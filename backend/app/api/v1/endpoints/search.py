import os
import asyncio
import json
import hashlib
import logging
from typing import List, Optional, Dict, Any
import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import meilisearch
from pydantic import BaseModel

from app.db.session import get_session
from app.models.all_models import Contribution, DocumentVersion, Course, User
from app.core.limits import limiter
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Defensive Architecture: Initialize MeiliSearch Client securely
MEILI_URL = os.getenv("MEILI_URL", "http://localhost:7700")
MEILI_MASTER_KEY = os.getenv("MEILI_MASTER_KEY", "meili_master_key")
meili_client = meilisearch.Client(MEILI_URL, MEILI_MASTER_KEY)

# Lazy loading for the embedding model to save memory
_embedder = None

def get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        _embedder = SentenceTransformer("sentence-transformers/paraphrase-multilingual-mpnet-base-v2")
    return _embedder

def _embed_query_sync(q: str) -> List[float]:
    """CPU-bound embedding isolated for threading."""
    try:
        m = get_embedder()
        return m.encode([q], normalize_embeddings=True)[0].tolist()
    except Exception as e:
        raise RuntimeError(f"Embedding failed: {str(e)}")

def _meili_search_sync(query: str, filters: List[str], limit: int, specific_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    IO-bound MeiliSearch call isolated for threading.
    US-09: Supports faceted filtering and explicit ID fetching for RRF candidate metadata resolution.
    """
    index = meili_client.index("documents")
    search_params = {
        "limit": limit,
        "attributesToHighlight": ["title", "ocr_text", "tags"],
        "highlightPreTag": "<mark>",
        "highlightPostTag": "</mark>",
        "attributesToRetrieve": ["id", "document_version_id", "title", "teacher_name", "is_official", "quality_score", "tags", "filiere"]
    }
    
    final_filters = list(filters) if filters else []
    
    # Enable fetching specific metadata for semantic candidates
    if specific_ids:
        ids_str = ", ".join([f"'{x}'" for x in specific_ids])
        final_filters.append(f"document_version_id IN [{ids_str}]")
        
    if final_filters:
        search_params["filter"] = final_filters
        
    return index.search(query, search_params)

class SearchResultItem(BaseModel):
    document_version_id: str
    title: str
    teacher_name: Optional[str]
    is_official: bool
    quality_score: Optional[float]
    snippet: str
    tags: Optional[List[str]] = []
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

# US-24: Strict rate limiting applied to search (60 req/min/user)
@router.get("/search", response_model=List[SearchResultItem], dependencies=[Depends(limiter(60, 60))])
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
    US-09: True Hybrid Search combining MeiliSearch (Lexical/Typo) + pgvector (Semantic)
    - Replaces and absorbs the legacy /search/text route.
    - Utilizes Reciprocal Rank Fusion (RRF) on independently executed searches.
    - Applies strict backend-level facet filtering.
    """
    # 0. DEFENSIVE ARCHITECTURE: Cache-Aside Implementation
    raw_key = f"{q}|{filiere}|{niveau}|{annee}|{type_cours}|{langue}|{is_official}|{top_k}"
    hashed_key = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    cache_key = f"cache:search:v1:{hashed_key}"
    
    redis_cache = getattr(request.app.state, "redis_cache", None)
    
    if redis_cache:
        try:
            cached_payload = await redis_cache.get(cache_key)
            if cached_payload:
                parsed_payload = json.loads(cached_payload)
                return [SearchResultItem(**item) for item in parsed_payload]
        except Exception as e:
            logger.warning(f"Redis cache GET failure on search: {e}")

    # 1. Build Faceted Filters for MeiliSearch
    filters = []
    if filiere:
        filters.append(f"filiere = '{filiere}'")
    if niveau:
        filters.append(f"level = '{niveau}'")
    if annee:
        filters.append(f"academic_year = '{annee}'")
    if type_cours:
        filters.append(f"course_type = '{type_cours}'")
    if langue:
        filters.append(f"language = '{langue}'")
    if is_official is not None:
        filters.append(f"is_official = {str(is_official).lower()}")

    # 2. Execute INDEPENDENT Semantic Search (pgvector)
    sem_ranks = {}
    if q.strip():
        try:
            query_vector = await asyncio.to_thread(_embed_query_sync, q)
            # Fetch broader candidate pool (top_k * 5) to account for facet drop-offs during metadata sync
            sem_sql = sa.text("""
                SELECT e.document_version_id, MIN(e.vector <=> :q_vec) as dist
                FROM documentembedding e
                GROUP BY e.document_version_id
                ORDER BY dist ASC
                LIMIT :limit
            """)
            
            sem_res = await session.execute(
                sem_sql.bindparams(
                    sa.bindparam("q_vec", value=query_vector), 
                    sa.bindparam("limit", value=top_k * 5)
                )
            )
            
            for i, row in enumerate(sem_res.mappings().all()):
                sem_ranks[str(row["document_version_id"])] = i + 1
                
        except Exception as e:
            logger.warning(f"Semantic search degraded. Falling back to Lexical-only: {e}")

    # 3. Execute INDEPENDENT Lexical Search (MeiliSearch)
    meili_ranks = {}
    try:
        lex_results = await asyncio.to_thread(_meili_search_sync, q, filters, top_k * 3)
        for i, hit in enumerate(lex_results.get("hits", [])):
            meili_ranks[hit["document_version_id"]] = i + 1
    except Exception as e:
        logger.error(f"MeiliSearch execution failed: {e}")

    # 4. Combine Candidates and Resolve Metadata via MeiliSearch
    # This acts as our facet enforcer for semantic results and retrieves snippets.
    all_candidate_ids = list(set(list(meili_ranks.keys()) + list(sem_ranks.keys())))
    candidate_data = {}
    
    if all_candidate_ids:
        try:
            # Query MeiliSearch with the specific candidate IDs AND the strict facet filters
            meta_results = await asyncio.to_thread(_meili_search_sync, q, filters, len(all_candidate_ids), all_candidate_ids)
            
            for hit in meta_results.get("hits", []):
                dv_id = hit["document_version_id"]
                
                # Highlight Extraction
                formatted = hit.get("_formatted", {})
                snippet = formatted.get("ocr_text", "")
                if len(snippet) > 200:
                    snippet = snippet[:200] + "..."
                    
                candidate_data[dv_id] = {
                    "title": hit.get("title", ""),
                    "teacher_name": hit.get("teacher_name", ""),
                    "is_official": hit.get("is_official", False),
                    "quality_score": hit.get("quality_score", 0.0),
                    "tags": hit.get("tags", []),
                    "filiere": hit.get("filiere", ""),
                    "snippet": snippet
                }
        except Exception as e:
            logger.error(f"MeiliSearch candidate metadata fetch failed: {e}")

    # 5. Calculate True Reciprocal Rank Fusion (RRF)
    k_rrf = 60
    fused_results = []
    
    # Only process documents that survived the facet filtering in Step 4
    for dv_id, data in candidate_data.items():
        score = 0.0
        if dv_id in meili_ranks:
            score += 1.0 / (k_rrf + meili_ranks[dv_id])
        if dv_id in sem_ranks:
            score += 1.0 / (k_rrf + sem_ranks[dv_id])
            
        fused_results.append(
            SearchResultItem(
                document_version_id=dv_id,
                title=data["title"],
                teacher_name=data["teacher_name"],
                is_official=data["is_official"],
                quality_score=data["quality_score"],
                snippet=data["snippet"],
                tags=data.get("tags") or [],
                filiere=data.get("filiere"),
                rrf_score=score
            )
        )

    # 6. Apply Strict Business Logic Sorting
    # Priority: 1. Official Teacher (True > False), 2. RRF Score, 3. Quality Score
    fused_results.sort(key=lambda x: (
        x.is_official, 
        x.rrf_score, 
        x.quality_score
    ), reverse=True)

    final_results = fused_results[:top_k]

    # 7. Write to Cache
    if redis_cache:
        try:
            cache_payload = [item.model_dump() for item in final_results]
            await redis_cache.setex(
                name=cache_key,
                time=settings.CACHE_TTL_SEARCH,
                value=json.dumps(cache_payload)
            )
        except Exception as e:
            logger.warning(f"Redis cache SET failure on search: {e}")

    return final_results