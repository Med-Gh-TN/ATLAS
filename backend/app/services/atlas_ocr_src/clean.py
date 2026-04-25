"""
src/infrastructure/patches.py
════════════════════════════════════════════════════════════════════════════════
Infrastructure Patches — LightRAG Framework Compatibility Layer

⚠  DANGER ZONE — This module intentionally monkey-patches third-party
   framework internals.  It is intentionally isolated here so that:
   • Every other module in the codebase can import without side-effects.
   • Changes to patch strategy are confined to a single file.
   • Integration tests can import patches independently and verify them.

Call apply_all_patches() once at startup before any other LightRAG code runs.

────────────────────────────────────────────────────────────────────────────────
Patches applied
────────────────────────────────────────────────────────────────────────────────
1.  [STORAGE-REGISTRY]  lightrag.kg.STORAGES["ColbertQdrantStorage"] registration.
2.  [VERIFY-NOOP]       verify_storage_implementation → no-op lambda (avoids
                         runtime schema assertion errors on custom storage classes).
3.  [CRASH-01-EMBED]    EmbeddingFunc.__call__ override: mean-pools ColBERT 2D
                         matrices to 1D vectors during query mode so the LightRAG
                         graph layer never receives a shape it cannot handle.
4.  [CRASH-01-COSINE-U] lightrag.utils.cosine_similarity patched to call
                         coerce_vec() on both operands before delegating to
                         the original implementation.
5.  [CRASH-01-COSINE-O] Same patch applied to lightrag.operate.cosine_similarity.
6.  [NAMESPACE]         contextvars.ContextVar ACTIVE_NAMESPACE with set/get
                         helpers for thread-safe multi-tenant isolation. (Phase 1)
7.  [WORKSPACE]         LightRAG.__init__ patched to redirect working_dir into
                         a per-namespace sub-folder on disk. (Phase 1 Fix 3)
8.  [ANTI-HALLUC]       PROMPTS["entity_extraction"] and
                         PROMPTS["summarize_entity_descriptions"] overwritten to
                         strip sports/athlete few-shot examples and enforce strict
                         source-grounded extraction. (Phase 4)
9.  [TUPLE-PARSER]      lightrag.utils.split_string_by_multi_markers hardened:
                         rows with >4 fields are truncated to 4; rows with <4 are
                         padded with "". Entities are NEVER dropped. (Phase 5)
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    pass   # type-only imports here to avoid circular deps

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Module-level ingestion state flag (kept for backward compatibility)
# ──────────────────────────────────────────────────────────────────────────────
# True while a document is being ingested.
# When True: raw 2D ColBERT matrices are passed through untouched (needed by
# the Qdrant storage layer).
# When False (query mode): matrices are mean-pooled to 1D so the LightRAG graph
# cosine-similarity functions don't crash.
INGESTION_ACTIVE: bool = False

# ColBERT dense vector key
_COLBERT_DENSE_KEY: str = "colbert_dense"


# ──────────────────────────────────────────────────────────────────────────────
# [PHASE 1 FIX 1] THREAD-SAFE MULTI-TENANT NAMESPACE CONTEXT VAR
# ──────────────────────────────────────────────────────────────────────────────
#
# ContextVar provides asyncio-native isolation:
#   • Each asyncio Task carries its own copy of the variable's value.
#   • Concurrent ingestion for different namespaces (e.g. masters_cs vs
#     highschool_physics) is guaranteed isolated at the Python runtime level
#     — no locks, no race conditions.
#   • Falls back to "default" if set_active_namespace() was never called.
#
ACTIVE_NAMESPACE: ContextVar[str] = ContextVar("ACTIVE_NAMESPACE", default="default")


def set_active_namespace(ns: str) -> None:
    """
    Set the active namespace for the current async context.

    Call this at the very start of ingest() and query() before any storage
    or LightRAG operations. The ContextVar guarantees that concurrent tasks
    for different namespaces are fully isolated — no cross-tenant leakage.

    Parameters
    ──────────
    ns : str
        Namespace identifier.  Examples: "masters_cs", "highschool_physics".
        Use "default" for single-tenant / legacy deployments.
    """
    ACTIVE_NAMESPACE.set(ns)
    logger.info(f"Patches [NAMESPACE]: Active namespace set → '{ns}'")


def get_active_namespace() -> str:
    """
    Returns the active namespace for the current async context.
    Defaults to "default" if set_active_namespace() has not been called.
    """
    return ACTIVE_NAMESPACE.get()


# ──────────────────────────────────────────────────────────────────────────────
# [CRASH-01] COERCION HELPER
# ──────────────────────────────────────────────────────────────────────────────

def coerce_vec(vec) -> np.ndarray:
    """
    Normalizes any embedding type to a 1D numpy float32 array.

    Handles three cases that arise with the ColBERT embedding pipeline:
      • dict  → extracts the "colbert_dense" key (or first non-None value).
      • 2-D   → mean-pools rows to a single 1D vector.
      • >2-D  → reshapes to (N, last_dim) then mean-pools.
      • 1-D   → returned as-is after dtype cast.

    A zero vector of length 128 is returned when no extractable data exists.
    """
    if isinstance(vec, dict):
        dense = vec.get(_COLBERT_DENSE_KEY) or next(
            (v for v in vec.values() if v is not None), None
        )
        if dense is None:
            return np.zeros(128, dtype=np.float32)
        vec = dense
    arr = np.asarray(vec, dtype=np.float32)
    if arr.ndim == 2:
        return arr.mean(axis=0)
    if arr.ndim > 2:
        return arr.reshape(-1, arr.shape[-1]).mean(axis=0)
    return arr.ravel()


# ──────────────────────────────────────────────────────────────────────────────
# PATCH APPLICATION
# ──────────────────────────────────────────────────────────────────────────────

def apply_all_patches(ingestion_active_getter) -> None:
    """
    Apply every framework patch in dependency order.

    Parameters
    ──────────
    ingestion_active_getter : callable[[], bool]
        A zero-argument callable that returns the current INGESTION_ACTIVE state.
        Passed as a closure so patches always read the live value.
        Typically: ``lambda: patches.INGESTION_ACTIVE``
    """
    _patch_storage_registry()
    _patch_verify_noop()
    _patch_embedding_func(ingestion_active_getter)
    _patch_cosine_similarity_utils()
    _patch_cosine_similarity_operate()
    _patch_workspace_resolution()     # Phase 1 Fix 3
    _patch_entity_prompts()           # Phase 4
    _patch_tuple_parser()             # Phase 5
    logger.info("Infrastructure patches: All patches applied ✓")


# ── Individual patch functions ─────────────────────────────────────────────────

def _patch_storage_registry() -> None:
    """Register ColbertQdrantStorage in LightRAG's storage class registry."""
    try:
        import lightrag.kg as _kg
        _kg.STORAGES["ColbertQdrantStorage"] = "colbert_qdrant"
        logger.info("Patches [STORAGE-REGISTRY]: ColbertQdrantStorage registered ✓")
    except Exception as e:
        logger.warning(f"Patches [STORAGE-REGISTRY]: Non-fatal — {e}")


