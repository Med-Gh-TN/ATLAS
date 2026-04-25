from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_patterns
from app.core.exceptions import atlas_error
from app.core.redis import get_redis_client
from app.db.session import get_session
from app.dependencies import get_current_user, require_role
from app.models.contribution import Contribution, DocumentVersion
from app.models.course import Course
from app.models.user import User
from app.services.doc_processing.storage import minio_client


router = APIRouter(tags=["Courses"])


class CourseUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    academic_year: str | None = None
    tags: list[str] | None = None


def _serialize_version(version: DocumentVersion, contribution: Contribution | None = None) -> dict[str, Any]:
    return {
        "id": str(version.id),
        "version_number": version.version_number,
        "pipeline_status": version.pipeline_status,
        "mime_type": version.mime_type,
        "file_size_bytes": version.file_size_bytes,
        "uploaded_at": version.uploaded_at,
        "quality_score": version.quality_score,
        "contribution_id": str(version.contribution_id),
        "course_id": str(contribution.course_id) if contribution and contribution.course_id else None,
    }


def _serialize_course(course: Course, latest_version: DocumentVersion | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "level": course.level,
        "course_type": course.course_type,
        "academic_year": course.academic_year,
        "language": course.language,
        "tags": course.tags or [],
        "created_at": course.created_at,
    }
    if latest_version is not None:
        payload["latestVersion"] = _serialize_version(latest_version)
    return payload


async def _get_latest_course_version(
    db: AsyncSession,
    course_id: UUID,
) -> tuple[DocumentVersion | None, Contribution | None]:
    result = await db.execute(
        select(DocumentVersion, Contribution)
        .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
        .where(
            Contribution.course_id == course_id,
            DocumentVersion.is_deleted.is_(False),
        )
        .order_by(desc(DocumentVersion.version_number))
        .limit(1)
    )
    row = result.first()
    if row is None:
        return None, None
    return row[0], row[1]


@router.post("/courses/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_course(
    title: str = Form(...),
    description: str | None = Form(default=None),
    level: str = Form(...),
    course_type: str = Form(...),
    academic_year: str = Form(...),
    language: str = Form(...),
    department_id: UUID | None = Form(default=None),
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, Any]:
    from app.services.doc_processing.upload_service import upload_official_course_document

    try:
        contribution = await upload_official_course_document(
            session=db,
            current_user=current_user,
            title=title,
            description=description,
            level=level,
            course_type=course_type,
            academic_year=academic_year,
            language=language,
            department_id=department_id,
            file=file,
        )
    except ValueError as exc:
        raise atlas_error("COURSE_002", str(exc), status_code=400) from exc

    latest_version, _ = await _get_latest_course_version(db, contribution.course_id)
    await invalidate_cache_patterns(redis_client, "course_meta:*", "search_autocomplete:*")
    return {
        "status": "PROCESSING",
        "course": {
            "id": str(contribution.course_id),
            "title": contribution.title,
            "description": contribution.description,
        },
        "contribution": {
            "id": str(contribution.id),
            "status": contribution.status,
            "created_at": contribution.created_at,
        },
        "latestVersion": _serialize_version(latest_version) if latest_version else None,
    }


@router.get("/courses")
async def list_courses(
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    result = await db.execute(select(Course).order_by(desc(Course.created_at)).limit(100))
    courses = result.scalars().all()
    payload: list[dict[str, Any]] = []
    for course in courses:
        latest_version, _ = await _get_latest_course_version(db, course.id)
        payload.append(_serialize_course(course, latest_version))
    return payload


@router.get("/courses/my-uploads")
async def get_my_uploads(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_role("TEACHER", "ADMIN")),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(Course, Contribution)
        .join(Contribution, Contribution.course_id == Course.id)
        .where(Contribution.uploader_id == current_user.id)
        .order_by(desc(Course.created_at))
    )
    payload: list[dict[str, Any]] = []
    # We may have multiple contributions per course, but typically one for my-uploads.
    # Group by course or just return list of courses. The user asked to return courses.
    seen_courses = set()
    for course, contribution in result.all():
        if course.id in seen_courses:
            continue
        seen_courses.add(course.id)
        latest_version, _ = await _get_latest_course_version(db, course.id)
        payload.append(_serialize_course(course, latest_version))
    return payload


@router.get("/courses/{course_id}")
async def get_course(
    course_id: UUID,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    course = await db.get(Course, course_id)
    if course is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)

    latest_version, _ = await _get_latest_course_version(db, course_id)
    return _serialize_course(course, latest_version)


@router.get("/courses/{course_id}/versions")
async def list_course_versions(
    course_id: UUID,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    course = await db.get(Course, course_id)
    if course is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)

    result = await db.execute(
        select(DocumentVersion, Contribution)
        .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
        .where(Contribution.course_id == course_id)
        .order_by(desc(DocumentVersion.version_number))
    )
    return [_serialize_version(version, contribution) for version, contribution in result.all()]


@router.patch("/courses/{course_id}")
async def update_course(
    course_id: UUID,
    payload: CourseUpdateRequest,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, Any]:
    course = await db.get(Course, course_id)
    if course is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)

    for field in ("title", "description", "academic_year", "tags"):
        value = getattr(payload, field)
        if value is not None:
            setattr(course, field, value)

    db.add(course)
    await db.commit()
    await db.refresh(course)
    await invalidate_cache_patterns(redis_client, "course_meta:*", "search_autocomplete:*")

    latest_version, _ = await _get_latest_course_version(db, course_id)
    return _serialize_course(course, latest_version)


@router.delete("/courses/{course_id}")
async def delete_course(
    course_id: UUID,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, bool]:
    course = await db.get(Course, course_id)
    if course is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)

    result = await db.execute(
        select(DocumentVersion)
        .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
        .where(Contribution.course_id == course_id)
    )
    for version in result.scalars().all():
        version.is_deleted = True
        db.add(version)

    await db.commit()
    await invalidate_cache_patterns(redis_client, "course_meta:*", "search_autocomplete:*")
    return {"success": True}


@router.get("/courses/{course_id}/download-url")
async def get_course_download_url(
    course_id: UUID,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    latest_version, _ = await _get_latest_course_version(db, course_id)
    if latest_version is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)

    url = minio_client.get_file_url(latest_version.storage_path, expires_in_hours=0.25)
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    return {"url": url, "expiresAt": expires_at.isoformat()}


@router.get("/courses/{course_id}/preview")
async def get_course_preview(
    course_id: UUID,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    latest_version, _ = await _get_latest_course_version(db, course_id)
    if latest_version is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)

    preview_url = f"/api/v1/files/proxy/{latest_version.storage_path}"
    return {
        "course_id": str(course_id),
        "preview": {
            "type": "document",
            "url": preview_url,
            "mime_type": latest_version.mime_type,
        },
    }
