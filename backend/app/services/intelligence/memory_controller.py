"""
@file backend/app/services/intelligence/memory_controller.py
@description Lightweight Memory Controller using direct Gemma model calls (legacy protocol).
Gemma models (gemma-4-*, gemma-3-*) do not support systemInstruction or JSON mode.
We merge system prompt into user message and request text/plain.
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

# Reuse the application's engine (imported from session module)
from app.db.session import engine

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

    async def _call_model(self, prompt: str) -> str:
        """
        Call a Gemma model with the legacy plain‑text protocol.
        System prompt is prepended to the user message because Gemma does not accept
        the systemInstruction field. JSON mode is not available, so we request text/plain
        and later strip any markdown fences.
        """
        if not self.api_key:
            return ""

        system_prompt = (
            "You are the ATLAS Memory Controller. Analyze the following tutoring transcript segment. "
            "Extract the student's cognitive state into two arrays: "
            "1. 'mastery': Concepts the student clearly understands. "
            "2. 'weaknesses': Concepts the student is struggling with. "
            "Output strictly JSON format. No markdown, no preamble. "
            'Example: {"mastery": ["Binary Trees"], "weaknesses": ["Graph Traversal"]}'
        )
        merged_prompt = f"{system_prompt}\n\n---\n\nUser Request:\n{prompt}"

        for model in self.model_list:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                f"?key={self.api_key}"
            )
            payload = {
                "contents": [{"role": "user", "parts": [{"text": merged_prompt}]}],
                "generationConfig": {
                    "responseMimeType": "text/plain",   # JSON mode is not supported by these Gemma models
                },
            }

            for attempt in range(2):
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.post(url, json=payload, timeout=20) as resp:
                            if resp.status == 200:
                                data = await resp.json()
                                text = data["candidates"][0]["content"]["parts"][0]["text"]
                                # Strip markdown fences / extra whitespace
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
                                break  # Try next model in list
                except Exception as e:
                    logger.warning(f"[Memory] Model {model} exception: {e}")
                    break  # Try next model
        return ""

    async def extract_insights(self, transcript_segment: str) -> Dict[str, Any]:
        response_text = await self._call_model(transcript_segment)
        if response_text and len(response_text) > 5:
            # Any remaining markdown fences are already stripped in _call_model,
            # but keep this for safety
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
        Creates the table if missing (ideal for rapid prototyping).
        """
        async_session = sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
        async with async_session() as db:
            try:
                # Ensure the table exists (migration would be better, but this is safe)
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

                # Insert the new insight
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
            # Session closed automatically by context manager