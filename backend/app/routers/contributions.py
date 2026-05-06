from __future__ import annotations

from datetime import datetime
import logging
import os
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import desc, func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_patterns
from app.core.exceptions import atlas_error
from app.core.redis import get_redis_client
from app.db.session import get_session
from app.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.pagination import build_paginated_response
from app.models.contribution import (
    Contribution,
    ContributionStatus,
    ContributorRequest,
    ContributorRequestStatus,
    DocumentVersion,
)
from app.models.course import Course
from app.models.rag import RAGSession
from app.models.study_tools import FlashcardDeck, QuizSession, MindMap, Summary
from app.models.annotation import DocumentAnnotation
from app.models.all_models import Notification, ReadingProgress


router = APIRouter(tags=["Contributions"])


class ReviewContributionRequest(BaseModel):
    status: str | None = None
    action: str | None = None
    rejection_reason: str | None = None
    review_note: str | None = None


class ReportCreateRequest(BaseModel):
    type: str
    title: str
    description: str
    severity: str | None = None
    screenshot_url: str | None = None


class ResolveReportRequest(BaseModel):
    action: str = "dismiss"
    note: str | None = None


class ContributorRequestReviewRequest(BaseModel):
    review_note: str | None = None


REPORT_TITLE_PREFIX = "Feedback received: "
logger = logging.getLogger(__name__)


def _serialize_contribution(item: Contribution) -> dict[str, Any]:
    data = item.model_dump()
    latest_version: DocumentVersion | None = None
    if item.document_versions:
        latest_version = sorted(
            item.document_versions,
            key=lambda version: version.version_number,
            reverse=True,
        )[0]

    data["review_note"] = item.rejection_reason
    data["updated_at"] = None
    data["is_demo_submission"] = item.is_demo_submission
    data["mime_type"] = latest_version.mime_type if latest_version else None
    data["s3_key"] = latest_version.storage_path if latest_version else None
    data["quality_score"] = latest_version.quality_score if latest_version else None
    data["preview_text"] = (
        (latest_version.ocr_text[:1200] if latest_version and latest_version.ocr_text else None)
    )
    return data


def _serialize_contributor_request(item: ContributorRequest, student: User, contribution: Contribution) -> dict[str, Any]:
    latest_version: DocumentVersion | None = None
    if contribution.document_versions:
        latest_version = sorted(
            contribution.document_versions,
            key=lambda version: version.version_number,
            reverse=True,
        )[0]

    quality_score = latest_version.quality_score if latest_version and latest_version.quality_score is not None else item.ocr_quality_score
    return {
        "id": str(item.id),
        "student_id": str(student.id),
        "email": student.email,
        "full_name": student.full_name,
        "status": item.status,
        "review_note": item.review_note,
        "ocr_quality_score": quality_score,
        "created_at": item.created_at,
        "reviewed_at": item.reviewed_at,
        "demo_contribution": {
            "id": str(contribution.id),
            "title": contribution.title,
            "description": contribution.description,
            "course_id": str(contribution.course_id) if contribution.course_id else None,
            "status": contribution.status,
            "created_at": contribution.created_at,
            "mime_type": latest_version.mime_type if latest_version else None,
            "s3_key": latest_version.storage_path if latest_version else None,
            "preview_text": latest_version.ocr_text[:1200] if latest_version and latest_version.ocr_text else None,
            "quality_score": latest_version.quality_score if latest_version else None,
        },
    }


def _serialize_report(notification: Notification) -> dict[str, Any]:
    report_type = "other"
    severity: str | None = None
    screenshot_url: str | None = None
    description_lines: list[str] = []

    for raw_line in notification.message.splitlines():
        line = raw_line.strip()
        if line.startswith("Type: "):
            report_type = line.removeprefix("Type: ").strip().lower() or "other"
        elif line.startswith("Severity: "):
            severity = line.removeprefix("Severity: ").strip().lower() or None
        elif line.startswith("Screenshot: "):
            screenshot_url = line.removeprefix("Screenshot: ").strip() or None
        elif line:
            description_lines.append(line)

    description = "\n".join(description_lines).strip() or notification.message

    return {
        "id": str(notification.id),
        "title": notification.title.removeprefix(REPORT_TITLE_PREFIX).strip() or notification.title,
        "description": description,
        "type": report_type,
        "severity": severity,
        "screenshot_url": screenshot_url,
        "status": "RESOLVED" if notification.is_read else "PENDING",
        "is_resolved": notification.is_read,
        "created_at": notification.created_at,
    }