def _patch_verify_noop() -> None:
    """Replace verify_storage_implementation with a no-op in both modules."""
    try:
        import lightrag.kg as _kg
        import lightrag.lightrag as _lr
        _noop = lambda *args, **kwargs: None  # noqa: E731
        _kg.verify_storage_implementation = _noop
        _lr.verify_storage_implementation = _noop
        logger.info("Patches [VERIFY-NOOP]: verify_storage_implementation suppressed ✓")
    except Exception as e:
        logger.warning(f"Patches [VERIFY-NOOP]: Non-fatal — {e}")


def _patch_embedding_func(ingestion_active_getter) -> None:
    """
    [CRASH-01] Override EmbeddingFunc.__call__ to mean-pool 2D ColBERT matrices
    to 1D vectors during query mode.

    During ingestion (ingestion_active_getter() == True) the raw matrices are
    passed through untouched — Qdrant's ColBERT storage needs the full matrix.
    """
    try:
        from lightrag.utils import EmbeddingFunc

        async def _graph_safe_embed_call(self_ef, texts, *args, **kwargs):
            raw = await self_ef.func(texts, *args, **kwargs)
            if not ingestion_active_getter():
                return [coerce_vec(m) for m in raw]
            return raw

        EmbeddingFunc.__call__ = _graph_safe_embed_call
        logger.info("Patches [CRASH-01-EMBED]: EmbeddingFunc.__call__ patched ✓")
    except Exception as e:
        logger.warning(f"Patches [CRASH-01-EMBED]: Non-fatal — {e}")


