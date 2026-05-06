"""
@file ATLAS-OCR/src/services/semantic_cache.py
@description SOTA Asymmetric Semantic Cache.
SOTA FIX: Disabled local model downloads (BGE-M3) to ensure instant backend boot.
@layer Core Logic
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from infrastructure.config_manager import OmniConfig
    from infrastructure.llm.bridge import OmniModelBridge

logger = logging.getLogger(__name__)

class SemanticCacheService:
    """
    Temporarily neutered Semantic Cache to prevent gigabyte local model downloads.
    Will safely return cache MISSes for everything.
    """

    def __init__(self, bridge: "OmniModelBridge", config: "OmniConfig") -> None:
        self._ready = False
        self._hits = 0
        self._misses = 0

    async def initialize(self) -> None:
        logger.warning("SemanticCache: Operating in Thin-Client mode. Cache intentionally bypassed to save RAM.")
        self._ready = False

    async def get(self, query: str, document_uuids: Optional[list[str]] = None) -> Optional[dict]:
        self._misses += 1
        return None

    async def store(self, query: str, answer: str, trace_id: str = "", document_uuids: Optional[list[str]] = None) -> None:
        pass

    async def invalidate_all(self) -> int:
        return 0

    def shutdown(self):
        pass

    @property
    def stats(self) -> dict:
        return {"enabled": False, "hits": 0, "misses": 0, "hit_rate": 0.0, "model": "disabled"}