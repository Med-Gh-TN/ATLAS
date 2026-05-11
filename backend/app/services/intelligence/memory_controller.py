"""
@file backend/app/services/intelligence/memory_controller.py
@description Memory Controller with Sovereign Edge routing.
Primary: Kaggle Qwen3‑VL via VLLMClient.
Fallback: Direct Gemma models (existing loop).
SOTA UPDATE: Academic‑level extraction prompt (four‑category taxonomy).
@layer Core Logic / State Persistence
"""

import aiohttp
import asyncio
import json
import logging
import os
import re
import uuid
from typing import Dict, Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

# Reuse the application's engine
from app.db.session import engine


# ── Academic‑grade extraction prompt ────────────────────────────────────────
_EXTRACTION_SYSTEM_PROMPT = (
    "You are the ATLAS Memory Controller, an expert academic cognition analyst. "
    "Analyze the following tutoring transcript segment and extract the student's "
    "cognitive state into FOUR arrays using PRECISE academic terminology:\n\n"
    "1. 'concepts': Key concepts explicitly mentioned in the segment. "
    "These are important definitions, models, or frameworks the student encountered. "
    "Each entry should be the exact term or phrase (e.g., 'XML Schema Definition (XSD)', "
    "'Time Complexity of Merge Sort').\n\n"
    "2. 'weaknesses': Concepts the student is struggling with or asked for clarification on. "
    "Phrase them as actionable focus areas (e.g., 'XSD validation rules and constraint syntax', "
    "'Graph traversal edge cases').\n\n"
    "3. 'mastery': Concepts the student demonstrated solid understanding of, "
    "either by explaining them back correctly or answering confidently. "
    "Phrase them as completed items (e.g., 'Well‑formed XML documents and basic tag nesting rules').\n\n"
    "4. 'session_notes': A short summary of the session's current state or next steps "
    "(e.g., 'Session started – covering XML fundamentals before moving to XSD schema definitions'). "
    "Only include if the segment contains enough information to summarize.\n\n"
    "Output strictly JSON format. No markdown, no preamble. "
    'Example: {"concepts": ["Binary Search Tree (BST)"], '
    '"weaknesses": ["Red‑Black Tree insertion balancing"], '
    '"mastery": ["Pre‑order, in‑order, post‑order traversal"], '
    '"session_notes": "Covering tree data structures – moving to AVL trees next"}'
)


class MemoryController:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "")
        # Only Gemma models (they do NOT support systemInstruction or JSON mode)
        self.model_list = [
            "gemma-4-31b-it",
            "gemma-4-26b-a4b-it",
            "gemma-3-27b-it",
            "gemma-3-12b-it",
        ]

    async def _call_model_via_kaggle(self, prompt: str) -> str:
        """
        Call the Kaggle Qwen3‑VL sovereign node through VLLMClient.
        Returns the raw text response, or raises an exception on failure.
        """
        try:
            from infrastructure.llm.vllm_client import VLLMClient

            text = await VLLMClient.generate(
                prompt=prompt,
                system_instruction=_EXTRACTION_SYSTEM_PROMPT,
                max_tokens=2048,
            )
            # Strip any markdown fences that may still slip through
            text = re.sub(r"```(?:json)?\s*\n?", "", text)
            text = text.replace("```", "").strip()
            return text

        except ImportError:
            logger.warning("[Memory] VLLMClient not importable – falling back to direct Gemma.")
            raise
        except Exception as e:
            logger.warning(f"[Memory] Kaggle call failed ({e}) – falling back to direct Gemma.")
            raise

    async def _call_model_direct_gemma(self, prompt: str) -> str:
        """
        Original direct Gemma fallback loop.
        System prompt is prepended to the user message because Gemma does not
        accept the systemInstruction field.
        """
        if not self.api_key:
            return ""

        merged_prompt = f"{_EXTRACTION_SYSTEM_PROMPT}\n\n---\n\nUser Request:\n{prompt}"

        for model in self.model_list:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                f"?key={self.api_key}"
            )
            payload = {
                "contents": [{"role": "user", "parts": [{"text": merged_prompt}]}],
                "generationConfig": {
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
                                text = re.sub(r"```(?:json)?\s*\n?", "", text)
                                text = text.replace("```", "").strip()
                                return text
                            elif resp.status == 429:
                                body = await resp.text()
                                logger.warning(
                                    f"[Memory] 429 from {model}, attempt {attempt+1}: {body[:100]}"
                                )
                                await asyncio.sleep(2 * (attempt + 1))
                                continue
                            else:
                                body = await resp.text()
                                logger.warning(f"[Memory] Model {model} returned {resp.status}: {body[:200]}")
                                break
                except Exception as e:
                    logger.warning(f"[Memory] Model {model} exception: {e}")
                    break
        return ""

    async def _call_model(self, prompt: str) -> str:
        """
        Primary: Kaggle Qwen node (sovereign edge).
        Fallback: direct Gemma loop if the tunnel is down or an error occurs.
        """
        use_external = os.getenv("USE_EXTERNAL_GPU", "false").lower() == "true"
        colab_url = os.getenv("COLAB_GPU_URL", "").strip()

        if use_external and colab_url:
            try:
                return await self._call_model_via_kaggle(prompt)
            except Exception:
                pass  # Fall through to Gemma fallback

        return await self._call_model_direct_gemma(prompt)

    async def extract_insights(self, transcript_segment: str) -> Dict[str, Any]:
        response_text = await self._call_model(transcript_segment)
        if response_text and len(response_text) > 5:
            clean = response_text.replace("```json", "").replace("```", "").strip()
            try:
                return json.loads(clean)
            except json.JSONDecodeError:
                logger.error("[Memory] Failed to decode JSON.")
        return {}

    async def persist_to_sql(
        self,
        student_id: str,
        course_id: str,
        insights: Dict[str, Any],
        transcript_segment: str = ""
    ) -> None:
        """
        Persist cognitive insights using a new async session.
        Creates the table if missing.
        """
        async_session = sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
        async with async_session() as db:
            try:
                await db.execute(text("""
                    CREATE TABLE IF NOT EXISTS user_cognitive_insights (
                        id UUID PRIMARY KEY,
                        student_id VARCHAR(255) NOT NULL,
                        course_id VARCHAR(255) NOT NULL,
                        mastery JSONB DEFAULT '[]'::jsonb,
                        weaknesses JSONB DEFAULT '[]'::jsonb,
                        transcript_segment TEXT,
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
                    )
                """))
                await db.commit()

                await db.execute(
                    text("""
                        INSERT INTO user_cognitive_insights
                            (id, student_id, course_id, mastery, weaknesses, transcript_segment)
                        VALUES
                            (:id, :student_id, :course_id, :mastery, :weaknesses, :transcript)
                    """),
                    {
                        "id": uuid.uuid4(),
                        "student_id": student_id,
                        "course_id": course_id,
                        "mastery": json.dumps(insights.get("mastery", [])),
                        "weaknesses": json.dumps(insights.get("weaknesses", [])),
                        "transcript": transcript_segment[:1500],
                    },
                )
                await db.commit()
                logger.info(f"[Memory] Persisted insights for student {student_id}.")
            except Exception as e:
                await db.rollback()
                logger.error(f"[Memory] SQL error: {e}")