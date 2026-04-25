import os
import uuid
import magic
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import sqlalchemy as sa

from app.db.session import get_session
from app.models.all_models import (
    User, Contribution, ContributionRead,
    DocumentVersion, DocumentPipelineStatus
)
from app.models.user import UserRole
from app.models.course import Course

# ARCHITECTURAL FIX: Explicit IAM dependency resolution
from app.api.v1.endpoints.auth.me import get_current_user

# ARCHITECTURAL FIX: Re-routed to Doc Processing and Communications Bounded Contexts
from app.services.doc_processing.storage import minio_client, calculate_sha256
from app.services.communications.email_service import send_admin_new_contribution_email
from app.core.limits import limiter

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for Student Contribution telemetry
logger = logging.getLogger("app.api.v1.endpoints.contributions.students")
router = APIRouter()

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"  # PPTX
}

def dispatch_moderator_notifications(emails: List[str], title: str, uploader_name: str):
    """
    Background task helper to dispatch emails to all fetched moderators via Communications domain.
    """
    for email in emails:
        send_admin_new_contribution_email(to_email=email, title=title, uploader_name=uploader_name)

# ==========================================
# US-11: STUDENT CONTRIBUTIONS
# ==========================================
@router.post("/", response_model=ContributionRead, dependencies=[Depends(limiter(20, 60))])
async def create_student_contribution(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    course_id: uuid.UUID = Form(..., description="Target parent course for this contribution"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-11: Student Contribution Flow.
    Refactored to interact with refactored Doc Processing and Communications Lego blocks.
    """
    # 1. Validate MIME Type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Invalid file format declared. Only PDF, DOCX, and PPTX are permitted."
        )

    # Byte-level Signature Validation
    header_bytes = await file.read(2048)
    actual_mime = magic.from_buffer(header_bytes, mime=True)
    if actual_mime not in ALLOWED_MIME_TYPES:
        await file.seek(0)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Byte-level signature mismatch. Detected: {actual_mime}."
        )

    await file.seek(0)
    file_content = await file.read()
    if len(file_content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds the 50MB limit."
        )

    # Use calculate_sha256 from the doc_processing domain
    file_hash = calculate_sha256(file_content)

    # Dedup check
    existing_doc = await session.execute(
        select(DocumentVersion).where(DocumentVersion.sha256_hash == file_hash)
    )
    if existing_doc.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Duplicate detected: This specific file has already been uploaded."
        )

    # Validate target course exists
    course_query = await session.execute(select(Course).where(Course.id == course_id))
    course = course_query.scalars().first()
    if not course:
        raise HTTPException(status_code=404, detail="Target course not found.")

    # Create Contribution (PENDING state for student uploads)
    contribution = Contribution(
        title=title,
        description=description,
        uploader_id=current_user.id,
        course_id=course.id,
        status="PENDING"
    )
    session.add(contribution)
    await session.flush()

    # Upload to MinIO via doc_processing domain
    _, ext = os.path.splitext(file.filename or "")
    quarantine_path = f"quarantine/contrib_{uuid.uuid4()}{ext.lower()}"

    try:
        minio_client.upload_file(file_content, quarantine_path, file.content_type)
    except Exception as e:
        await session.rollback()
        logger.error(f"Storage Error: Failed to upload student contribution. {e}")
        raise HTTPException(status_code=500, detail="Storage service unavailable.")

    # Initialize DocumentVersion
    doc_version = DocumentVersion(
        contribution_id=contribution.id,
        version_number=1,
        storage_path=quarantine_path,
        file_size_bytes=len(file_content),
        mime_type=file.content_type,
        sha256_hash=file_hash,
        pipeline_status=DocumentPipelineStatus.QUEUED
    )
    session.add(doc_version)

    # Fetch Moderators for Notification (Communications Domain)
    mod_query = await session.execute(
        select(User.email).where(User.role.in_([UserRole.TEACHER, UserRole.ADMIN]))
    )
    moderator_emails = mod_query.scalars().all()
    uploader_name = current_user.full_name or current_user.email

    await session.commit()

    await session.refresh(contribution)
    await session.refresh(doc_version)

    # ARCHITECTURAL FIX: Re-routed OCR task to the doc_processing domain
    from app.services.doc_processing.ocr_tasks import process_document_ocr
    process_document_ocr.delay(str(doc_version.id))

    # Background Task: Alert moderators of new student content
    background_tasks.add_task(
        dispatch_moderator_notifications,
        moderator_emails,
        contribution.title,
        uploader_name
    )

    logger.info(f"AUDIT: Student contribution '{title}' submitted by User [{current_user.id}]. Status: PENDING.")
    return contribution


@router.get("/", response_model=List[ContributionRead])
async def list_contributions(
    skip: int = 0,
    limit: int = 100,
    session: AsyncSession = Depends(get_session)
):
    """Lists contributions with basic pagination."""
    result = await session.execute(select(Contribution).offset(skip).limit(limit))
    return result.scalars().all()


@router.get("/query")
async def query_contributions(
    limit: int = 20,
    offset: int = 0,
    status: str | None = None,
    uploader_id: str | None = None,
    sort_by: str = "created_at",
    order: str = "desc",
    session: AsyncSession = Depends(get_session)
):
    """Advanced querying for contributions with filtering and sorting."""
    q = select(Contribution)
    if status:
        q = q.where(Contribution.status == status.upper())
    if uploader_id:
        q = q.where(Contribution.uploader_id == uploader_id)

    total = (
        await session.execute(select(sa.func.count()).select_from(q.subquery()))
    ).scalar_one()

    if sort_by not in {"created_at", "title", "status"}:
        sort_by = "created_at"

    sort_col = getattr(Contribution, sort_by)
    q = q.order_by(sort_col.asc() if order.lower() == "asc" else sort_col.desc())
    q = q.offset(offset).limit(limit)
    items = (await session.execute(q)).scalars().all()

    return {"items": items, "meta": {"total": total, "limit": limit, "offset": offset}}


@router.get("/{contribution_id}", response_model=ContributionRead)
async def get_contribution(
    contribution_id: str,
    session: AsyncSession = Depends(get_session)
):
    """Retrieves a specific contribution by ID."""
    result = await session.execute(
        select(Contribution).where(Contribution.id == contribution_id)
    )
    c = result.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Contribution not found")
    return c


@router.get("/{contribution_id}/versions")
async def list_versions(
    contribution_id: str,
    session: AsyncSession = Depends(get_session)
):
    """Returns all versions associated with a contribution."""
    result = await session.execute(
        select(DocumentVersion)
        .where(DocumentVersion.contribution_id == contribution_id)
        .order_by(DocumentVersion.version_number)
    )
    return result.scalars().all()


@router.get("/version/{version_id}")
async def get_version(
    version_id: str,
    session: AsyncSession = Depends(get_session)
):
    """
    Retrieves a specific document version and generates a backend-proxy URL.
    """
    result = await session.execute(
        select(DocumentVersion).where(DocumentVersion.id == version_id)
    )
    dv = result.scalars().first()

    if not dv:
        # Fallback for contribution-level lookup
        fallback_result = await session.execute(
            select(DocumentVersion)
            .where(DocumentVersion.contribution_id == version_id)
            .order_by(DocumentVersion.version_number.desc())
        )
        dv = fallback_result.scalars().first()

    if not dv:
        raise HTTPException(status_code=404, detail="Version not found")

    # ARCHITECTURE FIX: Return a backend-proxy URL (Port 8000) to bypass CORS blocks
    file_url = f"/api/v1/files/proxy/{dv.storage_path}"

    return {
        "id": dv.id,
        "version_number": dv.version_number,
        "storage_path": dv.storage_path,
        "file_url": file_url,
        "file_size_bytes": dv.file_size_bytes,
        "mime_type": dv.mime_type,
        "sha256_hash": dv.sha256_hash,
        "ocr_text": dv.ocr_text,
        "language": dv.language,
        "pipeline_status": dv.pipeline_status,
        "uploaded_at": dv.uploaded_at,
        "contribution_id": dv.contribution_id,
        "quality_score": dv.quality_score,
    }