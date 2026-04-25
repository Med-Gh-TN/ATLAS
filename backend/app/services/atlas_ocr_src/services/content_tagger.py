"""
src/services/content_tagger.py
════════════════════════════════════════════════════════════════════════════════
Content Tagging Service

Responsibility: Accept a raw markdown string, run two-pass semantic chunking,
and return a list of typed chunk dicts.

Pass 1 (Sync):  SemanticDoclingParser — regex / structural pattern recognition.
Pass 2 (Async): LLM classify_content_type() — fires only for TEXT chunks that
                the parser flagged as needing deeper classification (e.g. BIOLOGY).

No storage I/O.  No LightRAG calls.  Pure document intelligence.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from model_bridge import OmniModelBridge
    from pdf_worker import SemanticDoclingParser as _SemanticDoclingParserType

logger = logging.getLogger(__name__)

# Content types we track in distribution logs.
_TRACKED_TYPES: tuple[str, ...] = ("MATH", "CODE", "TABLE", "IMAGE", "BIOLOGY", "TEXT")


class ContentTaggingPipeline:
    """
    Two-pass semantic chunking + content-type tagging.

    Pass 1 (Sync):  SemanticDoclingParser — regex structural hints.
    Pass 2 (Async): classify_content_type() — LLM BIOLOGY detection on TEXT chunks.

    Usage
    ─────
    tagger = ContentTaggingPipeline(bridge=bridge, semaphore=semaphore)
    chunks = await tagger.process_markdown(markdown_text)
    """

    def __init__(
        self,
        bridge: "OmniModelBridge",
        semaphore: asyncio.Semaphore,
    ) -> None:
        from pdf_worker import SemanticDoclingParser
        self.bridge    = bridge
        self.semaphore = semaphore
        self.parser: "_SemanticDoclingParserType" = SemanticDoclingParser()

    # ──────────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ──────────────────────────────────────────────────────────────────────────

    async def process_markdown(self, markdown_text: str) -> list[dict]:
        """
        Full two-pass pipeline.

        Parameters
        ──────────
        markdown_text : Raw markdown produced by Docling or VLM OCR.

        Returns
        ───────
        list[dict] — each element has keys:
            content, content_type, is_atomic, char_start, char_end
        """
        raw_chunks = self.parser.get_semantic_chunks(markdown_text)
        if not raw_chunks:
            logger.warning("ContentTaggingPipeline: Parser returned 0 chunks.")
            return []

        # Identify chunks that need LLM classification (e.g. BIOLOGY detection)
        needs_llm = [
            (i, c) for i, c in enumerate(raw_chunks)
            if c.get("needs_llm_classification")
        ]
        logger.info(
            f"ContentTaggingPipeline: {len(raw_chunks)} chunks, "
            f"{len(needs_llm)} queued for LLM classification."
        )

        if needs_llm:
            await self._run_llm_classification(raw_chunks, needs_llm)

        final_chunks = self._normalise(raw_chunks)
        self._log_distribution(final_chunks)
        return final_chunks

    # ──────────────────────────────────────────────────────────────────────────
    # PRIVATE HELPERS
    # ──────────────────────────────────────────────────────────────────────────

    async def _run_llm_classification(
        self,
        raw_chunks: list[dict],
        needs_llm: list[tuple[int, dict]],
    ) -> None:
        """Parallel LLM classification with semaphore-bounded concurrency."""

        async def classify_one(idx: int, chunk: dict) -> tuple[int, str]:
            async with self.semaphore:
                ct = await self.bridge.classify_content_type(chunk["content"])
            return idx, ct

        results = await asyncio.gather(
            *[classify_one(i, c) for i, c in needs_llm],
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, Exception):
                logger.error(
                    f"ContentTaggingPipeline: Classification failed: {result}. "
                    "Chunk keeps TEXT label."
                )
                continue
            idx, content_type = result
            raw_chunks[idx]["content_type"] = content_type

    @staticmethod
    def _normalise(raw_chunks: list[dict]) -> list[dict]:
        """Strip parser-internal keys and enforce a stable output schema."""
        return [
            {
                "content":      c["content"],
                "content_type": c.get("content_type", "TEXT"),
                "is_atomic":    c.get("is_atomic", False),
                "char_start":   c.get("char_start", 0),
                "char_end":     c.get("char_end",   0),
            }
            for c in raw_chunks
        ]

    @staticmethod
    def _log_distribution(chunks: list[dict]) -> None:
        distribution = ", ".join(
            f"{ct}={sum(1 for c in chunks if c['content_type'] == ct)}"
            for ct in _TRACKED_TYPES
        )
        logger.info(f"ContentTaggingPipeline: Distribution: {distribution}")