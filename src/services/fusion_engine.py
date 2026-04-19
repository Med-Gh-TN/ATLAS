"""
src/services/fusion_engine.py
════════════════════════════════════════════════════════════════════════════════
Fusion Engine — SOTA Advanced RAG Pipeline  (v6.0)
════════════════════════════════════════════════════════════════════════════════

Pipeline architecture (new in v6.0)
────────────────────────────────────
 Query
   │
   ├─[0] Semantic Cache Check  ──────────────────────────────→ cached hit? → return
   │
   ├─[1] Math/LaTeX Normalisation  (MATH_LATEX_NORMALIZE=true)
   │
   ├─[2] Domain Detection  (keyword heuristic, 0 API calls)
   │
   ├─[3] Query Decomposition  (QUERY_DECOMP_ENABLED=true, 1 API call if complex)
   │       → [q₁, q₂, q₃, ...]
   │
   ├─[4] HyDE Generation  (HYDE_ENABLED=true, 1 API call)
   │       → hypothetical textbook excerpt per original question
   │
   ├─[5] Parallel Retrieval  (asyncio.gather)
   │       ├─ Graph:   LightRAG aquery (original question)
   │       └─ Vector:  ColBERT+BM25 per [HyDE_text, sub_q₁, sub_q₂]
   │
   ├─[6] Multi-Result RRF Fusion  (across all vector result sets)
   │
   ├─[7] Cross-Encoder Reranking  (RERANKER_ENABLED=true, CPU, ~100ms)
   │       vs.
   │      ColBERT MaxSim  (fallback when reranker disabled)
   │
   ├─[8] Secondary RRF  (graph + reranked vector)
   │
   ├─[9] Context Assembly
   │
   ├─[10] Domain-Aware Synthesis  (MATH/BIOLOGY/CODE/TEXT system prompts)
   │
   └─[11] Async Cache Store  (background task, zero added latency)

Backward compatibility
──────────────────────
All new services (reranker, hyde, decomposer, cache) are Optional.  When None,
the corresponding step is skipped and the pipeline degrades gracefully to the
v5.0 behaviour.  No existing call sites need changes.

Changelog v6.0
──────────────
• Integrated SemanticCacheService (Step 0 + Step 11).
• Integrated QueryDecomposer (Step 3).
• Integrated HyDEService (Step 4).
• Multi-result vector RRF across decomposed sub-queries.
• Integrated CrossEncoderReranker replacing MaxSim when enabled (Step 7).
• Domain-aware synthesis prompt injection (Step 10).
• Math/LaTeX query normalisation (Step 1).
• New QueryResult fields: domain, cache_hit, hyde_text, decomposed_queries.

v5.0 — [ENTERPRISE MIGRATION — Phase 2 + Phase 4]
v4.4 — [FIX-03a/b/c] VLM short-circuit, ColBERT MaxSim, synthesis guardrail.
════════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import TYPE_CHECKING, Optional

import numpy as np

from domain.models import (
    EMPTY_RESULT_PHRASES,
    GRAPH_SYNTHESIS_ID,
    QueryResult,
)
import infrastructure.patches as patches

if TYPE_CHECKING:
    from colbert_qdrant import ColbertQdrantStorage
    from infrastructure.llm.bridge import OmniModelBridge
    from raganything.raganything import RAGAnything
    from services.reranker import CrossEncoderReranker
    from services.hyde import HyDEService
    from services.query_decomposer import QueryDecomposer
    from services.semantic_cache import SemanticCacheService

logger = logging.getLogger(__name__)

_RRF_K: int = 60   # Cormack & Clarke (2009) standard constant


# ──────────────────────────────────────────────────────────────────────────────
# [1] MATH / LATEX QUERY NORMALISATION
# Expands LaTeX tokens to natural-language equivalents so ColBERT's sub-word
# tokeniser can match them against prose explanations in textbook chunks.
# Strategy: APPEND normalised form — keeps original tokens + adds NL variants.
# ──────────────────────────────────────────────────────────────────────────────

_LATEX_SUBS: list[tuple[str, str]] = [
    # Display delimiters
    (r"\$\$([^$]+)\$\$",                  r" \1 "),
    (r"\$([^$]+)\$",                      r" \1 "),
    # Fractions
    (r"\\frac\{([^}]+)\}\{([^}]+)\}",     r"\1 over \2"),
    # Integrals
    (r"\\int_\{([^}]+)\}\^\{([^}]+)\}",  r"integral from \1 to \2 of"),
    (r"\\int",                            r"integral"),
    # Sums / products
    (r"\\sum_\{([^}]+)\}\^\{([^}]+)\}",  r"sum from \1 to \2 of"),
    (r"\\sum",                            r"summation"),
    (r"\\prod",                           r"product"),
    # Calculus
    (r"\\partial",                        r"partial derivative"),
    (r"\\nabla",                          r"gradient nabla"),
    (r"\\infty",                          r"infinity"),
    (r"\\sqrt\{([^}]+)\}",               r"square root of \1"),
    (r"\\lim_\{([^}]+)\}",              r"limit as \1"),
    # Greek letters
    (r"\\alpha",   "alpha"),   (r"\\beta",  "beta"),
    (r"\\gamma",   "gamma"),   (r"\\delta", "delta"),
    (r"\\epsilon", "epsilon"), (r"\\theta", "theta"),
    (r"\\lambda",  "lambda"),  (r"\\mu",    "mu"),
    (r"\\sigma",   "sigma"),   (r"\\pi",    "pi"),
    (r"\\omega",   "omega"),   (r"\\rho",   "rho"),
    (r"\\phi",     "phi"),     (r"\\psi",   "psi"),
    (r"\\xi",      "xi"),      (r"\\eta",   "eta"),
    # Operators
    (r"\\times",   "times"),
    (r"\\cdot",    "dot product"),
    (r"\\leq",     "less than or equal to"),
    (r"\\geq",     "greater than or equal to"),
    (r"\\neq",     "not equal to"),
    (r"\\approx",  "approximately equal to"),
    (r"\\equiv",   "equivalent to"),
    # Sets / Logic
    (r"\\in",      "element of"),
    (r"\\subset",  "subset of"),
    (r"\\cup",     "union"),
    (r"\\cap",     "intersection"),
    (r"\\forall",  "for all"),
    (r"\\exists",  "there exists"),
    (r"\\rightarrow",     "implies"),
    (r"\\Rightarrow",     "implies"),
    (r"\\leftrightarrow", "if and only if"),
    # Number sets
    (r"\\mathbb\{R\}",   "real numbers"),
    (r"\\mathbb\{N\}",   "natural numbers"),
    (r"\\mathbb\{Z\}",   "integers"),
    (r"\\mathbb\{C\}",   "complex numbers"),
    # Clean-up
    (r"\\[a-zA-Z]+",     ""),   # strip remaining LaTeX commands
    (r"\{|\}",           " "),  # remove braces
    (r"\s{2,}",          " "),  # collapse whitespace
]

_LATEX_RE: list[tuple[re.Pattern, str]] = [
    (re.compile(pat), repl) for pat, repl in _LATEX_SUBS
]

_HAS_LATEX = re.compile(r"\\[a-zA-Z]+|\$\$?")


def _normalize_math_query(query: str) -> str:
    """
    Expand LaTeX in a query string to natural language.
    Returns: original + " " + normalised_form (if different).
    Pure text queries pass through unchanged.
    """
    if not _HAS_LATEX.search(query):
        return query

    norm = query
    for pattern, repl in _LATEX_RE:
        norm = pattern.sub(repl, norm)
    norm = norm.strip()

    if norm and norm != query:
        # Append normalised form so both LaTeX tokens AND NL tokens are
        # available for ColBERT to match against stored chunks.
        return f"{query} {norm}"
    return query


# ──────────────────────────────────────────────────────────────────────────────
# [FIX-03a] VLM SHORT-CIRCUIT — Visual Query Heuristic
# ──────────────────────────────────────────────────────────────────────────────

_VISUAL_QUERY_RE = re.compile(
    r"\b("
    r"diagram|chart|figure|image|graph|plot|visual|screenshot|"
    r"illustration|drawing|picture|photo|photograph|depicted|"
    r"displayed|shown in|based on the|what does the .{0,30} show|"
    r"according to the .{0,20} (figure|chart|diagram|image|graph)|"
    r"as (shown|depicted|illustrated|displayed) in|"
    r"refer(ring)? to (figure|chart|diagram|image|graph|table)"
    r")\b",
    re.IGNORECASE,
)


def _needs_visual_context(query: str) -> bool:
    return bool(_VISUAL_QUERY_RE.search(query))


# ──────────────────────────────────────────────────────────────────────────────
# [FIX-03b] COLBERT MAXSIM (used as fallback when reranker is disabled)
# ──────────────────────────────────────────────────────────────────────────────

def _colbert_maxsim(query_matrix: np.ndarray, doc_matrix: np.ndarray) -> float:
    if query_matrix.ndim == 1:
        query_matrix = query_matrix.reshape(1, -1)
    if doc_matrix.ndim == 1:
        doc_matrix = doc_matrix.reshape(1, -1)
    sim_matrix = query_matrix @ doc_matrix.T
    return float(sim_matrix.max(axis=1).mean())


def _rerank_with_maxsim(
    query_embedding: Optional[np.ndarray],
    chunks: list[dict],
) -> list[dict]:
    if query_embedding is None:
        return chunks
    if query_embedding.ndim == 1:
        query_embedding = query_embedding.reshape(1, -1)

    scored: list[tuple[float, dict]] = []
    for chunk in chunks:
        doc_emb = chunk.get("embedding")
        if doc_emb is None:
            scored.append((chunk.get("rrf_score", 0.0), chunk))
            continue
        if not isinstance(doc_emb, np.ndarray):
            try:
                doc_emb = np.array(doc_emb, dtype=np.float32)
            except Exception:
                scored.append((chunk.get("rrf_score", 0.0), chunk))
                continue
        s = _colbert_maxsim(query_embedding, doc_emb)
        chunk["rrf_score"] = s
        scored.append((s, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored]


# ──────────────────────────────────────────────────────────────────────────────
# MULTI-RESULT VECTOR RRF FUSION
# Fuses N ranked lists (one per sub-query / HyDE text) into one unified ranking.
# ──────────────────────────────────────────────────────────────────────────────

def _multi_vector_rrf(
    multi_results: list[list[dict]],
) -> list[dict]:
    """
    RRF fusion across N vector retrieval result sets.

    Each element of multi_results is a ranked list of chunk dicts from one
    ColBERT query.  We:
      1. Build a chunk registry (id → dict).
      2. Convert each ranked list to [(id, score), ...].
      3. Call colbert_qdrant._rrf_fuse() to compute the fused scores.
      4. Return the merged, re-sorted list with updated rrf_score.
    """
    try:
        from colbert_qdrant import _rrf_fuse
    except ImportError:
        # Fallback: simple de-duplicated concatenation in order
        seen: set[str] = set()
        merged: list[dict] = []
        for result_set in multi_results:
            for chunk in result_set:
                cid = _chunk_id(chunk)
                if cid not in seen:
                    seen.add(cid)
                    merged.append(chunk)
        return merged

    registry: dict[str, dict]              = {}
    ranked_lists: list[list[tuple[str, float]]] = []

    for result_set in multi_results:
        if not result_set:
            continue
        ranked: list[tuple[str, float]] = []
        for i, chunk in enumerate(result_set):
            cid = _chunk_id(chunk, i)
            if cid not in registry:
                registry[cid] = chunk
            score = chunk.get("rrf_score", 1.0 / (i + 1))
            ranked.append((cid, score))
        if ranked:
            ranked_lists.append(ranked)

    if not ranked_lists:
        return []
    if len(ranked_lists) == 1:
        return list(registry.values())

    fused = _rrf_fuse(ranked_lists)
    result: list[dict] = []
    for cid, new_score in fused:
        if cid in registry:
            chunk = registry[cid].copy()
            chunk["rrf_score"] = new_score
            result.append(chunk)
    return result


def _chunk_id(chunk: dict, fallback_idx: int = 0) -> str:
    """Extract a stable string ID from a chunk dict."""
    for key in ("id", "__id__", "chunk_id"):
        val = chunk.get(key)
        if val:
            return str(val)
    content = chunk.get("content", chunk.get("text", ""))[:50]
    return f"chunk_{fallback_idx}_{abs(hash(content))}"


# ══════════════════════════════════════════════════════════════════════════════
# FUSION ENGINE
# ══════════════════════════════════════════════════════════════════════════════

class FusionEngine:
    """
    SOTA Dual-Level Retrieval + SOTA Quality Enhancement Pipeline  (v6.0).

    Constructor Parameters
    ──────────────────────
    rag_instance  — RAGAnything / LightRAG instance for graph retrieval.
    chunk_storage — ColbertQdrantStorage for vector retrieval.
    bridge        — OmniModelBridge for LLM + embedding calls.
    reranker      — CrossEncoderReranker (optional).
    hyde          — HyDEService (optional).
    decomposer    — QueryDecomposer (optional).
    cache         — SemanticCacheService (optional).
    math_normalize — Whether to expand LaTeX in queries before retrieval.
    """

    def __init__(
        self,
        rag_instance:   "RAGAnything",
        chunk_storage:  Optional["ColbertQdrantStorage"],
        bridge:         "OmniModelBridge",
        reranker:       Optional["CrossEncoderReranker"]    = None,
        hyde:           Optional["HyDEService"]             = None,
        decomposer:     Optional["QueryDecomposer"]         = None,
        cache:          Optional["SemanticCacheService"]    = None,
        math_normalize: bool                                = True,
    ) -> None:
        self._rag_instance  = rag_instance
        self._chunk_storage = chunk_storage
        self.bridge         = bridge
        self._reranker      = reranker
        self._hyde          = hyde
        self._decomposer    = decomposer
        self._cache         = cache
        self._math_normalize = math_normalize

    # ──────────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ──────────────────────────────────────────────────────────────────────────

    async def query_dual_fusion(
        self,
        question:        str,
        retrieval_query: str,
        route:           str,
        trace_id:        str,
        document_uuids:  Optional[list[str]] = None,
    ) -> QueryResult:
        """
        Execute the full SOTA retrieval + synthesis pipeline.

        Steps 0-11 are described in the module docstring.
        All SOTA services (cache/hyde/decomposer/reranker) degrade gracefully
        to None → previous behaviour when not injected.
        """
        top_k   = int(os.getenv("RETRIEVAL_TOP_K", "10"))
        lg_mode = "local" if route == "VECTOR" else "hybrid"

        is_multi_doc = bool(
            document_uuids
            and len(document_uuids) > 1
            and "global" not in document_uuids
        )
        is_single_doc = bool(
            document_uuids
            and len(document_uuids) == 1
            and "global" not in document_uuids
        )
        is_global = not document_uuids or document_uuids == ["global"]

        if is_multi_doc:
            logger.info(
                "FusionEngine [%s]: Cross-document mode — %d docs.",
                trace_id, len(document_uuids),
            )
        elif is_single_doc:
            logger.info(
                "FusionEngine [%s]: Single-doc isolation — %s...",
                trace_id, document_uuids[0][:12],
            )
        else:
            logger.info("FusionEngine [%s]: Global mode.", trace_id)

        # ── [0] Semantic Cache Check (Strict Vault Isolation) ─────────────────
        if self._cache is not None:
            # 1. Pass document_uuids so the cache respects the Vault Selector
            cache_hit = await self._cache.get(question, document_uuids=document_uuids)
            if cache_hit:
                logger.info(
                    "FusionEngine [%s]: Semantic cache HIT (sim=%.4f). Skipping Gemini synthesis.",
                    trace_id, cache_hit.get("similarity", 0.0),
                )
                # 2. Return the raw QueryResult object expected by the Orchestrator
                return _build_cached_result(cache_hit, route, trace_id)

        # ── [1] Math/LaTeX Normalisation ──────────────────────────────────────
        norm_retrieval_query = (
            _normalize_math_query(retrieval_query)
            if self._math_normalize
            else retrieval_query
        )

        # ── [2] Domain Detection ──────────────────────────────────────────────
        detected_domain = "TEXT"
        if self._hyde is not None:
            from services.hyde import detect_domain
            detected_domain = detect_domain(question)
        logger.debug(
            "FusionEngine [%s]: Detected domain=%s.", trace_id, detected_domain
        )

        # ── [3] Query Decomposition (VECTOR only) ─────────────────────────────
        sub_queries: list[str] = [question]
        if self._decomposer is not None and route == "VECTOR":
            sub_queries = await self._decomposer.decompose(question)
        logger.info(
            "FusionEngine [%s]: %d sub-queries: %s",
            trace_id, len(sub_queries),
            [q[:50] for q in sub_queries],
        )

        # ── [4] HyDE Generation (one hypothesis for the original question) ────
        hyde_text: str = ""
        if self._hyde is not None and route == "VECTOR":
            hyde_text, detected_domain, _ = await self._hyde.generate(
                question, domain=detected_domain
            )

        # Build the ordered list of retrieval texts:
        #  [HyDE text OR original query, sub_q₁, sub_q₂ (max 2 extras)]
        vector_queries: list[str] = [
            hyde_text if hyde_text else norm_retrieval_query
        ]
        if len(sub_queries) > 1:
            # Add decomposed sub-queries (skip if == original question)
            extra = [
                _normalize_math_query(q) if self._math_normalize else q
                for q in sub_queries
                if q.strip().lower() != question.strip().lower()
            ]
            vector_queries.extend(extra[:2])  # max 3 total vector retrievals

        needs_visual = _needs_visual_context(question)

        logger.info(
            "FusionEngine [%s]: Parallel retrieval — graph + %d vector queries.  "
            "HyDE=%s  Decompose=%s  VisualCtx=%s",
            trace_id,
            len(vector_queries),
            "✓" if hyde_text else "✗",
            f"{len(sub_queries)} sub-qs" if len(sub_queries) > 1 else "✗",
            "✓" if needs_visual else "✗",
        )

        # ── [5] Parallel Retrieval ─────────────────────────────────────────────
        patches.set_active_query_uuids(document_uuids)
        retrieval_start = time.perf_counter()

        try:
            # Build all coroutines for parallel execution
            graph_coro = self._run_graph_retrieval(
                question,          # always original question for graph
                lg_mode, trace_id,
                skip_visual    = not needs_visual,
                document_uuids = document_uuids,
            )
            vector_coros = [
                self._run_vector_retrieval(vq, top_k, trace_id, document_uuids)
                for vq in vector_queries
            ]

            all_results = await asyncio.gather(
                graph_coro,
                *vector_coros,
                return_exceptions=True,
            )
        finally:
            patches.set_active_query_uuids([])

        retrieval_latency_ms = int((time.perf_counter() - retrieval_start) * 1000)
        logger.info(
            "FusionEngine [%s]: Retrieval wall time: %dms.", trace_id, retrieval_latency_ms
        )

        # Unpack results
        graph_raw     = all_results[0]
        vector_raw    = all_results[1:]

        graph_text    = graph_raw if isinstance(graph_raw, str) else ""
        vector_result_sets: list[list[dict]] = [
            vr for vr in vector_raw if isinstance(vr, list)
        ]

        # ── [6] Multi-Result Vector RRF Fusion ────────────────────────────────
        all_vector_chunks: list[dict] = []
        if vector_result_sets:
            if len(vector_result_sets) == 1:
                all_vector_chunks = vector_result_sets[0]
            else:
                all_vector_chunks = _multi_vector_rrf(vector_result_sets)
                logger.info(
                    "FusionEngine [%s]: Multi-RRF fused %d result sets → %d chunks.",
                    trace_id, len(vector_result_sets), len(all_vector_chunks),
                )

        # ── [7] Reranking ─────────────────────────────────────────────────────
        if self._reranker is not None and all_vector_chunks:
            # Cross-encoder with original question (not HyDE text)
            all_vector_chunks = await self._reranker.rerank(question, all_vector_chunks)
        else:
            # Fallback: ColBERT MaxSim
            query_embedding = await self._embed_query_for_maxsim(
                norm_retrieval_query, trace_id
            )
            if query_embedding is not None and all_vector_chunks:
                all_vector_chunks = _rerank_with_maxsim(query_embedding, all_vector_chunks)

        # ── Index size (non-blocking best-effort) ─────────────────────────────
        index_size = await self._get_index_size()

        # ── Degradation tier check ────────────────────────────────────────────
        graph_valid  = bool(graph_text) and not _is_empty_result(graph_text)
        vector_valid = bool(all_vector_chunks)

        if not graph_valid and not vector_valid:
            logger.warning(
                "FusionEngine [%s]: [Tier 3] Both retrieval paths empty.",
                trace_id,
            )
            return _build_empty_result(
                route=route, retrieval_query=norm_retrieval_query,
                retrieval_latency_ms=retrieval_latency_ms, index_size=index_size,
                trace_id=trace_id, domain=detected_domain,
                decomposed_queries=sub_queries, hyde_text=hyde_text or None,
            )

        # ── [8] Secondary RRF (graph + vector) ───────────────────────────────
        vector_ranked, chunk_lookup, chunk_meta = _build_vector_ranked(all_vector_chunks)
        graph_ranked  = [(GRAPH_SYNTHESIS_ID, 1.0)] if graph_valid else []

        if not graph_valid:
            logger.warning(
                "FusionEngine [%s]: [Tier 2] Graph empty — vector-only fusion.",
                trace_id,
            )

        try:
            from colbert_qdrant import _rrf_fuse
        except ImportError:
            _rrf_fuse = lambda lists: sorted(
                {cid: s for lst in lists for cid, s in lst}.items(),
                key=lambda x: x[1], reverse=True,
            )

        if graph_ranked and vector_ranked:
            fused_ranked     = _rrf_fuse([graph_ranked, vector_ranked])
            degradation_tier = 1
        elif vector_ranked:
            fused_ranked     = _rrf_fuse([vector_ranked])
            degradation_tier = 2
        else:
            fused_ranked     = graph_ranked
            degradation_tier = 1

        # ── [9] Context Assembly ──────────────────────────────────────────────
        context_parts, telemetry_chunks = _assemble_context(
            fused_ranked=fused_ranked,
            chunk_lookup=chunk_lookup,
            chunk_meta=chunk_meta,
            graph_text=graph_text if graph_valid else None,
            top_k=top_k,
            trace_id=trace_id,
        )

        if not context_parts:
            return _build_empty_result(
                route=route, retrieval_query=norm_retrieval_query,
                retrieval_latency_ms=retrieval_latency_ms, index_size=index_size,
                trace_id=trace_id, chunks=telemetry_chunks,
                domain=detected_domain, decomposed_queries=sub_queries,
                hyde_text=hyde_text or None,
            )

        context_str = "\n\n---\n\n".join(context_parts)

        # ── [10] Domain-Aware Synthesis ───────────────────────────────────────
        synthesis_prompt, synthesis_system = _build_synthesis_prompt(
            question         = question,
            context_str      = context_str,
            degradation_tier = degradation_tier,
            is_multi_doc     = is_multi_doc,
            document_uuids   = document_uuids,
            detected_domain  = detected_domain,
            hyde_text        = hyde_text or None,
        )

        logger.info(
            "FusionEngine [%s]: Synthesis — tier=%d  domain=%s  "
            "multi_doc=%s  ctx_parts=%d",
            trace_id, degradation_tier, detected_domain,
            is_multi_doc, len(context_parts),
        )

        answer, prompt_tokens, completion_tokens = await self._synthesis_with_usage(
            synthesis_prompt, system_prompt=synthesis_system
        )

        logger.info(
            "FusionEngine [%s]: Synthesis complete.  "
            "prompt_tok=%s  completion_tok=%s",
            trace_id, prompt_tokens, completion_tokens,
        )

        # ── [11] Async Cache Store (Strict Vault Isolation) ───────────────────
        if (
            self._cache is not None
            and answer
            and not _is_empty_result(answer)
        ):
            # Pass document_uuids so Qdrant saves this answer inside the correct Vault Partition
            asyncio.create_task(
                self._cache.store(question, answer, trace_id, document_uuids=document_uuids)
            )
            
        return QueryResult(
            answer               = answer,
            route                = route,
            expanded_query       = vector_queries[0],  # HyDE text or expanded query
            chunks               = telemetry_chunks,
            retrieval_latency_ms = retrieval_latency_ms,
            index_size           = index_size,
            prompt_tokens        = prompt_tokens,
            completion_tokens    = completion_tokens,
            total_latency_ms     = 0,      # filled by orchestrator
            ttft_ms              = None,   # reserved for streaming
            trace_id             = trace_id,
            # v4.3 new fields
            domain               = detected_domain,
            cache_hit            = False,
            hyde_text            = hyde_text or None,
            decomposed_queries   = sub_queries,
        )

    # ──────────────────────────────────────────────────────────────────────────
    # RETRIEVAL TASKS
    # ──────────────────────────────────────────────────────────────────────────

    async def _run_graph_retrieval(
        self,
        retrieval_query: str,
        lg_mode:         str,
        trace_id:        str,
        skip_visual:     bool               = False,
        document_uuids:  Optional[list[str]] = None,
    ) -> str:
        kwargs: dict = {}
        if skip_visual:
            kwargs["skip_image_processing"] = True

        effective_query = retrieval_query
        if (
            document_uuids
            and len(document_uuids) > 1
            and "global" not in document_uuids
        ):
            n = len(document_uuids)
            effective_query = (
                f"{retrieval_query} "
                f"[cross-document context: comparing across {n} documents]"
            )

        try:
            result = await self._rag_instance.aquery(
                effective_query, mode=lg_mode, **kwargs
            )
            logger.info("FusionEngine [%s] [Graph]: Complete.", trace_id)
            return result or ""
        except TypeError:
            try:
                result = await self._rag_instance.aquery(retrieval_query, mode=lg_mode)
                return result or ""
            except Exception as exc:
                logger.error(
                    "FusionEngine [%s] [Graph]: Failed: %s.", trace_id, exc
                )
                return ""
        except Exception as exc:
            logger.error(
                "FusionEngine [%s] [Graph]: Failed: %s.", trace_id, exc
            )
            return ""

    async def _run_vector_retrieval(
        self,
        retrieval_query: str,
        top_k:           int,
        trace_id:        str,
        document_uuids:  Optional[list[str]] = None,
    ) -> list[dict]:
        if self._chunk_storage is None:
            logger.error(
                "FusionEngine [%s] [Vector]: chunk_storage is None — "
                "graph-only fusion will proceed.",
                trace_id,
            )
            return []

        uuid_hint = (
            f"filter={len(document_uuids)} UUIDs"
            if document_uuids and "global" not in document_uuids
            else "global"
        )
        logger.debug(
            "FusionEngine [%s] [Vector]: query='%s...' top_k=%d %s",
            trace_id, retrieval_query[:50], top_k, uuid_hint,
        )

        try:
            results = await self._chunk_storage.query(retrieval_query, top_k=top_k)
            logger.info(
                "FusionEngine [%s] [Vector]: Retrieved %d chunks.",
                trace_id, len(results),
            )
            return results
        except Exception as exc:
            logger.error(
                "FusionEngine [%s] [Vector]: ColBERT retrieval failed: %s.", trace_id, exc
            )
            return []

    async def _embed_query_for_maxsim(
        self, retrieval_query: str, trace_id: str
    ) -> Optional[np.ndarray]:
        try:
            matrices = await self.bridge.local_embedding_func([retrieval_query])
            if matrices and isinstance(matrices[0], np.ndarray):
                q = matrices[0]
                return q.reshape(1, -1) if q.ndim == 1 else q
        except Exception as exc:
            logger.debug(
                "FusionEngine [%s] [MaxSim]: embed failed (non-fatal): %s",
                trace_id, exc,
            )
        return None

    # ──────────────────────────────────────────────────────────────────────────
    # SYNTHESIS WRAPPER
    # ──────────────────────────────────────────────────────────────────────────

    async def _synthesis_with_usage(
        self,
        prompt:        str,
        system_prompt: str,
    ) -> tuple[str, Optional[int], Optional[int]]:
        p_tok: Optional[int] = None
        c_tok: Optional[int] = None

        if hasattr(self.bridge, "_call_gemini_with_usage"):
            try:
                answer, p_tok, c_tok = await self.bridge._call_gemini_with_usage(
                    prompt, system_prompt=system_prompt
                )
                return answer, p_tok, c_tok
            except Exception as exc:
                logger.debug("_call_gemini_with_usage failed (non-fatal): %s", exc)

        answer = await self.bridge.llm_synthesis_func(
            prompt, system_prompt=system_prompt
        )
        try:
            meta = getattr(self.bridge, "_last_usage_metadata", None)
            if meta is not None:
                p_tok = getattr(meta, "prompt_token_count",     None)
                c_tok = getattr(meta, "candidates_token_count", None)
                if c_tok is None:
                    total = getattr(meta, "total_token_count", None)
                    if total is not None and p_tok is not None:
                        c_tok = total - p_tok
        except Exception:
            pass

        return answer, p_tok, c_tok

    # ──────────────────────────────────────────────────────────────────────────
    # QDRANT INDEX SIZE
    # ──────────────────────────────────────────────────────────────────────────

    async def _get_index_size(self) -> Optional[int]:
        if self._chunk_storage is None:
            return None
        try:
            client = getattr(self._chunk_storage, "_client", None)
            if client is None:
                return None
            coll = (
                getattr(self._chunk_storage, "_collection_name", None)
                or getattr(self._chunk_storage, "collection_name",  None)
                or "chunks"
            )
            info = await asyncio.to_thread(client.get_collection, coll)
            cnt  = getattr(info, "vectors_count", None)
            if cnt is None:
                cnt = getattr(info, "points_count", None)
            return int(cnt) if cnt is not None else None
        except Exception as exc:
            logger.debug("_get_index_size: non-fatal — %s", exc)
            return None


# ══════════════════════════════════════════════════════════════════════════════
# MODULE-LEVEL PURE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _is_empty_result(result: str) -> bool:
    if not result or not result.strip():
        return True
    lower = result.lower()
    return any(phrase in lower for phrase in EMPTY_RESULT_PHRASES)


def _build_vector_ranked(
    vector_chunks: list[dict],
) -> tuple[list[tuple[str, float]], dict[str, str], dict[str, dict]]:
    try:
        from lightrag.kg.qdrant_impl import ID_FIELD
    except ImportError:
        ID_FIELD = "id"

    vector_ranked: list[tuple[str, float]] = []
    chunk_lookup:  dict[str, str]          = {}
    chunk_meta:    dict[str, dict]         = {}

    for i, chunk in enumerate(vector_chunks):
        cid = (
            chunk.get(ID_FIELD)
            or chunk.get("id")
            or f"chunk_{i}_{abs(hash(chunk.get('content', '')[:50]))}"
        )
        content = chunk.get("content", chunk.get("text", ""))
        chunk_lookup[cid] = content
        chunk_meta[cid]   = {
            "score":        chunk.get("rrf_score", chunk.get("rerank_score", 0.0)),
            "source":       (
                chunk.get("source")
                or chunk.get("file_name")
                or chunk.get("metadata", {}).get("source")
            ),
            "page":         chunk.get("page") or chunk.get("metadata", {}).get("page"),
            "content_type": chunk.get("content_type", "TEXT"),
            "workspace_id": chunk.get("workspace_id", ""),
        }
        vector_ranked.append((cid, chunk.get("rrf_score", chunk.get("rerank_score", 0.0))))

    return vector_ranked, chunk_lookup, chunk_meta


def _assemble_context(
    fused_ranked:  list[tuple[str, float]],
    chunk_lookup:  dict[str, str],
    chunk_meta:    dict[str, dict],
    graph_text:    Optional[str],
    top_k:         int,
    trace_id:      str,
) -> tuple[list[str], list[dict]]:
    context_parts:    list[str]  = []
    telemetry_chunks: list[dict] = []

    if graph_text and not _is_empty_result(graph_text):
        context_parts.append(f"[Knowledge Graph Context]\n{graph_text.strip()}")

    vector_limit = int(os.getenv("CONTEXT_VECTOR_CHUNKS", str(top_k)))
    n_added = 0

    for chunk_id, rrf_score in fused_ranked:
        if chunk_id == GRAPH_SYNTHESIS_ID:
            continue
        content = chunk_lookup.get(chunk_id, "")
        meta    = chunk_meta.get(chunk_id, {})
        if content and n_added < vector_limit:
            context_parts.append(
                f"[Vector Chunk | RRF={rrf_score:.4f}]\n{content.strip()}"
            )
            telemetry_chunks.append({
                "id":           chunk_id,
                "text":         content[:800] + ("..." if len(content) > 800 else ""),
                "score":        round(rrf_score, 4),
                "source":       meta.get("source"),
                "page":         meta.get("page"),
                "content_type": meta.get("content_type", "TEXT"),
                "workspace_id": meta.get("workspace_id", ""),
            })
            n_added += 1

    return context_parts, telemetry_chunks


# ──────────────────────────────────────────────────────────────────────────────
# DOMAIN-AWARE SYNTHESIS PROMPT BUILDER
# ──────────────────────────────────────────────────────────────────────────────

_DOMAIN_SYSTEM_ADDONS: dict[str, str] = {
    "MATH": (
        "You are a mathematics synthesis engine.  "
        "When answering, preserve ALL mathematical notation exactly as it appears in the context.  "
        "Show derivation steps where relevant.  "
        "Use LaTeX notation inline ($...$) and display ($$...$$) appropriately.  "
    ),
    "BIOLOGY": (
        "You are a biology synthesis engine specialising in molecular and cellular biology.  "
        "Describe mechanisms step-by-step.  Use correct scientific terminology.  "
        "When describing pathways, name intermediates and enzymes precisely.  "
    ),
    "CODE": (
        "You are a computer science synthesis engine.  "
        "When explaining algorithms or data structures, state the time and space complexity.  "
        "Explain logic in clear prose — do not invent code unless the context contains code.  "
    ),
    "TEXT": "",
}


def _build_synthesis_prompt(
    question:          str,
    context_str:       str,
    degradation_tier:  int,
    is_multi_doc:      bool                = False,
    document_uuids:    Optional[list[str]] = None,
    detected_domain:   str                 = "TEXT",
    hyde_text:         Optional[str]       = None,
) -> tuple[str, str]:
    """
    Build the (synthesis_prompt, system_instruction) pair.

    v6.0: Domain-aware system prompt injection.
    v5.0: Cross-document comparison preamble.
    v4.4: Mandatory <verification> block hallucination guardrail.
    """
    # ── Cross-document preamble ────────────────────────────────────────────────
    cross_doc = ""
    if is_multi_doc and document_uuids:
        n = len(document_uuids)
        cross_doc = (
            f"══════════════════════════════════════════════════════\n"
            f"CROSS-DOCUMENT CONTEXT ({n} DOCUMENTS)\n"
            f"══════════════════════════════════════════════════════\n"
            f"The context below is retrieved from {n} distinct documents.  "
            f"When relevant, explicitly compare or contrast information across "
            f"documents.  Cite which document a fact comes from when the "
            f"information differs between sources.\n\n"
        )

    # ── HyDE context note (optional, helps grounding) ─────────────────────────
    hyde_note = ""
    if hyde_text:
        hyde_note = (
            f"[Retrieval Context Note: The vector retrieval was seeded with a "
            f"hypothetical textbook excerpt to improve recall.  "
            f"Base your answer ONLY on the CONTEXT below, not on the retrieval seed.]\n\n"
        )

    synthesis_prompt = (
        cross_doc
        + hyde_note
        + "You are a precise question-answering assistant operating on retrieved "
        "document context.\n\n"
        "══════════════════════════════════════════════════════\n"
        "MANDATORY STEP 1 — VERIFICATION (complete before answering)\n"
        "══════════════════════════════════════════════════════\n"
        "Before writing your answer, you MUST write a <verification> block.\n"
        "Inside it, find the exact passage in the CONTEXT below that supports "
        "your answer.  Quote it verbatim (≤ 30 words).\n\n"
        "Format:\n"
        "<verification>\n"
        "Supporting passage: \"[exact quote from CONTEXT, ≤ 30 words]\"\n"
        "Relevance: [one sentence explaining why this passage answers the question]\n"
        "</verification>\n\n"
        "If you cannot find ANY supporting passage:\n"
        "<verification>\n"
        "Supporting passage: NOT FOUND IN CONTEXT\n"
        "Relevance: N/A\n"
        "</verification>\n\n"
        "If your <verification> block contains 'NOT FOUND IN CONTEXT', your "
        "ANSWER MUST BE EXACTLY:\n"
        "\"The provided document does not contain this information.\"\n"
        "Do NOT answer from general knowledge when verification fails.\n\n"
        "══════════════════════════════════════════════════════\n"
        "STEP 2 — ANSWER (only after verification passes)\n"
        "══════════════════════════════════════════════════════\n"
        "  A. ANSWER — If the context directly supports the question, answer "
        "accurately and concisely using ONLY the provided context.\n\n"
        "  B. CORRECT — If the question contains a false or unverifiable premise, "
        "explicitly state which part is contradicted and provide the correct "
        "information from the context.\n\n"
        "  C. ACKNOWLEDGE GAP — Only if verification contains 'NOT FOUND IN CONTEXT' "
        "AND no adjacent correct fact exists.\n\n"
        "Do NOT invent or infer facts beyond what the verified context supports.\n\n"
        f"QUESTION: {question}\n\n"
        f"CONTEXT:\n{context_str}\n\n"
        "ANSWER (write <verification> block first, then your answer):"
    )

    domain_addon = _DOMAIN_SYSTEM_ADDONS.get(detected_domain, "")
    cross_doc_sys = (
        f"You have context from {len(document_uuids)} documents.  "
        "Compare and contrast when relevant.  "
        if is_multi_doc and document_uuids else ""
    )

    synthesis_system = (
        "You are a corrective synthesis engine operating on retrieved document context.  "
        + domain_addon
        + cross_doc_sys
        + "You MUST write a <verification> block before every answer.  "
        "The verification block must quote (≤ 30 words) from the provided context.  "
        "If no quote exists, write 'NOT FOUND IN CONTEXT' and reply: "
        "'The provided document does not contain this information.'  "
        "Three answer modes in priority order: Answer → Correct false premises → Acknowledge Gap.  "
        "NEVER answer from general knowledge when verification fails.  "
        "NEVER skip the <verification> block."
    )

    return synthesis_prompt, synthesis_system


def _build_cached_result(
    cache_payload: dict,
    route:         str,
    trace_id:      str,
) -> QueryResult:
    """Build a QueryResult from a semantic cache hit — no Gemini call needed."""
    return QueryResult(
        answer               = cache_payload.get("answer", ""),
        route                = route,
        expanded_query       = cache_payload.get("original_question", ""),
        chunks               = [],
        retrieval_latency_ms = 0,
        index_size           = None,
        prompt_tokens        = None,
        completion_tokens    = None,
        total_latency_ms     = 0,
        ttft_ms              = None,
        trace_id             = trace_id,
        domain               = None,
        cache_hit            = True,
        hyde_text            = None,
        decomposed_queries   = None,
    )


def _build_empty_result(
    route:                str,
    retrieval_query:      str,
    retrieval_latency_ms: int,
    index_size:           Optional[int],
    trace_id:             str,
    chunks:               Optional[list]     = None,
    domain:               Optional[str]      = None,
    decomposed_queries:   Optional[list[str]] = None,
    hyde_text:            Optional[str]       = None,
) -> QueryResult:
    return QueryResult(
        answer               = "",
        route                = route,
        expanded_query       = retrieval_query,
        chunks               = chunks or [],
        retrieval_latency_ms = retrieval_latency_ms,
        index_size           = index_size,
        prompt_tokens        = None,
        completion_tokens    = None,
        total_latency_ms     = 0,
        ttft_ms              = None,
        trace_id             = trace_id,
        domain               = domain,
        cache_hit            = False,
        hyde_text            = hyde_text,
        decomposed_queries   = decomposed_queries,
    )