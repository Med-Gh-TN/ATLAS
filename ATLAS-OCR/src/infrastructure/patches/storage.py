"""
src/infrastructure/patches/storage.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect Storage & Infrastructure Patches (v6.6 — Master Orchestrator)
────────────────────────────────────────────────────────────────────────────────
Responsibility: Clean facade to apply decoupled infrastructure patches.
This file acts as the entrypoint, delegating to highly cohesive sub-modules
to strictly enforce the Single Responsibility Principle.
"""

from __future__ import annotations

import logging

# Import the decoupled patch modules
from .framework_patch import apply_framework_patches
from .qdrant_patch import apply_qdrant_isolation
from .graph_redis_patch import apply_graph_redis_isolation

logger = logging.getLogger(__name__)


def apply_storage_patches(ingestion_active_getter, enterprise_mode: bool) -> None:
    """
    Master entrypoint to apply all core framework and database-level patches.
    Delegates to specialized modules to maintain isolated failure domains.
    """
    
    # 1. Apply Core Framework, Schema Adapters, and Tensor Coercion
    apply_framework_patches(ingestion_active_getter, enterprise_mode)
    
    # 2. Apply Multi-Tenant Database Strict Isolation
    if enterprise_mode:
        apply_qdrant_isolation()
        apply_graph_redis_isolation()
        logger.info("Patches [ENTERPRISE]: SOTA Async-Safe Identity Shifting Active.")