async def _teacher_can_manage_course(
    db: AsyncSession,
    teacher: User,
    course_id: UUID | None,
) -> bool:
    if course_id is None:
        return False
    teacher_department_id = (
        teacher.teacher_profile.department_id
        if getattr(teacher, "teacher_profile", None)
        else None
    )
    if teacher_department_id is None:
        return False
    course = await db.get(Course, course_id)
    return bool(course and course.department_id == teacher_department_id)


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

    if not current_user.is_contributor:
        raise atlas_error(
            "CONTRIBUTION_004",
            "Contributor access is required before submitting community uploads.",
            status_code=403,
        )

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

    # XP awarding removed — contribution submission is enough.
    await invalidate_cache_patterns(redis_client, "admin_dashboard:*")
    return result


@router.post("/contributor-requests")
async def create_contributor_request(
    title: str = Form(...),
    description: str | None = Form(default=None),
    course_id: UUID = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, Any]:
    from app.services.doc_processing.upload_service import upload_student_contribution

    if current_user.is_contributor:
        raise atlas_error(
            "CONTRIBUTOR_001",
            "You already have contributor access.",
            status_code=400,
        )

    existing_pending = (
        await db.execute(
            select(ContributorRequest)
            .where(
                ContributorRequest.student_id == current_user.id,
                ContributorRequest.status == ContributorRequestStatus.PENDING,
            )
            .order_by(desc(ContributorRequest.created_at))
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing_pending is not None:
        raise atlas_error(
            "CONTRIBUTOR_002",
            "A contributor request is already pending review.",
            status_code=400,
        )

    try:
        contribution = await upload_student_contribution(
            session=db,
            current_user=current_user,
            title=title,
            description=description,
            course_id=course_id,
            file=file,
            is_demo_submission=True,
        )
    except ValueError as exc:
        raise atlas_error("CONTRIBUTOR_003", str(exc), status_code=400) from exc

    contributor_request = ContributorRequest(
        student_id=current_user.id,
        demo_contribution_id=contribution.id,
    )
    db.add(contributor_request)
    await db.commit()
    await db.refresh(contributor_request)

    result = await db.execute(
        select(ContributorRequest, User, Contribution)
        .join(User, User.id == ContributorRequest.student_id)
        .join(Contribution, Contribution.id == ContributorRequest.demo_contribution_id)
        .options(selectinload(Contribution.document_versions))
        .where(ContributorRequest.id == contributor_request.id)
    )
    row = result.first()
    await invalidate_cache_patterns(redis_client, "admin_dashboard:*", "leaderboard:*")
    if row is None:
        raise atlas_error("CONTRIBUTOR_004", "Contributor request could not be loaded.", status_code=500)
    req, student, demo_contribution = row
    return {
        "message": "Contributor request submitted successfully.",
        "request": _serialize_contributor_request(req, student, demo_contribution),
    }


@router.get("/contributor-requests/me")
async def get_my_contributor_request(
    current_user: User = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    result = await db.execute(
        select(ContributorRequest, Contribution)
        .join(Contribution, Contribution.id == ContributorRequest.demo_contribution_id)
        .options(selectinload(Contribution.document_versions))
        .where(ContributorRequest.student_id == current_user.id)
        .order_by(desc(ContributorRequest.created_at))
        .limit(1)
    )
    row = result.first()
    request_payload = None
    if row is not None:
        contributor_request, contribution = row
        request_payload = _serialize_contributor_request(contributor_request, current_user, contribution)
    return {
        "is_contributor": current_user.is_contributor,
        "contributor_badge_awarded_at": current_user.contributor_badge_awarded_at,
        "request": request_payload,
    }


@router.get("/contributions/me")
async def list_my_contributions(
    status: str | None = Query(default=None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    filters = [Contribution.uploader_id == current_user.id]
    if status:
        filters.append(Contribution.status == status.upper())

    total = (
        await db.execute(select(func.count()).select_from(Contribution).where(*filters))
    ).scalar_one()
    result = await db.execute(
        select(Contribution)
        .options(selectinload(Contribution.document_versions))
        .where(*filters)
        .order_by(desc(Contribution.created_at))
        .offset(offset)
        .limit(limit)
    )
    items = result.scalars().all()
    return build_paginated_response(
        [_serialize_contribution(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/admin/contributor-requests")
async def list_contributor_requests(
    status: str | None = Query(default=None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_role("TEACHER")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    filters = []
    if status:
        normalized = status.upper()
        if normalized in {"PENDING", "APPROVED", "REJECTED"}:
            filters.append(ContributorRequest.status == normalized)

    profile = getattr(current_user, "teacher_profile", None)
    teacher_department_id = profile.department_id if profile else None
    
    if teacher_department_id is None:
        raise atlas_error("AUTH_008", "Teacher department assignment is required to review contributor requests.", status_code=403)
    filters.append(Course.department_id == teacher_department_id)

    total = (
        await db.execute(
            select(func.count())
            .select_from(ContributorRequest)
            .join(User, User.id == ContributorRequest.student_id)
            .join(Contribution, Contribution.id == ContributorRequest.demo_contribution_id)
            .join(Course, Course.id == Contribution.course_id)
            .where(*filters)
        )
    ).scalar_one()
    result = await db.execute(
        select(ContributorRequest, User, Contribution)
        .join(User, User.id == ContributorRequest.student_id)
        .join(Contribution, Contribution.id == ContributorRequest.demo_contribution_id)
        .join(Course, Course.id == Contribution.course_id)
        .options(selectinload(Contribution.document_versions))
        .where(*filters)
        .order_by(desc(ContributorRequest.created_at))
        .offset(offset)
        .limit(limit)
    )
    items = [
        _serialize_contributor_request(request, student, contribution)
        for request, student, contribution in result.all()
    ]
    return build_paginated_response(items, total=total, limit=limit, offset=offset)


@router.post("/admin/contributor-requests/{request_id}/approve")
async def approve_contributor_request(
    request_id: UUID,
    background_tasks: BackgroundTasks,
    payload: ContributorRequestReviewRequest | None = None,
    current_user: User = Depends(require_role("TEACHER")),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, Any]:
    from app.services.doc_processing.moderation_service import execute_contribution_review

    result = await db.execute(
        select(ContributorRequest, User, Contribution)
        .join(User, User.id == ContributorRequest.student_id)
        .join(Contribution, Contribution.id == ContributorRequest.demo_contribution_id)
        .options(selectinload(Contribution.document_versions))
        .where(ContributorRequest.id == request_id)
    )
    row = result.first()
    if row is None:
        raise atlas_error("CONTRIBUTOR_005", "Contributor request not found.", status_code=404)

    request, student, contribution = row
    if not await _teacher_can_manage_course(db, current_user, contribution.course_id):
        raise atlas_error("AUTH_008", "You do not have permission to review this request.", status_code=403)
    if request.status != ContributorRequestStatus.PENDING:
        raise atlas_error("CONTRIBUTOR_006", "Contributor request is not pending.", status_code=400)

    latest_version = None
    if contribution.document_versions:
        latest_version = sorted(contribution.document_versions, key=lambda v: v.version_number, reverse=True)[0]
    request.ocr_quality_score = latest_version.quality_score if latest_version and latest_version.quality_score is not None else request.ocr_quality_score

    await execute_contribution_review(
        contribution_id=str(contribution.id),
        status=ContributionStatus.APPROVED,
        rejection_reason=None,
        admin_user=current_user,
        session=db,
        background_tasks=background_tasks,
    )

    request.status = ContributorRequestStatus.APPROVED
    request.reviewed_by = current_user.id
    request.review_note = payload.review_note if payload else None
    request.reviewed_at = datetime.utcnow()
    student.is_contributor = True
    student.contributor_badge_awarded_at = student.contributor_badge_awarded_at or datetime.utcnow()
    student.trust_score = max(student.trust_score, 25)

    # Badge awarding removed (gamification system eliminated)
    db.add(request)
    db.add(student)
    await db.commit()
    await invalidate_cache_patterns(redis_client, "admin_dashboard:*", "leaderboard:*")
    return {
        "message": "Contributor request approved successfully.",
        "id": str(request.id),
        "status": request.status,
    }


@router.post("/admin/contributor-requests/{request_id}/reject")
async def reject_contributor_request(
    request_id: UUID,
    background_tasks: BackgroundTasks,
    payload: ContributorRequestReviewRequest,
    current_user: User = Depends(require_role("TEACHER")),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, Any]:
    from app.services.doc_processing.moderation_service import execute_contribution_review

    if not payload.review_note or not payload.review_note.strip():
        raise atlas_error("CONTRIBUTOR_007", "A review note is required when rejecting a contributor request.", status_code=400)

    result = await db.execute(
        select(ContributorRequest, User, Contribution)
        .join(User, User.id == ContributorRequest.student_id)
        .join(Contribution, Contribution.id == ContributorRequest.demo_contribution_id)
        .options(selectinload(Contribution.document_versions))
        .where(ContributorRequest.id == request_id)
    )
    row = result.first()
    if row is None:
        raise atlas_error("CONTRIBUTOR_005", "Contributor request not found.", status_code=404)

    request, student, contribution = row
    if not await _teacher_can_manage_course(db, current_user, contribution.course_id):
        raise atlas_error("AUTH_008", "You do not have permission to review this request.", status_code=403)
    if request.status != ContributorRequestStatus.PENDING:
        raise atlas_error("CONTRIBUTOR_006", "Contributor request is not pending.", status_code=400)

    latest_version = None
    if contribution.document_versions:
        latest_version = sorted(contribution.document_versions, key=lambda v: v.version_number, reverse=True)[0]
    request.ocr_quality_score = latest_version.quality_score if latest_version and latest_version.quality_score is not None else request.ocr_quality_score

    await execute_contribution_review(
        contribution_id=str(contribution.id),
        status=ContributionStatus.REJECTED,
        rejection_reason=payload.review_note,
        admin_user=current_user,
        session=db,
        background_tasks=background_tasks,
    )

    request.status = ContributorRequestStatus.REJECTED
    request.reviewed_by = current_user.id
    request.review_note = payload.review_note.strip()
    request.reviewed_at = datetime.utcnow()

    db.add(request)
    await db.commit()
    await invalidate_cache_patterns(redis_client, "admin_dashboard:*")
    return {
        "message": "Contributor request rejected successfully.",
        "id": str(request.id),
        "status": request.status,
    }


@router.post("/reports")
async def create_report(
    payload: ReportCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    lines = [f"Type: {payload.type.upper()}"]
    if payload.severity:
        lines.append(f"Severity: {payload.severity.upper()}")
    if payload.screenshot_url:
        lines.append(f"Screenshot: {payload.screenshot_url}")
    lines.extend(["", payload.description.strip()])

    notification = Notification(
        user_id=current_user.id,
        title=f"{REPORT_TITLE_PREFIX}{payload.title.strip()}",
        message="\n".join(lines),
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return {
        "message": "Feedback submitted successfully.",
        "id": str(notification.id),
    }


@router.delete("/contributions/{contribution_id}")
async def delete_contribution(
    contribution_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, bool]:
    """
    Granular hard delete: removes a single contribution and its related data permanently.
    Only purges PostgreSQL relational data (Vectors managed by Cognitive Core).
    """
    import structlog
    from sqlalchemy import delete, cast
    from sqlalchemy.dialects.postgresql import ARRAY, UUID as PG_UUID

    from app.models.embedding import DocumentEmbedding

    log = structlog.get_logger().bind(action="delete_contribution", contribution_id=str(contribution_id))
    log.info("delete_request_received")

    contribution = await db.get(Contribution, contribution_id)
    if contribution is None:
        log.warning("contribution_not_found")
        raise atlas_error("CONTRIBUTION_001", "Contribution not found.", status_code=404)

    user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if contribution.uploader_id != current_user.id and user_role not in ("TEACHER", "ADMIN", "SUPERADMIN"):
        log.warning("permission_denied", user_id=str(current_user.id))
        raise atlas_error("AUTH_008", "You do not have permission to delete this contribution.", status_code=403)

    result = await db.execute(
        select(DocumentVersion).where(DocumentVersion.contribution_id == contribution_id)
    )
    versions = result.scalars().all()
    version_ids = [v.id for v in versions]

    if version_ids:
        log.info("cleaning_up_versions", version_count=len(version_ids))
        safe_version_ids = cast(version_ids, ARRAY(PG_UUID(as_uuid=True)))

        # Use overlap for array columns
        await db.execute(delete(FlashcardDeck).where(FlashcardDeck.document_version_ids.overlap(safe_version_ids)))
        await db.execute(delete(QuizSession).where(QuizSession.document_version_ids.overlap(safe_version_ids)))
        await db.execute(delete(MindMap).where(MindMap.document_version_ids.overlap(safe_version_ids)))
        await db.execute(delete(Summary).where(Summary.document_version_ids.overlap(safe_version_ids)))
        await db.execute(delete(RAGSession).where(RAGSession.document_version_ids.overlap(safe_version_ids)))

        # Scalar columns can still use in_
        await db.execute(delete(DocumentAnnotation).where(DocumentAnnotation.document_version_id.in_(version_ids)))
        await db.execute(delete(ReadingProgress).where(ReadingProgress.document_version_id.in_(version_ids)))
        await db.execute(delete(DocumentEmbedding).where(DocumentEmbedding.document_version_id.in_(version_ids)))

    # Final DB removal
    await db.execute(delete(DocumentVersion).where(DocumentVersion.contribution_id == contribution_id))
    await db.execute(delete(Contribution).where(Contribution.id == contribution_id))
    await db.commit()

    await invalidate_cache_patterns(redis_client, "admin_dashboard:*", "course_meta:*")
    log.info("contribution_fully_deleted")

    return {"success": True}