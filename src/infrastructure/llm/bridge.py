"""
@file bridge.py
@description Central facade orchestrating decoupled Embedder, Vision, and LLM Router services.
@layer Core Logic
@dependencies asyncio, logging, os, pathlib, typing, numpy, infrastructure modules
"""
from __future__ import annotations
import asyncio
import logging
import os
from pathlib import Path
from typing import Optional, Tuple
import numpy as np

from infrastructure.config_manager import OmniConfig, TaskType, load_config
from infrastructure.model_registry import ModelRegistry
from infrastructure.circuit_breaker import CircuitBreaker
from .prompts import PromptLoader
from .router import TaskRouter
from .embedder import CPUEmbedderService
from .vision import VisionService

logger = logging.getLogger(__name__)

_BRIDGE_INSTANCE: Optional["OmniModelBridge"] = None
_INGESTION_ACTIVE: bool = False
CONTENT_TYPES = frozenset({"MATH", "CODE", "TABLE", "IMAGE", "BIOLOGY", "TEXT"})
_EXTRACTION_KEYWORDS = frozenset({
    "extract", "entities", "entity", "relation", "relations",
    "knowledge graph", "triplet", "node", "nodes", "edge", "edges",
    "named entity", "tuple", "subject", "predicate", "object"
})

async def raw_colbert_embed(texts: list[str]) -> list[np.ndarray]:
    """Global hook for external libraries requiring a raw embedding func."""
    if _BRIDGE_INSTANCE is None:
        raise RuntimeError("raw_colbert_embed() called before OmniModelBridge init.")
    return await _BRIDGE_INSTANCE.local_embedding_func(texts)

