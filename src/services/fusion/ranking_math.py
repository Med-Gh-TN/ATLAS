"""
src/services/fusion/ranking_math.py
════════════════════════════════════════════════════════════════════════════════
Vector Ranking & ColBERT Matrix Operations
════════════════════════════════════════════════════════════════════════════════
Single Responsibility: ColBERT MaxSim calculations, pure Reciprocal Rank Fusion (RRF),
and dynamic hardware routing (GPU -> CPU failover).

Changelog v6.6:
  - SOTA FIX: Eradicated fragile external RRF dependencies. 
  - SOTA FIX: Implemented mathematically pure RRF formula 1 / (k + rank).
"""

import asyncio
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# DYNAMIC HARDWARE ROUTING
# ──────────────────────────────────────────────────────────────────────────────
try:
    import cupy as cp
    HAS_GPU = True
except ImportError:
    HAS_GPU = False


def colbert_maxsim(query_matrix: np.ndarray, doc_matrix: np.ndarray) -> float:
    """
    Computes ColBERT MaxSim: mean of maximum similarities per query token.
    Attempts GPU execution first, gracefully falling back to CPU on VRAM overflow.
    """
    if query_matrix.ndim == 1:
        query_matrix = query_matrix.reshape(1, -1)
    if doc_matrix.ndim == 1:
        doc_matrix = doc_matrix.reshape(1, -1)

    if HAS_GPU:
        try:
            q_gpu = cp.asarray(query_matrix)
            d_gpu = cp.asarray(doc_matrix)
            sim_matrix = q_gpu @ d_gpu.T
            max_sims = sim_matrix.max(axis=1)
            return float(max_sims.mean().get())
        except Exception as e:
            logger.warning(
                "GPU MaxSim failed (potential VRAM overflow). Migrating workload to CPU. Error: %s", e
            )

    # CPU Execution Path (RAM)
    sim_matrix = query_matrix @ doc_matrix.T
    return float(sim_matrix.max(axis=1).mean())


# ──────────────────────────────────────────────────────────────────────────────
# RANKING AND FUSION LOGIC
# ──────────────────────────────────────────────────────────────────────────────

def _chunk_id(chunk: dict, fallback_idx: int = 0) -> str:
    """Extract a stable string ID from a chunk dict."""
    for key in ("id", "__id__", "chunk_id"):
        val = chunk.get(key)
        if val:
            return str(val)
    content = chunk.get("content", chunk.get("text", ""))[:50]
    return f"chunk_{fallback_idx}_{abs(hash(content))}"


def rerank_with_maxsim_sync(
    query_embedding: Optional[np.ndarray],
    chunks: list[dict],
) -> list[dict]:
    if query_embedding is None or not chunks:
        return chunks
        
    if query_embedding.ndim == 1:
        query_embedding = query_embedding.reshape(1, -1)

    scored: list[tuple[float, dict]] = []
    for chunk in chunks:
        doc_emb = chunk.get("embedding")
        if doc_emb is None:
            scored.append((chunk.get("rrf_score", 0.0), chunk))
            continue
            
        if not isinstance(doc_emb, np.ndarray):
            try:
                doc_emb = np.array(doc_emb, dtype=np.float32)
            except Exception:
                scored.append((chunk.get("rrf_score", 0.0), chunk))
                continue
                
        s = colbert_maxsim(query_embedding, doc_emb)
        chunk["rrf_score"] = s
        scored.append((s, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored]


async def async_rerank_with_maxsim(
    query_embedding: Optional[np.ndarray],
    chunks: list[dict],
) -> list[dict]:
    if not chunks or query_embedding is None:
        return chunks
    return await asyncio.to_thread(rerank_with_maxsim_sync, query_embedding, chunks)


def multi_vector_rrf(multi_results: list[list[dict]], k: int = 60) -> list[dict]:
    """
    SOTA FIX: Mathematically pure Reciprocal Rank Fusion (RRF) across N vector sets.
    Formula: Score = sum( 1 / (k + rank_in_list) )
    """
    registry: dict[str, dict] = {}
    rrf_scores: dict[str, float] = {}

    for result_set in multi_results:
        if not result_set:
            continue
            
        # Rank is 1-indexed for the mathematical formula
        for rank, chunk in enumerate(result_set, start=1):
            cid = _chunk_id(chunk, rank)
            if cid not in registry:
                registry[cid] = chunk
            
            # Accumulate RRF score across all lists where this chunk appears
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + (1.0 / (k + rank))

    if not rrf_scores:
        return []

    # Sort chunks purely by their new accumulated RRF score
    sorted_cids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)
    
    result: list[dict] = []
    for cid in sorted_cids:
        chunk = registry[cid].copy()
        chunk["rrf_score"] = rrf_scores[cid]
        result.append(chunk)
        
    return result