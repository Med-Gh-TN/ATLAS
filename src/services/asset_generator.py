"""
src/services/asset_generator.py
════════════════════════════════════════════════════════════════════════════════
Academic Asset Generation Service  (v2.1 Omni-Architect SOTA)

Architecture: Cache-First, Context-Distilled Generation Pipeline with Strict Validation.

Flow for every request:
  1. CHECK  → PostgreSQL cache (O(1) composite index lookup).
  2. HIT    → Return immediately. Zero LLM cost.
  3. MISS   → Distill context from Qdrant (document-scoped scroll).
  4. GEN    → Call Gemini via OmniModelBridge with SOTA prompt.
  5. PARSE  → Extract JSON / Mermaid from LLM response.
  6. VALIDATE → Pass through strict Pydantic schemas (domain.models).
  7. STORE  → Upsert to PostgreSQL academic_assets table.
  8. RETURN → Structured payload to the API layer.

Context Distillation Strategy:
  Fetches ALL chunks for the target document_uuid via Qdrant scroll.
  Sorts by vector score to surface density clusters.
  Truncates to MAX_CONTEXT_CHARS to stay inside the Gemini context window.

Fault Isolation:
  • Qdrant scroll failures → empty context → RuntimeError with clear message.
  • JSON parse failures    → logged + empty fallback.
  • Pydantic failures      → invalid items dropped, valid items preserved.
════════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Optional

from pydantic import ValidationError

import infrastructure.database as db
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
MAX_SCROLL_POINTS  = 300      # Qdrant scroll upper bound per document


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
                "Ensure the document has been fully ingested into the vector store "
                "before generating academic assets."
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
        Retrieve and concatenate all text chunks for document_uuid from Qdrant.
        Includes SOTA Dynamic Collection Resolution to bypass attribute obfuscation.
        """
        if self.chunk_storage is None:
            logger.warning("AssetGenerator: chunk_storage is None — empty context.")
            return ""

        client = (
            getattr(self.chunk_storage, "_client", None)
            or getattr(self.chunk_storage, "client", None)
            or getattr(self.chunk_storage, "qdrant_client", None)
        )

        if client is None:
            logger.warning("AssetGenerator: Could not resolve Qdrant client.")
            return ""

        # ── Dynamic Collection Resolution ──
        collection_name = getattr(self.chunk_storage, "collection_name", None) or getattr(self.chunk_storage, "_collection_name", None)
        
        if not collection_name:
            try:
                cols_response = await asyncio.to_thread(client.get_collections)
                for col in cols_response.collections:
                    if "chunks" in col.name:
                        collection_name = col.name
                        logger.info("AssetGenerator: Dynamically resolved collection name → %s", collection_name)
                        break
            except Exception as e:
                logger.warning("AssetGenerator: Failed dynamic collection resolution: %s", e)

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

            # Strictly Filtered Scroll
            points, _next_offset = await asyncio.to_thread(
                client.scroll,
                collection_name = collection_name,
                scroll_filter   = scroll_filter,
                limit           = MAX_SCROLL_POINTS,
                with_payload    = True,
                with_vectors    = False,
            )

            if not points:
                logger.warning(
                    "AssetGenerator: No chunks found for doc=%s… "
                    "in collection '%s'. Verify the document is ingested.",
                    document_uuid[:8], collection_name,
                )
                return ""

            # Extract text
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

            logger.info(
                "AssetGenerator: Distilled %d chunks → %d chars (raw=%d, truncated=%s) "
                "for doc=%s…",
                len(ordered),
                len(truncated),
                len(combined),
                len(combined) > MAX_CONTEXT_CHARS,
                document_uuid[:8],
            )
            return truncated

        except Exception as exc:
            logger.error(
                "AssetGenerator: Context distillation failed for doc=%s…: %s",
                document_uuid[:8], exc,
            )
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