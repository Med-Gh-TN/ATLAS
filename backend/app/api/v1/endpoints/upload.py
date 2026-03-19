import os
import uuid
import magic
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import sqlalchemy as sa
# ARCHITECTURE FIX: Import IntegrityError to catch foreign key violations gracefully
from sqlalchemy.exc import IntegrityError

from app.db.session import get_session
from app.models.all_models import (
    User, Contribution, ContributionCreate, ContributionRead,
    DocumentVersion, DocumentPipelineStatus
)
from app.models.user import UserRole
from app.models.course import Course, CourseLevel, CourseType, CourseLanguage
from app.api.v1.endpoints.auth import get_current_user
from app.services.storage import minio_client, calculate_sha256
from app.core.limits import limiter
from app.services.email_service import send_admin_new_contribution_email

router = APIRouter()

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"  # PPTX
}

def dispatch_moderator_notifications(emails: List[str], title: str, uploader_name: str):
    """
    Background task helper to dispatch emails to all fetched moderators.
    Delegated to BackgroundTasks to prevent blocking the upload request.
    """
    for email in emails:
        send_admin_new_contribution_email(to_email=email, title=title, uploader_name=uploader_name)

# ==========================================
# US-06: OFFICIAL COURSE UPLOAD
# Exposed as: /api/v1/contributions/courses/upload
# ==========================================
@router.post(
    "/courses/upload",
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
    Strictly validates MIME type, 50MB size limit, and prevents SHA-256 duplicates.
    Captures full taxonomy, increments version if course exists, and triggers OCR pipeline.
    """
    # 1. Validate Declared MIME Type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Invalid file format declared. Only PDF, DOCX, and PPTX are permitted."
        )

    # 1.5 DEFENSIVE ARCHITECTURE: Byte-level MIME Type Validation
    header_bytes = await file.read(2048)
    actual_mime = magic.from_buffer(header_bytes, mime=True)
    if actual_mime not in ALLOWED_MIME_TYPES:
        await file.seek(0)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Byte-level signature mismatch. Detected: {actual_mime}. "
                "Only PDF, DOCX, and PPTX are permitted."
            )
        )

    # Reset file pointer after reading headers
    await file.seek(0)

    # 2. Read file and validate size
    file_content = await file.read()
    file_size = len(file_content)

    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"File size exceeds the 50MB limit. "
                f"Current size: {file_size / (1024 * 1024):.2f}MB"
            )
        )

    # 3. Calculate hash for deduplication
    file_hash = calculate_sha256(file_content)

    # 4. Check for exact-file duplicates
    existing_doc = await session.execute(
        select(DocumentVersion).where(DocumentVersion.sha256_hash == file_hash)
    )
    if existing_doc.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Duplicate detected: This specific file has already been uploaded to the platform."
        )

    # 5. Find or Create Academic Course Record (Taxonomy) — US-12 Versioning Match
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
            await session.flush()  # Flush to get course.id without committing

        except ValueError as e:
            await session.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Invalid taxonomy value provided: {str(e)}"
            )

        except IntegrityError as e:
            await session.rollback()
            if "course_department_id_fkey" in str(e):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="The specified Department ID does not exist in the system."
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Database integrity error. Check your inputs."
            )

    # 6. Find or Create Contribution Record linked to the Course
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
        await session.flush()  # Flush to get contribution.id

    # 7. US-12: Calculate the New Version Number automatically
    max_v_query = await session.execute(
        select(sa.func.max(DocumentVersion.version_number))
        .join(Contribution)
        .where(Contribution.course_id == course.id)
    )
    current_max_version = max_v_query.scalar() or 0
    new_version_number = current_max_version + 1

    # 8. DEFENSIVE ARCHITECTURE: Upload to MinIO Quarantine — US-24
    _, ext = os.path.splitext(file.filename or "")
    quarantine_path = f"quarantine/{uuid.uuid4()}{ext.lower()}"

    try:
        minio_client.upload_file(file_content, quarantine_path, file.content_type)
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage upload failed: {str(e)}"
        )

    # 9. Create DocumentVersion Record
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

    # 10. Trigger Celery async pipeline (US-07 + US-24)
    from app.services.ocr_tasks import process_document_ocr
    process_document_ocr.delay(str(doc_version.id))

    return contribution


@router.get("/courses/{course_id}/versions")
async def get_course_versions(
    course_id: uuid.UUID,
    session: AsyncSession = Depends(get_session)
):
    """
    US-12: GET /courses/{id}/versions
    Returns complete version history with dates, uploader, size, and pipeline status.
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
        uploader_name = (
            getattr(user, "full_name", None) or
            getattr(user, "email", str(user.id))
        )
        versions.append({
            "version_id": dv.id,
            "version_number": dv.version_number,
            "uploaded_at": dv.uploaded_at,
            "file_size_bytes": dv.file_size_bytes,
            "mime_type": dv.mime_type,
            "pipeline_status": dv.pipeline_status,
            "quality_score": dv.quality_score,
            "uploader": {
                "id": user.id,
                "name": uploader_name
            }
        })

    return versions


# ==========================================
# US-11: STUDENT CONTRIBUTIONS
# Exposed as: /api/v1/contributions
# ==========================================
@router.post("", response_model=ContributionRead, dependencies=[Depends(limiter(20, 60))])
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
    US-11: Flux Contribution Étudiant.
    Associates the upload to an existing course, sets status to PENDING, 
    and dispatches admin notifications.
    """
    # 1. Validate Declared MIME Type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Invalid file format declared. Only PDF, DOCX, and PPTX are permitted."
        )

    # 1.5 DEFENSIVE ARCHITECTURE: Byte-level MIME Type Validation
    header_bytes = await file.read(2048)
    actual_mime = magic.from_buffer(header_bytes, mime=True)
    if actual_mime not in ALLOWED_MIME_TYPES:
        await file.seek(0)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Byte-level signature mismatch. Detected: {actual_mime}. "
                "Only PDF, DOCX, and PPTX are permitted."
            )
        )

    await file.seek(0)

    # 2. Content and size validation
    file_content = await file.read()
    if len(file_content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds the 50MB limit."
        )

    file_hash = calculate_sha256(file_content)

    # 3. Hash deduplication
    existing_doc = await session.execute(
        select(DocumentVersion).where(DocumentVersion.sha256_hash == file_hash)
    )
    if existing_doc.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This file has already been uploaded."
        )

    # 4. Validate target course exists
    course_query = await session.execute(select(Course).where(Course.id == course_id))
    course = course_query.scalars().first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target course not found."
        )

    # 5. Create Contribution with PENDING state
    contribution = Contribution(
        title=title,
        description=description,
        uploader_id=current_user.id,
        course_id=course.id,
        status="PENDING"
    )
    session.add(contribution)
    await session.flush()

    # 6. Safe storage upload to quarantine
    _, ext = os.path.splitext(file.filename or "")
    quarantine_path = f"quarantine/contrib_{uuid.uuid4()}{ext.lower()}"

    try:
        minio_client.upload_file(file_content, quarantine_path, file.content_type)
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    # 7. Initialize DocumentVersion
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
    
    # 8. Fetch Moderators for Notification (US-11 Side-Effect)
    mod_query = await session.execute(
        select(User.email).where(User.role.in_([UserRole.TEACHER, UserRole.ADMIN]))
    )
    moderator_emails = mod_query.scalars().all()
    uploader_name = current_user.full_name or current_user.email
    
    await session.commit()

    await session.refresh(contribution)
    await session.refresh(doc_version)

    # 9. Async pipeline dispatch & Background Notifications
    from app.services.ocr_tasks import process_document_ocr
    process_document_ocr.delay(str(doc_version.id))
    
    background_tasks.add_task(
        dispatch_moderator_notifications,
        moderator_emails,
        contribution.title,
        uploader_name
    )

    return contribution


@router.get("", response_model=List[ContributionRead])
async def list_contributions(
    skip: int = 0,
    limit: int = 100,
    session: AsyncSession = Depends(get_session)
):
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
    BUG FIX: Dual-resolution version lookup.

    Root cause: The upload endpoints (POST /courses/upload, POST /) return a
    ContributionRead response. The frontend navigates to /document/{contribution.id}
    and then calls GET /contributions/version/{id} — passing a contribution UUID
    where a DocumentVersion UUID is expected. This causes a hard 404 on every
    first navigation to a newly uploaded document.

    Fix strategy:
    1. PRIMARY: Look up by DocumentVersion.id (original behavior, preserved).
    2. FALLBACK: If no version matches, treat the ID as a contribution_id and
       return the latest DocumentVersion for that contribution ordered by
       version_number DESC.

    This makes the endpoint forward-compatible with both ID types without
    requiring changes to the frontend navigation contract or the upload
    response schema.
    """
    # Primary path: exact match on DocumentVersion primary key
    result = await session.execute(
        select(DocumentVersion).where(DocumentVersion.id == version_id)
    )
    dv = result.scalars().first()

    if not dv:
        # Fallback path: the caller passed a contribution_id instead of a version_id.
        # Return the highest version_number for that contribution (the canonical latest).
        fallback_result = await session.execute(
            select(DocumentVersion)
            .where(DocumentVersion.contribution_id == version_id)
            .order_by(DocumentVersion.version_number.desc())
        )
        dv = fallback_result.scalars().first()

    if not dv:
        raise HTTPException(status_code=404, detail="Version not found")

    return dv