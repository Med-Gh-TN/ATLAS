"""
@file backend/app/services/intelligence/agents/ui_agent.py
@description Model‑aware Autonomous UI Agent for Node B.
Uses direct Gemini API calls with capability‑aware dispatch:
- Gemma 3 models: no systemInstruction, no JSON mode → prompt engineering + regex
- Gemma 4 / Gemini Flash: systemInstruction + responseJsonSchema for guaranteed JSON
@layer Core Logic
@dependencies aiohttp, asyncio, json, logging, os, time
"""

import aiohttp
import asyncio
import json
import logging
import os
import re
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ── Model capability flags ──────────────────────────────────────────────────
# Models that support systemInstruction, responseMimeType, and responseJsonSchema
_FULLY_CAPABLE_MODELS = {
    "gemma-4-31b-it", "gemma-4-26b-a4b-it",
    "gemma-3-27b-it", "gemma-3-12b-it",
}

# ── VirtualBoard JSON Schema (used for models that support responseJsonSchema)
_VIRTUAL_BOARD_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "component": {"type": "STRING", "enum": ["VirtualBoard"]},
        "props": {
            "type": "OBJECT",
            "properties": {
                "title": {"type": "STRING"},
                "subtitle": {"type": "STRING"},
                "sections": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "id": {"type": "STRING"},
                            "title": {"type": "STRING"},
                            "type": {"type": "STRING", "enum": ["list", "process", "grid"]},
                            "items": {"type": "ARRAY", "items": {"type": "STRING"}},
                            "colorTheme": {"type": "STRING", "enum": ["blue", "yellow", "green", "red", "white"]},
                        },
                        "required": ["id", "title", "type", "items", "colorTheme"],
                    },
                },
            },
            "required": ["title", "sections"],
        },
    },
    "required": ["component", "props"],
}


def _clean_json_text(text: str) -> str:
    """Robustly strip markdown fences and any surrounding non‑JSON fluff."""
    # Remove ```json blocks
    cleaned = re.sub(r"```(?:json)?\s*\n?", "", text)
    cleaned = cleaned.replace("```", "")
    # Remove leading/trailing whitespace
    cleaned = cleaned.strip()
    # If the model wrapped JSON in some explanatory text, try to extract just the JSON object
    # by finding the first { and last }
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        return match.group(0)
    return cleaned


