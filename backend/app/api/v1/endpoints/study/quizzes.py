import uuid
import logging
from datetime import datetime
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, Field

from app.db.session import get_session

# ARCHITECTURAL FIX: Explicitly import from the specific IAM dependency provider
from app.api.v1.endpoints.auth.me import get_current_user
from app.models.all_models import User, DocumentVersion, QuizSession, Question
from app.core.limits import limiter

# ARCHITECTURAL FIX: Re-routed to the new Study Engine Bounded Context
from app.services.study_engine import generation_service

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for Study Tool telemetry
logger = logging.getLogger("app.api.v1.endpoints.study.quizzes")
router = APIRouter()

# --- Pydantic Schemas ---


class GenerateQuizRequest(BaseModel):
    """Schema for requesting AI-generated assessment from document context."""

    document_version_id: uuid.UUID
    num_questions: int = Field(default=5, ge=1, le=15)


class SubmitQuizRequest(BaseModel):
    """Schema for submitting student answers for evaluation."""

    answers: Dict[str, str] = Field(
        ..., description="Map of question_id to selected_option"
    )


# --- Quiz Endpoints ---


@router.post(
    "/generate",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limiter(5, 86400))],
)
async def generate_quiz(
    payload: GenerateQuizRequest,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session),
):
    """
    US-08: AI Quiz Generation.
    Orchestrates the extraction of OCR text and dispatches a generation task
    to the Study Engine's generation service.
    """
    doc_query = await db_session.execute(
        select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id)
    )
    doc = doc_query.scalars().first()

    if not doc or not doc.ocr_text:
        logger.warning(
            f"Quiz Generation Failed: Document {payload.document_version_id} not ready."
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not ready or OCR content missing.",
        )

    # Invoke Domain Logic: Generation Service (Study Engine)
    raw_questions = await generation_service.generate_quiz_from_text(
        doc.ocr_text, payload.num_questions
    )

    if not raw_questions:
        logger.error(
            f"AI Engine Failure: Failed to generate questions for doc {doc.id}"
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Failed to generate quiz. LLM engine returned an empty set.",
        )

    # State Persistence: Create Session and Questions
    quiz_session = QuizSession(
        student_id=current_user.id,
        document_version_id=doc.id,
        total_questions=len(raw_questions),
    )
    db_session.add(quiz_session)
    await db_session.flush()

    for q_data in raw_questions:
        question = Question(
            quiz_session_id=quiz_session.id,
            content=q_data.get("content", ""),
            question_type="MCQ",
            options=q_data.get("options", []),
            correct_answer=q_data.get("correct_answer", ""),
            explanation=q_data.get("explanation", ""),
        )
        db_session.add(question)

    await db_session.commit()

    logger.info(
        f"AUDIT: Quiz generated for User {current_user.id}. Session: {quiz_session.id}"
    )
    return {"quiz_session_id": quiz_session.id, "questions": raw_questions}


@router.post("/{session_id}/submit")
async def submit_quiz(
    session_id: uuid.UUID,
    payload: SubmitQuizRequest,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session),
):
    """
    Calculates score based on submitted answers and records the result.
    Verification: Ensures the session belongs to the authenticated student.
    """
    session_query = await db_session.execute(
        select(QuizSession).where(
            QuizSession.id == session_id, QuizSession.student_id == current_user.id
        )
    )
    quiz_session = session_query.scalars().first()

    if not quiz_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Quiz session not found."
        )

    if quiz_session.submitted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quiz has already been submitted and scored.",
        )

    q_query = await db_session.execute(
        select(Question).where(Question.quiz_session_id == session_id)
    )
    questions = q_query.scalars().all()

    correct_count = 0
    feedback = []

    for q in questions:
        user_answer = payload.answers.get(str(q.id))
        is_correct = user_answer == q.correct_answer
        if is_correct:
            correct_count += 1

        feedback.append(
            {
                "question_id": q.id,
                "is_correct": is_correct,
                "correct_answer": q.correct_answer,
                "explanation": q.explanation,
            }
        )

    # Scoring Logic
    final_score = (correct_count / len(questions)) * 100 if questions else 0.0
    quiz_session.score = final_score
    quiz_session.submitted_at = datetime.utcnow()

    db_session.add(quiz_session)

    # SIDE-EFFECT: Commit results
    await db_session.commit()

    # --- User Intelligence Layer: Track topic knowledge ---
    try:
        from app.services.intelligence import knowledge_service

        course_id = None
        doc_query = await db_session.execute(
            select(DocumentVersion).where(
                DocumentVersion.id == quiz_session.document_version_id
            )
        )
        doc = doc_query.scalars().first()
        if doc and doc.contribution and doc.contribution.course_id:
            course_id = doc.contribution.course_id

        for q in questions:
            user_answer = payload.answers.get(str(q.id))
            is_correct = user_answer == q.correct_answer

            await knowledge_service.update_topic_confidence(
                session=db_session,
                user_id=str(current_user.id),
                course_id=str(course_id) if course_id else None,
                topic_name="document_quiz",
                quiz_session_id=str(quiz_session.id),
                score=100.0 if is_correct else 0.0,
                is_correct=is_correct,
            )
    except Exception as e:
        logger.warning(f"Failed to update topic knowledge: {e}")

    # TODO: Add side-effect call to gamification_service.award_xp(current_user.id, score)

    logger.info(f"AUDIT: Quiz session {session_id} submitted. Score: {final_score}%")
    return {"score": final_score, "feedback": feedback}


@router.get("/history")
async def get_quiz_history(
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session),
):
    """
    US-XX: Retrieves the last 30 days of quiz history for the current user.
    """
    from datetime import timedelta

    cutoff_date = datetime.utcnow() - timedelta(days=30)

    sessions_query = await db_session.execute(
        select(QuizSession)
        .where(
            QuizSession.student_id == current_user.id,
            QuizSession.submitted_at >= cutoff_date,
        )
        .order_by(QuizSession.submitted_at.desc())
        .limit(50)
    )
    sessions = sessions_query.scalars().all()

    history = []
    for session in sessions:
        history.append(
            {
                "session_id": str(session.id),
                "document_version_id": str(session.document_version_id),
                "score": session.score,
                "total_questions": session.total_questions,
                "submitted_at": session.submitted_at.isoformat()
                if session.submitted_at
                else None,
            }
        )

    return history
