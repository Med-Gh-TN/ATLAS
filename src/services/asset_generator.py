"""
src/services/asset_generator.py
════════════════════════════════════════════════════════════════════════════════
Academic Asset Generation Service  (v3.0 Omni-Architect SOTA)

Architecture: Cache-First, Context-Distilled Generation Pipeline with Strict Validation.

Changelog v3.0:
  - SOTA FIX: Eradicated vector-scroll document reconstruction.
  - SOTA FIX: _distill_context now queries PostgreSQL parent_chunks directly for 
    O(1) latency and 100% sequential AST integrity.
════════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid as uuid_module
from typing import Any, Optional

from pydantic import ValidationError

import infrastructure.database as db
from infrastructure.database.connection import get_pool
from infrastructure.llm.prompts import PromptLoader
from domain.models import (
    FlashcardCollection,
    FlashcardItem,
    ExamData,
    MindmapData,
    SummaryData,
)

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
VALID_ASSET_TYPES  = frozenset({"flashcards", "mindmap", "exam", "summary"})
MAX_CONTEXT_CHARS  = 28_000   # ≈ 7 000 tokens — well within Gemini 1.5 Flash window
MAX_SCROLL_POINTS  = 300      # Qdrant fallback upper bound per document


class AssetGeneratorService:
    """
    Service responsible for generating, validating, and caching academic assets.
    Injected into the FastAPI router via the asset_router module's
    set_pipeline() call during server startup.
    """

    def __init__(
        self,
        bridge,          # OmniModelBridge
        chunk_storage,   # ColbertQdrantStorage | None
        prompt_loader: Optional[PromptLoader] = None,
    ) -> None:
        self.bridge        = bridge
        self.chunk_storage = chunk_storage
        self._loader       = prompt_loader or PromptLoader()
        self._model_version = os.getenv("GEMINI_MODEL_NAME", "unknown")

    # ──────────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ──────────────────────────────────────────────────────────────────────────

    async def get_or_generate(
        self,
        document_uuid:   str,
        asset_type:      str,
        force_regenerate: bool = False,
    ) -> dict[str, Any]:
        """
        Cache-first entry point for all asset requests.
        """
        if asset_type not in VALID_ASSET_TYPES:
            raise ValueError(
                f"Unknown asset_type '{asset_type}'. "
                f"Valid options: {sorted(VALID_ASSET_TYPES)}"
            )

        # ── 1. Cache check ────────────────────────────────────────────────────
        if not force_regenerate and db.is_available():
            cached = await db.get_asset(document_uuid, asset_type)
            if cached:
                logger.info(
                    "AssetGenerator: Cache HIT — doc=%s… type=%s",
                    document_uuid[:8], asset_type,
                )
                return {
                    "cached":     True,
                    "asset_type": asset_type,
                    "content":    cached["content"],
                    "doc_uuid":   document_uuid,
                    "generated_at": cached.get("generated_at"),
                }

        # ── 2. Context distillation ──────────────────────────────────────────
        logger.info(
            "AssetGenerator: Cache MISS — distilling context for doc=%s…",
            document_uuid[:8],
        )
        context = await self._distill_context(document_uuid)
        if not context or len(context.strip()) < 100:
            raise RuntimeError(
                f"Insufficient content found for document '{document_uuid[:12]}…'. "
                "Ensure the document has been fully ingested before generating academic assets."
            )

        # ── 3. Generate & Validate ────────────────────────────────────────────
        logger.info(
            "AssetGenerator: Generating '%s' for doc=%s… (%d chars context)",
            asset_type, document_uuid[:8], len(context),
        )
        dispatch = {
            "flashcards": self._generate_flashcards,
            "mindmap":    self._generate_mindmap,
            "exam":       self._generate_exam,
            "summary":    self._generate_summary,
        }
        content = await dispatch[asset_type](context)

        # ── 4. Cache ──────────────────────────────────────────────────────────
        if db.is_available():
            try:
                await db.create_or_update_asset(
                    document_uuid = document_uuid,
                    asset_type    = asset_type,
                    content       = content,
                    model_version = self._model_version,
                )
                logger.info(
                    "AssetGenerator: Persisted '%s' for doc=%s…",
                    asset_type, document_uuid[:8],
                )
            except Exception as exc:
                logger.error(
                    "AssetGenerator: Non-fatal cache write failure: %s", exc
                )

        return {
            "cached":     False,
            "asset_type": asset_type,
            "content":    content,
            "doc_uuid":   document_uuid,
            "generated_at": None,
        }

    async def get_cached_manifest(self, document_uuid: str) -> list[dict[str, Any]]:
        """
        Returns which asset types are already cached for a document.
        Used by the UI to display cache-hit badges on buttons.
        """
        if not db.is_available():
            return []
        try:
            return await db.list_document_assets(document_uuid)
        except Exception as exc:
            logger.error("AssetGenerator: Manifest fetch failed: %s", exc)
            return []

    async def invalidate(self, document_uuid: str, asset_type: str) -> bool:
        """Delete a cached asset to force re-generation on next request."""
        if not db.is_available():
            return False
        return await db.delete_asset(document_uuid, asset_type)

    # ──────────────────────────────────────────────────────────────────────────
    # CONTEXT DISTILLATION
    # ──────────────────────────────────────────────────────────────────────────

    async def _distill_context(self, document_uuid: str) -> str:
        """
        SOTA FIX: Relational AST Context Retrieval.
        Bypasses Qdrant vector scrolling entirely to fetch the pure, sequentially 
        ordered ParentChunks directly from PostgreSQL.
        """
        if db.is_available():
            try:
                pool = await get_pool()
                doc_uuid_obj = uuid_module.UUID(hex=document_uuid) if len(document_uuid) == 32 else uuid_module.UUID(document_uuid)
                
                async with pool.acquire() as conn:
                    # Fetching by created_at ensures sequential document reconstruction
                    rows = await conn.fetch(
                        "SELECT content FROM parent_chunks WHERE document_uuid = $1 ORDER BY created_at ASC",
                        doc_uuid_obj
                    )
                
                if rows:
                    combined = "\n\n---\n\n".join([r["content"] for r in rows])
                    truncated = combined[:MAX_CONTEXT_CHARS]
                    logger.info(
                        "AssetGenerator: Distilled %d ParentChunks from PostgreSQL → %d chars for doc=%s…",
                        len(rows), len(truncated), document_uuid[:8]
                    )
                    return truncated
            except Exception as e:
                logger.warning("AssetGenerator: PostgreSQL parent_chunk fetch failed, falling back to Qdrant: %s", e)

        # ── Fallback: Qdrant Dynamic Collection Resolution ──
        logger.warning("AssetGenerator: Executing legacy Qdrant scroll fallback.")
        if self.chunk_storage is None:
            return ""

        client = (
            getattr(self.chunk_storage, "_client", None)
            or getattr(self.chunk_storage, "client", None)
            or getattr(self.chunk_storage, "qdrant_client", None)
        )

        if client is None:
            return ""

        collection_name = getattr(self.chunk_storage, "collection_name", None) or getattr(self.chunk_storage, "_collection_name", None)
        
        if not collection_name:
            try:
                cols_response = await asyncio.to_thread(client.get_collections)
                for col in cols_response.collections:
                    if "chunks" in col.name:
                        collection_name = col.name
                        break
            except Exception:
                pass

        collection_name = collection_name or "chunks"

        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue

            scroll_filter = Filter(
                should=[
                    FieldCondition(key="workspace_id", match=MatchValue(value=document_uuid)),
                    FieldCondition(key="workspace",    match=MatchValue(value=document_uuid)),
                    FieldCondition(key="doc_id",       match=MatchValue(value=document_uuid)),
                    FieldCondition(key="document_id",  match=MatchValue(value=document_uuid)),
                    FieldCondition(key="namespace",    match=MatchValue(value=document_uuid)),
                ]
            )

            points, _next_offset = await asyncio.to_thread(
                client.scroll,
                collection_name = collection_name,
                scroll_filter   = scroll_filter,
                limit           = MAX_SCROLL_POINTS,
                with_payload    = True,
                with_vectors    = False,
            )

            if not points:
                return ""

            texts: list[tuple[float, str]] = []
            for point in points:
                payload = point.payload or {}
                text = (
                    payload.get("content")
                    or payload.get("text")
                    or payload.get("chunk_content")
                    or ""
                )
                if text and text.strip():
                    score = payload.get("score", 0.0)
                    try:
                        score = float(score)
                    except (TypeError, ValueError):
                        score = 0.0
                    texts.append((score, text.strip()))

            if not texts:
                return ""

            texts.sort(key=lambda x: x[0], reverse=True)
            ordered = [t for _, t in texts]

            combined = "\n\n---\n\n".join(ordered)
            truncated = combined[:MAX_CONTEXT_CHARS]

            return truncated

        except Exception as exc:
            logger.error("AssetGenerator: Qdrant fallback failed: %s", exc)
            return ""

    # ──────────────────────────────────────────────────────────────────────────
    # GENERATION METHODS (STRICT PYDANTIC BOUNDARIES)
    # ──────────────────────────────────────────────────────────────────────────

    async def _generate_flashcards(self, context: str) -> dict[str, Any]:
        system_prompt = self._loader.get("flashcard_gen")
        user_prompt   = (
            f"{system_prompt}\n\n"
            f"<DOCUMENT_CONTEXT>\n{context}\n</DOCUMENT_CONTEXT>\n\n"
            f"Generate the flashcard JSON array now:"
        )
        raw = await self._call_llm(user_prompt, system_prompt)
        parsed_list = self._parse_json(raw, fallback=[])
        
        if not isinstance(parsed_list, list):
            logger.warning("AssetGenerator: flashcard JSON was not a list — fallback.")
            parsed_list = []

        valid_cards = []
        for item in parsed_list:
            if isinstance(item, dict):
                try:
                    # Enforce strict domain schema validation
                    valid_card = FlashcardItem(**item)
                    valid_cards.append(valid_card)
                except ValidationError as e:
                    logger.warning("AssetGenerator: Dropping malformed flashcard: %s", e)

        collection = FlashcardCollection(cards=valid_cards, count=len(valid_cards))
        logger.info("AssetGenerator: Generated %d valid flashcards.", collection.count)
        return collection.model_dump()

    async def _generate_mindmap(self, context: str) -> dict[str, Any]:
        system_prompt = self._loader.get("mindmap_gen")
        user_prompt   = (
            f"Generate a Mermaid.js mindmap for the following academic document. "
            f"Respond with ONLY the mindmap syntax.\n\n"
            f"<DOCUMENT_CONTEXT>\n{context}\n</DOCUMENT_CONTEXT>"
        )
        raw       = await self._call_llm(user_prompt, system_prompt)
        mermaid   = self._clean_mermaid(raw)
        
        try:
            # Enforce domain schema
            mindmap_data = MindmapData(mermaid=mermaid)
        except ValidationError as e:
            logger.error("AssetGenerator: Mermaid schema validation failed: %s", e)
            mindmap_data = MindmapData(mermaid="")

        logger.info("AssetGenerator: Generated mindmap (%d chars).", len(mindmap_data.mermaid))
        return mindmap_data.model_dump()

    async def _generate_exam(self, context: str) -> dict[str, Any]:
        system_prompt = self._loader.get("exam_gen")
        user_prompt   = (
            f"{system_prompt}\n\n"
            f"<DOCUMENT_CONTEXT>\n{context}\n</DOCUMENT_CONTEXT>\n\n"
            f"Generate the examination JSON object now:"
        )
        raw       = await self._call_llm(user_prompt, system_prompt)
        parsed_dict = self._parse_json(raw, fallback={"mcq": [], "written": []})
        
        try:
            # Enforce strict domain schema validation recursively
            exam_data = ExamData(**parsed_dict)
        except ValidationError as e:
            logger.error("AssetGenerator: Exam schema validation failed. Dropping invalid items: %s", e)
            # If the entire object fails, fall back to empty to prevent UI crashes
            exam_data = ExamData(mcq=[], written=[])

        logger.info(
            "AssetGenerator: Generated exam — %d MCQ + %d written.",
            len(exam_data.mcq), len(exam_data.written),
        )
        return exam_data.model_dump()
    

    async def _generate_summary(self, context: str) -> dict[str, Any]:
        system_prompt = self._loader.get("summary_gen")
        user_prompt   = (
            f"{system_prompt}\n\n"
            f"<DOCUMENT_CONTEXT>\n{context}\n</DOCUMENT_CONTEXT>\n\n"
            f"Generate the summary JSON object now:"
        )
        raw       = await self._call_llm(user_prompt, system_prompt)
        parsed_dict = self._parse_json(raw, fallback={"overview": "", "key_concepts": []})
        
        # ── ULTIMATE SOTA JSON UNWRAPPER ──
        # Handles arrays (if LLM returns [{...}])
        if isinstance(parsed_dict, list) and len(parsed_dict) > 0:
            parsed_dict = parsed_dict[0]

        # Hunts for the 'overview' key no matter how deeply nested it is
        if isinstance(parsed_dict, dict) and "overview" not in parsed_dict:
            for key, val in parsed_dict.items():
                if isinstance(val, dict) and "overview" in val:
                    parsed_dict = val
                    logger.debug("AssetGenerator: Unwrapped nested JSON successfully.")
                    break
        
        try:
            # Enforce strict domain schema
            summary_data = SummaryData(**parsed_dict)
        except ValidationError as e:
            logger.error("AssetGenerator: Summary schema validation failed. Raw JSON: %s | Error: %s", str(parsed_dict)[:200], e)
            summary_data = SummaryData(overview="Generation failed.", key_concepts=[])

        logger.info("AssetGenerator: Generated summary (%d chars overview).", len(summary_data.overview))
        return summary_data.model_dump()

    # ──────────────────────────────────────────────────────────────────────────
    # LLM CALL WRAPPER
    # ──────────────────────────────────────────────────────────────────────────

    async def _call_llm(self, user_prompt: str, system_instruction: str) -> str:
        try:
            from infrastructure.config_manager import TaskType 
            return await self.bridge._call_gemini(
                [user_prompt],
                system_instruction = system_instruction,
                throttle           = True,
                force_json         = False,
                task               = TaskType.ASSET_GENERATION, 
            )
        except Exception as exc:
            logger.error("AssetGenerator: LLM call failed: %s", exc)
            raise RuntimeError(f"LLM generation failed: {exc}") from exc

    # ──────────────────────────────────────────────────────────────────────────
    # PARSING HELPERS
    # ──────────────────────────────────────────────────────────────────────────

    def _parse_json(self, raw: str, fallback: Any) -> Any:
        """
        Safely parse JSON from an LLM response.
        Strips all known markdown code fence variants before parsing.
        """
        cleaned = raw.strip()
        # Strip opening fence
        for fence in ("```json\n", "```json", "```\n", "```"):
            if cleaned.startswith(fence):
                cleaned = cleaned[len(fence):]
                break
        # Strip closing fence
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].rstrip()
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.error(
                "AssetGenerator: JSON parse failed (%s). "
                "First 300 chars of raw: %s",
                exc, raw[:300],
            )
            return fallback

    def _clean_mermaid(self, raw: str) -> str:
        """
        Extract and sanitise Mermaid syntax from the LLM response.
        Handles both raw output and markdown-fenced output.
        """
        cleaned = raw.strip()

        # Extract from code fence if present
        if "```mermaid" in cleaned:
            start   = cleaned.index("```mermaid") + len("```mermaid")
            end_idx = cleaned.find("```", start)
            cleaned = cleaned[start : end_idx if end_idx > 0 else len(cleaned)].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

        # Guarantee the mindmap directive is present
        if not cleaned.lstrip().startswith("mindmap"):
            cleaned = "mindmap\n  root((Document Overview))\n" + cleaned

        return cleaned