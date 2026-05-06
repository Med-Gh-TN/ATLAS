"""
@file backend/app/routers/study/assets.py
@description Domain-driven router for Summaries, Mindmaps, and Unified Asset pipelines.
@layer Core Logic
@dependencies app.models, app.services.intelligence
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.contribution import Contribution, DocumentVersion
from app.models.study_tools import MindMap, Summary, AcademicAssetType
from app.models.user import User
from app.services.intelligence import generation_service, asset_cache_service

router = APIRouter()

class SummaryGenerateRequest(BaseModel):
    course_id: UUID
    document_version_ids: list[UUID] = Field(default_factory=list)
    format_type: str = "EXECUTIVE"
    target_lang: str = "fr"

class MindMapGenerateRequest(BaseModel):
    course_id: UUID
    document_version_ids: list[UUID] = Field(default_factory=list)
    target_lang: str = "fr"

class DocumentAssetGenerateRequest(BaseModel):
    asset_type: str
    target_lang: str = "fr"
    profile: str = "default"
    force_regenerate: bool = False


async def _latest_document_version(db: AsyncSession, course_id: UUID) -> DocumentVersion:
    result = await db.execute(
        select(DocumentVersion)
        .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
        .where(
            Contribution.course_id == course_id,
            DocumentVersion.is_deleted.is_(False),
        )
        .order_by(desc(DocumentVersion.version_number))
        .limit(1)
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)
    return version

def _resolve_document_uuids(payload_uuids: list[UUID], latest_version: DocumentVersion) -> list[UUID]:
    return payload_uuids if len(payload_uuids) > 0 else [latest_version.id]

# ============================================================================
# SUMMARIES & MINDMAPS
# ============================================================================
@router.post("/summaries/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_summary(
    payload: SummaryGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    version = await _latest_document_version(db, payload.course_id)
    doc_uuids = _resolve_document_uuids(payload.document_version_ids, version)

    try:
        summary = await generation_service.generate_and_persist_summary(
            document_version_ids=doc_uuids,
            format_type=payload.format_type,
            target_lang=payload.target_lang,
            user=current_user,
            session=db
        )
        return {"job_id": str(summary.id), "status": "READY"}
    except RuntimeError as e:
        if "exhausted ALL models" in str(e) or "503" in str(e) or "429" in str(e):
            raise atlas_error("AI_503", "The AI provider is currently experiencing high demand. Please try again in a few moments.", status_code=503)
        raise atlas_error("GEN_500", f"Generation failed: {str(e)}", status_code=500)


@router.get("/summaries/{summary_id}")
async def get_summary(
    summary_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    summary = await db.get(Summary, summary_id)
    if summary is None or summary.student_id != current_user.id:
        raise atlas_error("SUMMARY_002", "Summary not found.", status_code=404)
    return {
        "id": str(summary.id),
        "format": summary.format,
        "target_lang": summary.target_lang,
        "content": summary.content,
        "created_at": summary.created_at,
    }


@router.post("/mindmaps/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_mindmap(
    payload: MindMapGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    version = await _latest_document_version(db, payload.course_id)
    doc_uuids = _resolve_document_uuids(payload.document_version_ids, version)

    try:
        mindmap = await generation_service.generate_and_persist_mindmap(
            document_version_ids=doc_uuids,
            target_lang=payload.target_lang,
            user=current_user,
            session=db
        )
        return {"job_id": str(mindmap.id), "status": "READY"}
    except RuntimeError as e:
        if "exhausted ALL models" in str(e) or "503" in str(e) or "429" in str(e):
            raise atlas_error("AI_503", "The AI provider is currently experiencing high demand. Please try again in a few moments.", status_code=503)
        raise atlas_error("GEN_500", f"Generation failed: {str(e)}", status_code=500)


@router.get("/mindmaps/{mindmap_id}")
async def get_mindmap(
    mindmap_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    mindmap = await db.get(MindMap, mindmap_id)
    if mindmap is None or mindmap.student_id != current_user.id:
        raise atlas_error("MINDMAP_002", "Mind map not found.", status_code=404)
    return {
        "id": str(mindmap.id),
        "title": mindmap.title,
        "target_lang": mindmap.target_lang,
        "nodes": mindmap.nodes_json,
        "edges": mindmap.edges_json,
        "created_at": mindmap.created_at,
    }


# ============================================================================
# UNIFIED ASSET ROUTER
# ============================================================================
@router.get("/documents/{document_version_id}/assets/manifest")
async def get_document_asset_manifest(
    document_version_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    version = await db.get(DocumentVersion, document_version_id)
    if version is None or version.is_deleted:
        raise atlas_error("ASSET_003", "Document version not found.", status_code=404)
        
    items = await asset_cache_service.list_cached_assets(db, version.id)
    return {"items": items, "total": len(items)}


@router.get("/documents/{document_version_id}/assets/{asset_type}")
async def get_document_asset(
    document_version_id: UUID,
    asset_type: str,
    target_lang: str = "fr",
    profile: str = "default",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    version = await db.get(DocumentVersion, document_version_id)
    if version is None or version.is_deleted:
        raise atlas_error("ASSET_003", "Document version not found.", status_code=404)
        
    try:
        enum_type = AcademicAssetType(asset_type.upper())
    except ValueError:
        raise atlas_error("ASSET_001", "Unsupported asset type.", status_code=400)

    asset = await asset_cache_service.get_cached_asset(
        session=db,
        document_version_id=version.id,
        asset_type=enum_type,
        target_lang=target_lang,
        profile=profile,
    )
    
    if not asset:
        raise atlas_error("ASSET_004", "Asset not found in cache.", status_code=404)
        
    return {
        "id": str(asset.id),
        "document_version_id": str(asset.document_version_id),
        "asset_type": asset.asset_type.value,
        "target_lang": asset.target_lang,
        "profile": asset.profile,
        "content": asset.content,
        "updated_at": asset.updated_at,
    }


@router.post("/documents/{document_version_id}/assets/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_document_asset(
    document_version_id: UUID,
    payload: DocumentAssetGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    
    version = await db.get(DocumentVersion, document_version_id)
    if version is None or version.is_deleted:
        raise atlas_error("ASSET_003", "Document version not found.", status_code=404)

    asset_type = payload.asset_type.strip().upper()
    doc_uuids = [version.id]
    
    try:
        # Generate the asset logic
        content_payload = {}
        
        if asset_type == "FLASHCARDS":
            asset = await generation_service.generate_and_persist_flashcards(doc_uuids, 10, current_user, db)
            content_payload = {"title": asset.title, "card_count": asset.card_count}
        elif asset_type == "QUIZ":
            asset = await generation_service.generate_and_persist_quiz(doc_uuids, 10, current_user, db)
            content_payload = {"total_questions": asset.total_questions}
        elif asset_type == "SUMMARY":
            asset = await generation_service.generate_and_persist_summary(doc_uuids, "EXECUTIVE", payload.target_lang, current_user, db)
            content_payload = asset.content
        elif asset_type == "MINDMAP":
            asset = await generation_service.generate_and_persist_mindmap(doc_uuids, payload.target_lang, current_user, db)
            content_payload = {
                "title": asset.title,
                "nodes": asset.nodes_json,
                "edges": asset.edges_json
            }
        else:
            raise atlas_error("ASSET_001", "Unsupported asset type.", status_code=400)

        return {
            "id": str(asset.id),
            "document_version_id": str(version.id),
            "asset_type": asset_type,
            "target_lang": payload.target_lang,
            "profile": payload.profile,
            "content": content_payload,
            "updated_at": datetime.utcnow().isoformat(),
            "status": "READY"
        }
    except RuntimeError as e:
        if "exhausted ALL models" in str(e) or "503" in str(e) or "429" in str(e):
            raise atlas_error("AI_503", "The AI provider is currently experiencing high demand. Please try again in a few moments.", status_code=503)
        raise atlas_error("GEN_500", f"Generation failed: {str(e)}", status_code=500)