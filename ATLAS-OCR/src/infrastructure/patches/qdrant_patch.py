"""
src/infrastructure/patches/qdrant_patch.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect Qdrant Storage Patch (v6.16)
────────────────────────────────────────────────────────────────────────────────
Responsibility: Async-safe dynamic workspace filtering, UUID normalization, 
and Named Vector routing for Jina-ColBERT v2 late-interaction compatibility.

Changelog v6.16:
- CRITICAL FIX: The Vector Router now deeply unwraps `ColBERTList` objects. 
  LightRAG passes `[{"colbert_dense": [...]}]` during querying. The interceptor 
  now extracts the matrix safely, permanently enabling native Qdrant similarity search.
"""

from __future__ import annotations

import logging
import hashlib
from typing import Optional

# Import our context variables from the new modular orchestrator
from . import get_active_namespace, get_active_query_uuids

logger = logging.getLogger(__name__)


def _ensure_uuid(item_id: str) -> str:
    """
    Qdrant strictly requires UUIDs or integers. 
    Hashes arbitrary relationship strings into 32-char hex.
    """
    item_id_str = str(item_id)
    if len(item_id_str) == 32 and all(c in "0123456789abcdefABCDEF" for c in item_id_str):
        return item_id_str
    return hashlib.md5(item_id_str.encode("utf-8")).hexdigest()

def _extract_colbert_vector(query_vector, kwargs):
    """
    Deep unwrapper. Strips away the list and dict layers from LightRAG 
    to expose the raw 2D ColBERT matrix to the Qdrant Rust backend.
    """
    target = query_vector
    # If LightRAG wrapped it in a ColBERTList, unwrap the first element
    if isinstance(target, list) and len(target) > 0 and isinstance(target[0], dict):
        target = target[0]
    
    # If we hit the dictionary payload, extract the dense matrix and set the route
    if isinstance(target, dict) and "colbert_dense" in target:
        kwargs["using"] = "colbert_dense"
        return target["colbert_dense"]
        
    return query_vector


def apply_qdrant_isolation() -> None:
    """
    SOTA Dynamic Label Partitioning, UUID Enforcement, and Named Vector Routing.
    """
    try:
        from lightrag.kg.qdrant_impl import QdrantVectorDBStorage
        import lightrag.kg.qdrant_impl as qdrant_impl
        from qdrant_client import models, AsyncQdrantClient

        # ======================================================================
        # 1. Shape-shifting Property Patch (Multi-Tenant Workspaces)
        # ======================================================================
        orig_effective = getattr(QdrantVectorDBStorage, "effective_workspace", None)
        
        @property
        def async_effective_workspace(self):
            ns = get_active_namespace()
            if ns and ns not in ("default", "global", ""):
                return ns
            uuids = get_active_query_uuids()
            if uuids and len(uuids) == 1 and uuids[0] not in ("global", ""):
                return uuids[0]
            if orig_effective is not None and hasattr(orig_effective, "fget") and orig_effective.fget:
                return orig_effective.fget(self)
            return getattr(self, "_base_workspace", "default")

        @async_effective_workspace.setter
        def async_effective_workspace(self, value):
            self._base_workspace = value

        QdrantVectorDBStorage.effective_workspace = async_effective_workspace

        # ======================================================================
        # 2. Multi-Doc Filter Interceptor
        # ======================================================================
        if hasattr(qdrant_impl, "workspace_filter_condition"):
            orig_filter = qdrant_impl.workspace_filter_condition
            def dynamic_filter(workspace: str):
                uuids = get_active_query_uuids()
                if uuids and len(uuids) > 1 and "global" not in uuids:
                    return models.Filter(
                        must=[
                            models.FieldCondition(
                                key="workspace_id", 
                                match=models.MatchAny(any=uuids)
                            )
                        ]
                    )
                return orig_filter(workspace)
            qdrant_impl.workspace_filter_condition = dynamic_filter

        # ======================================================================
        # 3. UUID Normalization Interceptor (Fixes 0 Relationship Vectors)
        # ======================================================================
        orig_upsert = getattr(QdrantVectorDBStorage, "upsert", None)
        if orig_upsert:
            async def _sota_upsert(self, data: dict[str, dict]):
                safe_data = {}
                for k, v in data.items():
                    safe_k = _ensure_uuid(k)
                    safe_v = v.copy()
                    safe_v["id"] = safe_k
                    safe_data[safe_k] = safe_v
                return await orig_upsert(self, safe_data)
            QdrantVectorDBStorage.upsert = _sota_upsert

        # ======================================================================
        # 4. Named Vector Routing Interceptor (Fixes 0 Chunk Retrieval)
        # ======================================================================
        orig_search = getattr(AsyncQdrantClient, "search", None)
        orig_query_points = getattr(AsyncQdrantClient, "query_points", None)

        if orig_search:
            async def _sota_search(self_client, collection_name, query_vector, **kwargs):
                kwargs.pop("score_threshold", None)
                # DEEP UNWRAP
                query_vector = _extract_colbert_vector(query_vector, kwargs)
                return await orig_search(self_client, collection_name=collection_name, query_vector=query_vector, **kwargs)
            AsyncQdrantClient.search = _sota_search

        if orig_query_points:
            async def _sota_query_points(self_client, collection_name, query, **kwargs):
                kwargs.pop("score_threshold", None)
                # DEEP UNWRAP
                query = _extract_colbert_vector(query, kwargs)
                return await orig_query_points(self_client, collection_name=collection_name, query=query, **kwargs)
            AsyncQdrantClient.query_points = _sota_query_points

        logger.info("Patches [QDRANT-ISOLATION]: SOTA Filtering, UUID Normalization, & Deep Vector Unwrapping online ✓")
    except Exception as e:
        logger.warning(f"Patches [QDRANT-ISOLATION]: Non-fatal — {e}")