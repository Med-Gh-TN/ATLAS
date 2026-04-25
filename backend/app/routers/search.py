from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.core.limits import limiter
from app.db.session import get_session
from app.services.ai_core.rag_inference import execute_hybrid_search, meili_client


router = APIRouter(tags=["Search"])


class SearchResultItem(BaseModel):
    document_version_id: str
    title: str
    teacher_name: str | None = None
    is_official: bool = False
    quality_score: float | None = 0.0
    snippet: str
    tags: list[str] = Field(default_factory=list)
    filiere: str | None = None
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


@router.get("/search", response_model=SearchResponse, dependencies=[Depends(limiter(60, 60))])
async def search(
    request: Request,
    q: str = Query(..., min_length=1),
    filiere: str | None = None,
    niveau: str | None = None,
    type: str | None = None,
    annee: int | None = None,
    langue: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
) -> SearchResponse:
    if len(q.strip()) < 2:
        raise atlas_error(
            "SEARCH_001",
            "Search query must contain at least 2 characters.",
            field="q",
            status_code=400,
        )

    items = await execute_hybrid_search(
        query=q,
        filiere=filiere,
        niveau=niveau,
        annee=str(annee) if annee is not None else None,
        type_cours=type,
        langue=langue,
        is_official=None,
        top_k=limit,
        session=db,
        request_app_state=request.app.state,
    )

    return SearchResponse(
        items=[SearchResultItem(**item) for item in items],
        page=page,
        limit=limit,
        total=len(items),
    )


@router.get("/search/autocomplete", response_model=list[AutocompleteItem], dependencies=[Depends(limiter(60, 60))])
async def autocomplete(
    q: str = Query(..., min_length=2),
) -> list[AutocompleteItem]:
    try:
        result: dict[str, Any] = meili_client.index("documents").search(
            q,
            {
                "limit": 8,
                "attributesToRetrieve": ["document_version_id", "title", "course_type"],
            },
        )
    except Exception as exc:
        raise atlas_error(
            "GEN_002",
            "Autocomplete service is currently unavailable.",
            field="q",
            status_code=503,
        ) from exc

    suggestions: list[AutocompleteItem] = []
    for hit in result.get("hits", []):
        suggestions.append(
            AutocompleteItem(
                course_id=str(hit.get("document_version_id", "")),
                title=hit.get("title", ""),
                type=hit.get("course_type"),
            )
        )
    return suggestions
