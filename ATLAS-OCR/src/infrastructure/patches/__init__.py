"""
Omni-Architect: Infrastructure Patches Orchestrator (v6.1 Modular)
────────────────────────────────────────────────────────────────────────────────
This module manages the state and initialization of all LightRAG framework overrides.
It replaces the legacy monolithic patches.py to ensure surgical, isolated fixes.

Architecture:
  - __init__.py : Holds global context variables (namespaces) and the master boot function.
  - parsers.py  : Replaces internal regex with our deterministic TOON scanner.
  - prompts.py  : Forces LightRAG/RAG-Anything to consume our SOTA .md files.
  - storage.py  : Handles Multi-Tenant UUID tagging for Qdrant and Neo4j.
"""

from __future__ import annotations

import logging
import os
from contextvars import ContextVar
from typing import Optional

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Module-level ingestion state flag
# ──────────────────────────────────────────────────────────────────────────────
# True while a document is being ingested.
# Used by the storage patches to determine if raw 2D ColBERT matrices should be 
# passed through to Qdrant, or mean-pooled to 1D for graph cosine similarity.
INGESTION_ACTIVE: bool = False


# ══════════════════════════════════════════════════════════════════════════════
# [PATCH 6]  NAMESPACE CONTEXT VAR  (thread-safe multi-tenant)
# ══════════════════════════════════════════════════════════════════════════════

ACTIVE_NAMESPACE: ContextVar[str] = ContextVar("ACTIVE_NAMESPACE", default="default")

def set_active_namespace(ns: str) -> None:
    """
    Set the active document namespace for the current async context.
    Called at the very start of ingest() with the document's UUID4 hex string.
    """
    ACTIVE_NAMESPACE.set(ns)
    logger.debug(f"Patches [NAMESPACE]: Active namespace → '{ns[:12]}…'")

def get_active_namespace() -> str:
    """Returns the active namespace for the current async context."""
    return ACTIVE_NAMESPACE.get()


# ══════════════════════════════════════════════════════════════════════════════
# [PATCH 7]  QUERY UUIDS CONTEXT VAR  (multi-document retrieval filter)
# ══════════════════════════════════════════════════════════════════════════════

ACTIVE_QUERY_UUIDS: ContextVar[list[str]] = ContextVar(
    "ACTIVE_QUERY_UUIDS", default=[]
)

def set_active_query_uuids(uuids: Optional[list[str]]) -> None:
    """
    Set the list of document UUIDs authorised for the current retrieval request.
    This ContextVar flows through the entire async call stack without explicit
    argument passing, enabling Qdrant/Neo4j read-isolation filters.
    """
    ACTIVE_QUERY_UUIDS.set(uuids or [])
    if uuids:
        logger.debug(
            f"Patches [QUERY-UUIDS]: Active query UUIDs → "
            f"[{', '.join(u[:8] for u in uuids)}] (n={len(uuids)})"
        )
    else:
        logger.debug("Patches [QUERY-UUIDS]: Query UUID filter cleared (global mode).")

def get_active_query_uuids() -> list[str]:
    """Returns the active query UUIDs for the current async context."""
    return ACTIVE_QUERY_UUIDS.get()


# ══════════════════════════════════════════════════════════════════════════════
# PATCH ORCHESTRATOR BOOT SEQUENCE
# ══════════════════════════════════════════════════════════════════════════════

def apply_all_patches(ingestion_active_getter) -> None:
    """
    Apply every framework patch in dependency order.
    
    Parameters
    ──────────
    ingestion_active_getter : callable[[], bool]
        Zero-argument callable returning live INGESTION_ACTIVE state.
        Typically: `lambda: patches.INGESTION_ACTIVE`
    """
    enterprise_mode = (
        os.getenv("ENTERPRISE_STORAGE_ENABLED", "false").lower() == "true"
    )

    logger.info("Infrastructure patches: Booting modular patch sequence...")

    # We import the sub-modules locally inside the function to avoid circular 
    # dependency crashes, as the sub-modules need to import get_active_namespace from here.
    from .parsers import apply_tuple_parser_patch
    from .prompts import apply_prompt_patches
    from .storage import apply_storage_patches

    # 1. Knowledge Graph Quality & Parsing Patches (The TOON Fix)
    apply_tuple_parser_patch()
    
    # 2. Anti-Hallucination Prompts (The SOTA Markdown Injection)
    apply_prompt_patches()

    # 3. Core Framework & Enterprise Storage Patches (Neo4j/Qdrant/Redis)
    apply_storage_patches(ingestion_active_getter, enterprise_mode)

    logger.info(
        f"Infrastructure patches: All patches applied ✓ "
        f"(enterprise_mode={enterprise_mode})"
    )