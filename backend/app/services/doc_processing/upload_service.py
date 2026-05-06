"""
@file backend/app/services/doc_processing/upload_service.py
@description Upload Service with butterfly fix: syncs documentversion status & ocr_text post‑ingestion.
SOTA FIX: Duplicate hash check now excludes DocumentVersion records that are soft‑deleted or belong to a
REJECTED contribution, allowing teachers to re‑upload files after deletion.
@layer Core Logic
@dependencies SQLAlchemy, asyncio, pathlib, filetype
"""

from __future__ import annotations

import os
import uuid
import asyncio
from typing import Optional
from pathlib import Path

import filetype
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi import BackgroundTasks

from app.models.contribution import Contribution, ContributionStatus, DocumentPipelineStatus, DocumentVersion
from app.models.course import Course, CourseType, CourseLanguage
from app.models.user import User, UserRole
from app.services.doc_processing.storage import calculate_sha256

import logging
logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/png",
    "image/jpeg",
}

OMNI_WORKSPACE_DIR = Path("/omni/workspace")

_INGESTION_LOCK = asyncio.Lock()


def _write_file_sync(path: Path, content: bytes):
    os.makedirs(path.parent, exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)


async def read_and_validate_upload(upload_file) -> tuple[bytes, str]:
    if upload_file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError("Invalid file format declared.")

    header_bytes = await upload_file.read(2048)
    kind = filetype.guess(header_bytes)
    actual_mime = kind.mime if kind else "application/octet-stream"
    if actual_mime not in ALLOWED_MIME_TYPES:
        await upload_file.seek(0)
        raise ValueError(f"Byte-level signature mismatch. Detected: {actual_mime}.")

    await upload_file.seek(0)
    file_content = await upload_file.read()
    if len(file_content) > MAX_FILE_SIZE_BYTES:
        raise ValueError("File size exceeds the 50MB limit.")

    file_hash = await asyncio.to_thread(calculate_sha256, file_content)
    return file_content, file_hash


async def _sync_document_status_after_ingestion(doc_uuid: str, success: bool = True):
    """Updates the backend's documentversion table to match ATLAS-OCR completion."""
    from app.db.session import get_session
    async for db in get_session():  # FastAPI dependency generator gives us a session
        try:
            if success:
                # Copy ocr_text from parent_chunks
                result = await db.execute(
                    sa.text("SELECT string_agg(content, '\n\n' ORDER BY created_at) FROM parent_chunks WHERE document_uuid = :uuid"),
                    {"uuid": doc_uuid}
                )
                ocr_text = result.scalar() or ""
                await db.execute(
                    sa.text("""
                        UPDATE documentversion
                        SET pipeline_status = :status,
                            ocr_text = :ocr_text,
                            parser_used = 'docling_or_vlm'
                        WHERE id = :uuid
                    """),
                    {"status": DocumentPipelineStatus.READY.value,
                     "ocr_text": ocr_text,
                     "uuid": doc_uuid}
                )
                logger.info(f"🔄 Synced documentversion {doc_uuid} to READY with {len(ocr_text)} chars.")
            else:
                await db.execute(
                    sa.text("UPDATE documentversion SET pipeline_status = :status WHERE id = :uuid"),
                    {"status": DocumentPipelineStatus.FAILED.value, "uuid": doc_uuid}
                )
                logger.warning(f"🔄 Synced documentversion {doc_uuid} to FAILED.")
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to sync documentversion after ingestion: {e}")
        finally:
            await db.close()
            break


async def _async_ingestion_worker(file_path: str, doc_uuid: str):
    async with _INGESTION_LOCK:
        logger.info(f"🔒 [QUEUE] Lock acquired. Initiating ingestion for: {doc_uuid}")
        from orchestrator import HybridRAGPipeline
        pipeline = HybridRAGPipeline()
        success = False
        try:
            await pipeline.initialize()
            result = await pipeline.ingest(
                file_path=file_path,
                namespace="global",
                user_id=None,
                force_doc_uuid=doc_uuid
            )
            logger.info(f"✅ [OMNI-ARCHITECT] Ingestion complete for {doc_uuid}. Result: {result}")
            success = result.get("status") == "success"
        except Exception as e:
            logger.error(f"❌ [OMNI-ARCHITECT] Fatal error during ingestion: {e}")
        finally:
            try:
                await pipeline.shutdown()
            except Exception as e:
                logger.error(f"Error during orchestrator shutdown: {e}")
        # Butterfly fix: sync documentversion with actual ingestion result
        await _sync_document_status_after_ingestion(doc_uuid, success=success)
        logger.info(f"🔓 [QUEUE] Lock released.")


