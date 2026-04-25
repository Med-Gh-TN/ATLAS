"""
@file reranker.py
@description Cross-Encoder Reranking Service (Hybrid Edge-Cloud Edition). 
Prioritizes Colab T4 GPU with pure asynchronous fallback.
@layer Core Logic
@dependencies infrastructure.config_manager, httpx
"""
from __future__ import annotations

import asyncio
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from infrastructure.config_manager import OmniConfig

logger = logging.getLogger(__name__)

_CONTENT_KEYS = ("content", "text", "chunk_text", "passage")

def _get_content(chunk: dict) -> str:
    for k in _CONTENT_KEYS:
        val = chunk.get(k, "")
        if val:
            return str(val)
    return ""

class CrossEncoderReranker:
    """Cross-encoder re-ranking using sentence-transformers, with pure async Edge-Cloud offloading."""

    def __init__(self, config: "OmniConfig") -> None:
        self._model_name   = config.reranker_model
        self._top_k        = config.reranker_top_k
        self._reranker_cores = config.reranker_cores
        
        self._model        = None
        self._ready        = False
        self._load_error: Optional[str] = None
        self._executor: Optional[ThreadPoolExecutor] = None

    def _init_thread_affinity(self):
        """Worker initializer: Pins the thread to specific CPU cores."""
        if hasattr(os, "sched_setaffinity") and self._reranker_cores:
            try:
                os.sched_setaffinity(0, set(self._reranker_cores))
                logger.debug("CrossEncoderReranker: Thread %s pinned to cores %s.", threading.get_ident(), self._reranker_cores)
            except Exception as e:
                logger.warning("CrossEncoderReranker: Failed to set CPU affinity: %s", e)

    async def initialize(self) -> None:
        if not self._ready and not self._load_error:
            self._executor = ThreadPoolExecutor(max_workers=1, initializer=self._init_thread_affinity)
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(self._executor, self._load_model_sync)

    def _load_model_sync(self) -> None:
        if self._ready or self._load_error:
            return
        try:
            import torch
            from sentence_transformers import CrossEncoder
            
            if self._reranker_cores:
                torch.set_num_threads(len(self._reranker_cores))

            logger.info("CrossEncoderReranker: Loading '%s' on CPU (Pinned Cores=%s)...", self._model_name, self._reranker_cores)
            self._model = CrossEncoder(self._model_name, device="cpu", max_length=512)
            self._ready = True
            logger.info("CrossEncoderReranker: '%s' loaded successfully.", self._model_name)
        except ImportError:
            self._load_error = "sentence-transformers not installed"
            logger.error("CrossEncoderReranker: %s. Reranking disabled.", self._load_error)
        except Exception as exc:
            self._load_error = str(exc)
            logger.error("CrossEncoderReranker: Model load failed: %s.", exc)

    def _score_and_sort_sync(self, query: str, chunks: list[dict]) -> list[dict]:
        if not self._ready or self._model is None:
            return chunks[: self._top_k]

        pairs = [(query, _get_content(c)) for c in chunks]

        try:
            scores = self._model.predict(pairs, show_progress_bar=False)
        except Exception as exc:
            logger.warning("CrossEncoderReranker: predict() failed: %s.", exc)
            return chunks[: self._top_k]

        for chunk, score in zip(chunks, scores):
            # SOTA FIX: Logits are stored independently. We DO NOT overwrite rrf_score.
            chunk["rerank_score"] = float(score)

        chunks.sort(key=lambda c: c.get("rerank_score", 0.0), reverse=True)
        return chunks[: self._top_k]

    async def rerank(self, query: str, chunks: list[dict]) -> list[dict]:
        """Async entry point for scoring chunks. Prioritizes non-blocking Colab Tunnel with local fallback."""
        if not chunks:
            return chunks

        use_external = os.getenv("USE_EXTERNAL_GPU", "false").lower() == "true"
        colab_url = os.getenv("COLAB_GPU_URL")
        tunnel_key = os.getenv("TUNNEL_API_KEY")

        # ── 1. SOTA Async Network Offloading ──
        if use_external and colab_url:
            try:
                headers = {"X-API-Key": tunnel_key} if tunnel_key else {}
                url = f"{colab_url.rstrip('/')}/rerank"
                text_chunks = [_get_content(c) for c in chunks]
                
                async with httpx.AsyncClient(timeout=12.0) as client:
                    response = await client.post(url, json={"query": query, "chunks": text_chunks}, headers=headers)
                    response.raise_for_status()
                    scores = response.json()["scores"]

                for chunk, score in zip(chunks, scores):
                    chunk["rerank_score"] = float(score)

                chunks.sort(key=lambda c: c.get("rerank_score", 0.0), reverse=True)
                logger.info("CrossEncoderReranker: Scored %d chunks via Colab GPU.", len(chunks))
                return chunks[: self._top_k]
            except Exception as e:
                logger.warning(
                    "CrossEncoderReranker: Colab tunnel failed (%s). "
                    "Falling back to local CPU execution.", str(e)
                )

        # ── 2. Fallback to Local P-Cores ──
        if not self._ready and not self._load_error:
            await self.initialize()

        if not self._ready or not self._executor:
            return chunks[: self._top_k]

        logger.info("CrossEncoderReranker: Scoring %d chunks locally...", len(chunks))
        loop = asyncio.get_running_loop()
        reranked = await loop.run_in_executor(
            self._executor, 
            self._score_and_sort_sync, 
            query, 
            list(chunks)
        )
        
        top_score = reranked[0].get("rerank_score", 0.0) if reranked else 0.0
        logger.info("CrossEncoderReranker: Done. top_score=%.4f returned=%d/%d", top_score, len(reranked), len(chunks))
        return reranked

    def shutdown(self):
        if self._executor:
            self._executor.shutdown(wait=False)