"""
src/infrastructure/fallback.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Emergency Groq Fallback  (v6.0)

Chain of Responsibility — final tier after all Gemini/Gemma models are
exhausted by the circuit breaker.

Changes from v5.x
─────────────────
  • OpenRouter REMOVED.  Groq is the sole external fallback.
  • Returns (output_text, prompt_tokens, completion_tokens) tuple — same
    telemetry contract as before so model_bridge captures unit economics.
  • Vision data is safely stripped before sending to Groq (text-only model).
  • JSON requests are enforced via response_format: json_object parameter.
  • Stub vision JSON is returned automatically when a vision call is routed
    to Groq (downstream code handles it gracefully via EMPTY_RESULT_PHRASES
    check in models.py).

Architecture note
─────────────────
This module is intentionally dumb — it does ONE thing: call Groq.
Error handling, circuit breaker recording, and retry logic all live in
model_bridge._route_call().  This file never calls the circuit breaker.
════════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import logging
from typing import Any, Optional, Tuple

import aiohttp

logger = logging.getLogger(__name__)

# Stub JSON response returned when a vision-only call is routed to Groq.
# Downstream pipeline recognises "[VLM blocked" and gracefully degrades.
_GROQ_VISION_STUB = (
    '{"content_type": "IMAGE", '
    '"detailed_description": "[VLM blocked: Groq emergency fallback — '
    'vision data unavailable on text-only provider]", '
    '"entity_info": {'
    '"entity_name": "groq_fallback_stub", '
    '"entity_type": "error", '
    '"summary": "Vision analysis unavailable: Groq does not support images."}}'
)


class GroqFallback:
    """
    Calls the Groq chat completions API via direct HTTP (no SDK dependency).

    Usage
    ─────
        fallback = GroqFallback(api_key=cfg.groq_api_key, model=cfg.groq_model)
        text, p_tok, c_tok = await fallback.call(
            prompt_parts=parts,
            system_instruction=sys,
            force_json=True,
            max_tokens=512,
            is_vision_call=False,
        )
    """

    _GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise ValueError("GroqFallback: GROQ_API_KEY is missing from config.")
        self._api_key = api_key
        self._model   = model
        logger.info("GroqFallback initialised — model: %s", model)

    # ─────────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────────

    async def call(
        self,
        prompt_parts:       list,
        system_instruction: str,
        force_json:         bool,
        max_tokens:         int,
        is_vision_call:     bool = False,
    ) -> Tuple[str, Optional[int], Optional[int]]:
        """
        Route a request to Groq.

        Args:
            prompt_parts:       List of prompt parts (text strings, google.genai
                                types.Part objects, or raw bytes).  Non-text
                                objects are stripped with a warning.
            system_instruction: System prompt string (may be empty).
            force_json:         If True, sets response_format: json_object.
            max_tokens:         Hard output token ceiling.
            is_vision_call:     If True, skips the real call and returns the
                                vision stub JSON immediately — Groq cannot
                                process images.

        Returns:
            (output_text, prompt_tokens, completion_tokens)
        """
        if is_vision_call:
            logger.warning(
                "GroqFallback: vision call detected — returning stub JSON "
                "(Groq does not support image inputs)."
            )
            return _GROQ_VISION_STUB, None, None

        messages = self._build_messages(prompt_parts, system_instruction)
        logger.info(
            "GroqFallback: calling %s (force_json=%s, max_tokens=%d)...",
            self._model, force_json, max_tokens,
        )

        payload: dict[str, Any] = {
            "model":       self._model,
            "messages":    messages,
            "temperature": 0.0,
            "max_tokens":  max_tokens,
        }
        if force_json:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type":  "application/json",
        }

        timeout = aiohttp.ClientTimeout(total=45)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                self._GROQ_URL, json=payload, headers=headers
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(
                        f"GroqFallback HTTP {resp.status}: {body[:300]}"
                    )
                data = await resp.json()

        output = data["choices"][0]["message"]["content"] or ""
        if force_json:
            output = self._strip_markdown_fence(output)

        usage  = data.get("usage", {})
        p_tok  = usage.get("prompt_tokens")
        c_tok  = usage.get("completion_tokens")

        logger.info(
            "GroqFallback: response received (P:%s C:%s).", p_tok, c_tok
        )
        return output, p_tok, c_tok

    # ─────────────────────────────────────────────────────────────────────────
    # Helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _build_messages(
        self, prompt_parts: list, system_instruction: str
    ) -> list[dict]:
        """
        Convert prompt_parts (which may contain google.genai Part objects or
        raw bytes) into plain-text OpenAI-style message dicts.

        Non-text parts are replaced with a descriptive placeholder so the
        model understands context was omitted rather than receiving a crash.
        """
        messages: list[dict] = []

        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})

        text_parts: list[str] = []
        for part in prompt_parts:
            if isinstance(part, str):
                text_parts.append(part)
            elif isinstance(part, bytes):
                text_parts.append("[Binary data omitted — Groq text-only endpoint]")
                logger.debug("GroqFallback: stripped binary part (%d bytes)", len(part))
            elif hasattr(part, "text"):
                text_parts.append(str(part.text))
            elif hasattr(part, "inline_data"):
                # google.genai Blob / Part with image bytes
                text_parts.append("[Image data omitted — Groq text-only endpoint]")
                logger.debug("GroqFallback: stripped image Part (type=%s)", type(part).__name__)
            else:
                text_parts.append(f"[{type(part).__name__} omitted]")
                logger.warning(
                    "GroqFallback: unknown prompt part type '%s' stripped",
                    type(part).__name__,
                )

        user_content = "\n".join(text_parts).strip()
        if user_content:
            messages.append({"role": "user", "content": user_content})

        return messages

    @staticmethod
    def _strip_markdown_fence(text: str) -> str:
        """Remove ```json … ``` wrappers that some models emit."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()