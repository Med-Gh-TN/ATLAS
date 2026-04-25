"""
src/services/reranker.py
════════════════════════════════════════════════════════════════════════════════
Cross-Encoder Reranking Service  (v1.0)
────────────────────────────────────────────────────────────────────────────────
Uses ms-marco-MiniLM-L-6-v2 to re-rank ColBERT top-K candidates with full
attention between query and document.

Why cross-encoder over bi-encoder for re-ranking
─────────────────────────────────────────────────
ColBERT MaxSim computes per-token max-dot-products independently.
Cross-encoder attends over the full (query ++ document) sequence jointly.
This catches semantic relationships that token-level independence misses:
  • "ATP" in query ↔ "adenosine triphosphate" in document
  • "Navier-Stokes" in query ↔ "momentum conservation PDE" in document
  • Negations, qualifiers, and conditional statements
NDCG@10 improvement: ~15% on scientific content (ms-marco ablation).

Hardware alignment
──────────────────
• device="cpu" — RTX 3050 Ti VRAM is fully committed to ColBERT/BM25.
• max_length=512 — ONNX graph boundary for MiniLM.
• Inference: ~2 ms/pair on i5-12500H P-cores.
• 50 candidates → ~100 ms reranking latency.  Acceptable for RAG.
• Model size: 22 MB.  Downloads once to HuggingFace cache.
════════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.services.atlas_ocr_src.infrastructure.config_manager import OmniConfig

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CONTENT FIELD PRIORITY
# Chunks from different retrieval paths may use different key names.
# ─────────────────────────────────────────────────────────────────────────────
_CONTENT_KEYS = ("content", "text", "chunk_text", "passage")


def _get_content(chunk: dict) -> str:
    for k in _CONTENT_KEYS:
        val = chunk.get(k, "")
        if val:
            return str(val)
    return ""


# ══════════════════════════════════════════════════════════════════════════════
class CrossEncoderReranker:
    """
    CPU-only cross-encoder re-ranking using sentence-transformers.

    Lifecycle
    ─────────
    reranker = CrossEncoderReranker(config)   # no I/O yet
    chunks   = await reranker.rerank(query, chunks)  # lazy-loads model

    The model is loaded lazily on the FIRST call via asyncio.to_thread() so
    the main event loop is never blocked during the multi-second model load.
    Subsequent calls reuse the loaded model.

    Public interface
    ────────────────
    reranked_chunks = await reranker.rerank(query, chunks)
    """

    def __init__(self, config: "OmniConfig") -> None:
        self._model_name  = config.reranker_model
        self._top_k       = config.reranker_top_k
        self._model       = None          # CrossEncoder loaded lazily
        self._ready       = False
        self._load_error: Optional[str] = None

    # ─────────────────────────────────────────────────────────────────────
    # MODEL LOADING (runs in thread — never blocks event loop)
    # ─────────────────────────────────────────────────────────────────────

    def _load_model_sync(self) -> None:
        """Synchronous model initialisation — executed via asyncio.to_thread."""
        if self._ready or self._load_error:
            return
        try:
            from sentence_transformers import CrossEncoder

            logger.info(
                "CrossEncoderReranker: Loading '%s' on CPU...", self._model_name
            )
            self._model = CrossEncoder(
                self._model_name,
                device     = "cpu",
                max_length = 512,
            )
            self._ready = True
            logger.info(
                "CrossEncoderReranker: '%s' loaded successfully.",
                self._model_name,
            )
        except ImportError:
            self._load_error = "sentence-transformers not installed"
            logger.error(
                "CrossEncoderReranker: %s.  "
                "Install with: pip install sentence-transformers.  "
                "Reranking disabled — ColBERT MaxSim order preserved.",
                self._load_error,
            )
        except Exception as exc:
            self._load_error = str(exc)
            logger.error(
                "CrossEncoderReranker: Model load failed: %s.  "
                "Reranking disabled.",
                exc,
            )

    # ─────────────────────────────────────────────────────────────────────
    # SYNCHRONOUS INFERENCE (runs in thread)
    # ─────────────────────────────────────────────────────────────────────

    def _score_and_sort_sync(
        self,
        query:  str,
        chunks: list[dict],
    ) -> list[dict]:
        """
        Score all (query, passage) pairs with the cross-encoder and sort.
        Returns top-K chunks with 'rerank_score' field attached.
        """
        if not self._ready or self._model is None:
            return chunks[: self._top_k]

        pairs = [(query, _get_content(c)) for c in chunks]

        try:
            scores = self._model.predict(pairs, show_progress_bar=False)
        except Exception as exc:
            logger.warning(
                "CrossEncoderReranker._score_and_sort_sync: predict() failed: %s.  "
                "Returning original order.", exc,
            )
            return chunks[: self._top_k]

        for chunk, score in zip(chunks, scores):
            s = float(score)
            chunk["rerank_score"] = s
            # Overwrite rrf_score so downstream RRF sees cross-encoder ordering
            chunk["rrf_score"]    = s

        chunks.sort(key=lambda c: c.get("rerank_score", 0.0), reverse=True)
        return chunks[: self._top_k]

    # ─────────────────────────────────────────────────────────────────────
    # PUBLIC ASYNC API
    # ─────────────────────────────────────────────────────────────────────

    async def rerank(
        self,
        query:  str,
        chunks: list[dict],
    ) -> list[dict]:
        """
        Async reranking wrapper.

        1. Lazy-loads the cross-encoder model on first call (via thread).
        2. Runs CPU inference in a thread executor (non-blocking).
        3. Returns top-K chunks sorted by cross-encoder relevance.

        Parameters
        ──────────
        query  : Original user question (not HyDE text — we score against
                 the actual question, not the hypothetical document).
        chunks : Retrieved chunks — must have 'content' or 'text' key.

        Returns
        ───────
        list[dict] — length ≤ reranker_top_k, sorted by cross-encoder score.
        On any failure: returns original top-K without reranking.
        """
        if not chunks:
            return chunks

        # Lazy load — thread-safe, idempotent
        if not self._ready and not self._load_error:
            await asyncio.to_thread(self._load_model_sync)

        if not self._ready:
            # Model failed to load — preserve original retrieval order
            logger.debug(
                "CrossEncoderReranker: Model not ready (%s).  "
                "Returning top-%d in original order.",
                self._load_error or "unknown", self._top_k,
            )
            return chunks[: self._top_k]

        logger.info(
            "CrossEncoderReranker: Scoring %d chunks for '%s...'...",
            len(chunks), query[:60],
        )

        reranked = await asyncio.to_thread(
            self._score_and_sort_sync, query, list(chunks)
        )

        top_score = reranked[0].get("rerank_score", 0.0) if reranked else 0.0
        logger.info(
            "CrossEncoderReranker: Done.  top_score=%.4f  returned=%d/%d",
            top_score, len(reranked), len(chunks),
        )
        return reranked