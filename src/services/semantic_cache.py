"""
src/services/semantic_cache.py
════════════════════════════════════════════════════════════════════════════════
SOTA Asymmetric Semantic Cache (v2.3 — Affinity-Optimized)
────────────────────────────────────────────────────────────────────────────────
Architecture: Decouples Caching (Dense BGE) from Retrieval (Late-Interaction).
This service manages its own local embedding session to ensure intent-matching
precision that mean-pooled ColBERT vectors cannot achieve.

Changelog v2.3
──────────────
- [SOTA] CPU Affinity: Removed asyncio Mutex. Replaced with OS-level thread
         pinning (os.sched_setaffinity) mapping the PyTorch executor strictly
         to CACHE_CORES defined in .env to eliminate L3 cache thrashing.
════════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import asyncio
import logging
import time
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Optional, Any

import numpy as np

if TYPE_CHECKING:
    from infrastructure.config_manager import OmniConfig
    from infrastructure.llm.bridge import OmniModelBridge

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
_CACHE_COLLECTION = "semantic_query_cache"
_MIN_ANSWER_LEN   = 30
_POINT_ID_MOD     = 2 ** 31 - 1


class SemanticCacheService:
    """
    Qdrant-backed semantic cache utilizing Asymmetric Dense Embeddings (BGE).
    """

    def __init__(self, bridge: "OmniModelBridge", config: "OmniConfig") -> None:
        self._bridge = bridge
        self._config = config
        
        # Hyper-parameters from .env
        self._threshold = float(os.getenv("CACHE_SIMILARITY_THRESHOLD", "0.85"))
        self._model_name = os.getenv("CACHE_EMBEDDER_MODEL", "BAAI/bge-m3")
        self._dim = int(os.getenv("CACHE_EMBEDDING_DIM", "1024"))
        
        # Hardware Affinity Topology
        self._cache_dir = os.getenv("FASTEMBED_CACHE_PATH")
        self._threads = int(os.getenv("FASTEMBED_THREADS", "6"))
        self._cache_cores = self._config.cache_cores
        
        self._client = None
        self._embedder = None
        self._ready = False
        self._hits = 0
        self._misses = 0

        # Dedicated execution pool for strict OS-level thread pinning
        self._executor: Optional[ThreadPoolExecutor] = None

    # ─────────────────────────────────────────────────────────────────────
    # LIFECYCLE & MIGRATION
    # ─────────────────────────────────────────────────────────────────────

    def _init_thread_affinity(self):
        """Worker initializer: Pins the thread to specific CPU cores."""
        if hasattr(os, "sched_setaffinity") and self._cache_cores:
            try:
                # 0 means current thread
                os.sched_setaffinity(0, set(self._cache_cores))
                logger.debug("SemanticCache: Thread %s pinned to cores %s.", threading.get_ident(), self._cache_cores)
            except Exception as e:
                logger.warning("SemanticCache: Failed to set CPU affinity: %s", e)

    async def initialize(self) -> None:
        """Initialize specialized embedder and manage Qdrant collection migration."""
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams, KeywordIndexParams, KeywordIndexType
            import torch
            from sentence_transformers import SentenceTransformer

            # 1. Initialize Dedicated Cache Embedder (BGE-M3 via SentenceTransformers)
            # Restrict PyTorch's internal threading to match our assigned cores
            if self._cache_cores:
                torch.set_num_threads(len(self._cache_cores))
            else:
                torch.set_num_threads(self._threads)
            
            logger.info("SemanticCache: Loading %s via sentence-transformers (Pinned Cores=%s)...", self._model_name, self._cache_cores)

            # Create a dedicated ThreadPoolExecutor for this model, running the affinity initializer
            self._executor = ThreadPoolExecutor(max_workers=1, initializer=self._init_thread_affinity)
            
            device = "cuda" if torch.cuda.is_available() else "cpu"
            
            # Load model within the pinned executor
            loop = asyncio.get_running_loop()
            self._embedder = await loop.run_in_executor(
                self._executor,
                lambda: SentenceTransformer(
                    self._model_name,
                    cache_folder=self._cache_dir,
                    device=device
                )
            )
            
            # 2. Connect to Qdrant
            self._client = QdrantClient(
                url=self._config.qdrant_url,
                api_key=self._config.qdrant_api_key or None,
                timeout=10,
            )

            # 3. Migration Logic: Dimension Check (e.g., 384 vs 1024)
            try:
                coll_info = await asyncio.to_thread(self._client.get_collection, _CACHE_COLLECTION)
                current_dim = coll_info.config.params.vectors.size
                if current_dim != self._dim:
                    logger.warning(
                        "SemanticCache: Dimension mismatch (%d vs %d). "
                        "Dropping legacy collection for migration...", 
                        current_dim, self._dim
                    )
                    await asyncio.to_thread(self._client.delete_collection, _CACHE_COLLECTION)
            except Exception:
                # Collection likely does not exist yet
                pass

            # 4. Create/Verify SOTA Collection
            existing = await asyncio.to_thread(self._client.get_collections)
            names = {c.name for c in existing.collections}

            if _CACHE_COLLECTION not in names:
                await asyncio.to_thread(
                    self._client.create_collection,
                    collection_name=_CACHE_COLLECTION,
                    vectors_config=VectorParams(size=self._dim, distance=Distance.COSINE),
                )
                # Payload index for ultra-fast workspace filtering
                await asyncio.to_thread(
                    self._client.create_payload_index,
                    collection_name=_CACHE_COLLECTION,
                    field_name="workspace_id",
                    field_schema=KeywordIndexParams(type=KeywordIndexType.KEYWORD),
                )
                logger.info("SemanticCache: Created new %d-dim collection.", self._dim)
            else:
                logger.debug("SemanticCache: Reusing existing collection.")

            self._ready = True
            logger.info("SemanticCache: Online [ASYMMETRIC]. Model=%s | Device=%s", self._model_name, device)
        except Exception as exc:
            logger.error("SemanticCache: Initialization failed: %s", exc)
            self._ready = False

    # ─────────────────────────────────────────────────────────────────────
    # EMBEDDING & FILTERS
    # ─────────────────────────────────────────────────────────────────────

    async def _embed(self, text: str) -> Optional[np.ndarray]:
        """Generate a single high-precision dense vector for intent matching."""
        if not self._embedder or not self._executor:
            return None
        try:
            # SOTA Affinity Fix: Execute the embedding inside our pinned ThreadPool
            # removing the need for a global Mutex lock.
            loop = asyncio.get_running_loop()
            vec = await loop.run_in_executor(
                self._executor,
                lambda: self._embedder.encode(
                    text,
                    normalize_embeddings=True,
                    show_progress_bar=False
                )
            )
            return vec.astype(np.float32)
        except Exception as exc:
            logger.error("SemanticCache: Local BGE embedding failed: %s", exc)
            return None

    def _resolve_workspace_id(self, document_uuids: Optional[list[str]]) -> str | list[str]:
        """Convert UUID list to workspace ID or list for filtering."""
        if not document_uuids or "global" in document_uuids:
            return "global"
        return document_uuids[0] if len(document_uuids) == 1 else document_uuids

    def _build_workspace_filter(self, document_uuids: Optional[list[str]]):
        """Build Qdrant Filter with MatchAny support for multi-slice documents."""
        from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny
        
        ws = self._resolve_workspace_id(document_uuids)
        if ws == "global":
            return Filter(must=[FieldCondition(key="workspace_id", match=MatchValue(value="global"))])
        
        if isinstance(ws, list):
            # SOTA: Support for Logical Document Expansion (Multiple Slices)
            return Filter(must=[FieldCondition(key="workspace_id", match=MatchAny(any=ws))])
            
        return Filter(must=[FieldCondition(key="workspace_id", match=MatchValue(value=ws))])

    # ─────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ─────────────────────────────────────────────────────────────────────

    async def get(self, query: str, document_uuids: Optional[list[str]] = None) -> Optional[dict]:
        """Search the cache for similar queries within the selected vault context."""
        if not self._ready or self._client is None:
            return None

        vec = await self._embed(query)
        if vec is None:
            self._misses += 1
            return None

        try:
            # Modern Qdrant Contract: query_points
            response = await asyncio.to_thread(
                self._client.query_points,
                collection_name=_CACHE_COLLECTION,
                query=vec.tolist(),
                query_filter=self._build_workspace_filter(document_uuids),
                limit=1,
                score_threshold=self._threshold,
                with_payload=True,
            )

            if response.points:
                hit = response.points[0]
                payload = hit.payload or {}
                self._hits += 1
                logger.info(
                    "SemanticCache [HIT]: sim=%.4f workspace=%s query='%s...'",
                    hit.score, payload.get("workspace_id", "unknown"), query[:40]
                )
                return {
                    "answer":            payload.get("answer", ""),
                    "trace_id":          payload.get("trace_id", "cached"),
                    "cached_at":         payload.get("cached_at", 0.0),
                    "similarity":        hit.score,
                    "original_question": payload.get("question", ""),
                }

            self._misses += 1
            return None
        except Exception as exc:
            logger.error("SemanticCache [MISS]: Qdrant retrieval error: %s", exc)
            self._misses += 1
            return None

    async def store(self, query: str, answer: str, trace_id: str = "", document_uuids: Optional[list[str]] = None) -> None:
        """Persist a new answer to the cache bound to the current workspace context."""
        if not self._ready or self._client is None:
            return
        if not query.strip() or len(answer.strip()) < _MIN_ANSWER_LEN:
            return

        vec = await self._embed(query)
        if vec is None:
            return

        try:
            from qdrant_client.models import PointStruct
            ws = self._resolve_workspace_id(document_uuids)
            
            # Incorporate workspace in ID to prevent collision across isolated vaults
            point_id = abs(hash(query + str(ws))) % _POINT_ID_MOD

            await asyncio.to_thread(
                self._client.upsert,
                collection_name=_CACHE_COLLECTION,
                points=[
                    PointStruct(
                        id=point_id,
                        vector=vec.tolist(),
                        payload={
                            "question":     query,
                            "answer":       answer,
                            "trace_id":     trace_id,
                            "cached_at":    time.time(),
                            "workspace_id": ws,
                        },
                    )
                ],
            )
            logger.info("SemanticCache [STORED]: Entry saved for workspace '%s'.", ws)
        except Exception as exc:
            logger.error("SemanticCache: Storage failed: %s", exc)

    async def invalidate_all(self) -> int:
        """Wipe the cache collection and re-initialize."""
        if not self._client:
            return 0
        try:
            await asyncio.to_thread(self._client.delete_collection, _CACHE_COLLECTION)
            self._ready = False
            await self.initialize()
            return 1
        except Exception:
            return 0

    def shutdown(self):
        """Cleanup resources."""
        if self._executor:
            self._executor.shutdown(wait=False)

    @property
    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            "enabled":   self._ready,
            "hits":      self._hits,
            "misses":    self._misses,
            "hit_rate":  round(self._hits / total, 2) if total else 0.0,
            "model":     self._model_name,
            "threshold": self._threshold,
        }