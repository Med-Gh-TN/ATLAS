"""
@file colbert_qdrant.py
@description ColBERT Qdrant Storage Adapter. Enforces strict tensor micro-batching and GC suspension to prevent CPU cache thrashing. (v7.0 Parent-Child Alignment)
@layer State Persistence
@dependencies os, time, math, re, logging, asyncio, gc, numpy, qdrant_client
"""

import os
import time
import math
import re
import logging
import asyncio
import gc
import numpy as np
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from qdrant_client import QdrantClient, models
from lightrag.utils import logger
from lightrag.kg.qdrant_impl import (
    QdrantVectorDBStorage,
    compute_mdhash_id_for_qdrant,
    ID_FIELD,
    WORKSPACE_ID_FIELD,
    CREATED_AT_FIELD,
    workspace_filter_condition,
)
from lightrag.kg.shared_storage import get_data_init_lock
from infrastructure.llm.bridge import raw_colbert_embed

DENSE_VECTOR_NAME  = "colbert_dense"
SPARSE_VECTOR_NAME = "bm25_sparse"
_RRF_K = 60

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")

def _rrf_fuse(
    ranked_lists: list[list[tuple[str, float]]],
    k: int = _RRF_K,
) -> list[tuple[str, float]]:
    rrf_scores: dict[str, float] = {}
    for ranked_list in ranked_lists:
        for rank_idx, (doc_id, _score) in enumerate(ranked_list):
            rank = rank_idx + 1
            rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (k + rank)
    return sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)

def _to_2d_list(matrix: Any) -> list[list[float]]:
    if isinstance(matrix, np.ndarray):
        if matrix.ndim == 1:
            raise TypeError(
                f"ARCHITECTURAL HALT: Received 1D vector shape {matrix.shape}. "
                "ColBERT upsert requires 2D token matrix [seq_len x dim]."
            )
        # SOTA: tolist() is implemented in C and is the fastest conversion method, 
        # but creates massive heap fragmentation. Protected by gc.disable() upstream.
        return matrix.tolist()
    if isinstance(matrix, list):
        if matrix and not isinstance(matrix[0], (list, np.ndarray)):
            raise TypeError(
                "ARCHITECTURAL HALT: Received flat list (1D). "
                "Expected list-of-lists [seq_len x dim] for ColBERT MaxSim upsert."
            )
        return matrix
    raise TypeError(f"Unsupported embedding type for upsert: {type(matrix)}")

def _coerce_query_to_2d(embedding: Any, expected_dim: int = 128) -> list[list[float]]:
    if embedding is None:
        return [[0.0] * expected_dim]
    if isinstance(embedding, dict):
        embedding = embedding.get(DENSE_VECTOR_NAME) or next(
            (v for v in embedding.values() if v is not None), None
        )
        if embedding is None:
            return [[0.0] * expected_dim]
    arr = np.asarray(embedding, dtype=np.float32)
    if arr.ndim == 1:
        return arr.reshape(1, -1).tolist()
    elif arr.ndim == 2:
        return arr.tolist()
    else:
        return arr.reshape(-1, arr.shape[-1]).tolist()

_BM25_EMBEDDER = None
_BM25_EMBEDDER_AVAILABLE: Optional[bool] = None

def _get_bm25_embedder():
    global _BM25_EMBEDDER, _BM25_EMBEDDER_AVAILABLE
    if _BM25_EMBEDDER_AVAILABLE is False:
        return None
    if _BM25_EMBEDDER is not None:
        return _BM25_EMBEDDER
    try:
        from fastembed import SparseTextEmbedding
        _BM25_EMBEDDER = SparseTextEmbedding("Qdrant/bm25")
        _BM25_EMBEDDER_AVAILABLE = True
        return _BM25_EMBEDDER
    except Exception:
        _BM25_EMBEDDER_AVAILABLE = False
        return None

def _compute_bm25_sparse_vectors_sync(texts: list[str]) -> list[dict]:
    """Synchronous BM25 computation worker."""
    embedder = _get_bm25_embedder()
    if embedder is not None:
        try:
            sparse_results = list(embedder.embed(texts))
            output = []
            for sp in sparse_results:
                indices = sp.indices.tolist() if hasattr(sp.indices, "tolist") else list(sp.indices)
                values  = sp.values.tolist()  if hasattr(sp.values,  "tolist") else list(sp.values)
                output.append({"indices": indices or [0], "values": values or [0.0]})
            return output
        except Exception:
            pass

    sparse_vectors = []
    for text in texts:
        tokens = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", text.lower())
        term_freq: dict[str, int] = {}
        for token in tokens:
            term_freq[token] = term_freq.get(token, 0) + 1
        if not term_freq:
            sparse_vectors.append({"indices": [0], "values": [0.0]})
            continue
        indices = [abs(hash(term)) % (2**31) for term in term_freq]
        values  = [math.log1p(tf) for tf in term_freq.values()]
        sparse_vectors.append({"indices": indices, "values": values})
    return sparse_vectors

