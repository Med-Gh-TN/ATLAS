import os
import hashlib
import json
import logging
import asyncio
import httpx
from typing import AsyncGenerator, Optional, List, Dict, Any
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
import meilisearch

from app.core.config import settings

logger = logging.getLogger(__name__)

# ==========================================
# CONFIGURATION & INFRASTRUCTURE SETUP
# ==========================================
# Global HTTP client with connection pooling for high-concurrency chat sessions
http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(connect=5.0, read=60.0, write=5.0, pool=10.0),
    limits=httpx.Limits(max_keepalive_connections=5, max_connections=50),
)

# Defensive Architecture: Initialize MeiliSearch Client securely
MEILI_URL = os.getenv("MEILI_URL", "http://localhost:7700")
MEILI_MASTER_KEY = os.getenv("MEILI_MASTER_KEY", "meili_master_key")
meili_client = meilisearch.Client(MEILI_URL, MEILI_MASTER_KEY)

# Lazy loading for the embedding model to save memory footprint during boot
_embedder = None


def get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer

        logger.info(
            "[AI_CORE] Loading SentenceTransformer embedding model into memory..."
        )
        _embedder = SentenceTransformer(
            "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
        )
    return _embedder


# SOTA: Load System Prompt into memory at boot to prevent Disk I/O during streaming
# ARCHITECT FIX: Traverse up two levels (ai_core -> services -> app) to hit the prompts directory.
PROMPT_FILE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../prompts/rag_system_prompt.md")
)

try:
    with open(PROMPT_FILE_PATH, "r", encoding="utf-8") as f:
        RAG_SYSTEM_PROMPT_TEMPLATE = f.read().strip()
        logger.info(
            f"[AI_CORE] System prompt successfully loaded from {PROMPT_FILE_PATH}"
        )
except FileNotFoundError:
    logger.error(
        f"[INFERENCE] Prompt template not found at {PROMPT_FILE_PATH}. Using hardcoded fallback."
    )
    RAG_SYSTEM_PROMPT_TEMPLATE = (
        "Tu es l'intelligence académique ATLAS. "
        "Langue de réponse: {language}. "
        "Contrainte 1: Utilise uniquement le contexte fourni pour répondre. "
        "Contrainte 2: Cite systématiquement la page source via [Page X]. "
        "Contrainte 3: Si la réponse n'est pas dans le contexte, dis-le poliment."
    )


# ==========================================
# HYBRID RAG SEARCH (Lexical + Semantic + RRF)
# ==========================================


def _embed_query_sync(q: str) -> List[float]:
    """CPU-bound embedding isolated for threading to prevent event loop blocking."""
    try:
        m = get_embedder()
        return m.encode([q], normalize_embeddings=True)[0].tolist()
    except Exception as e:
        raise RuntimeError(f"Embedding failed: {str(e)}")


