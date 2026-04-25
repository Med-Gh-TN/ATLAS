import os
import uuid
import magic
import structlog
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.db.session import get_session
from app.models.all_models import (
    User, Contribution, ContributionRead,
    DocumentVersion, DocumentPipelineStatus
)
from app.models.course import Course, CourseLevel, CourseType, CourseLanguage

# ARCHITECTURAL FIX: Explicit IAM dependency resolution
from app.api.v1.endpoints.auth.me import get_current_user

# ARCHITECTURAL FIX: Re-routed to the Doc Processing Bounded Context via public __init__.py
from app.services.doc_processing import minio_client, calculate_sha256, process_document_ocr

from app.core.limits import limiter

logger = structlog.get_logger(__name__)

router = APIRouter()

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"  # PPTX
}

# ==========================================
# US-06: OFFICIAL COURSE UPLOAD
# ==========================================
@router.post(
    "/upload",
    response_model=ContributionRead,
    dependencies=[Depends(limiter(20, 60))]
)
async def upload_course_document(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    level: str = Form(..., description="e.g., L1, L2, M1, OTHER"),
    course_type: str = Form(..., description="e.g., LECTURE, TD, TP"),
    academic_year: str = Form(..., description="e.g., 2025-2026"),
    language: str = Form(..., description="e.g., FR, EN, AR"),
    department_id: Optional[uuid.UUID] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-06 & US-12: Upload Officiel de Cours par l'Enseignant avec Versioning Automatique.
    Refactored to utilize the Doc Processing domain for storage and background OCR.
    """
    log = logger.bind(user_id=str(current_user.id), action="upload_course_document")

    if file.content_type not in ALLOWED_MIME_TYPES:
        log.warning("unsupported_mime_type_declared", content_type=file.content_type)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Invalid file format declared. Only PDF, DOCX, and PPTX are permitted."
        )

    # Byte-level MIME Type Validation (OWASP defense-in-depth)
    header_bytes = await file.read(2048)
    actual_mime = magic.from_buffer(header_bytes, mime=True)
    if actual_mime not in ALLOWED_MIME_TYPES:
        await file.seek(0)
        log.warning("byte_level_mime_mismatch", detected=actual_mime)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Byte-level signature mismatch. Detected: {actual_mime}. Only PDF, DOCX, and PPTX are permitted."
        )

    await file.seek(0)
    file_content = await file.read()
    file_size = len(file_content)

    if file_size > MAX_FILE_SIZE_BYTES:
        log.warning("file_too_large", size_mb=file_size / (1024 * 1024))
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds the 50MB limit. Current size: {file_size / (1024 * 1024):.2f}MB"
        )

    # Use calculate_sha256 from the doc_processing domain
    file_hash = calculate_sha256(file_content)

    existing_doc = await session.execute(
        select(DocumentVersion).where(DocumentVersion.sha256_hash == file_hash)
    )
    if existing_doc.scalars().first():
        log.warning("duplicate_file_detected", hash=file_hash[:16])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Duplicate detected: This specific file has already been uploaded."
        )

    # Taxonomy Match
    dept_filter = (Course.department_id == department_id) if department_id else sa.true()
    existing_course_query = await session.execute(
        select(Course).where(
            Course.title == title,
            Course.level == level.upper(),
            Course.course_type == course_type.upper(),
            Course.academic_year == academic_year,
            Course.language == language.upper(),
            dept_filter
        )
    )
    course = existing_course_query.scalars().first()

    if not course:
        try:
            course = Course(
                title=title,
                description=description,
                level=CourseLevel(level.upper()),
                course_type=CourseType(course_type.upper()),
                academic_year=academic_year,
                language=CourseLanguage(language.upper()),
                department_id=department_id
            )
            session.add(course)
            await session.flush()

        except ValueError as e:
            await session.rollback()
            log.error("invalid_taxonomy", error=str(e))
            raise HTTPException(status_code=400, detail=f"Invalid taxonomy value provided: {str(e)}")
        except IntegrityError as e:
            await session.rollback()
            log.error("integrity_error_course_creation", error=str(e))
            if "course_department_id_fkey" in str(e):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="The specified Department ID does not exist in the system."
                )
            raise HTTPException(status_code=400, detail="Database integrity error.")

    # Link Contribution
    existing_contrib_query = await session.execute(
        select(Contribution).where(
            Contribution.course_id == course.id,
            Contribution.uploader_id == current_user.id
        )
    )
    contribution = existing_contrib_query.scalars().first()

    if not contribution:
        contribution = Contribution(
            title=title,
            description=description,
            uploader_id=current_user.id,
            course_id=course.id
        )
        session.add(contribution)
        await session.flush()

    # Version Calculation
    max_v_query = await session.execute(
        select(sa.func.max(DocumentVersion.version_number))
        .join(Contribution)
        .where(Contribution.course_id == course.id)
    )
    current_max_version = max_v_query.scalar() or 0
    new_version_number = current_max_version + 1

    # Upload to MinIO via doc_processing domain + OCR pipeline
    _, ext = os.path.splitext(file.filename or "")
    quarantine_path = f"quarantine/{uuid.uuid4()}{ext.lower()}"

    try:
        minio_client.upload_file(file_content, quarantine_path, file.content_type)
        log.info("file_uploaded_to_quarantine", path=quarantine_path)

        doc_version = DocumentVersion(
            contribution_id=contribution.id,
            version_number=new_version_number,
            storage_path=quarantine_path,
            file_size_bytes=file_size,
            mime_type=file.content_type,
            sha256_hash=file_hash,
            language=language.lower(),
            pipeline_status=DocumentPipelineStatus.QUEUED
        )
        session.add(doc_version)
        await session.commit()
        await session.refresh(contribution)
        await session.refresh(doc_version)

        # Trigger OCR pipeline (async Celery task) - now via clean public API
        process_document_ocr.delay(str(doc_version.id))
        log.info("ocr_task_queued", document_version_id=str(doc_version.id))

        # FULL SPECTRUM SIDE-EFFECTS (US-12) - first-class citizens
        # TODO Step 4: award XP via gamification_service, send in-app/email notification,
        #              and write structured audit log to Redis/DB

    except Exception as e:
        await session.rollback()
        log.error("upload_pipeline_failed", error=str(e), exc_info=True)
        # TODO Step 4: Trigger failure notification to user + admin alert
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred during upload. Our team has been notified."
        )

    log.info("course_upload_success", contribution_id=str(contribution.id), version=new_version_number)
    return contribution


@router.get("/{course_id}/versions")
async def get_course_versions(
    course_id: uuid.UUID,
    session: AsyncSession = Depends(get_session)
):
    """
    US-12: Returns complete version history for a specific course.
    """
    stmt = (
        select(DocumentVersion, Contribution, User)
        .join(Contribution, DocumentVersion.contribution_id == Contribution.id)
        .join(User, Contribution.uploader_id == User.id)
        .where(Contribution.course_id == course_id)
        .order_by(DocumentVersion.version_number.desc())
    )
    result = await session.execute(stmt)
    rows = result.all()

    versions = []
    for dv, contrib, user in rows:
        uploader_name = getattr(user, "full_name", None) or getattr(user, "email", str(user.id))
        versions.append({
            "version_id": dv.id,
            "version_number": dv.version_number,
            "uploaded_at": dv.uploaded_at,
            "file_size_bytes": dv.file_size_bytes,
            "mime_type": dv.mime_type,
            "pipeline_status": dv.pipeline_status,
            "quality_score": dv.quality_score,
            "uploader": {"id": user.id, "name": uploader_name}
        })

    return versions