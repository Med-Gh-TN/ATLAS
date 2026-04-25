import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.db.session import get_session
from app.core.limits import limiter
from app.services.ai_core.rag_inference import execute_hybrid_search

logger = logging.getLogger(__name__)
router = APIRouter()

class SearchResultItem(BaseModel):
    """
    Contract for the API response.
    Strict typing ensures the service layer conforms to the expected output.
    """
    document_version_id: str
    title: str
    teacher_name: Optional[str] = None
    is_official: bool = False
    quality_score: Optional[float] = 0.0
    snippet: str
    tags: List[str] = Field(default_factory=list)
    filiere: Optional[str] = None
    rrf_score: float

async def search_user_identifier(request: Request) -> str:
    """
    Custom identifier for fastapi-limiter to enforce req/min/user.
    Falls back to IP if the user is unauthenticated.
    """
    auth_header = request.headers.get("Authorization")
    if auth_header:
        return auth_header
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0]
    return request.client.host if request.client else "127.0.0.1"

@router.get(
    "/search",
    response_model=List[SearchResultItem],
    dependencies=[Depends(limiter(60, 60))],
    summary="Execute Hybrid Semantic/Lexical Search",
    description="Delegates query execution to the AI Core service layer utilizing Reciprocal Rank Fusion."
)
async def search_hybrid(
    request: Request,
    q: str = Query("", description="Search query"),
    filiere: Optional[str] = Query(None, description="Department ID or name filter"),
    niveau: Optional[str] = Query(None, description="Level filter e.g., L1, M2"),
    annee: Optional[str] = Query(None, description="Academic year filter e.g., 2025-2026"),
    type_cours: Optional[str] = Query(None, description="Resource type e.g., LECTURE, TD"),
    langue: Optional[str] = Query(None, description="Language e.g., FR, AR"),
    is_official: Optional[bool] = Query(None, description="Filter for official teacher docs only"),
    top_k: int = Query(20, ge=1, le=50),
    session: AsyncSession = Depends(get_session)
):
    """
    US-09: True Hybrid Search Route.
    Endpoint acts strictly as a traffic controller. Business logic, caching,
    and model execution are delegated to the AI Core domain service.
    """
    client_id = await search_user_identifier(request)
    logger.info(
        f"Search execution initiated | User: {client_id} | Query: '{q}' | "
        f"Filters: filiere={filiere}, niveau={niveau}, is_official={is_official}"
    )

    try:
        # Delegate all IO/CPU bound operations, caching, and DB fusion to the service layer.
        results = await execute_hybrid_search(
            query=q,
            filiere=filiere,
            niveau=niveau,
            annee=annee,
            type_cours=type_cours,
            langue=langue,
            is_official=is_official,
            top_k=top_k,
            session=session,
            request_app_state=request.app.state # Pass state for Redis cache access within service
        )

        logger.debug(f"Search completed | Query: '{q}' | Results found: {len(results)}")
        return results

    except ValueError as ve:
        # Catch specific validation errors from the service layer
        logger.warning(f"Search validation error | Query: '{q}' | Error: {str(ve)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        # Catch infrastructure/model errors and sanitize the output
        logger.error(f"Search infrastructure failure | Query: '{q}' | Error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The search service is currently degraded. Please try again later."
        )