def _meili_search_sync(
    query: str, filters: List[str], limit: int, specific_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    IO-bound MeiliSearch call isolated for threading.
    Supports faceted filtering and explicit ID fetching for RRF candidate metadata resolution.
    """
    index = meili_client.index("documents")
    search_params = {
        "limit": limit,
        "attributesToHighlight": ["title", "ocr_text", "tags"],
        "highlightPreTag": "<mark>",
        "highlightPostTag": "</mark>",
        "attributesToRetrieve": [
            "id",
            "document_version_id",
            "title",
            "teacher_name",
            "is_official",
            "quality_score",
            "tags",
            "filiere",
        ],
    }

    final_filters = list(filters) if filters else []

    # Enable fetching specific metadata for semantic candidates
    if specific_ids:
        ids_str = ", ".join([f"'{x}'" for x in specific_ids])
        final_filters.append(f"document_version_id IN [{ids_str}]")

    if final_filters:
        search_params["filter"] = final_filters

    return index.search(query, search_params)


async def execute_hybrid_search(
    query: str,
    filiere: Optional[str],
    niveau: Optional[str],
    annee: Optional[str],
    type_cours: Optional[str],
    langue: Optional[str],
    is_official: Optional[bool],
    top_k: int,
    session: AsyncSession,
    request_app_state: Any,
) -> List[Dict[str, Any]]:
    """
    US-09: True Hybrid Search combining MeiliSearch (Lexical/Typo) + pgvector (Semantic)
    - Utilizes Reciprocal Rank Fusion (RRF) on independently executed searches.
    - Applies strict backend-level facet filtering.
    """
    if not query.strip() and not filiere and not niveau and not is_official:
        raise ValueError(
            "At least one search parameter (query, filiere, niveau, is_official) must be provided."
        )

    # 1. DEFENSIVE ARCHITECTURE: Cache-Aside Implementation
    raw_key = f"{query}|{filiere}|{niveau}|{annee}|{type_cours}|{langue}|{is_official}|{top_k}"
    hashed_key = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    cache_key = f"cache:search:v1:{hashed_key}"

    redis_cache = getattr(request_app_state, "redis_cache", None)

    if redis_cache:
        try:
            cached_payload = await redis_cache.get(cache_key)
            if cached_payload:
                logger.debug(f"[SEARCH] Cache hit for query: {query}")
                return json.loads(cached_payload)
        except Exception as e:
            logger.warning(f"[SEARCH] Redis cache GET failure: {e}")

    # 2. Build Faceted Filters for MeiliSearch
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

    # 3. Execute INDEPENDENT Semantic Search (pgvector)
    sem_ranks = {}
    if query.strip():
        try:
            query_vector = await asyncio.to_thread(_embed_query_sync, query)
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
                    sa.bindparam("limit", value=top_k * 5),
                )
            )

            for i, row in enumerate(sem_res.mappings().all()):
                sem_ranks[str(row["document_version_id"])] = i + 1

        except Exception as e:
            logger.warning(
                f"[SEARCH] Semantic search degraded. Falling back to Lexical-only: {e}"
            )

    # 4. Execute INDEPENDENT Lexical Search (MeiliSearch)
    meili_ranks = {}
    try:
        lex_results = await asyncio.to_thread(
            _meili_search_sync, query, filters, top_k * 3
        )
        for i, hit in enumerate(lex_results.get("hits", [])):
            meili_ranks[hit["document_version_id"]] = i + 1
    except Exception as e:
        logger.error(f"[SEARCH] MeiliSearch execution failed: {e}")

    # 5. Combine Candidates and Resolve Metadata via MeiliSearch
    # This acts as our facet enforcer for semantic results and retrieves snippets.
    all_candidate_ids = list(set(list(meili_ranks.keys()) + list(sem_ranks.keys())))
    candidate_data = {}

    if all_candidate_ids:
        try:
            meta_results = await asyncio.to_thread(
                _meili_search_sync,
                query,
                filters,
                len(all_candidate_ids),
                all_candidate_ids,
            )

            for hit in meta_results.get("hits", []):
                dv_id = hit["document_version_id"]
                formatted = hit.get("_formatted", {})
                snippet = formatted.get("ocr_text", "")
                if len(snippet) > 200:
                    snippet = snippet[:200] + "..."

                candidate_data[dv_id] = {
                    "document_version_id": dv_id,
                    "title": hit.get("title", ""),
                    "teacher_name": hit.get("teacher_name", ""),
                    "is_official": hit.get("is_official", False),
                    "quality_score": hit.get("quality_score", 0.0),
                    "tags": hit.get("tags", []),
                    "filiere": hit.get("filiere", ""),
                    "snippet": snippet,
                }
        except Exception as e:
            logger.error(f"[SEARCH] MeiliSearch candidate metadata fetch failed: {e}")

    # 6. Calculate True Reciprocal Rank Fusion (RRF)
    k_rrf = 60
    fused_results = []

    for dv_id, data in candidate_data.items():
        score = 0.0
        if dv_id in meili_ranks:
            score += 1.0 / (k_rrf + meili_ranks[dv_id])
        if dv_id in sem_ranks:
            score += 1.0 / (k_rrf + sem_ranks[dv_id])

        data["rrf_score"] = score
        fused_results.append(data)

    # 7. Apply Strict Business Logic Sorting
    # Priority: 1. Official Teacher (True > False), 2. RRF Score, 3. Quality Score
    fused_results.sort(
        key=lambda x: (x["is_official"], x["rrf_score"], x["quality_score"]),
        reverse=True,
    )

    final_results = fused_results[:top_k]

    # 8. Write to Cache
    if redis_cache:
        try:
            cache_ttl = getattr(settings, "CACHE_TTL_SEARCH", 3600)
            await redis_cache.setex(
                name=cache_key, time=cache_ttl, value=json.dumps(final_results)
            )
        except Exception as e:
            logger.warning(f"[SEARCH] Redis cache SET failure: {e}")

    return final_results


# ==========================================
# GENERATIVE INFERENCE ENGINE (Streaming)
# ==========================================


async def stream_llm_response(
    language: str, context: Optional[str], question: str
) -> AsyncGenerator[str, None]:
    """
    SOTA Hybrid Inference Engine.
    Routes tokens through a prioritized pipeline: Local Ollama -> Google AI Studio.
    """

    # Early Exit: Anti-Hallucination Guard yielded no context
    if context is None:
        fallback_msg = (
            "Information non trouvée dans ce cours."
            if language.lower() == "fr"
            else "Information not found in this course."
        )
        words = fallback_msg.split(" ")
        for i, word in enumerate(words):
            yield (
                json.dumps({"delta": word + (" " if i < len(words) - 1 else "")}) + "\n"
            )
            await asyncio.sleep(0.05)
        return

    # SOTA Prompt Engineering: Dynamic template injection
    system_prompt = RAG_SYSTEM_PROMPT_TEMPLATE.replace("{language}", language)
    user_prompt = f"CONTEXTE:\n{context}\n\nQUESTION:\n{question}"

    # -------------------------------------------------------------------------
    # PHASE 1: Primary Local Inference (Ollama)
    # -------------------------------------------------------------------------
    ollama_url = f"{settings.OLLAMA_BASE_URL}/api/chat"
    primary_model = settings.OLLAMA_MODEL_RAG

    ollama_payload = {
        "model": primary_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": True,
        "options": {"temperature": 0.3, "num_predict": 1024},
    }

    try:
        logger.info(f"[INFERENCE] Routing to Local Engine: {primary_model}")
        async with http_client.stream(
            "POST", ollama_url, json=ollama_payload
        ) as response:
            if response.status_code == 200:
                async for chunk in response.aiter_lines():
                    if not chunk:
                        continue
                    try:
                        data = json.loads(chunk)
                        token = data.get("message", {}).get("content", "")
                        if token:
                            yield json.dumps({"delta": token}) + "\n"
                        if data.get("done"):
                            return  # Successful local completion
                    except json.JSONDecodeError:
                        continue
            else:
                raise Exception(f"Ollama returned HTTP {response.status_code}")

    except Exception as primary_err:
        logger.warning(
            f"[INFERENCE] Local Engine '{primary_model}' failed: {primary_err}"
        )

    # -------------------------------------------------------------------------
    # PHASE 2: Cloud Fallback (Google AI Studio - Gemma 3 Optimized)
    # -------------------------------------------------------------------------
    api_key = settings.GOOGLE_AI_API_KEY
    fallback_model = settings.GOOGLE_AI_FALLBACK_MODEL

    if not api_key or "INSERT_NEW" in api_key:
        logger.error("[INFERENCE] Cloud Fallback aborted: Missing GOOGLE_AI_API_KEY.")
        yield (
            json.dumps(
                {"error": "Local engine offline. Cloud fallback not configured."}
            )
            + "\n"
        )
        return

    logger.info(f"[INFERENCE] Routing to Cloud Fallback: {fallback_model}")

    google_url = f"https://generativelanguage.googleapis.com/v1beta/models/{fallback_model}:streamGenerateContent?alt=sse&key={api_key}"

    # Architect Note: Flattened structure for Gemma 3 27B compatibility
    google_payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": f"SYSTEM_INSTRUCTIONS: {system_prompt}\n\nUSER_QUERY: {user_prompt}"
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
        },
    }

    try:
        async with http_client.stream(
            "POST", google_url, json=google_payload
        ) as response:
            if response.status_code != 200:
                err_content = await response.aread()
                logger.error(
                    f"[INFERENCE] Cloud Fallback rejected request ({response.status_code}): {err_content.decode()}"
                )
                raise Exception("Cloud API rejected request.")

            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue

                # Strip 'data: ' prefix
                payload_data = line[6:]
                if payload_data == "[DONE]":
                    break

                try:
                    data = json.loads(payload_data)
                    candidates = data.get("candidates", [])
                    if candidates and candidates[0].get("content", {}).get("parts"):
                        token = candidates[0]["content"]["parts"][0].get("text", "")
                        if token:
                            yield json.dumps({"delta": token}) + "\n"
                except json.JSONDecodeError:
                    continue

    except Exception as fallback_err:
        logger.error(f"CRITICAL: All inference engines failed: {fallback_err}")
        yield (
            json.dumps(
                {
                    "error": "Service temporarily unavailable. Our engineers are investigating."
                }
            )
            + "\n"
        )
