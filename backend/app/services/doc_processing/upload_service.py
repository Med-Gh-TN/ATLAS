from __future__ import annotations

import os
import uuid
from typing import Optional

import magic
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.contribution import Contribution, DocumentPipelineStatus, DocumentVersion
from app.models.course import Course, CourseLanguage, CourseLevel, CourseType
from app.models.user import User, UserRole
from app.services.doc_processing.ocr_tasks import process_document_ocr
from app.services.doc_processing.storage import calculate_sha256, minio_client


MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


async def read_and_validate_upload(upload_file) -> tuple[bytes, str]:
    if upload_file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError("Invalid file format declared. Only PDF, DOCX, and PPTX are permitted.")

    header_bytes = await upload_file.read(2048)
    actual_mime = magic.from_buffer(header_bytes, mime=True)
    if actual_mime not in ALLOWED_MIME_TYPES:
        await upload_file.seek(0)
        raise ValueError(f"Byte-level signature mismatch. Detected: {actual_mime}.")

    await upload_file.seek(0)
    file_content = await upload_file.read()
    if len(file_content) > MAX_FILE_SIZE_BYTES:
        raise ValueError("File size exceeds the 50MB limit.")

    return file_content, calculate_sha256(file_content)


async def upload_official_course_document(
    *,
    session: AsyncSession,
    current_user: User,
    title: str,
    description: Optional[str],
    level: str,
    course_type: str,
    academic_year: str,
    language: str,
    department_id,
    file,
) -> Contribution:
    file_content, file_hash = await read_and_validate_upload(file)

    existing_doc = await session.execute(
        select(DocumentVersion).where(DocumentVersion.sha256_hash == file_hash)
    )
    if existing_doc.scalars().first():
        raise ValueError("Duplicate detected: This specific file has already been uploaded.")

    dept_filter = (Course.department_id == department_id) if department_id else sa.true()
    existing_course_query = await session.execute(
        select(Course).where(
            Course.title == title,
            Course.level == level.upper(),
            Course.course_type == course_type.upper(),
            Course.academic_year == academic_year,
            Course.language == language.upper(),
            dept_filter,
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
                department_id=department_id,
            )
            session.add(course)
            await session.flush()
        except ValueError as exc:
            await session.rollback()
            raise ValueError(f"Invalid taxonomy value provided: {str(exc)}") from exc
        except IntegrityError as exc:
            await session.rollback()
            raise ValueError("Database integrity error while creating course.") from exc

    existing_contrib_query = await session.execute(
        select(Contribution).where(
            Contribution.course_id == course.id,
            Contribution.uploader_id == current_user.id,
        )
    )
    contribution = existing_contrib_query.scalars().first()
    if not contribution:
        contribution = Contribution(
            title=title,
            description=description,
            uploader_id=current_user.id,
            course_id=course.id,
        )
        session.add(contribution)
        await session.flush()

    max_v_query = await session.execute(
        select(sa.func.max(DocumentVersion.version_number))
        .join(Contribution)
        .where(Contribution.course_id == course.id)
    )
    current_max_version = max_v_query.scalar() or 0
    new_version_number = current_max_version + 1

    _, ext = os.path.splitext(file.filename or "")
    quarantine_path = f"quarantine/{uuid.uuid4()}{ext.lower()}"
    minio_client.upload_file(file_content, quarantine_path, file.content_type)

    doc_version = DocumentVersion(
        contribution_id=contribution.id,
        version_number=new_version_number,
        storage_path=quarantine_path,
        file_size_bytes=len(file_content),
        mime_type=file.content_type,
        sha256_hash=file_hash,
        language=language.lower(),
        pipeline_status=DocumentPipelineStatus.QUEUED,
    )
    session.add(doc_version)
    await session.commit()
    await session.refresh(contribution)
    await session.refresh(doc_version)

    process_document_ocr.delay(str(doc_version.id))
    return contribution


async def upload_student_contribution(
    *,
    session: AsyncSession,
    current_user: User,
    title: str,
    description: Optional[str],
    course_id,
    file,
) -> Contribution:
    file_content, file_hash = await read_and_validate_upload(file)

    existing_doc = await session.execute(
        select(DocumentVersion).where(DocumentVersion.sha256_hash == file_hash)
    )
    if existing_doc.scalars().first():
        raise ValueError("Duplicate detected: This specific file has already been uploaded.")

    course_query = await session.execute(select(Course).where(Course.id == course_id))
    course = course_query.scalars().first()
    if not course:
        raise ValueError("Target course not found.")

    contribution = Contribution(
        title=title,
        description=description,
        uploader_id=current_user.id,
        course_id=course.id,
        status="PENDING",
    )
    session.add(contribution)
    await session.flush()

    _, ext = os.path.splitext(file.filename or "")
    quarantine_path = f"quarantine/contrib_{uuid.uuid4()}{ext.lower()}"
    minio_client.upload_file(file_content, quarantine_path, file.content_type)

    doc_version = DocumentVersion(
        contribution_id=contribution.id,
        version_number=1,
        storage_path=quarantine_path,
        file_size_bytes=len(file_content),
        mime_type=file.content_type,
        sha256_hash=file_hash,
        pipeline_status=DocumentPipelineStatus.QUEUED,
    )
    session.add(doc_version)
    await session.commit()
    await session.refresh(contribution)
    await session.refresh(doc_version)

    process_document_ocr.delay(str(doc_version.id))
    return contribution
