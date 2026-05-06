"""
@file ATLAS-OCR/src/services/reranker.py
@description Cross-Encoder Reranking Service.
SOTA FIX: 100% Thin Client. Stripped sentence-transformers to eliminate RAM/Disk usage.
@layer Core Logic
@dependencies infrastructure.config_manager, infrastructure.llm.vllm_client
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional
from infrastructure.llm.vllm_client import VLLMClient

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
    """Pure async Edge-Cloud Reranker. Zero local processing."""

    def __init__(self, config: "OmniConfig") -> None:
        self._top_k = config.reranker_top_k
        self._ready = True # Always ready, we rely on the network now.
        logger.info("CrossEncoderReranker: Operating in Strict Sovereign (Thin-Client) Mode.")

    async def initialize(self) -> None:
        pass # No models to load locally!

    async def rerank(self, query: str, chunks: list[dict]) -> list[dict]:
        if not chunks:
            return chunks

        text_chunks = [_get_content(c) for c in chunks]
        
        try:
            scores = await VLLMClient.rerank(query, text_chunks)
            for chunk, score in zip(chunks, scores):
                chunk["rerank_score"] = float(score)

            chunks.sort(key=lambda c: c.get("rerank_score", 0.0), reverse=True)
            logger.info("CrossEncoderReranker: Scored %d chunks via Kaggle GPU.", len(chunks))
            return chunks[: self._top_k]
            
        except Exception as e:
            logger.warning(f"CrossEncoderReranker: Tunnel failed ({e}). Returning unscored chunks.")
            return chunks[: self._top_k]

    def shutdown(self):
        pass