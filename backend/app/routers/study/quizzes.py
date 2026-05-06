"""
@file backend/app/routers/study/quizzes.py
@description Domain-driven router for Quiz Generation, Session Tracking, and Grading.
@layer Core Logic
@dependencies app.models, app.services.intelligence
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.contribution import Contribution, DocumentVersion
from app.models.study_tools import Question, QuizSession
from app.models.user import User
from app.services.intelligence import generation_service

router = APIRouter()

class QuizGenerateRequest(BaseModel):
    course_id: UUID
    document_version_ids: list[UUID] = Field(default_factory=list)
    num_questions: int = Field(default=10, ge=1, le=15)

class QuizSubmitRequest(BaseModel):
    answers: dict[str, str]

async def _latest_document_version(db: AsyncSession, course_id: UUID) -> DocumentVersion:
    result = await db.execute(
        select(DocumentVersion)
        .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
        .where(
            Contribution.course_id == course_id,
            DocumentVersion.is_deleted.is_(False),
        )
        .order_by(desc(DocumentVersion.version_number))
        .limit(1)
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)
    return version

def _resolve_document_uuids(payload_uuids: list[UUID], latest_version: DocumentVersion) -> list[UUID]:
    return payload_uuids if len(payload_uuids) > 0 else [latest_version.id]

# ============================================================================
# QUIZZES
# ============================================================================
@router.post("/quiz/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_quiz(
    payload: QuizGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    version = await _latest_document_version(db, payload.course_id)
    doc_uuids = _resolve_document_uuids(payload.document_version_ids, version)

    try:
        session_row = await generation_service.generate_and_persist_quiz(
            document_version_ids=doc_uuids,
            num_questions=payload.num_questions,
            user=current_user,
            session=db
        )
        return {"job_id": str(session_row.id), "status": "READY"}
    except RuntimeError as e:
        if "exhausted ALL models" in str(e) or "503" in str(e) or "429" in str(e):
            raise atlas_error("AI_503", "The AI provider is currently experiencing high demand. Please try again in a few moments.", status_code=503)
        raise atlas_error("GEN_500", f"Generation failed: {str(e)}", status_code=500)


@router.get("/quiz/sessions")
async def list_quiz_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(QuizSession)
        .where(QuizSession.student_id == current_user.id)
        .order_by(desc(QuizSession.created_at))
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(row.id),
            "score": row.score,
            "total_questions": row.total_questions,
            "document_count": len(row.document_version_ids) if row.document_version_ids else 0,
            "is_completed": row.is_completed,
            "created_at": row.created_at,
            "submitted_at": row.submitted_at,
        }
        for row in rows
    ]


@router.get("/quiz/{quiz_id}")
async def get_quiz(
    quiz_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    session_row = await db.get(QuizSession, quiz_id)
    if session_row is None or session_row.student_id != current_user.id:
        raise atlas_error("QUIZ_002", "Quiz session not found.", status_code=404)

    result = await db.execute(select(Question).where(Question.quiz_session_id == quiz_id))
    questions = result.scalars().all()
    return {
        "id": str(session_row.id),
        "total_questions": session_row.total_questions,
        "time_limit_minutes": session_row.time_limit_minutes,
        "questions": [
            {
                "id": str(question.id),
                "question": question.question_text,
                "question_type": question.question_type,
                "options": question.options,
                "source_page": question.source_page,
            }
            for question in questions
        ],
    }


@router.post("/quiz/{quiz_id}/submit")
async def submit_quiz(
    quiz_id: UUID,
    payload: QuizSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    session_row = await db.get(QuizSession, quiz_id)
    if session_row is None or session_row.student_id != current_user.id:
        raise atlas_error("QUIZ_002", "Quiz session not found.", status_code=404)
    if session_row.is_completed:
        raise atlas_error("QUIZ_003", "Quiz has already been submitted.", status_code=400)

    result = await db.execute(select(Question).where(Question.quiz_session_id == quiz_id))
    questions = result.scalars().all()

    correct_count = 0
    explanations = []
    for question in questions:
        submitted = payload.answers.get(str(question.id))
        question.student_answer = submitted
        question.is_correct = submitted == question.correct_answer
        if question.is_correct:
            correct_count += 1
        explanations.append(
            {
                "question_id": str(question.id),
                "correct_answer": question.correct_answer,
                "explanation": question.explanation,
                "is_correct": question.is_correct,
                "source_page": question.source_page,
            }
        )
        db.add(question)

    score = (correct_count / len(questions) * 100) if questions else 0.0
    session_row.score = score
    session_row.is_completed = True
    session_row.submitted_at = datetime.utcnow()
    db.add(session_row)
    await db.commit()

    return {"score": score, "results": explanations}