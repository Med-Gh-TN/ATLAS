"""
@file content_tagger.py
@description Content Tagging Service
@layer Core Logic
@dependencies asyncio, logging, gc, os, aiohttp

Responsibility: Accept a raw markdown string, run two-pass semantic chunking,
and return a list of typed chunk dicts. (v9.0 Parent-Child Alignment)
"""

from __future__ import annotations

import asyncio
import logging
import gc
import os
import aiohttp
from typing import TYPE_CHECKING

from infrastructure.config_manager import TaskType
from infrastructure.model_registry import VLLM_SENTINEL
from infrastructure.circuit_breaker import CBState

if TYPE_CHECKING:
    from infrastructure.llm.bridge import OmniModelBridge

logger = logging.getLogger(__name__)

_TRACKED_TYPES: tuple[str, ...] = ("MATH", "CODE", "TABLE", "IMAGE", "BIOLOGY", "TEXT")


class ContentTaggingPipeline:
    def __init__(
        self,
        bridge: "OmniModelBridge",
        semaphore: asyncio.Semaphore,
    ) -> None:
        self.bridge    = bridge
        self.semaphore = semaphore

    async def _preflight_sovereign_probe(self) -> None:
        """
        SOTA FIX: The Authenticated Canary Probe with Aggressive Sanitation.
        """
        use_ext = os.getenv("USE_EXTERNAL_GPU", "false").strip().lower() == "true"
        url = os.getenv("COLAB_GPU_URL", "").strip().rstrip("/")
        tunnel_key = os.getenv("TUNNEL_API_KEY", "").strip()
        
        if not use_ext or not url:
            return

        state = await self.bridge.circuit_breaker.get_state(TaskType.QUERY_ROUTER, VLLM_SENTINEL)
        if state == CBState.OPEN:
            return

        logger.info("ContentTaggingPipeline: Firing 5.0s Canary Probe to Sovereign Node...")
        try:
            headers = {"X-API-Key": tunnel_key} if tunnel_key else {}
            
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5.0)) as session:
                async with session.get(f"{url}/health", headers=headers) as res:
                    if res.status == 200:
                        logger.info("ContentTaggingPipeline: Sovereign Node Canary OK.")
                        return
                    else:
                        logger.warning(f"ContentTaggingPipeline: Canary rejected. HTTP Status: {res.status}")
        except aiohttp.ClientConnectorDNSError as dns_err:
            logger.warning(f"ContentTaggingPipeline: Canary DNS Error. Double check the COLAB_GPU_URL for typos. ({dns_err})")
        except Exception as e:
            logger.warning(f"ContentTaggingPipeline: Canary Probe failed ({type(e).__name__}: {e}).")

        logger.error("[ALERT] Sovereign Node unresponsive. Forcing Gemma Cascade.")
        
        for task in [
            TaskType.QUERY_ROUTER, 
            TaskType.INGEST_GRAPH, 
            TaskType.INGEST_VISION, 
            TaskType.QUERY_SYNTHESIS, 
            TaskType.ASSET_GENERATION
        ]:
            await self.bridge.circuit_breaker.force_open(task, VLLM_SENTINEL, 300.0)

    async def process_child_dicts(self, child_dicts: list[dict]) -> None:
        """
        SOTA FIX: Processes pre-flattened ChildChunks from the AST Slicer.
        Uses structural heuristics to avoid spamming the LLM classifier.
        """
        if not child_dicts:
            return

        needs_llm = []
        for i, c in enumerate(child_dicts):
            content = c.get("content", "")
            # Heuristic: Only send to LLM if it contains structural markers
            if "```" in content or "|" in content or "<math" in content.lower() or "\\[" in content:
                needs_llm.append((i, c))
            else:
                c["content_type"] = "TEXT"

        if needs_llm:
            logger.info(f"ContentTaggingPipeline: Routing {len(needs_llm)} complex chunks to LLM Classifier.")
            await self._run_llm_classification(child_dicts, needs_llm)

        self._log_distribution(child_dicts)

    async def _run_llm_classification(
        self,
        raw_chunks: list[dict],
        needs_llm: list[tuple[int, dict]],
    ) -> None:
        
        await self._preflight_sovereign_probe()
        
        async def classify_one(idx: int, chunk: dict) -> tuple[int, str]:
            async with self.semaphore:
                ct = await self.bridge.classify_content_type(chunk["content"])
            return idx, ct

        BATCH_SIZE = 50
        for i in range(0, len(needs_llm), BATCH_SIZE):
            batch = needs_llm[i:i + BATCH_SIZE]
            
            results = await asyncio.gather(
                *[classify_one(idx, c) for idx, c in batch],
                return_exceptions=True,
            )
            
            for result in results:
                if isinstance(result, Exception):
                    logger.error(f"ContentTaggingPipeline: Classification failed: {result}. Chunk keeps TEXT label.")
                    continue
                idx, content_type = result
                raw_chunks[idx]["content_type"] = content_type
                
            del batch
            del results
            gc.collect()
            await asyncio.sleep(0.05)

    @staticmethod
    def _log_distribution(chunks: list[dict]) -> None:
        distribution = ", ".join(
            f"{ct}={sum(1 for c in chunks if c.get('content_type', 'TEXT') == ct)}"
            for ct in _TRACKED_TYPES
        )
        logger.info(f"ContentTaggingPipeline: Distribution: {distribution}")