"""
@file backend/app/routers/search.py
@description Search Router (Omni-Architect Pivot).
@layer Core Logic
@dependencies SQLAlchemy, HybridRAGPipeline, Meilisearch
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.exceptions import atlas_error
from app.core.limits import limiter
from app.db.session import get_session
from app.models.contribution import Contribution, DocumentVersion
from app.models.course import Course
from app.models.user import User
from app.dependencies import get_current_user
from app.infrastructure.meilisearch_client import search_courses

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Search"])

# [OMNI-ARCHITECT FIX]: meili_client & legacy rag_inference completely eradicated.

_omni_pipeline = None

async def _get_omni_pipeline():
    global _omni_pipeline
    if _omni_pipeline is None:
        try:
            from orchestrator import HybridRAGPipeline
            _omni_pipeline = HybridRAGPipeline()
            await _omni_pipeline.initialize()
        except ImportError as e:
            logger.error(f"CRITICAL: Failed to load Orchestrator for Search: {e}")
            raise atlas_error(
                "SYS_001",
                "Cognitive brain missing. Search unavailable.",
                status_code=503
            )
    return _omni_pipeline


class SearchResultItem(BaseModel):
    document_version_id: str
    course_id: str | None = None
    title: str
    teacher_name: str | None = None
    is_official: bool = False
    quality_score: float | None = 0.0
    snippet: str
    tags: list[str] = Field(default_factory=list)
    filiere: str | None = None
    level: str | None = None
    academic_year: str | None = None
    course_type: str | None = None
    language: str | None = None
    rrf_score: float


class SearchResponse(BaseModel):
    items: list[SearchResultItem]
    page: int
    limit: int
    total: int


class AutocompleteItem(BaseModel):
    course_id: str
    title: str
    type: str | None = None


class InstantCourseResult(BaseModel):
    course_id: str
    title: str
    level: str
    department_name: str
    academic_year: str
    description: str


async def _execute_omni_search(
    query: str,
    filiere: str | None,
    niveau: str | None,
    annee: str | None,
    type_cours: str | None,
    langue: str | None,
    is_official: bool | None,
    top_k: int
) -> list[dict[str, Any]]:
    """
    Executes a search query against the HybridRAGPipeline (Qdrant + Neo4j) 
    and formats the results for the frontend response.
    """
    pipeline = await _get_omni_pipeline()
    
    # We build a metadata filter map to pass down to the engine
    metadata_filters = {}
    if filiere: metadata_filters["filiere"] = filiere
    if niveau: metadata_filters["niveau"] = niveau
    if type_cours: metadata_filters["type_cours"] = type_cours
    
    try:
        # Utilize the orchestrator's core search capability
        # By default, search() in LightRAG returns context chunks. We adapt it.
        # Note: If the pipeline's search signature changes, this adapter will need updating.
        results = await pipeline.search(query, mode="hybrid", top_k=top_k)
        
        formatted_items = []
        for rank, res in enumerate(results):
            # Safe parsing of potential hybrid formats
            dv_id = res.get("document_id") or res.get("id", "")
            
            # Skip chunks with missing IDs
            if not dv_id:
                continue
                
            formatted_items.append({
                "document_version_id": str(dv_id),
                "title": res.get("title", f"Extracted Context {rank+1}"),
                "snippet": res.get("content", "")[:200] + "...",
                "rrf_score": res.get("score", 0.0),
                "tags": res.get("entities", []),
                "teacher_name": res.get("metadata", {}).get("author", "Atlas Faculty"),
            })
            
        return formatted_items
        
    except Exception as e:
        logger.error(f"Hybrid Search Execution Failed: {e}")
        return []


@router.get("/search", response_model=SearchResponse, dependencies=[Depends(limiter(60, 60))])
async def search(
    request: Request,
    q: str | None = Query(None, min_length=1),
    filiere: str | None = None,
    niveau: str | None = None,
    type: str | None = None,
    annee: int | None = None,
    langue: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SearchResponse:
    if not q and not filiere and not niveau and not type and not annee and not langue:
        raise atlas_error(
            "SEARCH_001",
            "Please provide a search query or at least one filter.",
            field="q",
            status_code=400,
        )

    if q and len(q.strip()) < 2:
        raise atlas_error(
            "SEARCH_002",
            "Search query must contain at least 2 characters.",
            field="q",
            status_code=400,
        )

    if not niveau:
        role_value = (
            current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        )
        if role_value == "STUDENT" and current_user.level:
            niveau = current_user.level if not hasattr(current_user.level, "value") else current_user.level.value

    # Execute Hybrid Graph-Vector Search
    items = await _execute_omni_search(
        query=q or "",
        filiere=filiere,
        niveau=niveau,
        annee=str(annee) if annee is not None else None,
        type_cours=type,
        langue=langue,
        is_official=None,
        top_k=limit,
    )

    dv_ids = [item.get("document_version_id") for item in items if item.get("document_version_id")]
    course_map: dict[str, str] = {}
    
    # Fast enrichment via Postgres Truth Layer
    if dv_ids:
        result = await db.execute(
            select(DocumentVersion.id, Contribution.course_id)
            .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
            .where(DocumentVersion.id.in_(dv_ids))
        )
        for dv_id, course_id in result.all():
            course_map[str(dv_id)] = str(course_id)

    enriched = []
    for item in items:
        dv_id = item.get("document_version_id")
        enriched.append(
            SearchResultItem(
                course_id=course_map.get(str(dv_id)),
                **item,
            )
        )

    return SearchResponse(
        items=enriched,
        page=page,
        limit=limit,
        total=len(enriched),
    )


@router.get("/search/autocomplete", response_model=list[AutocompleteItem], dependencies=[Depends(limiter(60, 60))])
async def autocomplete(
    q: str = Query(..., min_length=2),
    db: AsyncSession = Depends(get_session),
) -> list[AutocompleteItem]:
    """
    [OMNI-ARCHITECT PIVOT]: Bypassing Meilisearch.
    Using direct PostgreSQL ILIKE query on Course titles.
    """
    try:
        # Secure parameterized ILIKE query
        result = await db.execute(
            select(Course)
            .where(Course.title.ilike(f"%{q}%"), Course.is_deleted.is_(False))
            .limit(8)
        )
        courses = result.scalars().all()
        
        suggestions = []
        for course in courses:
            suggestions.append(
                AutocompleteItem(
                    course_id=str(course.id),
                    title=course.title,
                    type=course.level.value if hasattr(course.level, "value") else str(course.level)
                )
            )
        return suggestions

    except Exception as exc:
        raise atlas_error(
            "GEN_002",
            "Autocomplete service is currently unavailable.",
            field="q",
            status_code=503,
        ) from exc


@router.get("/search/instant", response_model=list[InstantCourseResult], dependencies=[Depends(limiter(60, 60))])
async def instant_search(
    q: str = Query(..., min_length=1, description="Search query for course title/description"),
    limit: int = Query(10, ge=1, le=30),
) -> list[InstantCourseResult]:
    """
    Instant course search powered by Meilisearch.
    Returns lightweight course cards for the frontend search-as-you-type.
    """
    try:
        raw = search_courses(q, limit=limit)
        hits = raw.get("hits", [])
        results = []
        for hit in hits:
            results.append(
                InstantCourseResult(
                    course_id=hit.get("id", ""),
                    title=hit.get("title", ""),
                    level=hit.get("level", ""),
                    department_name=hit.get("department_name", ""),
                    academic_year=hit.get("academic_year", ""),
                    description=hit.get("description", "")[:100] if hit.get("description") else "",
                )
            )
        return results
    except Exception as exc:
        logger.error("Meilisearch instant search failed: %s", exc)
        raise atlas_error(
            "SEARCH_MEILI_001",
            "Instant search is currently unavailable.",
            status_code=503,
        ) from exc