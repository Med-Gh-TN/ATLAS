"""
src/infrastructure/database/repositories/documents.py
════════════════════════════════════════════════════════════════════════════════
Enterprise Persistence Layer — Document Repository
Architecture: Pure CRUD operations for the documents table.
════════════════════════════════════════════════════════════════════════════════
"""
import logging
import uuid as uuid_module
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from app.services.atlas_ocr_src.infrastructure.database.connection import get_pool

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# CORE ENUMS & HELPERS
# ──────────────────────────────────────────────────────────────────────────────
class DocumentStatus(str, Enum):
    PENDING   = "pending"
    INGESTING = "ingesting"
    COMPLETED = "completed"
    FAILED    = "failed"


def _to_uuid(value: str) -> uuid_module.UUID:
    if len(value) == 32:
        return uuid_module.UUID(hex=value)
    return uuid_module.UUID(value)


def _row_to_dict(row: Any) -> dict[str, Any]:
    result = dict(row)
    if "uuid" in result and isinstance(result["uuid"], uuid_module.UUID):
        result["uuid"] = result["uuid"].hex
    for key in ("upload_timestamp",):
        if key in result and isinstance(result[key], datetime):
            result[key] = result[key].isoformat()
    return result

# ──────────────────────────────────────────────────────────────────────────────
# WRITE OPERATIONS
# ──────────────────────────────────────────────────────────────────────────────
async def create_document(
    original_filename: str,
    canonical_path:    str,
    user_id:           Optional[str]            = None,
    metadata:          Optional[dict[str, Any]] = None,
) -> str:
    pool     = await get_pool()
    doc_uuid = uuid_module.uuid4()
    meta     = metadata or {}

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO documents (
                uuid, original_filename, canonical_path,
                user_id, status, metadata
            )
            VALUES ($1, $2, $3, $4, 'pending', $5::jsonb)
            ON CONFLICT (canonical_path) DO UPDATE
                SET original_filename = EXCLUDED.original_filename,
                    status            = 'pending',
                    upload_timestamp  = NOW(),
                    error_message     = NULL
            RETURNING uuid, (xmax = 0) AS inserted
            """,
            doc_uuid,
            original_filename,
            canonical_path,
            user_id,
            meta,  # Passed cleanly to the asyncpg codec. NO manual json.dumps!
        )
    returned_uuid: uuid_module.UUID = row["uuid"]
    was_inserted: bool = row["inserted"]
    action = "created" if was_inserted else "re-opened (existing UUID preserved)"
    logger.info(f"Database: Document {action} → uuid={returned_uuid.hex}  file='{original_filename}'")
    return returned_uuid.hex


async def update_document_status(
    doc_uuid:      str,
    status:        DocumentStatus,
    chunk_count:   Optional[int] = None,
    ocr_mode:      Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    pool = await get_pool()
    set_clauses = ["status = $2", "upload_timestamp = NOW()"]
    params: list[Any] = [_to_uuid(doc_uuid), status.value]
    idx = 3

    if chunk_count is not None:
        set_clauses.append(f"chunk_count = ${idx}")
        params.append(chunk_count)
        idx += 1
    if ocr_mode is not None:
        set_clauses.append(f"ocr_mode = ${idx}")
        params.append(ocr_mode)
        idx += 1
    if error_message is not None:
        set_clauses.append(f"error_message = ${idx}")
        params.append(error_message)
        idx += 1

    sql = f"UPDATE documents SET {', '.join(set_clauses)} WHERE uuid = $1"
    async with pool.acquire() as conn:
        result = await conn.execute(sql, *params)

    updated = int(result.split(" ")[-1])
    if updated == 0:
        logger.warning(f"Database: No row found for uuid={doc_uuid}. Status={status.value} not applied.")

# ──────────────────────────────────────────────────────────────────────────────
# READ OPERATIONS
# ──────────────────────────────────────────────────────────────────────────────
async def get_document(doc_uuid: str) -> Optional[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM documents WHERE uuid = $1",
            _to_uuid(doc_uuid),
        )
    return _row_to_dict(row) if row else None


async def get_document_by_path(canonical_path: str) -> Optional[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM documents WHERE canonical_path = $1",
            canonical_path,
        )
    return _row_to_dict(row) if row else None


async def get_document_uuid(canonical_path: str) -> Optional[str]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT uuid FROM documents WHERE canonical_path = $1",
            canonical_path,
        )
    return row["uuid"].hex if row else None


async def list_documents(
    user_id: Optional[str]            = None,
    status:  Optional[DocumentStatus] = None,
    limit:   int                      = 100,
    offset:  int                      = 0,
) -> list[dict[str, Any]]:
    pool = await get_pool()
    conditions: list[str] = []
    params:     list[Any] = []
    idx = 1

    if user_id is not None:
        conditions.append(f"user_id = ${idx}")
        params.append(user_id)
        idx += 1
    if status is not None:
        conditions.append(f"status = ${idx}")
        params.append(status.value)
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.extend([limit, offset])

    sql = f"""
        SELECT * FROM documents
        {where}
        ORDER BY upload_timestamp DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    return [_row_to_dict(r) for r in rows]


async def resolve_uuids_from_paths(paths: list[str]) -> dict[str, str]:
    if not paths:
        return {}
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT canonical_path, uuid FROM documents WHERE canonical_path = ANY($1)",
            paths,
        )
    return {r["canonical_path"]: r["uuid"].hex for r in rows}