async def upload_official_course_document(
    *,
    session: AsyncSession,
    current_user: User,
    course_id,
    file,
    course_type: CourseType,
    language: CourseLanguage,
    background_tasks: BackgroundTasks,
    academic_year: str | None = None,
) -> Contribution:
    file_content, file_hash = await read_and_validate_upload(file)

    # ── SOTA FIX: Duplicate check now ignores soft‑deleted versions and rejected contributions
    # This allows teachers to re‑upload a file after deleting its previous contribution.
    existing_doc = await session.execute(
        select(DocumentVersion)
        .join(Contribution, DocumentVersion.contribution_id == Contribution.id)
        .where(
            DocumentVersion.sha256_hash == file_hash,
            DocumentVersion.is_deleted == False,
            Contribution.status != ContributionStatus.REJECTED,
        )
    )
    if existing_doc.scalars().first():
        raise ValueError("Duplicate detected: This specific file has already been uploaded to an active course contribution.")

    existing_course_query = await session.execute(select(Course).where(Course.id == course_id))
    course = existing_course_query.scalars().first()

    if not course or course.is_deleted:
        raise ValueError("Selected course does not exist.")

    if (
        current_user.role == UserRole.TEACHER
        and current_user.teacher_profile
        and current_user.teacher_profile.department_id
        and course.department_id != current_user.teacher_profile.department_id
    ):
        raise ValueError("You can only upload content for your assigned department.")

    base_name, file_ext = os.path.splitext(file.filename or "Untitled_Document")
    document_title = base_name.replace("_", " ").replace("-", " ").strip()

    existing_contrib_query = await session.execute(
        select(Contribution).where(
            Contribution.course_id == course.id,
            Contribution.uploader_id == current_user.id,
            Contribution.course_type == course_type,
            Contribution.title == document_title,
            Contribution.academic_year == academic_year
        )
    )
    contribution = existing_contrib_query.scalars().first()
    
    if not contribution:
        contribution = Contribution(
            title=document_title,
            description=f"{course_type.value} material for {course.title}",
            uploader_id=current_user.id,
            course_id=course.id,
            course_type=course_type,
            language=language,
            academic_year=academic_year,
            status=ContributionStatus.APPROVED,
        )
        session.add(contribution)
        await session.flush()

    max_v_query = await session.execute(
        select(sa.func.max(DocumentVersion.version_number))
        .join(Contribution)
        .where(Contribution.id == contribution.id)
    )
    current_max_version = max_v_query.scalar() or 0
    new_version_number = current_max_version + 1

    doc_uuid = str(uuid.uuid4())
    local_file_path = OMNI_WORKSPACE_DIR / f"{doc_uuid}{file_ext.lower()}"
    
    await asyncio.to_thread(_write_file_sync, local_file_path, file_content)

    doc_version = DocumentVersion(
        id=doc_uuid,
        contribution_id=contribution.id,
        version_number=new_version_number,
        storage_path=str(local_file_path),
        file_size_bytes=len(file_content),
        mime_type=file.content_type,
        sha256_hash=file_hash,
        language=(language.value if hasattr(language, "value") else str(language)).lower(),
        pipeline_status=DocumentPipelineStatus.QUEUED,
    )
    session.add(doc_version)

    # XP award removed — official upload is enough.
    await session.commit()
    await session.refresh(contribution)
    await session.refresh(doc_version)

    logger.info(f"📥 [QUEUE] Document accepted for ingestion: {doc_uuid}")
    background_tasks.add_task(_async_ingestion_worker, str(local_file_path), doc_uuid)
    
    return contribution


async def upload_student_contribution(
    *,
    session: AsyncSession,
    current_user: User,
    title: str,
    description: Optional[str],
    course_id,
    file,
    background_tasks: BackgroundTasks,
    is_demo_submission: bool = False,
) -> Contribution:
    file_content, file_hash = await read_and_validate_upload(file)

    # ── SOTA FIX: Same duplicate logic applied to student contributions
    existing_doc = await session.execute(
        select(DocumentVersion)
        .join(Contribution, DocumentVersion.contribution_id == Contribution.id)
        .where(
            DocumentVersion.sha256_hash == file_hash,
            DocumentVersion.is_deleted == False,
            Contribution.status != ContributionStatus.REJECTED,
        )
    )
    if existing_doc.scalars().first():
        raise ValueError("Duplicate detected. This file has already been submitted for an active contribution.")

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
        is_demo_submission=is_demo_submission,
    )
    session.add(contribution)
    await session.flush()

    _, ext = os.path.splitext(file.filename or "")
    doc_uuid = str(uuid.uuid4())
    
    local_file_path = OMNI_WORKSPACE_DIR / f"contrib_{doc_uuid}{ext.lower()}"
    
    await asyncio.to_thread(_write_file_sync, local_file_path, file_content)

    doc_version = DocumentVersion(
        id=doc_uuid,
        contribution_id=contribution.id,
        version_number=1,
        storage_path=str(local_file_path),
        file_size_bytes=len(file_content),
        mime_type=file.content_type,
        sha256_hash=file_hash,
        pipeline_status=DocumentPipelineStatus.QUEUED,
    )
    session.add(doc_version)
    await session.commit()
    await session.refresh(contribution)
    await session.refresh(doc_version)

    logger.info(f"📥 [QUEUE] Student Document accepted for ingestion: {doc_uuid}")
    background_tasks.add_task(_async_ingestion_worker, str(local_file_path), doc_uuid)
    
    return contribution