async def _compute_bm25_async(texts: list[str]) -> list[dict]:
    """Async wrapper to prevent FastEmbed from blocking the FastAPI event loop."""
    return await asyncio.to_thread(_compute_bm25_sparse_vectors_sync, texts)


# ==============================================================================
# COLBERT QDRANT STORAGE ADAPTER
# ==============================================================================

class ColbertQdrantStorage(QdrantVectorDBStorage):
    
    # ── SOTA GLOBAL HARDWARE LOCKS ──
    GLOBAL_TENANT_ID: Optional[str] = None
    GLOBAL_FILE_PATH: Optional[str] = None
    GLOBAL_QUERY_TENANT_IDS: Optional[list[str]] = None
    # ────────────────────────────────

    async def initialize(self):
        async with get_data_init_lock():
            if self._initialized: return

            try:
                if self._client is None:
                    qdrant_url     = os.getenv("QDRANT_URL")
                    qdrant_path    = os.getenv("QDRANT_PATH")
                    qdrant_api_key = os.getenv("QDRANT_API_KEY") or None

                    if qdrant_url: self._client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
                    elif qdrant_path: self._client = QdrantClient(path=qdrant_path)

                expected_dim = int(os.getenv("EMBEDDING_DIMENSION", "128"))
                
                # SOTA FIX: Hard cap ColBERT batch size to prevent REST payload limits and L3 Cache Thrashing
                env_batch = int(os.getenv("QDRANT_UPSERT_BATCH_SIZE", "32"))
                self._upsert_batch_size = min(4, max(1, env_batch))
                
                logger.info(f"ColbertQdrantStorage: Upsert batch size clamped to {self._upsert_batch_size} "
                            "to protect i5-12500H L3 Cache from Late-Interaction Matrix Overflow.")

                if not self._client.collection_exists(self.final_namespace):
                    self._client.create_collection(
                        collection_name=self.final_namespace,
                        vectors_config={
                            DENSE_VECTOR_NAME: models.VectorParams(
                                size=expected_dim, 
                                distance=models.Distance.DOT,
                                multivector_config=models.MultiVectorConfig(
                                    comparator=models.MultiVectorComparator.MAX_SIM
                                ),
                            ),
                        },
                        sparse_vectors_config={
                            SPARSE_VECTOR_NAME: models.SparseVectorParams(
                                index=models.SparseIndexParams(on_disk=False)
                            )
                        },
                        hnsw_config=models.HnswConfigDiff(
                            m=32, 
                            ef_construct=256
                        ),
                        quantization_config=models.BinaryQuantization(
                            binary=models.BinaryQuantizationConfig(always_ram=True)
                        )
                    )
                    
                    self._client.create_payload_index(collection_name=self.final_namespace, field_name=WORKSPACE_ID_FIELD, field_schema=models.KeywordIndexParams(type=models.KeywordIndexType.KEYWORD))
                    self._client.create_payload_index(collection_name=self.final_namespace, field_name="content_type", field_schema=models.KeywordIndexParams(type=models.KeywordIndexType.KEYWORD))
                    # Index parent_id for fast resolution queries
                    self._client.create_payload_index(collection_name=self.final_namespace, field_name="parent_id", field_schema=models.KeywordIndexParams(type=models.KeywordIndexType.KEYWORD))

                self._initialized = True
            except Exception as e:
                logger.error(f"Init FAILED: {e}")
                raise

    async def upsert(self, data: dict):
        if not data: return

        current_time = int(time.time())
        tenant_id = self.GLOBAL_TENANT_ID or self.effective_workspace
        file_path = self.GLOBAL_FILE_PATH

        data_items = list(data.items())
        total_items = len(data_items)
        processed = 0

        while data_items:
            batch = data_items[:self._upsert_batch_size]
            del data_items[:self._upsert_batch_size]

            batch_keys = [k for k, v in batch]
            batch_contents = [v["content"] for k, v in batch]

            raw_embeddings, sparse_vectors = await asyncio.gather(
                raw_colbert_embed(batch_contents),
                _compute_bm25_async(batch_contents)
            )

            batch_points = []
            
            # 🚨 SOTA GC SUSPENSION 🚨
            # Converting dense ColBERT matrices to Python lists creates >100,000 float objects per batch.
            # We disable the Garbage Collector to prevent it from stalling the CPU while scanning this new heap.
            gc.disable()
            try:
                for i, (k, v) in enumerate(batch):
                    # SOTA FIX: Explicitly inject parent_id bypassing dynamic meta_fields filter
                    base_meta = {
                        ID_FIELD:           k,
                        WORKSPACE_ID_FIELD: tenant_id,
                        "document_uuid":    tenant_id,  
                        CREATED_AT_FIELD:   current_time,
                        "parent_id":        v.get("parent_id"),
                        "chunk_index":      v.get("chunk_index"),
                        **{f: val for f, val in v.items() if f in getattr(self, "meta_fields", [])},
                    }
                    if file_path:
                        base_meta["file_path"] = file_path
                        base_meta["source"]    = file_path

                    dense_matrix = _to_2d_list(raw_embeddings[i])
                    batch_points.append(
                        models.PointStruct(
                            id=compute_mdhash_id_for_qdrant(k, prefix=self.effective_workspace),
                            vector={DENSE_VECTOR_NAME: dense_matrix, SPARSE_VECTOR_NAME: sparse_vectors[i]},
                            payload=base_meta,
                        )
                    )
            finally:
                # Instantly re-enable GC once the structure is locked.
                gc.enable()

            await asyncio.to_thread(
                self._client.upsert,
                collection_name=self.final_namespace, 
                points=batch_points, 
                wait=True
            )

            processed += len(batch)
            logger.info(f"[{self.workspace}] Upserted [{processed}/{total_items}]")

            del batch
            del batch_keys
            del batch_contents
            del raw_embeddings
            del sparse_vectors
            del batch_points
            
            # Force the GC to reap the massive list structure we just sent to Qdrant
            gc.collect()
            await asyncio.sleep(0.05) 

    async def query(self, query: str, top_k: int, query_embedding=None) -> list:
        env_dim = int(os.getenv("EMBEDDING_DIMENSION", "128"))

        if query_embedding is not None: 
            dense_matrix = _coerce_query_to_2d(query_embedding, expected_dim=env_dim)
        else:
            raw = await raw_colbert_embed([query])
            dense_matrix = _coerce_query_to_2d(raw[0], expected_dim=env_dim)

        sparse_query_vectors = await _compute_bm25_async([query])
        sparse_query = sparse_query_vectors[0]

        tenant_ids = self.GLOBAL_QUERY_TENANT_IDS
        if tenant_ids and len(tenant_ids) > 0 and "global" not in tenant_ids:
            workspace_flt = models.Filter(must=[models.FieldCondition(key=WORKSPACE_ID_FIELD, match=models.MatchAny(any=tenant_ids))])
        else:
            workspace_flt = models.Filter(must=[workspace_filter_condition(self.effective_workspace)])

        query_response = await asyncio.to_thread(
            self._client.query_points,
            collection_name=self.final_namespace,
            prefetch=[
                models.Prefetch(
                    query=models.SparseVector(indices=sparse_query["indices"], values=sparse_query["values"]), 
                    using=SPARSE_VECTOR_NAME, 
                    limit=top_k * 10, 
                    filter=workspace_flt
                ),
                models.Prefetch(
                    query=dense_matrix, 
                    using=DENSE_VECTOR_NAME, 
                    limit=top_k * 10, 
                    filter=workspace_flt
                ),
            ],
            query=models.FusionQuery(fusion=models.Fusion.RRF), 
            limit=top_k, 
            with_payload=True
        )
        
        results = query_response.points

        if not results:
            logger.warning("RRF Fusion returned 0 vectors. Executing pure Dense-Vector fallback.")
            fallback_response = await asyncio.to_thread(
                self._client.query_points,
                collection_name=self.final_namespace,
                query=dense_matrix,
                using=DENSE_VECTOR_NAME,
                limit=top_k,
                filter=workspace_flt,
                with_payload=True
            )
            results = fallback_response.points

        return [
            {**dp.payload, "distance": 1.0, "rrf_score": dp.score, CREATED_AT_FIELD: dp.payload.get(CREATED_AT_FIELD)}
            for dp in results
        ]