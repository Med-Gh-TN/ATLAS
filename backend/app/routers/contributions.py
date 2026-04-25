from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_patterns
from app.core.exceptions import atlas_error
from app.core.redis import get_redis_client
from app.db.session import get_session
from app.dependencies import get_current_user, require_role
from app.models.all_models import Notification
from app.models.contribution import Contribution
from app.models.user import User


router = APIRouter(tags=["Contributions"])


class ReviewContributionRequest(BaseModel):
    status: str
    rejection_reason: str | None = None


class ReportCreateRequest(BaseModel):
    type: str
    title: str
    description: str
    screenshot_url: str | None = None


@router.post("/contributions")
async def create_contribution(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    description: str | None = Form(default=None),
    course_id: UUID = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> Any:
    from app.services.doc_processing.upload_service import upload_student_contribution

    try:
        result = await upload_student_contribution(
            session=db,
            current_user=current_user,
            title=title,
            description=description,
            course_id=course_id,
            file=file,
        )
    except ValueError as exc:
        raise atlas_error("CONTRIBUTION_001", str(exc), status_code=400) from exc
    await invalidate_cache_patterns(redis_client, "admin_dashboard:*")
    return result


@router.get("/contributions/me")
async def list_my_contributions(
    current_user: User = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_session),
) -> list[Contribution]:
    result = await db.execute(
        select(Contribution)
        .where(Contribution.uploader_id == current_user.id)
        .order_by(desc(Contribution.created_at))
    )
    return result.scalars().all()


@router.get("/admin/contributions")
async def list_contribution_queue(
    status: str | None = None,
    current_user: User = Depends(require_role("ADMIN", "TEACHER")),
    db: AsyncSession = Depends(get_session),
) -> list[Contribution]:
    statement = select(Contribution).order_by(desc(Contribution.created_at))
    if status:
        statement = statement.where(Contribution.status == status.upper())
    result = await db.execute(statement)
    return result.scalars().all()


@router.patch("/admin/contributions/{contribution_id}")
async def review_contribution(
    contribution_id: UUID,
    payload: ReviewContributionRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role("ADMIN", "TEACHER")),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> Any:
    from app.services.doc_processing.moderation_service import execute_contribution_review

    try:
        result = await execute_contribution_review(
            contribution_id=str(contribution_id),
            status=payload.status,
            rejection_reason=payload.rejection_reason,
            admin_user=current_user,
            session=db,
            background_tasks=background_tasks,
        )
        await invalidate_cache_patterns(redis_client, "admin_dashboard:*", "leaderboard:*")
        return result
    except ValueError as exc:
        raise atlas_error("CONTRIBUTION_002", str(exc), status_code=400) from exc


@router.post("/reports")
async def create_report(
    payload: ReportCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    notification = Notification(
        user_id=current_user.id,
        title=f"Feedback received: {payload.title}",
        message=payload.description,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return {"success": True, "id": str(notification.id)}


@router.get("/admin/reports")
async def list_reports(
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(Notification).order_by(desc(Notification.created_at))
    )
    notifications = result.scalars().all()
    return [
        {
            "id": str(item.id),
            "title": item.title,
            "description": item.message,
            "is_resolved": item.is_read,
            "created_at": item.created_at,
        }
        for item in notifications
    ]


@router.patch("/admin/reports/{report_id}")
async def resolve_report(
    report_id: UUID,
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    report = await db.get(Notification, report_id)
    if report is None:
        raise atlas_error("REPORT_001", "Report not found.", status_code=404)
    report.is_read = True
    db.add(report)
    await db.commit()
    return {"success": True, "id": str(report.id), "resolved": True}
