"""
API Router for Quiz Generation, Submission, and History Tracking.
"""

from typing import List, Dict, Any
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user 
from app.models.user import User

from app.models.study_tools import QuizSession, Question
from app.services.quiz_service import QuizEvaluationEngine, QuizSubmitPayload, QuizEvaluationResult, AnswerSubmission
# SOTA FUNCTIONAL IMPORT
from app.services.generation_service import generate_exam_quiz

router = APIRouter()

class QuizGenerateRequest(BaseModel):
    document_id: str = Field(..., description="ID of the document/course to generate the quiz from")
    timer_minutes: int = Field(30, description="Simulation timer: 30, 60, or 90 minutes")

class SanitizedQuestionResponse(BaseModel):
    id: str
    question_text: str
    question_type: str
    options: List[str]

class QuizGenerateResponse(BaseModel):
    session_id: str
    timer_minutes: int
    questions: List[SanitizedQuestionResponse]

class HistoryDataPoint(BaseModel):
    date: str
    score: float

class SubmitAnswersRequest(BaseModel):
    answers: List[AnswerSubmission]
    time_spent_seconds: int = Field(..., ge=0)


@router.post("/generate", response_model=QuizGenerateResponse, status_code=status.HTTP_201_CREATED)
async def generate_quiz(
    request: QuizGenerateRequest, 
    db: AsyncSession = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    if request.timer_minutes not in [30, 60, 90]:
        raise HTTPException(status_code=400, detail="Timer must be 30, 60, or 90 minutes.")

    # In a full implementation, you fetch context chunks from ChromaDB here.
    # We pass a placeholder chunk to satisfy the generation service so the server boots cleanly.
    chunks = [{"page": 1, "text": "Le texte complet sera injecté ici depuis la base vectorielle."}]
    
    try:
        raw_questions = await generate_exam_quiz(chunks=chunks, num_questions=20)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Generation failed: {str(e)}")

    if not raw_questions or len(raw_questions) < 20:
        raise HTTPException(status_code=500, detail="AI failed to generate 20 valid questions.")

    new_session = QuizSession(
        student_id=current_user.id,
        document_version_id=request.document_id,
        timer_minutes=request.timer_minutes,
        total_questions=len(raw_questions),
        created_at=datetime.now(timezone.utc)
    )
    db.add(new_session)
    await db.flush()

    sanitized_output = []
    question_records = []
    
    for q_data in raw_questions:
        q_record = Question(
            quiz_session_id=new_session.id,
            question_text=q_data.get("question"),
            question_type=q_data.get("question_type", "MCQ"),
            options=q_data.get("options", []),
            correct_answer=q_data.get("correct_answer"),
            explanation=q_data.get("explanation"),
            source_page=q_data.get("source_page"),
            source_chunk=q_data.get("sourceChunk", "")
        )
        question_records.append(q_record)

    db.add_all(question_records)
    await db.commit()

    result = await db.execute(select(Question).where(Question.quiz_session_id == new_session.id))
    saved_questions = result.scalars().all()
    
    for sq in saved_questions:
        sanitized_output.append(SanitizedQuestionResponse(
            id=str(sq.id),
            question_text=sq.question_text,
            question_type=sq.question_type,
            options=sq.options
        ))

    return QuizGenerateResponse(
        session_id=str(new_session.id),
        timer_minutes=new_session.timer_minutes,
        questions=sanitized_output
    )


@router.post("/{session_id}/submit", response_model=QuizEvaluationResult)
async def submit_quiz(
    session_id: str, 
    payload: SubmitAnswersRequest, 
    db: AsyncSession = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    engine = QuizEvaluationEngine(db)
    full_payload = QuizSubmitPayload(
        quiz_session_id=session_id,
        answers=payload.answers,
        time_spent_seconds=payload.time_spent_seconds
    )
    try:
        return await engine.evaluate_and_store(user_id=str(current_user.id), payload=full_payload)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


@router.get("/history", response_model=List[HistoryDataPoint])
async def get_quiz_history(
    db: AsyncSession = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    
    result = await db.execute(
        select(QuizSession)
        .where(QuizSession.student_id == current_user.id)
        .where(QuizSession.is_completed == True)
        .where(QuizSession.submitted_at >= thirty_days_ago)
        .order_by(desc(QuizSession.submitted_at))
    )
    sessions = result.scalars().all()

    history_data = []
    for session in reversed(sessions):
        percentage = (session.score / session.total_questions * 100) if session.total_questions and session.score else 0
        submit_date = session.submitted_at or session.created_at
        
        history_data.append(HistoryDataPoint(
            date=submit_date.strftime("%m/%d"),
            score=round(percentage, 1)
        ))

    return history_data