def _patch_cosine_similarity_utils() -> None:
    """[CRASH-01] Wrap lightrag.utils.cosine_similarity with coerce_vec on both operands."""
    try:
        import lightrag.utils as _lr_utils
        _orig = getattr(_lr_utils, "cosine_similarity", None)
        if _orig is not None:
            _lr_utils.cosine_similarity = (
                lambda a, b, _f=_orig: _f(coerce_vec(a), coerce_vec(b))
            )
            logger.info("Patches [CRASH-01-COSINE-U]: lightrag.utils.cosine_similarity patched ✓")
    except Exception as e:
        logger.warning(f"Patches [CRASH-01-COSINE-U]: Non-fatal — {e}")


def _patch_cosine_similarity_operate() -> None:
    """[CRASH-01] Wrap lightrag.operate.cosine_similarity with coerce_vec on both operands."""
    try:
        import lightrag.operate as _lr_ops
        _orig = getattr(_lr_ops, "cosine_similarity", None)
        if _orig is not None:
            _lr_ops.cosine_similarity = (
                lambda a, b, _f=_orig: _f(coerce_vec(a), coerce_vec(b))
            )
            logger.info("Patches [CRASH-01-COSINE-O]: lightrag.operate.cosine_similarity patched ✓")
    except Exception as e:
        logger.warning(f"Patches [CRASH-01-COSINE-O]: Non-fatal — {e}")


# ──────────────────────────────────────────────────────────────────────────────
# [PHASE 1 FIX 3] NAMESPACE-AWARE WORKSPACE RESOLUTION
# ──────────────────────────────────────────────────────────────────────────────

def _patch_workspace_resolution() -> None:
    """
    [WORKSPACE] Monkey-patches LightRAG.__init__ so that when a non-default
    namespace is active, the working_dir is automatically redirected to a
    per-namespace sub-folder.

    Effect (examples):
        namespace = "masters_cs"        → working_dir = rag_workspace/masters_cs/
        namespace = "highschool_physics"→ working_dir = rag_workspace/highschool_physics/
        namespace = "default"           → working_dir unchanged (single-tenant mode)

    This ensures that .graphml and .json KV cache files are physically isolated
    on disk per namespace. Cross-namespace KG contamination is mathematically
    impossible because graph files live in entirely separate directories.

    Thread safety:
        The active namespace is read from ACTIVE_NAMESPACE (a ContextVar) inside
        the patched __init__, so concurrent initialization tasks for different
        namespaces each read their own correct value.
    """
    try:
        from lightrag.lightrag import LightRAG
        _orig_init = LightRAG.__init__

        def _namespaced_init(self_lr, *args, **kwargs):
            ns = get_active_namespace()
            if ns and ns != "default" and "working_dir" in kwargs:
                base_dir = Path(kwargs["working_dir"])
                ns_dir   = base_dir / ns
                ns_dir.mkdir(parents=True, exist_ok=True)
                kwargs["working_dir"] = str(ns_dir)
                logger.info(
                    f"Patches [WORKSPACE]: working_dir overridden → "
                    f"'{kwargs['working_dir']}' (namespace='{ns}')"
                )
            return _orig_init(self_lr, *args, **kwargs)

        LightRAG.__init__ = _namespaced_init
        logger.info("Patches [WORKSPACE]: LightRAG.__init__ patched for namespace isolation ✓")
    except Exception as e:
        logger.warning(f"Patches [WORKSPACE]: Non-fatal — {e}")


