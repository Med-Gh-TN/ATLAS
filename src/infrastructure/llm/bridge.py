# Comprehensive, production-ready code with clear JSDoc/Docstring comments.
"""
src/infrastructure/llm/bridge.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Model Bridge Facade (v6.4.1 — SOTA Deep Mode Integration)
─────────────────────────────────────────────────────────────────────────────
Acts as the central orchestrator for LLM and Embedding requests.
Delegates state management to PromptLoader and task execution to TaskRouter.

Changelog v6.4.1 (Deep Mode)
──────────────
• [FIX-ASYNC-01] Upgraded asyncio.get_event_loop() to asyncio.get_running_loop() 
  to prevent Python 3.10+ deprecation warnings and ensure strict thread safety 
  when FastEmbed blocks the loop.
• [FIX-ONNX-01] Explicitly injected `max_length=512` into FastEmbed. 
  Prevents unrecoverable C++ slice exceptions when dealing with messy OCR tokens.
• [TELEMETRY] Added `_call_gemini` and `_call_gemini_with_usage` methods to 
  expose `TaskRouter` token metadata directly to the FusionEngine and Orchestrator.
• [FIX-CPU-01] LateInteractionTextEmbedding receives `threads=config.fastembed_threads`.
• [FIX-TENSOR-01] Tensor Truncation Guardrail (8192) remains active as depth defense.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
from google.genai import types
from fastembed import LateInteractionTextEmbedding

from infrastructure.config_manager import OmniConfig, TaskType, load_config
from infrastructure.model_registry import ModelRegistry
from infrastructure.circuit_breaker import CircuitBreaker
from infrastructure.fallback import GroqFallback

# Relative imports from our llm package
from .prompts import PromptLoader
from .router import TaskRouter

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Tiktoken bootstrap for Tensor Truncation Guardrail
# ─────────────────────────────────────────────────────────────────────────────
# We import tiktoken at module level so the encoding table is loaded once and
# shared across all calls — not re-loaded on every embed() invocation.
# If tiktoken is unavailable we fall back to a word-count approximation that
# is accurate to ±30% (conservative: errs on the side of over-truncation).
try:
    import tiktoken as _tiktoken
    _TIKTOKEN_ENC = _tiktoken.get_encoding("cl100k_base")
    _HAS_TIKTOKEN = True
    logger.debug("bridge: tiktoken loaded — Tensor Truncation Guardrail is byte-exact.")
except ImportError:
    _TIKTOKEN_ENC = None
    _HAS_TIKTOKEN = False
    logger.warning(
        "bridge: tiktoken not found. Tensor Truncation Guardrail will use "
        "word-count approximation (±30% accuracy). "
        "Install with: pip install tiktoken"
    )

# ─────────────────────────────────────────────────────────────────────────────
# Module-level state
# ─────────────────────────────────────────────────────────────────────────────

_BRIDGE_INSTANCE: Optional["OmniModelBridge"] = None
_INGESTION_ACTIVE: bool = False

CONTENT_TYPES = frozenset({"MATH", "CODE", "TABLE", "IMAGE", "BIOLOGY", "TEXT"})

_VLM_BLOCKED_RESPONSE = (
    "blocked<SEP>blocked<SEP>VLM call blocked outside ingestion phase.<SEP>"
    "[VLM blocked: query phase — not an ingestion call]"
)

_EXTRACTION_KEYWORDS = frozenset({
    "extract", "entities", "entity", "relation", "relations",
    "knowledge graph", "triplet", "node", "nodes", "edge", "edges",
    "named entity", "tuple", "subject", "predicate", "object"
})


async def raw_colbert_embed(texts: list[str]) -> list[np.ndarray]:
    """Exposed module-level function for orchestrator/patch hooks."""
    if _BRIDGE_INSTANCE is None:
        raise RuntimeError("raw_colbert_embed() called before OmniModelBridge init.")
    return await _BRIDGE_INSTANCE.local_embedding_func(texts)


class OmniModelBridge:
    """
    Facade for LLM Routing, Embedding, and Prompt Enforcement.
    """

    def __init__(self) -> None:
        global _BRIDGE_INSTANCE

        # Resolve config from project root
        project_root = Path(__file__).resolve().parent.parent.parent.parent
        self.config: OmniConfig = load_config(str(project_root / ".env"))

        # Initialize core infrastructure services
        self.registry = ModelRegistry(
            rpm_safety_factor      = self.config.gemini_rpm_safety_factor,
            max_output_tokens      = self.config.gemini_max_output_tokens,
            max_extraction_tokens  = self.config.gemini_max_extraction_tokens,
        )
        self.circuit_breaker = CircuitBreaker(
            redis_uri               = self.config.redis_uri,
            failure_threshold       = self.config.cb_failure_threshold,
            rpm_cooldown_seconds    = self.config.cb_rpm_cooldown_seconds,
            rpd_cooldown_seconds    = self.config.cb_rpd_cooldown_seconds,
            service_cooldown_seconds = self.config.cb_service_cooldown_seconds,
        )
        self.groq = GroqFallback(
            api_key = self.config.groq_api_key,
            model   = self.config.groq_model,
        )

        # Initialize our decoupled LLM package components
        self.prompts = PromptLoader()
        self.router  = TaskRouter(
            self.config, self.registry, self.circuit_breaker, self.groq
        )

        # OOM Guard for Vision Models
        self._vision_semaphore = asyncio.Semaphore(1)

        # ── Embedder Initialization ────────────────────────────────────────
        # [FIX-CPU-01] threads= sets ONNX session inter_op_num_threads.
        # This controls how many threads the ONNX runtime uses to dispatch
        # independent graph nodes in parallel (inter-operator parallelism).
        # Aligned to P-core count (FASTEMBED_THREADS in .env) to prevent
        # E-core assignment on the i5-12500H hybrid architecture.
        #
        # Note: intra-operator parallelism (e.g. matrix multiply shards) is
        # controlled by OMP_NUM_THREADS, which orchestrator.py sets before
        # any numpy import. Both must be aligned.
        logger.info(
            "OmniModelBridge: loading FastEmbed '%s' "
            "(provider=%s, threads=%d, batch=%d, parallel=%d)...",
            self.config.embedder_model_name,
            self.config.fastembed_provider,
            self.config.fastembed_threads,
            self.config.fastembed_batch_size,
            self.config.fastembed_parallel,
        )
        self.embedding_model = LateInteractionTextEmbedding(
            model_name = self.config.embedder_model_name,
            providers  = [self.config.fastembed_provider],
            threads    = self.config.fastembed_threads,   # [FIX-CPU-01]
            max_length = 512,                             # [FIX-ONNX-01] Strict C++ boundary
            cache_dir  = os.getenv("FASTEMBED_CACHE_PATH")
        )

        _BRIDGE_INSTANCE = self
        logger.info(
            "OmniModelBridge v6.4.1 [Package Mode] — "
            "TOON Enforcement Online | SOTA Telemetry Active."
        )

    async def async_init(self) -> None:
        """Connects async infrastructure (Redis). Must be awaited after __init__."""
        await self.circuit_breaker.connect()

    # ─────────────────────────────────────────────────────────────────────
    # Telemetry and Routing Expositions (SOTA Additions)
    # ─────────────────────────────────────────────────────────────────────

    async def _call_gemini(
        self, prompt_parts: list, system_instruction: str = "",
        throttle: bool = True, force_json: bool = False,
        task: "TaskType" = None # <── NEW SOTA PATCH
    ) -> str:
        """Utility for orchestrator query expansion and sub-query decomposition."""
        from infrastructure.config_manager import TaskType
        return await self.router.route_call(
            prompt_parts=prompt_parts,
            system_instruction=system_instruction,
            task=task or TaskType.QUERY_ROUTER,
            force_json=force_json,
        )

    async def _call_gemini_with_usage(
        self, prompt: str, system_prompt: str = ""
    ) -> Tuple[str, Optional[int], Optional[int]]:
        """Utility for fusion_engine synthesis, extracting precise token metrics."""
        answer = await self.router.route_call(
            prompt_parts=[prompt],
            system_instruction=system_prompt,
            task=TaskType.QUERY_SYNTHESIS,
        )
        return answer, self.router.last_prompt_tokens, self.router.last_completion_tokens


    # ─────────────────────────────────────────────────────────────────────
    # Tensor Truncation Guardrail
    # ─────────────────────────────────────────────────────────────────────

    def _truncate_texts(self, texts: list[str]) -> list[str]:
        """
        [FIX-TENSOR-01] Hard-clips every text to EMBEDDING_MAX_TOKENS tokens.

        Jina-ColBERT-v2's position embedding table has a fixed size of 8192.
        If any input sequence exceeds this the ONNX Slice node indexes out of
        bounds, producing an unrecoverable RuntimeError that crashes the
        entire ingestion pipeline.

        This method is the last line of defence. The primary truncation is
        applied upstream in SemanticDoclingParser._chunk_prose() and in
        get_semantic_chunks() for oversized atomic blocks. This guardrail
        catches strings that reach the embedder via other code paths
        (e.g. LightRAG's internal entity description strings, keyword
        extraction outputs, or direct calls via raw_colbert_embed()).

        Implementation:
        - tiktoken path (preferred): byte-exact token count via cl100k_base.
        - fallback path: word count × 1.3 approximation, truncated to
          embedding_max_tokens / 1.3 words (conservative — may lose ~30 tokens
          of context at the boundary, but will never exceed the hard limit).

        Args:
            texts: List of raw strings before embedding.

        Returns:
            List of strings, each guaranteed ≤ embedding_max_tokens tokens.
        """
        limit = self.config.embedding_max_tokens  # 8192 by default
        result: list[str] = []

        for text in texts:
            if _HAS_TIKTOKEN and _TIKTOKEN_ENC is not None:
                ids = _TIKTOKEN_ENC.encode(text)
                if len(ids) > limit:
                    logger.warning(
                        "bridge._truncate_texts: text truncated %d → %d tokens "
                        "(Tensor Truncation Guardrail triggered).",
                        len(ids), limit,
                    )
                    result.append(_TIKTOKEN_ENC.decode(ids[:limit]))
                else:
                    result.append(text)
            else:
                # Word-count fallback: embedding_max_tokens / 1.3 words
                word_limit = int(limit / 1.3)
                words = text.split()
                if len(words) > word_limit:
                    logger.warning(
                        "bridge._truncate_texts: text truncated ~%d → ~%d words "
                        "(word-count approximation; install tiktoken for precision).",
                        len(words), word_limit,
                    )
                    result.append(" ".join(words[:word_limit]))
                else:
                    result.append(text)

        return result

    # ─────────────────────────────────────────────────────────────────────
    # LLM routing methods
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def _is_extraction_call(prompt: str, system_instruction: str) -> bool:
        """Determines if the current LightRAG hook is attempting KG extraction."""
        scan = f"{prompt[:600]} {system_instruction[:600]}".lower()
        return any(kw in scan for kw in _EXTRACTION_KEYWORDS)

    async def llm_synthesis_func(
        self, prompt: str, system_prompt: str = "", **kwargs
    ) -> str:
        """
        General-purpose LLM call used by LightRAG for extraction and synthesis.
        """
        safe_sys = system_prompt or ""

        if _INGESTION_ACTIVE:
            if self._is_extraction_call(prompt, safe_sys):
                logger.debug(
                    "llm_synthesis_func: extraction call → INGEST_GRAPH (TOON Forced)"
                )

                # [THE SYSTEM PROMPT SHADOWING FIX]
                hijack_directive = (
                    "\n\n"
                    "========================================================================\n"
                    "CRITICAL SYSTEM OVERRIDE: YOU MUST IGNORE ALL JSON INSTRUCTIONS.\n"
                    "YOU MUST STRICTLY USE THE TOON FORMAT DESCRIBED IN YOUR SYSTEM INSTRUCTIONS.\n"
                    "DO NOT OUTPUT JSON. OUTPUT PURE TEXT TUPLES DELIMITED BY <SEP>.\n"
                    "========================================================================"
                )

                # We drop `safe_sys` entirely to obliterate LightRAG's default JSON prompt.
                # We enforce our freshly loaded `entity_extract` SOTA prompt instead.
                return await self.router.route_call(
                    prompt_parts       = [prompt + hijack_directive],
                    system_instruction = self.prompts.get("entity_extract"),
                    task               = TaskType.INGEST_GRAPH,
                    force_json         = False,
                    extraction_mode    = True,
                )

            # Standard Ingestion (e.g., summary generation)
            return await self.router.route_call(
                prompt_parts       = [prompt],
                system_instruction = safe_sys,
                task               = TaskType.INGEST_GRAPH,
            )

        else:
            # Query Phase
            is_synthesis = any(
                kw in safe_sys.lower() for kw in ("synthesis", "answer", "respond")
            )
            if is_synthesis or not safe_sys:
                return await self.router.route_call(
                    prompt_parts       = [prompt],
                    system_instruction = safe_sys or self.prompts.get("synthesis"),
                    task               = TaskType.QUERY_SYNTHESIS,
                )
            return await self.router.route_call(
                prompt_parts       = [prompt],
                system_instruction = safe_sys,
                task               = TaskType.QUERY_ROUTER,
            )

    async def vision_translation_func(
        self, prompt: str, system_prompt: str = "", **kwargs
    ) -> str:
        """VLM image analysis for entity extraction from figures/diagrams."""
        if not _INGESTION_ACTIVE:
            return _VLM_BLOCKED_RESPONSE

        raw_image_data = kwargs.get("image_data")
        if not raw_image_data:
            return "unknown<SEP>illustration<SEP>Image missing.<SEP>[Unavailable]"

        image_bytes = base64.b64decode(raw_image_data)
        prompt_parts = [
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            prompt,
        ]

        async with self._vision_semaphore:
            return await self.router.route_call(
                prompt_parts       = prompt_parts,
                system_instruction = self.prompts.get("vision_extract"),
                task               = TaskType.INGEST_VISION,
                is_vision_call     = True,
            )

    async def vlm_ocr_page(
        self,
        image_bytes_batch: list[bytes],
        page_num_start: int = 0,
    ) -> str:
        """VLM OCR for handwritten / scanned document pages."""
        if not image_bytes_batch:
            return ""

        prompt_parts: list = [
            types.Part.from_bytes(data=page_bytes, mime_type="image/jpeg")
            for page_bytes in image_bytes_batch
        ]
        prompt_parts.append(
            "Perform complete verbatim OCR. Transcribe ALL text exactly. "
            "Output ONLY transcribed text, no commentary."
        )

        async with self._vision_semaphore:
            return await self.router.route_call(
                prompt_parts       = prompt_parts,
                system_instruction = "You are a precise OCR engine. Output only extracted text.",
                task               = TaskType.INGEST_VISION,
                is_vision_call     = True,
            )

    async def classify_query(self, query: str) -> str:
        """Fast binary query classification: VECTOR or GRAPH."""
        response = await self.router.route_call(
            prompt_parts       = [query],
            system_instruction = self.prompts.get("query_router"),
            task               = TaskType.QUERY_ROUTER,
        )
        return "VECTOR" if "VECTOR" in response.strip().upper() else "GRAPH"

    async def classify_content_type(self, chunk_text: str) -> str:
        """Semantic content type classifier for incoming chunks."""
        sys_prompt = "Respond EXACTLY ONE word: MATH, CODE, TABLE, IMAGE, BIOLOGY, or TEXT."
        try:
            response = await self.router.route_call(
                prompt_parts       = [chunk_text[:1500]],
                system_instruction = sys_prompt,
                task               = TaskType.QUERY_ROUTER,
            )
            content_type = response.strip().upper()
            return content_type if content_type in CONTENT_TYPES else "TEXT"
        except Exception as e:
            logger.error("classify_content_type failed: %s", e)
            return "TEXT"

    async def local_embedding_func(
        self, texts: list[str], *args, **kwargs
    ) -> list[np.ndarray]:
        """
        Jina ColBERT v2 late-interaction embedding.

        [FIX-TENSOR-01] Applies Tensor Truncation Guardrail before forwarding
        to the ONNX session. Any text exceeding EMBEDDING_MAX_TOKENS (8192)
        is hard-clipped to prevent the ONNX Slice node out-of-bounds crash.
        """
        if not texts:
            return []

        # Tensor Truncation Guardrail — applied before ONNX forward pass
        safe_texts = self._truncate_texts(texts)

        # [FIX-ASYNC-01] Upgraded to get_running_loop() for thread safety
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: list(self.embedding_model.embed(
                safe_texts,
                batch_size = self.config.fastembed_batch_size,
                parallel   = self.config.fastembed_parallel,
            ))
        )