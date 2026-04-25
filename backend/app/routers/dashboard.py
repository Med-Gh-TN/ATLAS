from __future__ import annotations

import csv
import io
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.dependencies import require_role
from app.models.contribution import Contribution, DocumentVersion
from app.models.course import Course
from app.models.gamification import XPTransaction
from app.models.study_tools import FlashcardDeck, QuizSession
from app.models.user import User


router = APIRouter(tags=["Dashboard"])


@router.get("/students/me/dashboard")
async def student_dashboard(
    current_user: User = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    quiz_count = (
        await db.execute(select(func.count(QuizSession.id)).where(QuizSession.student_id == current_user.id))
    ).scalar_one()
    deck_count = (
        await db.execute(select(func.count(FlashcardDeck.id)).where(FlashcardDeck.student_id == current_user.id))
    ).scalar_one()
    xp_total = (
        await db.execute(select(func.coalesce(func.sum(XPTransaction.amount), 0)).where(XPTransaction.user_id == current_user.id))
    ).scalar_one()
    return {
        "user": {
            "id": str(current_user.id),
            "full_name": current_user.full_name,
            "filiere": current_user.filiere,
            "level": current_user.level,
        },
        "stats": {
            "quizzes_taken": int(quiz_count or 0),
            "flashcard_decks": int(deck_count or 0),
            "xp_total": int(xp_total or 0),
        },
    }


@router.get("/students/me/history")
async def student_history(
    current_user: User = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(XPTransaction).where(XPTransaction.user_id == current_user.id).order_by(desc(XPTransaction.created_at)).limit(100)
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(item.id),
            "type": item.type,
            "amount": item.amount,
            "created_at": item.created_at,
        }
        for item in rows
    ]


@router.get("/teacher/analytics")
async def teacher_analytics(
    current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    uploads = (
        await db.execute(select(func.count(Contribution.id)).where(Contribution.uploader_id == current_user.id))
    ).scalar_one()
    approved = (
        await db.execute(
            select(func.count(Contribution.id)).where(
                Contribution.uploader_id == current_user.id,
                Contribution.status == "APPROVED",
            )
        )
    ).scalar_one()
    return {"total_uploads": int(uploads or 0), "approved_uploads": int(approved or 0)}


@router.get("/teacher/courses/{course_id}/analytics")
async def teacher_course_analytics(
    course_id: UUID,
    _current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    uploads = (
        await db.execute(
            select(func.count(DocumentVersion.id))
            .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
            .where(Contribution.course_id == course_id)
        )
    ).scalar_one()
    return {"course_id": str(course_id), "versions": int(uploads or 0)}


@router.get("/admin/dashboard")
async def admin_dashboard(
    _current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_courses = (await db.execute(select(func.count(Course.id)))).scalar_one()
    pending_contributions = (
        await db.execute(select(func.count(Contribution.id)).where(Contribution.status == "PENDING"))
    ).scalar_one()
    return {
        "total_users": int(total_users or 0),
        "total_courses": int(total_courses or 0),
        "pending_contributions": int(pending_contributions or 0),
    }


@router.get("/admin/analytics/export")
async def export_admin_analytics(
    _current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> Response:
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_courses = (await db.execute(select(func.count(Course.id)))).scalar_one()
    pending_contributions = (
        await db.execute(select(func.count(Contribution.id)).where(Contribution.status == "PENDING"))
    ).scalar_one()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["metric", "value"])
    writer.writerow(["total_users", int(total_users or 0)])
    writer.writerow(["total_courses", int(total_courses or 0)])
    writer.writerow(["pending_contributions", int(pending_contributions or 0)])

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=atlas-admin-analytics.csv"},
    )
