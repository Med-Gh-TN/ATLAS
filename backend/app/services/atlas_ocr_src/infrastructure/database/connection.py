"""
src/infrastructure/database/connection.py
════════════════════════════════════════════════════════════════════════════════
Enterprise Persistence Layer — Connection & Schema Manager
Architecture: Singleton AsyncPG Pool Provider
════════════════════════════════════════════════════════════════════════════════
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# CONDITIONAL ASYNCPG IMPORT
# ──────────────────────────────────────────────────────────────────────────────
try:
    import asyncpg
    from asyncpg import Pool
    _ASYNCPG_AVAILABLE = True
except ImportError:
    asyncpg = None          # type: ignore[assignment]
    Pool    = None          # type: ignore[assignment,misc]
    _ASYNCPG_AVAILABLE = False
    logger.warning(
        "Database: asyncpg not installed. PostgreSQL registry unavailable. "
        "Run `pip install asyncpg` to enable enterprise document tracking."
    )

# ──────────────────────────────────────────────────────────────────────────────
# DDL: ENTERPRISE SCHEMA (Documents & Academic Assets)
# ──────────────────────────────────────────────────────────────────────────────
_SCHEMA_DDL = """
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Document Registry
CREATE TABLE IF NOT EXISTS documents (
    uuid              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    original_filename TEXT         NOT NULL,
    canonical_path    TEXT         NOT NULL,
    upload_timestamp  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status            TEXT         NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','ingesting','completed','failed')),
    user_id           TEXT,
    chunk_count       INTEGER,
    ocr_mode          TEXT,
    error_message     TEXT,
    metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_canonical_path UNIQUE (canonical_path)
);

CREATE INDEX IF NOT EXISTS idx_docs_user_id ON documents (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_docs_status ON documents (status);
CREATE INDEX IF NOT EXISTS idx_docs_upload_ts ON documents (upload_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_docs_inflight ON documents (upload_timestamp) WHERE status = 'ingesting';

-- 2. Academic Assets Cache
CREATE TABLE IF NOT EXISTS academic_assets (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_uuid   UUID         NOT NULL,
    asset_type      TEXT         NOT NULL
                    CHECK (asset_type IN ('flashcards', 'mindmap', 'exam', 'summary')),
    content         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    generated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    model_version   TEXT,
    chunk_count     INTEGER,
    CONSTRAINT uq_doc_asset_type UNIQUE (document_uuid, asset_type)
);

CREATE INDEX IF NOT EXISTS idx_assets_doc_uuid ON academic_assets (document_uuid);
CREATE INDEX IF NOT EXISTS idx_assets_type ON academic_assets (asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_generated_at ON academic_assets (generated_at DESC);
"""

# ──────────────────────────────────────────────────────────────────────────────
# CONNECTION POOL SINGLETON
# ──────────────────────────────────────────────────────────────────────────────
_POOL: Optional["Pool"] = None
_DSN:  Optional[str]    = None


async def _configure_connection(conn: "asyncpg.Connection") -> None:
    """
    CRITICAL: Registers native JSONB serialization for the connection.
    Do NOT manually json.dumps() data in the repository layer.
    """
    await conn.set_type_codec(
        "jsonb",
        encoder=lambda v: __import__("json").dumps(v),
        decoder=lambda v: __import__("json").loads(v),
        schema="pg_catalog",
        format="text",
    )


async def init_db(dsn: str, min_size: int = 2, max_size: int = 10) -> None:
    """Initialize the AsyncPG connection pool and execute DDL."""
    global _POOL, _DSN
    if not _ASYNCPG_AVAILABLE:
        logger.warning("Database.init_db(): asyncpg unavailable — skipping.")
        return
    if _POOL is not None:
        logger.debug("Database.init_db(): Pool already initialized — skipping.")
        return

    logger.info("Database: Connecting to PostgreSQL...")
    try:
        _POOL = await asyncpg.create_pool(
            dsn=dsn,
            min_size=min_size,
            max_size=max_size,
            command_timeout=60,
            init=_configure_connection,
        )
        _DSN = dsn
        async with _POOL.acquire() as conn:
            await conn.execute(_SCHEMA_DDL)

        logger.info(
            f"Database: PostgreSQL pool online ✓  "
            f"(min={min_size}, max={max_size}). "
            f"Enterprise Schema verified."
        )
    except Exception as exc:
        logger.error(f"Database: Failed to connect to PostgreSQL: {exc}")
        _POOL = None
        raise


async def close_db() -> None:
    """Gracefully shutdown the connection pool."""
    global _POOL
    if _POOL is not None:
        await _POOL.close()
        _POOL = None
        logger.info("Database: PostgreSQL pool closed.")


def is_available() -> bool:
    """Check if the database pool is active and available."""
    return _POOL is not None


async def get_pool() -> "Pool":
    """Retrieve the active connection pool. Raises RuntimeError if uninitialized."""
    if _POOL is None:
        raise RuntimeError(
            "DocumentDatabase pool not initialized. "
            "Ensure init_db() is awaited during application startup."
        )
    return _POOL