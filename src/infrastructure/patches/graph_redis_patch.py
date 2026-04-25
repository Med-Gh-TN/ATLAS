"""
src/infrastructure/patches/graph_redis_patch.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect Graph & Cache Isolation Patch (v6.7 — The Sanitizer)
────────────────────────────────────────────────────────────────────────────────
Responsibility: Async-Safe Neo4j dynamic properties and Redis KV status filters.
Decoupled from the monolithic storage.py to strictly enforce single-responsibility.

Changelog v6.7:
- THE <SEP> ERADICATOR: Intercepted `upsert_nodes` and `upsert_edges`. 
  LightRAG crudely concatenates duplicate descriptions with `<SEP>`. This patch 
  splits, deduplicates, and cleanly formats descriptions/keywords BEFORE they 
  hit Neo4j, while preserving `<SEP>` in `source_id` to keep the Qdrant bridge intact.
"""

from __future__ import annotations

import logging
from . import get_active_namespace

logger = logging.getLogger(__name__)

def apply_graph_redis_isolation() -> None:
    """Applies async-safe multi-tenant isolation to Neo4j and Redis components."""
    _patch_neo4j_async_isolation()
    _patch_redis_kv_storage_get_docs()


# ══════════════════════════════════════════════════════════════════════════════
# ASYNC-SAFE NEO4J ISOLATION & SANITIZATION
# ══════════════════════════════════════════════════════════════════════════════

def _import_neo4j_storage():
    candidate_paths = [
        ("lightrag.kg.neo4j_impl",  "Neo4JStorage"),
        ("lightrag.kg",             "Neo4JStorage"),
        ("lightrag.storage.neo4j",  "Neo4JStorage"),
    ]
    for module_path, class_name in candidate_paths:
        try:
            module = __import__(module_path, fromlist=[class_name])
            cls = getattr(module, class_name, None)
            if cls is not None:
                return cls
        except ImportError:
            continue
    return None

def _patch_neo4j_async_isolation() -> None:
    try:
        Neo4JStorage = _import_neo4j_storage()
        if Neo4JStorage is None: return

        # 1. Workspace Isolation
        orig_init = Neo4JStorage.__init__
        def _new_init(self, *args, **kwargs):
            orig_init(self, *args, **kwargs)
            self._base_workspace = self.__dict__.get("workspace", "default")
            
        Neo4JStorage.__init__ = _new_init

        @property
        def async_workspace(self):
            try:
                from colbert_qdrant import ColbertQdrantStorage
                if ColbertQdrantStorage.GLOBAL_TENANT_ID:
                    return ColbertQdrantStorage.GLOBAL_TENANT_ID
            except Exception:
                pass
                
            ns = get_active_namespace()
            if ns and ns not in ("default", "global", ""):
                return ns
            return getattr(self, "_base_workspace", "default")

        @async_workspace.setter
        def async_workspace(self, value):
            self._base_workspace = value

        Neo4JStorage.workspace = async_workspace

        # 2. SOTA FIX: The <SEP> Semantic Sanitizer
        orig_upsert_nodes = getattr(Neo4JStorage, "upsert_nodes", None)
        if orig_upsert_nodes:
            async def _clean_upsert_nodes(self, nodes: list[dict]):
                for node in nodes:
                    if "description" in node and isinstance(node["description"], str):
                        parts = [p.strip() for p in node["description"].split("<SEP>") if p.strip()]
                        # Deduplicate preserving order
                        seen = set()
                        unique_parts = [x for x in parts if not (x in seen or seen.add(x))]
                        # Join with clean double newlines
                        node["description"] = "\n\n".join(unique_parts)
                return await orig_upsert_nodes(self, nodes)
            Neo4JStorage.upsert_nodes = _clean_upsert_nodes

        orig_upsert_edges = getattr(Neo4JStorage, "upsert_edges", None)
        if orig_upsert_edges:
            async def _clean_upsert_edges(self, edges: list[dict]):
                for edge in edges:
                    if "description" in edge and isinstance(edge["description"], str):
                        parts = [p.strip() for p in edge["description"].split("<SEP>") if p.strip()]
                        seen = set()
                        unique_parts = [x for x in parts if not (x in seen or seen.add(x))]
                        edge["description"] = "\n\n".join(unique_parts)
                        
                    if "keywords" in edge and isinstance(edge["keywords"], str):
                        parts = [p.strip() for p in edge["keywords"].split("<SEP>") if p.strip()]
                        seen = set()
                        unique_parts = [x for x in parts if not (x in seen or seen.add(x))]
                        edge["keywords"] = ", ".join(unique_parts)
                return await orig_upsert_edges(self, edges)
            Neo4JStorage.upsert_edges = _clean_upsert_edges

        logger.info("Patches [NEO4J-ISOLATION]: SOTA Dynamic Partitioning & Semantic Sanitizer online ✓")
    except Exception as e:
        logger.warning(f"Patches [NEO4J-ISOLATION]: CRITICAL FAILURE — {e}")

        
# ══════════════════════════════════════════════════════════════════════════════
# REDIS ISOLATION
# ══════════════════════════════════════════════════════════════════════════════

def _patch_redis_kv_storage_get_docs() -> None:
    class AttributeDict(dict):
        def __getattr__(self, attr): return self.get(attr)
        def __setattr__(self, attr, value): self[attr] = value

    try:
        candidate_paths = [
            ("lightrag.kg.redis_impl", "RedisKVStorage"),
            ("lightrag.kg", "RedisKVStorage"),
            ("lightrag.storage.redis", "RedisKVStorage"),
        ]
        RedisKVStorage = None
        for module_path, class_name in candidate_paths:
            try:
                module = __import__(module_path, fromlist=[class_name])
                RedisKVStorage = getattr(module, class_name, None)
                if RedisKVStorage is not None: break
            except ImportError: continue

        if RedisKVStorage is None or hasattr(RedisKVStorage, "get_docs_by_statuses"):
            return

        async def get_docs_by_statuses(self_instance, statuses: list) -> dict:
            results = {}
            try:
                client = None
                for attr in ["redis", "redis_client", "client", "_client", "_redis", "pool"]:
                    c = getattr(self_instance, attr, None)
                    if c is not None and hasattr(c, "keys"):
                        client = c
                        break
                if client is None:
                    for key, val in vars(self_instance).items():
                        if hasattr(val, "keys") and callable(getattr(val, "keys")):
                            client = val
                            break
                if client is None: return {}
                
                prefix = f"{self_instance.namespace}:*"
                status_values = [s.value if hasattr(s, "value") else s.name if hasattr(s, "name") else str(s) for s in statuses]

                keys = await client.keys(prefix)
                for key in keys:
                    key_str = key.decode("utf-8") if isinstance(key, bytes) else key
                    doc_id = key_str[len(self_instance.namespace)+1:]
                    val = await self_instance.get_by_id(doc_id)
                    if val and isinstance(val, dict):
                        val_status = val.get("status")
                        vs = val_status.value if hasattr(val_status, "value") else val_status.name if hasattr(val_status, "name") else str(val_status)
                        if vs in status_values:
                            results[doc_id] = AttributeDict(val)
                return results
            except Exception as e:
                return {}

        RedisKVStorage.get_docs_by_statuses = get_docs_by_statuses
        logger.info("Patches [REDIS-DOC-STATUS]: RedisKVStorage.get_docs_by_statuses patched ✓")
    except Exception as e:
        logger.warning(f"Patches [REDIS-DOC-STATUS]: Non-fatal — {e}")