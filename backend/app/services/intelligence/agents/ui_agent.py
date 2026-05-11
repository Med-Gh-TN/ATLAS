"""
@file backend/app/services/intelligence/agents/ui_agent.py
@description Model‑aware Autonomous UI Agent for Node B.
Primary: Kaggle Qwen3‑VL sovereign edge.
Fallback: Gemma/Gemini chain.
SOTA UPDATE: SOTA prompt that enforces multi‑section academic boards with
             colour‑coded sections, process flows, and comparative analysis.
SOTA UPDATE: Cooldown removed – every sufficient transcript chunk triggers a board.
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

_FULLY_CAPABLE_MODELS = {
    "gemma-4-31b-it", "gemma-4-26b-a4b-it",
    "gemma-3-27b-it", "gemma-3-12b-it",
}

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
                            "colorTheme": {"type": "STRING", "enum": ["blue", "amber", "green", "rose"]},
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
    cleaned = re.sub(r"```(?:json)?\s*\n?", "", text)
    cleaned = cleaned.replace("```", "")
    cleaned = cleaned.strip()
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        return match.group(0)
    return cleaned


class UIAgent:
    def __init__(self):
        models_env = os.getenv(
            "NODE_B_UI_MODELS",
            "gemma-4-31b-it,gemma-3-27b-it"
        )
        self.model_list = [m.strip() for m in models_env.split(",") if m.strip()]
        self.api_key = os.getenv("GEMINI_API_KEY", "")
        self._lock = asyncio.Lock()
        self._last_success_time = 0.0

        self._system_text = (
            "You are the ATLAS Autonomous UI Agent — an advanced, domain‑agnostic "
            "knowledge architect. Your sole purpose is to transform fragments of spoken "
            "tutoring transcripts into dense, academically rigorous VirtualBoard JSON.\n\n"
            "=== WHEN TO ACT ===\n"
            "If the tutor is explaining ANY educational concept, process, comparison, or "
            "list, you MUST generate the VirtualBoard. If the conversation is purely "
            "social, emotional, or filler, return an empty object: {}\n\n"
            "=== MANDATORY STRUCTURE (enforced at the schema level) ===\n"
            "Every board MUST contain:\n"
            "  - A clear, concise title and a descriptive subtitle.\n"
            "  - At LEAST 2 sections. \n"
            "  - Each section must have 3‑7 items (except 'process' sections, which may "
            "    have as many steps as needed).\n"
            "  - Every section MUST use a distinct, appropriate colorTheme:\n"
            "      'blue'  → Definitions, core concepts, fundamentals.\n"
            "      'amber' → Comparisons, contrasts, trade‑offs.\n"
            "      'green' → Processes, workflows, step‑by‑step guides.\n"
            "      'rose'  → Examples, case studies, important warnings, common mistakes.\n\n"
            "=== CONTENT RULES ===\n"
            "1. Decompose the concept into its intellectual pillars. Do not summarise "
            "   everything in one list — split into logically separate sections.\n"
            "2. If the tutor describes a sequence of actions, one section MUST be "
            "   type 'process' with each step as a separate item.\n"
            "3. If the tutor compares two things, use 'amber' and at least one 'grid' "
            "   section to show the comparison side‑by‑side.\n"
            "4. Every item must be a single, precise academic statement (≤ 8 words). "
            "   Use exact technical terminology from the transcript.\n"
            "5. NEVER invent external knowledge — only use concepts explicitly "
            "   mentioned in the transcript.\n\n"
            "=== QUALITY STANDARD ===\n"
            "Assume the student is a Master's‑level candidate who needs a rigorous, "
            "visual study aid. Your output must match the academic depth of a "
            "university textbook. The following example illustrates the expected "
            "density and structure:\n"
            "{\n"
            '  "component": "VirtualBoard",\n'
            '  "props": {\n'
            '    "title": "Introduction to XML",\n'
            '    "subtitle": "The rulebook for structuring data",\n'
            '    "sections": [\n'
            '      {\n'
            '        "id": "what_is_xml",\n'
            '        "title": "What is XML?",\n'
            '        "type": "list",\n'
            '        "colorTheme": "blue",\n'
            '        "items": [\n'
            '          "Defines data structure and hierarchy",\n'
            '          "Defines content rules and constraints",\n'
            '          "Human-readable, machine-parseable format"\n'
            '        ]\n'
            '      },\n'
            '      {\n'
            '        "id": "xml_vs_html",\n'
            '        "title": "XML vs HTML",\n'
            '        "type": "grid",\n'
            '        "colorTheme": "amber",\n'
            '        "items": [\n'
            '          "XML: focuses on data meaning",\n'
            '          "HTML: focuses on visual display",\n'
            '          "XML: self-defined tags",\n'
            '          "HTML: predefined tags only"\n'
            '        ]\n'
            '      },\n'
            '      {\n'
            '        "id": "processing_flow",\n'
            '        "title": "Document Processing Flow",\n'
            '        "type": "process",\n'
            '        "colorTheme": "green",\n'
            '        "items": [\n'
            '          "Author XML",\n'
            '          "Validate with XSD",\n'
            '          "Parse & Transform",\n'
            '          "Consume Data"\n'
            '        ]\n'
            '      }\n'
            '    ]\n'
            '  }\n'
            "}\n\n"
            "=== OUTPUT FORMAT ===\n"
            "Respond ONLY with the raw JSON object. No markdown fences, no preamble, "
            "no postamble."
        )

    async def _call_kaggle_node(self, prompt: str) -> Optional[str]:
        try:
            from infrastructure.llm.vllm_client import VLLMClient

            use_external = os.getenv("USE_EXTERNAL_GPU", "false").lower() == "true"
            colab_url = os.getenv("COLAB_GPU_URL", "").strip()
            if not use_external or not colab_url:
                logger.info("[Node B] Kaggle node not configured (USE_EXTERNAL_GPU=%s, COLAB_GPU_URL=%s)", use_external, colab_url)
                return None

            logger.info("[Node B] ☢️ Attempting Kaggle node for VirtualBoard…")
            raw = await VLLMClient.generate(
                prompt=prompt,
                system_instruction=self._system_text,
                max_tokens=4096,
            )
            cleaned = _clean_json_text(raw)
            if cleaned and len(cleaned) > 5:
                logger.info("[Node B] ✅ Kaggle returned VirtualBoard candidate (%d chars).", len(cleaned))
                return cleaned
            logger.warning("[Node B] Kaggle response was too short or empty: '%s'", raw[:100])
            return None
        except ImportError:
            logger.warning("[Node B] VLLMClient not importable — falling back to Gemma chain.")
            return None
        except Exception as e:
            logger.error("[Node B] Kaggle call FAILED (%s) — falling back to Gemma chain.", e)
            return None

    async def _call_model(self, model: str, prompt: str) -> Optional[str]:
        if not self.api_key:
            logger.error("[Node B] No API key available.")
            return None
        if model in _FULLY_CAPABLE_MODELS:
            return await self._call_fully_capable(model, prompt)
        else:
            return await self._call_legacy(model, prompt)

    async def _call_fully_capable(self, model: str, prompt: str) -> Optional[str]:
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
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            f"?key={self.api_key}"
        )
        merged_prompt = f"{self._system_text}\n\n---\n\nUser Request:\n{prompt}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text": merged_prompt}]}],
            "generationConfig": {"responseMimeType": "text/plain"},
        }
        for attempt in range(2):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=payload, timeout=20) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            text = data["candidates"][0]["content"]["parts"][0]["text"]
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
        async with self._lock:
            if not self.model_list:
                return None

            prompt = f"Recent Transcript segment:\n{transcript}"

            # ── PRIMARY: Kaggle ──
            kaggle_response = await self._call_kaggle_node(prompt)
            if kaggle_response:
                try:
                    ui_payload = json.loads(kaggle_response)
                    if ui_payload and ui_payload.get("component") == "VirtualBoard":
                        logger.info("[Node B] 🎨 VirtualBoard generated by Kaggle Qwen (sovereign edge).")
                        return ui_payload
                    else:
                        logger.info("[Node B] Kaggle returned JSON but no VirtualBoard component; falling back.")
                except json.JSONDecodeError:
                    logger.warning("[Node B] Kaggle response could not be parsed as JSON; falling back.")

            # ── FALLBACK: Gemma/Gemini ──
            for model in self.model_list:
                logger.info("[Node B] Fallback to model %s…", model)
                response_text = await self._call_model(model, prompt)
                if not response_text or len(response_text.strip()) <= 5:
                    continue
                clean = _clean_json_text(response_text)
                try:
                    ui_payload = json.loads(clean)
                except json.JSONDecodeError:
                    logger.warning("[Node B] Model %s returned non‑JSON: %s…", model, response_text[:120])
                    continue
                if ui_payload and ui_payload.get("component") == "VirtualBoard":
                    logger.info("[Node B] 🎨 VirtualBoard generated by %s (fallback).", model)
                    return ui_payload
                elif ui_payload and ui_payload.get("component"):
                    logger.info("[Node B] Model %s returned JSON but not VirtualBoard.", model)
                    return None
                else:
                    logger.info("[Node B] Model %s returned valid JSON but no VirtualBoard. Skipping.", model)
                    return None

            logger.info("[Node B] No model produced a valid VirtualBoard.")
            return None