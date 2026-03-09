
import uuid
from typing import List, Optional
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
from app.core.limits import limiter
import sqlalchemy as sa

router = APIRouter()

@router.post("/contributions", response_model=ContributionRead, dependencies=[Depends(limiter(20, 60))])
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

@router.get("/contributions/{contribution_id}", response_model=ContributionRead)
async def get_contribution(contribution_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Contribution).where(Contribution.id == contribution_id))
    c = result.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    return c

@router.get("/contributions/{contribution_id}/versions")
async def list_versions(contribution_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(DocumentVersion).where(DocumentVersion.contribution_id == contribution_id).order_by(DocumentVersion.version_number))
    return result.scalars().all()

@router.get("/version/{version_id}")
async def get_version(version_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(DocumentVersion).where(DocumentVersion.id == version_id))
    dv = result.scalars().first()
    if not dv:
        raise HTTPException(status_code=404, detail="Not found")
    return dv

@router.get("/contributions/query")
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
        q = q.where(Contribution.status == status)
    if uploader_id:
        q = q.where(Contribution.uploader_id == uploader_id)
    total = (await session.execute(select(sa.func.count()).select_from(q.subquery()))).scalar_one()
    if sort_by not in {"created_at", "title", "status"}:
        sort_by = "created_at"
    sort_col = getattr(Contribution, sort_by)
    if order.lower() == "asc":
        q = q.order_by(sort_col.asc())
    else:
        q = q.order_by(sort_col.desc())
    q = q.offset(offset).limit(limit)
    items = (await session.execute(q)).scalars().all()
    return {"items": items, "meta": {"total": total, "limit": limit, "offset": offset}}
