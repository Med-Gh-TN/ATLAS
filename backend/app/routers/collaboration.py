"""
@file backend/app/routers/collaboration.py
@description Collaboration router — only Learning Path endpoints retained.
Legacy study group, forum, and live session endpoints have been removed.
@layer Core Logic
"""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.collaboration import LearningPathJob
from app.models.user import User

router = APIRouter(tags=["Collaboration"])


class LearningPathRequest(BaseModel):
    goal: str
    course_ids: list[str] = []
    available_hours_per_week: int = Field(default=5, ge=1)


@router.post("/learning-path/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_learning_path(
    payload: LearningPathRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    steps = [
        {
            "id": str(uuid4()),
            "title": f"Review {course_id}",
            "action": "study-course",
            "estimated_hours": max(1, payload.available_hours_per_week // max(1, len(payload.course_ids or ['1']))),
        }
        for course_id in (payload.course_ids or ["general-foundation"])
    ]
    job = LearningPathJob(
        user_id=current_user.id,
        input_json=payload.model_dump(),
        result_json={"goal": payload.goal, "steps": steps},
        status="READY",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return {"job_id": str(job.id), "status": job.status}


@router.get("/learning-path/{job_id}")
async def get_learning_path(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    job = await db.get(LearningPathJob, job_id)
    if job is None or job.user_id != current_user.id:
        raise atlas_error("LEARNING_PATH_001", "Learning path not found.", status_code=404)
    return {
        "id": str(job.id),
        "status": job.status,
        "result": job.result_json,
        "created_at": job.created_at,
    }