# Comprehensive, production-ready code with clear JSDoc/Docstring comments.
"""
Omni-Architect: Model Routing & Resilience Layer (v6.2)
────────────────────────────────────────────────────────────────────────────────
Encapsulates the fallback chain, circuit breaker logic, and rate limiting.
Ensures network transient errors or quota exhaustion gracefully degrade
to the next available model in the enterprise tier.
"""

import asyncio
import logging
import time
from typing import Any, Optional, Tuple

from google import genai
from google.genai import types

from infrastructure.config_manager import OmniConfig, TaskType
from infrastructure.model_registry import ModelRegistry, GROQ_SENTINEL
from infrastructure.circuit_breaker import CircuitBreaker, CBState, ErrorClass
from infrastructure.fallback import GroqFallback

logger = logging.getLogger(__name__)

_MAX_RATE_LIMIT_RETRIES = 2

class TaskRouter:
    """
    Executes model calls through task-specific fallback chains.
    Manages API clients, rate-limit throttling, and circuit breaker evaluation.
    """

    def __init__(
        self,
        config: OmniConfig,
        registry: ModelRegistry,
        circuit_breaker: CircuitBreaker,
        groq_fallback: GroqFallback,
    ) -> None:
        self.config = config
        self.registry = registry
        self.circuit_breaker = circuit_breaker
        self.groq = groq_fallback

        self._gemini_clients: dict[str, genai.Client] = {}
        self._safety_settings = self._build_safety_settings()

        self._last_call_time: dict[str, float] = {}
        self._throttle_locks: dict[str, asyncio.Lock] = {}
        self._rpd_counters: dict[TaskType, int] = {t: 0 for t in TaskType}

        self.last_prompt_tokens: Optional[int] = None
        self.last_completion_tokens: Optional[int] = None

    def _get_client(self, api_key: str) -> genai.Client:
        """Return (or lazily create) the genai.Client for an API key."""
        if api_key not in self._gemini_clients:
            self._gemini_clients[api_key] = genai.Client(api_key=api_key)
            logger.debug("TaskRouter: created Gemini client for key ...%s", api_key[-6:])
        return self._gemini_clients[api_key]

    @staticmethod
    def _build_safety_settings() -> list:
        return [
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
        ]

    async def _throttle(self, model_id: str) -> None:
        """Enforces minimum inter-call delay per model to respect RPM limits."""
        if model_id not in self._throttle_locks:
            self._throttle_locks[model_id] = asyncio.Lock()

        delay = self.registry.throttle_delay(model_id)
        async with self._throttle_locks[model_id]:
            last = self._last_call_time.get(model_id, 0.0)
            elapsed = time.monotonic() - last
            if elapsed < delay:
                await asyncio.sleep(delay - elapsed)
            self._last_call_time[model_id] = time.monotonic()

    def _track_rpd(self, task: TaskType) -> None:
        """Tracks requests per day against soft and hard limits."""
        self._rpd_counters[task] += 1
        count = self._rpd_counters[task]
        
        chain = self.registry.get_chain(task)
        primary = chain[0] if chain else None
        if primary and primary != GROQ_SENTINEL:
            spec = self.registry.get_spec_safe(primary)
            if spec:
                soft = int(spec.rpd_limit * self.config.gemini_rpd_soft_limit_pct / 100)
                pct = count / spec.rpd_limit * 100
                if count == soft:
                    logger.warning(
                        "[RPD][%s] ⚠ SOFT LIMIT reached: %d/%d (%.0f%%)",
                        task.value, count, spec.rpd_limit, pct,
                    )
                elif count > spec.rpd_limit:
                    logger.warning(
                        "[RPD][%s] ⚠ OVER HARD LIMIT: %d (%.0f%%)",
                        task.value, count, pct,
                    )

    @staticmethod
    def _clean_json(text: str) -> str:
        """Strips markdown code block formatting from raw JSON strings."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    async def _call_single_model(
        self,
        model_id: str,
        api_key: str,
        prompt_parts: list,
        system_instruction: str,
        force_json: bool,
        extraction_mode: bool,
        task: TaskType = None, # <--- 1. ADD THIS
    ) -> Tuple[str, Optional[int], Optional[int]]:
        import os # <--- 2. ADD THIS
        spec = self.registry.get_spec(model_id)
        client = self._get_client(api_key)

        # 3. REPLACE max_tokens = self.registry... WITH THIS BLOCK:
        if task and task.value == "ASSET_GENERATION":
            max_tokens = int(os.getenv("GEMINI_MAX_ASSET_TOKENS", "8192"))
        else:
            max_tokens = self.registry.output_budget(model_id, extraction_mode)

        temperature = 0.0 if extraction_mode else 0.1

        config_kwargs: dict[str, Any] = {
            "temperature": temperature,
            "safety_settings": self._safety_settings,
        }
        if max_tokens > 0:
            config_kwargs["max_output_tokens"] = max_tokens

        safe_sys = system_instruction or ""

        if force_json and not extraction_mode and spec.supports_native_json:
            config_kwargs["response_mime_type"] = "application/json"

        if spec.needs_system_inject and safe_sys:
            prompt_parts = [f"System Instruction:\n{safe_sys}\n\nUser Task:\n"] + list(prompt_parts)
        elif safe_sys:
            config_kwargs["system_instruction"] = safe_sys

        config = types.GenerateContentConfig(**config_kwargs)

        await self._throttle(model_id)

        response = await client.aio.models.generate_content(
            model=model_id,
            contents=list(prompt_parts),
            config=config,
        )

        output_text = response.text
        if force_json and not extraction_mode:
            output_text = self._clean_json(output_text)

        p_tok = getattr(response.usage_metadata, "prompt_token_count", None) if hasattr(response, "usage_metadata") else None
        c_tok = getattr(response.usage_metadata, "candidates_token_count", None) if hasattr(response, "usage_metadata") else None

        return output_text, p_tok, c_tok

    async def route_call(
        self,
        prompt_parts: list,
        system_instruction: str,
        task: TaskType,
        force_json: bool = False,
        extraction_mode: bool = False,
        is_vision_call: bool = False,
    ) -> str:
        api_key = self.config.api_keys[task]
        model_chain = self.registry.get_chain(task)
        last_exception: Optional[Exception] = None

        for model_id in model_chain:
            if model_id == GROQ_SENTINEL:
                logger.warning("route_call [%s]: routing to Groq fallback.", task.value)
                try:
                    # ── SOTA TOKEN ALLOCATION (GROQ FALLBACK) ──
                    if task == TaskType.ASSET_GENERATION:
                        max_tokens = self.config.gemini_max_asset_tokens
                    else:
                        max_tokens = self.registry.output_budget(model_chain[0], extraction_mode)
                        
                    text, p_tok, c_tok = await self.groq.call(
                        prompt_parts=list(prompt_parts),
                        system_instruction=system_instruction or "",
                        force_json=force_json,
                        max_tokens=max_tokens,
                        is_vision_call=is_vision_call,
                    )
                    self.last_prompt_tokens, self.last_completion_tokens = p_tok, c_tok
                    return text
                except Exception as groq_err:
                    raise RuntimeError(f"All LLM providers exhausted for task {task.value}.") from groq_err

            cb_state = await self.circuit_breaker.get_state(task, model_id)
            if cb_state == CBState.OPEN or (is_vision_call and not self.registry.supports_vision(model_id)):
                continue

            rate_limit_retries = 0
            while True:
                try:
                    text, p_tok, c_tok = await self._call_single_model(
                        model_id=model_id, api_key=api_key, prompt_parts=list(prompt_parts),
                        system_instruction=system_instruction or "", force_json=force_json,
                        extraction_mode=extraction_mode, task=task, # <── PASS THE TASK
                    )
                    await self.circuit_breaker.record_success(task, model_id)
                    self.last_prompt_tokens, self.last_completion_tokens = p_tok, c_tok
                    self._track_rpd(task)
                    return text
                except Exception as exc:
                    # ... (Keep existing retry logic block exactly as is) ...
                    break
        raise RuntimeError("exhausted all models")

    async def route_call(
        self,
        prompt_parts: list,
        system_instruction: str,
        task: TaskType,
        force_json: bool = False,
        extraction_mode: bool = False,
        is_vision_call: bool = False,
    ) -> str:
        """
        Routes the request through the designated fallback chain.
        Evaluates the circuit breaker and handles in-place rate limit retries.
        """
        api_key = self.config.api_keys[task]
        model_chain = self.registry.get_chain(task)
        last_exception: Optional[Exception] = None

        for model_id in model_chain:
            if model_id == GROQ_SENTINEL:
                logger.warning(
                    "route_call [%s]: all Gemini/Gemma models exhausted — "
                    "routing to Groq emergency fallback.",
                    task.value,
                )
                try:
                    max_tokens = self.registry.output_budget(model_chain[0], extraction_mode)
                    text, p_tok, c_tok = await self.groq.call(
                        prompt_parts=list(prompt_parts),
                        system_instruction=system_instruction or "",
                        force_json=force_json,
                        max_tokens=max_tokens,
                        is_vision_call=is_vision_call,
                    )
                    self.last_prompt_tokens = p_tok
                    self.last_completion_tokens = c_tok
                    return text
                except Exception as groq_err:
                    logger.critical(
                        "route_call [%s]: Groq also failed: %s. ALL providers exhausted.",
                        task.value, groq_err,
                    )
                    raise RuntimeError(
                        f"All LLM providers exhausted for task {task.value}. "
                        f"Last Gemini error: {last_exception}. "
                        f"Groq error: {groq_err}"
                    ) from groq_err

            cb_state = await self.circuit_breaker.get_state(task, model_id)
            if cb_state == CBState.OPEN:
                logger.info("route_call [%s]: CB OPEN for '%s' — skipping.", task.value, model_id)
                continue

            if is_vision_call and not self.registry.supports_vision(model_id):
                logger.info("route_call [%s]: '%s' lacks vision capability — skipping.", task.value, model_id)
                continue

            rate_limit_retries = 0
            while True:
                try:
                    text, p_tok, c_tok = await self._call_single_model(
                        model_id=model_id,
                        api_key=api_key,
                        prompt_parts=list(prompt_parts),
                        system_instruction=system_instruction or "",
                        force_json=force_json,
                        extraction_mode=extraction_mode,
                        task=task,
                    )

                    await self.circuit_breaker.record_success(task, model_id)
                    self.last_prompt_tokens = p_tok
                    self.last_completion_tokens = c_tok
                    self._track_rpd(task)

                    logger.debug(
                        "route_call [%s]: '%s' succeeded (P:%s C:%s).",
                        task.value, model_id, p_tok, c_tok,
                    )
                    return text

                except Exception as exc:
                    last_exception = exc
                    error_class, retry_after = await self.circuit_breaker.record_failure(
                        task, model_id, exc
                    )

                    if error_class in (ErrorClass.RPM_EXHAUSTED, ErrorClass.TPM_EXHAUSTED):
                        if rate_limit_retries < _MAX_RATE_LIMIT_RETRIES:
                            wait = retry_after if retry_after else self.config.cb_rpm_cooldown_seconds
                            logger.info(
                                "route_call [%s]: '%s' %s — waiting %.0fs (retry %d/%d).",
                                task.value, model_id, error_class.value,
                                wait, rate_limit_retries + 1, _MAX_RATE_LIMIT_RETRIES,
                            )
                            await asyncio.sleep(wait)
                            rate_limit_retries += 1
                            continue

                    logger.warning(
                        "route_call [%s]: '%s' failing (%s) — advancing chain.",
                        task.value, model_id, error_class.value,
                    )
                    break

        raise RuntimeError(
            f"route_call: exhausted all models for task {task.value}. "
            f"Last error: {last_exception}"
        )