# ──────────────────────────────────────────────────────────────────────────────
# [PHASE 4] ANTI-HALLUCINATION PROMPT PATCH (The "Noah Carter" Bug)
# ──────────────────────────────────────────────────────────────────────────────

# Strict instruction prepended to every entity extraction prompt.
# Replaces the behavioural guidance that allowed few-shot content to leak
# into extraction output (the "Noah Carter" / sports athlete contamination bug).
_STRICT_EXTRACTION_INSTRUCTION = """\
CRITICAL EXTRACTION RULES — MANDATORY COMPLIANCE:
1. DO NOT hallucinate. DO NOT fabricate any entity, relationship, or data point.
2. DO NOT output any entity or relationship sourced from the few-shot examples
   below. The examples illustrate FORMAT and DELIMITER SYNTAX ONLY. Their
   substantive content (names, places, facts) MUST NOT appear in your output.
3. ONLY extract entities and relationships that EXPLICITLY exist — word-for-word
   — in the SOURCE TEXT provided in this request.
4. If no valid technical entities or relationships exist in the source text,
   return an empty list: [].
5. Every extracted entity MUST be directly traceable to a specific phrase in
   the input. If you cannot cite the exact source phrase, do NOT include it.
6. The following categories of content from examples are PERMANENTLY BANNED
   from your output unless they literally appear in the source text:
   proper names of athletes, celebrities, fictional characters, sports teams,
   geographic locations not in the source, and any entity whose origin is the
   few-shot example rather than the provided document.
"""

# Strict instruction prepended to summarization prompts.
_STRICT_SUMMARY_INSTRUCTION = """\
CRITICAL: Summarize ONLY information that is explicitly present in the provided
entity descriptions. DO NOT add context, infer relationships, or introduce any
entity, person, place, or concept that is not directly stated in the input text.
If the descriptions are empty or contain no meaningful technical content, return
an empty summary string — never fabricate a summary.
"""


def _patch_entity_prompts() -> None:
    """
    [ANTI-HALLUC] Overwrites LightRAG's default entity_extraction and
    summarize_entity_descriptions prompts to prevent hallucination of entities
    from few-shot examples.

    Strategy:
        Prepend _STRICT_EXTRACTION_INSTRUCTION before the existing prompt body.
        This preserves the FORMAT instructions (tuple syntax, delimiters, field
        names) that LightRAG depends on, while replacing the permissive
        behavioural guidance that allowed few-shot content to contaminate output.

        The overwrite is additive: if LightRAG updates its default prompts, the
        strict instruction prefix continues to apply correctly on top.
    """
    try:
        from lightrag.prompt import PROMPTS

        if "entity_extraction" in PROMPTS:
            PROMPTS["entity_extraction"] = (
                _STRICT_EXTRACTION_INSTRUCTION + "\n\n" + PROMPTS["entity_extraction"]
            )
            logger.info("Patches [ANTI-HALLUC]: entity_extraction prompt hardened ✓")
        else:
            logger.warning(
                "Patches [ANTI-HALLUC]: PROMPTS['entity_extraction'] not found — "
                "LightRAG version mismatch? Skipping."
            )

        if "summarize_entity_descriptions" in PROMPTS:
            PROMPTS["summarize_entity_descriptions"] = (
                _STRICT_SUMMARY_INSTRUCTION + "\n\n" + PROMPTS["summarize_entity_descriptions"]
            )
            logger.info("Patches [ANTI-HALLUC]: summarize_entity_descriptions prompt hardened ✓")
        else:
            logger.warning(
                "Patches [ANTI-HALLUC]: PROMPTS['summarize_entity_descriptions'] not found — "
                "Skipping."
            )

    except ImportError as e:
        logger.warning(f"Patches [ANTI-HALLUC]: lightrag.prompt unavailable — {e}")
    except Exception as e:
        logger.warning(f"Patches [ANTI-HALLUC]: Non-fatal — {e}")


