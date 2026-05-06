"""
src/presentation/asset_router.py
════════════════════════════════════════════════════════════════════════════════
Academic Asset REST API  (v1.1 - Summary Enabled)

Endpoints
─────────
GET  /api/v1/assets/{document_uuid}/manifest
    Returns which asset types are cached for a document (no LLM cost).
    Used by the UI to render cache-hit badges on buttons immediately.

GET  /api/v1/assets/{document_uuid}?type=flashcards|mindmap|exam|summary
    Cache-first retrieval. Returns asset if cached; 404 if not yet generated.
    Does NOT trigger generation — use POST for that.

POST /api/v1/assets/generate
    Triggers the full generation pipeline (cache-check → distill → LLM → cache).
    Idempotent: if already cached, returns the cached version immediately.
    Set force_regenerate=true to bypass cache and re-generate.

DELETE /api/v1/assets/{document_uuid}?type=...
    Invalidates a specific cached asset. Forces re-generation on next POST.

Design Notes
────────────
• The router holds a lazy reference to the pipeline (_pipeline_ref). This
  avoids circular imports — server.py calls set_pipeline(pipeline) in the
  lifespan hook after the pipeline is fully initialized.
• All endpoints return a consistent envelope:
    { "ok": bool, "data": ..., "error": str|null }
• HTTP 503 is returned during the startup window before the pipeline is ready.
════════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import infrastructure.database as db

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Lazy pipeline reference — injected by server.py after startup
# ──────────────────────────────────────────────────────────────────────────────
_pipeline_ref = None


def set_pipeline(pipeline: Any) -> None:
    """Called by server.py once HybridRAGPipeline.initialize() completes."""
    global _pipeline_ref
    _pipeline_ref = pipeline
    logger.info("AssetRouter: Pipeline reference injected. Asset API ready.")


def _get_generator():
    """Dependency-style getter. Raises 503 during startup."""
    if _pipeline_ref is None:
        raise HTTPException(
            status_code=503,
            detail="Service initializing. Please retry in a moment.",
        )
    gen = getattr(_pipeline_ref, "_asset_generator", None)
    if gen is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Asset generator not initialized. "
                "Ensure RERANKER_ENABLED and pipeline initialization completed."
            ),
        )
    return gen


# ──────────────────────────────────────────────────────────────────────────────
# PYDANTIC MODELS
# ──────────────────────────────────────────────────────────────────────────────

class GenerateAssetRequest(BaseModel):
    document_uuid:   str  = Field(..., min_length=32, max_length=36,
                                  description="Document UUID hex (32 chars) or hyphenated form.")
    asset_type:      str  = Field(..., pattern="^(flashcards|mindmap|exam|summary)$",
                                  description="Asset type to generate.")
    force_regenerate: bool = Field(False,
                                   description="Bypass cache and re-generate from scratch.")


class AssetEnvelope(BaseModel):
    ok:    bool
    data:  Optional[Any] = None
    error: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# ROUTER
# ──────────────────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/v1/assets", tags=["Academic Assets"])


# ── GET /manifest ─────────────────────────────────────────────────────────────
@router.get(
    "/{document_uuid}/manifest",
    summary="List cached asset types for a document",
    response_model=AssetEnvelope,
)
async def get_asset_manifest(document_uuid: str):
    """
    Returns a manifest of which asset types (flashcards/mindmap/exam/summary) are
    already cached for the given document.

    The UI uses this on document selection to immediately show which buttons
    have a cached result (green badge) vs. need generation.
    Zero LLM cost — pure database read.
    """
    gen = _get_generator()
    try:
        manifest = await gen.get_cached_manifest(document_uuid)
        return {"ok": True, "data": {"manifest": manifest}, "error": None}
    except Exception as exc:
        logger.error("AssetRouter: manifest error for %s: %s", document_uuid[:8], exc)
        return JSONResponse(
            status_code=500,
            content={"ok": False, "data": None, "error": str(exc)},
        )


# ── GET /{document_uuid}?type=... ─────────────────────────────────────────────
@router.get(
    "/{document_uuid}",
    summary="Retrieve a cached academic asset",
    response_model=AssetEnvelope,
)
async def get_asset(
    document_uuid: str,
    type: str = Query(..., pattern="^(flashcards|mindmap|exam|summary)$"),
):
    """
    Cache-only retrieval. Returns the asset if cached; HTTP 404 if not found.
    Does NOT trigger generation — call POST /generate for that.
    """
    gen = _get_generator()
    if not db.is_available():
        return JSONResponse(
            status_code=503,
            content={
                "ok":    False,
                "data":  None,
                "error": "Database unavailable. Enterprise mode may be disabled.",
            },
        )
    try:
        cached = await db.get_asset(document_uuid, type)
        if cached is None:
            return JSONResponse(
                status_code=404,
                content={
                    "ok":    False,
                    "data":  None,
                    "error": f"No cached '{type}' found for document. Call POST /generate first.",
                },
            )
        return {
            "ok":    True,
            "data":  {
                "asset_type":   cached["asset_type"],
                "content":      cached["content"],
                "cached":       True,
                "generated_at": cached.get("generated_at"),
                "doc_uuid":     document_uuid,
            },
            "error": None,
        }
    except Exception as exc:
        logger.error("AssetRouter: get error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"ok": False, "data": None, "error": str(exc)},
        )


# ── POST /generate ─────────────────────────────────────────────────────────────
@router.post(
    "/generate",
    summary="Generate (or retrieve cached) academic asset",
    response_model=AssetEnvelope,
)
async def generate_asset(body: GenerateAssetRequest):
    """
    Cache-first generation pipeline.

    1. If the asset is cached (and force_regenerate=false), returns it instantly.
    2. If not cached, runs the full distillation + LLM + caching pipeline.
    3. Returns a consistent payload regardless of cache status.

    This endpoint is idempotent: calling it multiple times for the same
    (document_uuid, asset_type) is safe and efficient.
    """
    gen = _get_generator()
    try:
        result = await gen.get_or_generate(
            document_uuid    = body.document_uuid,
            asset_type       = body.asset_type,
            force_regenerate = body.force_regenerate,
        )
        return {"ok": True, "data": result, "error": None}

    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "data": None, "error": str(exc)},
        )
    except RuntimeError as exc:
        # RuntimeError signals a user-fixable problem (e.g., doc not ingested)
        return JSONResponse(
            status_code=422,
            content={"ok": False, "data": None, "error": str(exc)},
        )
    except Exception as exc:
        logger.error(
            "AssetRouter: generation failed for %s/%s: %s",
            body.document_uuid[:8], body.asset_type, exc,
        )
        return JSONResponse(
            status_code=500,
            content={"ok": False, "data": None, "error": str(exc)},
        )


# ── DELETE /{document_uuid}?type=... ──────────────────────────────────────────
@router.delete(
    "/{document_uuid}",
    summary="Invalidate a cached academic asset",
    response_model=AssetEnvelope,
)
async def delete_asset(
    document_uuid: str,
    type: str = Query(..., pattern="^(flashcards|mindmap|exam|summary)$"),
):
    """
    Deletes a cached asset, forcing re-generation on the next POST /generate.
    Useful when the underlying document has been re-ingested with new content.
    """
    gen = _get_generator()
    try:
        deleted = await gen.invalidate(document_uuid, type)
        return {
            "ok":    True,
            "data":  {"deleted": deleted, "asset_type": type, "doc_uuid": document_uuid},
            "error": None,
        }
    except Exception as exc:
        logger.error("AssetRouter: delete error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"ok": False, "data": None, "error": str(exc)},
        )