class OmniModelBridge:
    """Facade for LLM Routing, Embedding, and Prompt Enforcement."""

    def __init__(self) -> None:
        global _BRIDGE_INSTANCE
        project_root = Path(__file__).resolve().parent.parent.parent.parent
        self.config: OmniConfig = load_config(str(project_root / ".env"))

        self.registry = ModelRegistry(
            rpm_safety_factor      = self.config.gemini_rpm_safety_factor,
            max_output_tokens      = self.config.gemini_max_output_tokens,
            max_extraction_tokens  = self.config.gemini_max_extraction_tokens,
        )
        self.circuit_breaker = CircuitBreaker(
            redis_uri                = self.config.redis_uri,
            failure_threshold        = self.config.cb_failure_threshold,
            rpm_cooldown_seconds     = self.config.cb_rpm_cooldown_seconds,
            rpd_cooldown_seconds     = self.config.cb_rpd_cooldown_seconds,
            service_cooldown_seconds = self.config.cb_service_cooldown_seconds,
        )

        self.prompts = PromptLoader()
        self.router  = TaskRouter(self.config, self.registry, self.circuit_breaker)
        max_async = int(os.getenv("GEMINI_MAX_ASYNC_CALLS", "1"))
        self._llm_semaphore = asyncio.Semaphore(max_async)
        self.embedder = CPUEmbedderService(self.config)
        self.vision = VisionService(self.router, self.prompts)

        _BRIDGE_INSTANCE = self
        logger.info("OmniModelBridge v8.1 [STRICT SOVEREIGN MODE] — Online.")

    async def async_init(self) -> None:
        await self.circuit_breaker.connect()

    @staticmethod
    def _is_extraction_call(prompt: str, system_instruction: str) -> bool:
        scan = f"{prompt[:600]} {system_instruction[:600]}".lower()
        return any(kw in scan for kw in _EXTRACTION_KEYWORDS)

    async def _call_gemini(
        self, prompt_parts: list, system_instruction: str = "",
        throttle: bool = True, force_json: bool = False, task: "TaskType" = None
    ) -> str:
        is_ext = self._is_extraction_call(str(prompt_parts[0]), system_instruction)
        resolved_task = task or (TaskType.INGEST_GRAPH if is_ext else TaskType.QUERY_ROUTER)
        route_kwargs = {"force_json": force_json}
        if is_ext:
            route_kwargs["extraction_mode"] = True
            
        if resolved_task == TaskType.INGEST_GRAPH:
            env_limit = getattr(self.config, "gemini_max_extraction_tokens", 4096)
            route_kwargs["max_tokens"] = max(env_limit, 4096)

        async with self._llm_semaphore:
            return await self.router.route_call(
                prompt_parts=prompt_parts,
                system_instruction=system_instruction,
                task=resolved_task,
                **route_kwargs
            )

    async def _call_gemini_with_usage(
        self, prompt: str, system_prompt: str = ""
    ) -> Tuple[str, Optional[int], Optional[int]]:
        async with self._llm_semaphore:
            answer = await self.router.route_call(
                prompt_parts=[prompt],
                system_instruction=system_prompt,
                task=TaskType.QUERY_SYNTHESIS,
            )
            return answer, self.router.last_prompt_tokens, self.router.last_completion_tokens

    async def llm_synthesis_func(self, prompt: str, system_prompt: str = "", **kwargs) -> str:
        safe_sys = system_prompt or ""
        is_extraction = self._is_extraction_call(prompt, safe_sys)
        is_synthesis = any(kw in safe_sys.lower() for kw in ("synthesis", "answer", "respond"))

        if _INGESTION_ACTIVE and is_extraction:
            task_type = TaskType.INGEST_GRAPH
            safe_sys = self.prompts.get("entity_extract") or safe_sys
        else:
            task_type = TaskType.QUERY_SYNTHESIS if is_synthesis else TaskType.QUERY_ROUTER
            safe_sys = safe_sys or self.prompts.get("synthesis") if is_synthesis else safe_sys

        route_kwargs = {
            "force_json": True if is_extraction else False,
            "extraction_mode": True if is_extraction else False,
        }
        
        if task_type == TaskType.INGEST_GRAPH:
            env_limit = getattr(self.config, "gemini_max_extraction_tokens", 4096)
            route_kwargs["max_tokens"] = max(env_limit, 4096)

        async with self._llm_semaphore:
            return await self.router.route_call(
                prompt_parts=[prompt],
                system_instruction=safe_sys,
                task=task_type,
                **route_kwargs
            )

    async def classify_query(self, query: str) -> str:
        sys_prompt = self.prompts.get("query_router")
        async with self._llm_semaphore:
            response = await self.router.route_call(
                prompt_parts=[query], system_instruction=sys_prompt, task=TaskType.QUERY_ROUTER
            )
            return "VECTOR" if "VECTOR" in response.strip().upper() else "GRAPH"

    async def classify_content_type(self, chunk_text: str) -> str:
        sys_prompt = "Respond EXACTLY ONE word: MATH, CODE, TABLE, IMAGE, BIOLOGY, or TEXT."
        try:
            async with self._llm_semaphore:
                response = await self.router.route_call(
                    prompt_parts=[chunk_text[:1500]], system_instruction=sys_prompt, task=TaskType.QUERY_ROUTER
                )
            content_type = response.strip().upper()
            if content_type not in CONTENT_TYPES:
                for ct in CONTENT_TYPES:
                    if ct in content_type: return ct
            return content_type if content_type in CONTENT_TYPES else "TEXT"
        except Exception as e:
            logger.error("classify_content_type failed: %s", e)
            return "TEXT"

    async def vision_translation_func(self, prompt: str, system_prompt: str = "", **kwargs) -> str:
        return await self.vision.vision_translation_func(prompt, system_prompt, _INGESTION_ACTIVE, **kwargs)

    async def vlm_ocr_page(self, image_bytes_batch: list[bytes], page_num_start: int = 0) -> str:
        return await self.vision.vlm_ocr_page(image_bytes_batch, page_num_start)

    async def local_embedding_func(self, texts: list[str], *args, **kwargs) -> list[np.ndarray]:
        return await self.embedder.embed(texts)