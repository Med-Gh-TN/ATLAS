"""
src/infrastructure/database/__init__.py
════════════════════════════════════════════════════════════════════════════════
Enterprise Persistence Layer — Facade Module
Architecture: Re-exports all required methods from the isolated repositories
to maintain backward compatibility with the application's transport layer.
════════════════════════════════════════════════════════════════════════════════
"""

from .connection import (
    init_db,
    close_db,
    is_available,
    get_pool,
)

from .repositories.documents import (
    DocumentStatus,
    create_document,
    update_document_status,
    get_document,
    get_document_by_path,
    get_document_uuid,
    list_documents,
    resolve_uuids_from_paths,
)

from .repositories.assets import (
    VALID_ASSET_TYPES,
    create_or_update_asset,
    get_asset,
    list_document_assets,
    delete_asset,
)

__all__ = [
    # ── Connection Management ──
    "init_db",
    "close_db",
    "is_available",
    "get_pool",

    # ── Document Tracking ──
    "DocumentStatus",
    "create_document",
    "update_document_status",
    "get_document",
    "get_document_by_path",
    "get_document_uuid",
    "list_documents",
    "resolve_uuids_from_paths",

    # ── Academic Assets Cache ──
    "VALID_ASSET_TYPES",
    "create_or_update_asset",
    "get_asset",
    "list_document_assets",
    "delete_asset",
]