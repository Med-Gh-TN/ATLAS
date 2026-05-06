"""
@file router.py
@description Omni-Architect: Model Routing & Resilience Layer (v8.5 True Streaming)
────────────────────────────────────────────────────────────────────────────────
Changelog v8.5:
  - SOTA FIX: Implemented `route_call_stream()` to support real-time AsyncGenerators.
    Pipes TTFT (Time To First Token) directly to the application layer.
"""

import asyncio
import logging
import time
import os
from typing import Any, Optional, Tuple, AsyncGenerator

from google import genai
from google.genai import types

from infrastructure.config_manager import OmniConfig, TaskType
from infrastructure.model_registry import ModelRegistry, VLLM_SENTINEL
from infrastructure.circuit_breaker import CircuitBreaker, CBState, ErrorClass

# Decoupled Sub-Services
from .vllm_client import VLLMClient

logger = logging.getLogger(__name__)

_MAX_RATE_LIMIT_RETRIES = 2

class TaskRouter:
    def __init__(
        self,
        config: OmniConfig,
        registry: ModelRegistry,
        circuit_breaker: CircuitBreaker,
    ) -> None:
        self.config = config
        self.registry = registry
        self.circuit_breaker = circuit_breaker

        self._gemini_clients: dict[str, genai.Client] = {}
        self._safety_settings = self._build_safety_settings()

        self._last_call_time: dict[str, float] = {}
        self._throttle_locks: dict[str, asyncio.Lock] = {}
        self._rpd_counters: dict[TaskType, int] = {t: 0 for t in TaskType}

        self.last_prompt_tokens: Optional[int] = None
        self.last_completion_tokens: Optional[int] = None

    def _get_client(self, api_key: str) -> genai.Client:
        if api_key not in self._gemini_clients:
            self._gemini_clients[api_key] = genai.Client(api_key=api_key)
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
        self._rpd_counters[task] += 1
        count = self._rpd_counters[task]
        
        chain = self.registry.get_chain(task)
        primary = chain[0] if chain else None
        if primary and primary != VLLM_SENTINEL:
            spec = self.registry.get_spec_safe(primary)
            if spec:
                soft = int(spec.rpd_limit * self.config.gemini_rpd_soft_limit_pct / 100)
                pct = count / spec.rpd_limit * 100
                if count == soft:
                    logger.warning("[RPD][%s] ⚠ SOFT LIMIT reached: %d/%d (%.0f%%)", task.value, count, spec.rpd_limit, pct)
                elif count > spec.rpd_limit:
                    logger.warning("[RPD][%s] ⚠ OVER HARD LIMIT: %d (%.0f%%)", task.value, count, pct)

    @staticmethod
    def _clean_json(text: str) -> str:
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
        task: TaskType = None,
        max_tokens_override: Optional[int] = None,
    ) -> Tuple[str, Optional[int], Optional[int]]:
        spec = self.registry.get_spec(model_id)
        client = self._get_client(api_key)

        if max_tokens_override is not None:
            max_tokens = max_tokens_override
        elif task and getattr(task, "value", "") == "ASSET_GENERATION":
            max_tokens = int(os.getenv("GEMINI_MAX_ASSET_TOKENS", "8192"))
        else:
            max_tokens = self.registry.output_budget(model_id, extraction_mode)

        temperature = 0.0 if extraction_mode else 0.1
        config_kwargs: dict[str, Any] = {"temperature": temperature, "safety_settings": self._safety_settings}
        if max_tokens > 0: config_kwargs["max_output_tokens"] = max_tokens

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
            model=model_id, contents=list(prompt_parts), config=config,
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
        image_base64: Optional[str] = None,
        force_api: bool = False,
        **kwargs
    ) -> str:
        api_key = self.config.api_keys.get(task, os.getenv("GEMINI_API_KEY", ""))
        model_chain = list(self.registry.get_chain(task))
        last_exception: Optional[Exception] = None

        use_external = os.getenv("USE_EXTERNAL_GPU", "false").lower() == "true"
        colab_url = os.getenv("COLAB_GPU_URL")
        
        if VLLM_SENTINEL in model_chain: model_chain.remove(VLLM_SENTINEL)

        if use_external and colab_url and not force_api:
            allowed_tasks = {"QUERY_SYNTHESIS", "QUERY_ROUTER", "INGEST_VISION", "INGEST_GRAPH"}
            if task and getattr(task, "value", "") in allowed_tasks:
                model_chain.insert(0, VLLM_SENTINEL)
        
        max_tokens_override = kwargs.get("max_tokens")

        for model_id in model_chain:
            if model_id == VLLM_SENTINEL:
                cb_state = await self.circuit_breaker.get_state(task, model_id)
                if cb_state == CBState.OPEN: continue

                try:
                    max_tokens = max_tokens_override if max_tokens_override is not None else self.registry.output_budget(VLLM_SENTINEL, extraction_mode)
                    text_parts = [p for p in prompt_parts if isinstance(p, str)]
                    
                    text = await VLLMClient.generate(
                        prompt="\n".join(text_parts),
                        system_instruction=system_instruction or "",
                        max_tokens=max_tokens,
                        image_base64=image_base64
                    )
                    await self.circuit_breaker.record_success(task, model_id)
                    return text

                except Exception as exc:
                    last_exception = exc
                    await self.circuit_breaker.record_failure(task, model_id, exc)
                    continue

            cb_state = await self.circuit_breaker.get_state(task, model_id)
            if cb_state == CBState.OPEN: continue

            if is_vision_call and not self.registry.supports_vision(model_id): continue

            rate_limit_retries = 0
            while True:
                try:
                    text, _, _ = await self._call_single_model(
                        model_id=model_id, api_key=api_key, prompt_parts=list(prompt_parts),
                        system_instruction=system_instruction or "", force_json=force_json,
                        extraction_mode=extraction_mode, task=task, max_tokens_override=max_tokens_override
                    )
                    await self.circuit_breaker.record_success(task, model_id)
                    self._track_rpd(task)
                    return text

                except Exception as exc:
                    last_exception = exc
                    error_class, retry_after = await self.circuit_breaker.record_failure(task, model_id, exc)

                    if error_class in (ErrorClass.RPM_EXHAUSTED, ErrorClass.TPM_EXHAUSTED):
                        if rate_limit_retries < _MAX_RATE_LIMIT_RETRIES:
                            wait = retry_after if retry_after else self.config.cb_rpm_cooldown_seconds
                            await asyncio.sleep(wait)
                            rate_limit_retries += 1
                            continue
                    break

        raise RuntimeError(f"route_call: exhausted ALL models in the fallback chain. Last error: {last_exception}")

    async def route_call_stream(
        self,
        prompt_parts: list,
        system_instruction: str,
        task: TaskType,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """
        🚨 SOTA FIX: True Streaming Router.
        Pipes the generator directly up the stack without aggregating the text.
        """
        api_key = self.config.api_keys.get(task, os.getenv("GEMINI_API_KEY", ""))
        model_chain = list(self.registry.get_chain(task))
        last_exception: Optional[Exception] = None

        use_external = os.getenv("USE_EXTERNAL_GPU", "false").lower() == "true"
        colab_url = os.getenv("COLAB_GPU_URL")
        
        if VLLM_SENTINEL in model_chain: model_chain.remove(VLLM_SENTINEL)

        if use_external and colab_url:
            model_chain.insert(0, VLLM_SENTINEL)
        
        max_tokens_override = kwargs.get("max_tokens")

        for model_id in model_chain:
            # ── SOVEREIGN EDGE (Kaggle Stream) ──
            if model_id == VLLM_SENTINEL:
                cb_state = await self.circuit_breaker.get_state(task, model_id)
                if cb_state == CBState.OPEN: continue

                try:
                    max_tokens = max_tokens_override if max_tokens_override is not None else self.registry.output_budget(VLLM_SENTINEL, False)
                    text_parts = [p for p in prompt_parts if isinstance(p, str)]
                    
                    # Yield straight from the VLLM socket
                    async for chunk in VLLMClient.generate_stream(
                        prompt="\n".join(text_parts),
                        system_instruction=system_instruction or "",
                        max_tokens=max_tokens,
                        image_base64=kwargs.get("image_base64")
                    ):
                        yield chunk
                        
                    await self.circuit_breaker.record_success(task, model_id)
                    return

                except Exception as exc:
                    last_exception = exc
                    await self.circuit_breaker.record_failure(task, model_id, exc)
                    continue

            # ── GEMINI API FALLBACK (Google Stream) ──
            cb_state = await self.circuit_breaker.get_state(task, model_id)
            if cb_state == CBState.OPEN: continue

            client = self._get_client(api_key)
            max_tokens = max_tokens_override if max_tokens_override is not None else self.registry.output_budget(model_id, False)

            config_kwargs: dict[str, Any] = {"temperature": 0.1, "safety_settings": self._safety_settings}
            if max_tokens > 0: config_kwargs["max_output_tokens"] = max_tokens
            if system_instruction: config_kwargs["system_instruction"] = system_instruction
            config = types.GenerateContentConfig(**config_kwargs)

            try:
                await self._throttle(model_id)
                response_stream = await client.aio.models.generate_content_stream(
                    model=model_id, contents=list(prompt_parts), config=config,
                )
                async for chunk in response_stream:
                    if chunk.text:
                        yield chunk.text
                        
                await self.circuit_breaker.record_success(task, model_id)
                self._track_rpd(task)
                return

            except Exception as exc:
                last_exception = exc
                await self.circuit_breaker.record_failure(task, model_id, exc)
                continue

        raise RuntimeError(f"route_call_stream: exhausted ALL models in the fallback chain. Last error: {last_exception}")