class UIAgent:
    def __init__(self):
        models_env = os.getenv(
            "NODE_B_UI_MODELS",
            "gemini-2.5-flash,gemini-1.5-flash,gemma-4-31b-it"
        )
        self.model_list = [m.strip() for m in models_env.split(",") if m.strip()]
        self.api_key = os.getenv("GEMINI_API_KEY", "")
        self._lock = asyncio.Lock()
        self._last_success_time = 0.0
        self._cooldown_after_success = 30

        # System prompt shared across all models
        self._system_text = (
            "You are the ATLAS Autonomous UI Agent. Your purpose is to enhance real‑time "
            "education by structuring chaotic spoken transcripts into a clean, semantic "
            "'VirtualBoard' React component.\n\n"
            "If the tutor is explaining a distinct educational concept, process, or list, "
            "generate the JSON below. If the conversation is just casual filler, return "
            "an empty object: {}\n\n"
            "=== SCHEMA REQUIREMENT ===\n"
            "{\n"
            '  "component": "VirtualBoard",\n'
            '  "props": {\n'
            '    "title": "Main Concept Title",\n'
            '    "subtitle": "Short explanatory context",\n'
            '    "sections": [\n'
            '      {\n'
            '        "id": "unique_section_id",\n'
            '        "title": "Section Header",\n'
            '        "type": "list",\n'
            '        "items": ["Point 1", "Point 2"],\n'
            '        "colorTheme": "blue"\n'
            '      }\n'
            '    ]\n'
            '  }\n'
            "}\n\n"
            "=== RULES ===\n"
            "1. Output STRICTLY raw JSON. Do NOT wrap in markdown ```json blocks.\n"
            "2. Do NOT add any text before or after the JSON object.\n"
            "3. Keep text extremely concise. A visual board uses bullet points, not paragraphs.\n"
            "4. Use 'colorTheme' intelligently: 'red' for warnings/errors, 'green' for success, 'blue' for facts.\n"
            "5. NEVER invent information not present in the transcript."
        )

    async def _call_model(self, model: str, prompt: str) -> Optional[str]:
        """Dispatch to the appropriate API call based on model capabilities."""

        if not self.api_key:
            logger.error("[Node B] No API key available.")
            return None

        if model in _FULLY_CAPABLE_MODELS:
            # ── Path A: systemInstruction + responseJsonSchema ──
            return await self._call_fully_capable(model, prompt)
        else:
            # ── Path B: prompt engineering only (Gemma 3, etc.) ──
            return await self._call_legacy(model, prompt)

    async def _call_fully_capable(self, model: str, prompt: str) -> Optional[str]:
        """Use systemInstruction + responseJsonSchema for guaranteed JSON."""
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            f"?key={self.api_key}"
        )
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "systemInstruction": {"parts": [{"text": self._system_text}]},
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": _VIRTUAL_BOARD_SCHEMA,
            },
        }

        for attempt in range(2):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=payload, timeout=20) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            return data["candidates"][0]["content"]["parts"][0]["text"]
                        elif resp.status == 429:
                            body = await resp.text()
                            logger.warning(f"[Node B] 429 from {model}, attempt {attempt+1}: {body[:100]}")
                            await asyncio.sleep(2 * (attempt + 1))
                            continue
                        else:
                            body = await resp.text()
                            logger.warning(f"[Node B] {model} returned {resp.status}: {body[:200]}")
                            return None
            except Exception as e:
                logger.warning(f"[Node B] {model} exception: {e}")
                return None
        return None

    async def _call_legacy(self, model: str, prompt: str) -> Optional[str]:
        """
        For models (e.g. Gemma 3) that don't support systemInstruction or JSON mode.
        Strategy: prepend system prompt to user message, output as text/plain,
        then strip markdown fences post‑processing.
        """
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            f"?key={self.api_key}"
        )

        # Merge system prompt into the user message (Gemma 3's only supported pattern)
        merged_prompt = f"{self._system_text}\n\n---\n\nUser Request:\n{prompt}"

        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": merged_prompt}]}
            ],
            # No systemInstruction — would cause 400
            "generationConfig": {
                # text/plain — no JSON mode (would cause 400)
                "responseMimeType": "text/plain",
            },
        }

        for attempt in range(2):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=payload, timeout=20) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            text = data["candidates"][0]["content"]["parts"][0]["text"]
                            # The model may still output JSON despite text/plain
                            return _clean_json_text(text)
                        elif resp.status == 429:
                            body = await resp.text()
                            logger.warning(f"[Node B] 429 from {model}, attempt {attempt+1}: {body[:100]}")
                            await asyncio.sleep(2 * (attempt + 1))
                            continue
                        else:
                            body = await resp.text()
                            logger.warning(f"[Node B] {model} returned {resp.status}: {body[:200]}")
                            return None
            except Exception as e:
                logger.warning(f"[Node B] {model} exception: {e}")
                return None
        return None

    async def evaluate_transcript(self, transcript: str) -> dict | None:
        """
        Acquires a lock to prevent concurrent evaluations, applies cooldown,
        and tries models in order until a valid VirtualBoard JSON is obtained.
        """
        async with self._lock:
            if time.time() - self._last_success_time < self._cooldown_after_success:
                logger.info("[Node B] In cooldown after recent board generation. Skipping.")
                return None

            if not self.model_list:
                return None

            prompt = f"Recent Transcript segment:\n{transcript}"

            for model in self.model_list:
                logger.info(f"[Node B] Trying model {model}…")
                response_text = await self._call_model(model, prompt)

                if not response_text or len(response_text.strip()) <= 5:
                    continue

                clean = _clean_json_text(response_text)

                try:
                    ui_payload = json.loads(clean)
                except json.JSONDecodeError:
                    logger.warning(
                        f"[Node B] Model {model} returned non‑JSON: {response_text[:120]}…"
                    )
                    continue

                if ui_payload and ui_payload.get("component") == "VirtualBoard":
                    logger.info(f"[Node B] 🎨 VirtualBoard generated by {model}.")
                    self._last_success_time = time.time()
                    return ui_payload
                elif ui_payload and ui_payload.get("component"):
                    logger.info(
                        f"[Node B] Model {model} returned JSON but not VirtualBoard "
                        f"(component={ui_payload.get('component')}). Stopping iteration."
                    )
                    return None
                else:
                    # Valid JSON but empty object {} or no component field
                    logger.info(f"[Node B] Model {model} returned valid JSON but no VirtualBoard. Skipping.")
                    return None

            logger.info("[Node B] No model produced a valid VirtualBoard.")
            return None