"""
src/infrastructure/database/repositories/assets.py
════════════════════════════════════════════════════════════════════════════════
Enterprise Persistence Layer — Academic Assets Cache Repository
Architecture: Pure CRUD operations for the academic_assets table.
Includes Zero-Trust Auto-Healing for legacy double-encoded payloads.
════════════════════════════════════════════════════════════════════════════════
"""
import json
import logging
import uuid as uuid_module
from datetime import datetime
from typing import Any, Optional

from app.services.atlas_ocr_src.infrastructure.database.connection import get_pool

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# CORE CONSTANTS & HELPERS
# ──────────────────────────────────────────────────────────────────────────────
VALID_ASSET_TYPES = frozenset({"flashcards", "mindmap", "exam", "summary"})


def _to_uuid(value: str) -> uuid_module.UUID:
    if len(value) == 32:
        return uuid_module.UUID(hex=value)
    return uuid_module.UUID(value)


def _asset_row_to_dict(row: Any) -> dict[str, Any]:
    result = dict(row)
    for uuid_key in ("id", "document_uuid"):
        if uuid_key in result and isinstance(result[uuid_key], uuid_module.UUID):
            result[uuid_key] = result[uuid_key].hex
    if "generated_at" in result and isinstance(result["generated_at"], datetime):
        result["generated_at"] = result["generated_at"].isoformat()

    # ── [ZERO-TRUST HEALING] ──────────────────────────────────────────────────
    # If legacy data was double-encoded, it will emerge from asyncpg as a string.
    # We intercept and parse it safely back into a native object.
    if "content" in result and isinstance(result["content"], str):
        try:
            result["content"] = json.loads(result["content"])
            logger.debug("Database: Auto-healed legacy stringified JSON in cache.")
        except json.JSONDecodeError as e:
            logger.error("Database: Cache content string is completely unparsable: %s", e)
    # ──────────────────────────────────────────────────────────────────────────

    return result

# ──────────────────────────────────────────────────────────────────────────────
# ASSET CACHE OPERATIONS
# ──────────────────────────────────────────────────────────────────────────────
async def create_or_update_asset(
    document_uuid: str,
    asset_type:    str,
    content:       dict[str, Any],
    model_version: Optional[str] = None,
    chunk_count:   Optional[int] = None,
) -> str:
    """
    Upsert a generated academic asset into the cache.
    ON CONFLICT (document_uuid, asset_type) overwrites content and refreshes generated_at.
    """
    if asset_type not in VALID_ASSET_TYPES:
        raise ValueError(f"Invalid asset_type '{asset_type}'. Must be one of {VALID_ASSET_TYPES}")

    pool = await get_pool()
    asset_uuid = uuid_module.uuid4()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO academic_assets (
                id, document_uuid, asset_type, content,
                model_version, chunk_count, generated_at
            )
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
            ON CONFLICT (document_uuid, asset_type) DO UPDATE
                SET content       = EXCLUDED.content,
                    model_version = EXCLUDED.model_version,
                    chunk_count   = EXCLUDED.chunk_count,
                    generated_at  = NOW()
            RETURNING id
            """,
            asset_uuid,
            _to_uuid(document_uuid),
            asset_type,
            content,  # CRITICAL: Passed cleanly to asyncpg codec. NO manual json.dumps!
            model_version,
            chunk_count,
        )

    returned_id: uuid_module.UUID = row["id"]
    logger.info(
        "Database: Asset cached → doc=%s… type=%s id=%s…",
        document_uuid[:8], asset_type, returned_id.hex[:8],
    )
    return returned_id.hex


async def get_asset(
    document_uuid: str,
    asset_type:    str,
) -> Optional[dict[str, Any]]:
    """
    Retrieve a cached asset. Returns None on cache miss.
    This is the O(1) hot path — hits the composite index.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, document_uuid, asset_type, content,
                   generated_at, model_version, chunk_count
            FROM academic_assets
            WHERE document_uuid = $1 AND asset_type = $2
            """,
            _to_uuid(document_uuid),
            asset_type,
        )
    return _asset_row_to_dict(row) if row else None


async def list_document_assets(
    document_uuid: str,
) -> list[dict[str, Any]]:
    """
    Return a manifest of all cached asset types for a document.
    Used by the UI to show which buttons have cached results.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT asset_type, generated_at, model_version, chunk_count
            FROM academic_assets
            WHERE document_uuid = $1
            ORDER BY generated_at DESC
            """,
            _to_uuid(document_uuid),
        )
    return [
        {
            "asset_type":    r["asset_type"],
            "generated_at":  r["generated_at"].isoformat() if r["generated_at"] else None,
            "model_version": r["model_version"],
            "chunk_count":   r["chunk_count"],
        }
        for r in rows
    ]


async def delete_asset(
    document_uuid: str,
    asset_type:    str,
) -> bool:
    """
    Delete a cached asset to force re-generation.
    Returns True if a row was deleted, False if no row existed.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM academic_assets WHERE document_uuid = $1 AND asset_type = $2",
            _to_uuid(document_uuid),
            asset_type,
        )
    deleted = int(result.split(" ")[-1])
    logger.info(
        "Database: Asset cache invalidated → doc=%s… type=%s deleted=%d",
        document_uuid[:8], asset_type, deleted,
    )
    return deleted > 0