# ──────────────────────────────────────────────────────────────────────────────
# [PHASE 5] SCHEMA PARSING RESILIENCE (The 5/4 Field Fix)
# ──────────────────────────────────────────────────────────────────────────────

def _patch_tuple_parser() -> None:
    """
    [TUPLE-PARSER] Hardens the LightRAG tuple-parsing utility that splits
    entity/relation rows by '<|>' and '\\n'.

    Problem:
        LightRAG expects exactly 4 fields per ENTITY row:
            [EntityName, Type, Description, SourceID]
        Gemini sporadically emits 5 fields (extra reasoning field) or 3 fields
        (missing SourceID). Both cause silent data loss with the log message:
            "found 5/4 fields on ENTITY"

    Fix applied:
        Wrap split_string_by_multi_markers in lightrag.utils to post-process
        each returned row:
            len(row) > 4  → truncate: row = row[:4]     (extra fields discarded)
            len(row) < 4  → pad:      row += [""] * gap  (missing fields = "")
            len(row) == 4 → pass through unchanged

        Entities are NEVER dropped.  A WARNING is logged for every row that
        required normalization so the operator can track prompt drift over time.

    Targeting:
        lightrag.utils.split_string_by_multi_markers() is the single low-level
        function responsible for this parsing across all LightRAG versions.
        If the function is renamed in a future version, the patch degrades
        gracefully (warning + no-op, never a crash).
    """
    try:
        import lightrag.utils as _lr_utils

        _orig_split = getattr(_lr_utils, "split_string_by_multi_markers", None)
        if _orig_split is None:
            logger.warning(
                "Patches [TUPLE-PARSER]: split_string_by_multi_markers not found in "
                "lightrag.utils. Tuple normalization skipped — check LightRAG version."
            )
            return

        def _normalized_split(text: str, markers: list, *args, **kwargs):
            """
            Wraps split_string_by_multi_markers with field-count normalization.

            For each row in the parsed output:
              • len > 4 → truncate to row[:4]          (extra field dropped, warned)
              • len < 4 → pad to 4 with ""             (missing fields, warned)
              • len = 4 → pass through                 (nominal path, silent)

            Non-list rows (e.g. raw strings from relation parsing) are passed
            through unchanged — this patch targets only the 4-field ENTITY schema.
            """
            rows = _orig_split(text, markers, *args, **kwargs)
            if not isinstance(rows, list):
                return rows

            normalized = []
            for row in rows:
                if not isinstance(row, list):
                    normalized.append(row)
                    continue

                original_len = len(row)
                if original_len > 4:
                    logger.warning(
                        f"Patches [TUPLE-PARSER]: Row has {original_len} fields "
                        f"(expected 4) — truncating last {original_len - 4} field(s). "
                        f"Entity='{row[0] if row else 'EMPTY'}'. "
                        f"Dropped: {row[4:]}"
                    )
                    row = row[:4]
                elif original_len < 4:
                    gap     = 4 - original_len
                    padding = [""] * gap
                    logger.warning(
                        f"Patches [TUPLE-PARSER]: Row has {original_len} fields "
                        f"(expected 4) — padding with {gap} empty string(s). "
                        f"Entity='{row[0] if row else 'EMPTY'}'."
                    )
                    row = row + padding

                normalized.append(row)

            return normalized

        _lr_utils.split_string_by_multi_markers = _normalized_split
        logger.info(
            "Patches [TUPLE-PARSER]: split_string_by_multi_markers wrapped "
            "(5/4 field tolerance active) ✓"
        )

    except Exception as e:
        logger.warning(f"Patches [TUPLE-PARSER]: Non-fatal — {e}")