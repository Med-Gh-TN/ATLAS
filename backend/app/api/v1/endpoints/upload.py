
import uuid
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_session
from app.models.all_models import (
    User, Contribution, ContributionCreate, ContributionRead,
    DocumentVersion, DocumentPipelineStatus
)
from app.api.v1.endpoints.auth import get_current_user
from app.services.storage import minio_client, calculate_sha256

router = APIRouter()

@router.post("/contributions", response_model=ContributionRead)
async def create_contribution(
    title: str = Form(...),
    description: str = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    # 1. Read file and calculate hash for deduplication
    file_content = await file.read()
    file_hash = calculate_sha256(file_content)
    
    # 2. Check for duplicates
    existing_doc = await session.execute(
        select(DocumentVersion).where(DocumentVersion.sha256_hash == file_hash)
    )
    if existing_doc.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This file has already been uploaded."
        )
    
    # 3. Create Contribution Record
    contribution = Contribution(
        title=title,
        description=description,
        uploader_id=current_user.id
    )
    session.add(contribution)
    await session.commit()
    await session.refresh(contribution)
    
    # 4. Upload to MinIO
    file_extension = file.filename.split('.')[-1]
    storage_path = f"{contribution.id}/{uuid.uuid4()}.{file_extension}"
    
    try:
        minio_client.upload_file(file_content, storage_path, file.content_type)
    except Exception as e:
        # Rollback contribution if upload fails
        await session.delete(contribution)
        await session.commit()
        raise HTTPException(status_code=500, detail=str(e))
        
    # 5. Create DocumentVersion Record
    doc_version = DocumentVersion(
        contribution_id=contribution.id,
        version_number=1,
        storage_path=storage_path,
        file_size_bytes=len(file_content),
        sha256_hash=file_hash,
        pipeline_status=DocumentPipelineStatus.QUEUED
    )
    session.add(doc_version)
    await session.commit()
    
    # Trigger Celery Task for OCR
    from app.services.ocr_tasks import process_document_ocr
    process_document_ocr.delay(str(doc_version.id))
    
    return contribution

@router.get("/contributions", response_model=List[ContributionRead])
async def list_contributions(
    skip: int = 0,
    limit: int = 100,
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(select(Contribution).offset(skip).limit(limit))
    return result.scalars().all()
