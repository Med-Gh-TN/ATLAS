"""
 * @file engine.py
 * @description Fusion Engine — SOTA Advanced RAG Pipeline (v8.0 True Graph-Vector Bridge)
 * @layer Core Logic
 *
 * Single Responsibility: Asynchronous orchestration of the retrieval, ranking, and 
 * synthesis lifecycle. Implements Parent-Child AST context resolution and SOTA 
 * Vector-to-Graph semantic bridging, bypassing brittle keyword extractors.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import TYPE_CHECKING, Optional, Callable, Awaitable

import numpy as np

from domain.models import (
    EMPTY_RESULT_PHRASES,
    GRAPH_SYNTHESIS_ID,
    QueryResult,
)
import infrastructure.patches as patches

from services.fusion.query_normalizer import normalize_math_query, needs_visual_context
from services.fusion.prompt_assembler import build_synthesis_prompt
from services.fusion.ranking_math import async_rerank_with_maxsim, multi_vector_rrf

if TYPE_CHECKING:
    from colbert_qdrant import ColbertQdrantStorage
    from infrastructure.llm.bridge import OmniModelBridge
    from raganything.raganything import RAGAnything
    from services.reranker import CrossEncoderReranker
    from services.hyde import HyDEService
    from services.query_decomposer import QueryDecomposer
    from services.semantic_cache import SemanticCacheService

logger = logging.getLogger(__name__)


class FusionEngine:
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
        parent_resolver: Optional[Callable[[list[str]], Awaitable[dict[str, str]]]] = None,
    ) -> None:
        self._rag_instance  = rag_instance
        self._chunk_storage = chunk_storage
        self.bridge         = bridge
        self._reranker      = reranker
        self._hyde          = hyde
        self._decomposer    = decomposer
        self._cache         = cache
        self._math_normalize = math_normalize
        self._parent_resolver = parent_resolver

    async def query_dual_fusion(
        self,
        question:        str,
        retrieval_query: str,
        route:           str,
        trace_id:        str,
        document_uuids:  Optional[list[str]] = None,
    ) -> QueryResult:
        top_k   = int(os.getenv("RETRIEVAL_TOP_K", "10"))
        is_multi_doc = bool(document_uuids and len(document_uuids) > 1 and "global" not in document_uuids)

        if self._cache is not None:
            cache_hit = await self._cache.get(question, document_uuids=document_uuids)
            if cache_hit:
                logger.info("FusionEngine [%s]: Cache HIT.", trace_id)
                return _build_cached_result(cache_hit, route, trace_id)

        norm_retrieval_query = normalize_math_query(retrieval_query) if self._math_normalize else retrieval_query

        detected_domain = "TEXT"
        if self._hyde is not None:
            from services.hyde import detect_domain
            detected_domain = detect_domain(question)

        sub_queries: list[str] = [question]
        if self._decomposer is not None and route == "VECTOR":
            sub_queries = await self._decomposer.decompose(question)

        hyde_text: str = ""
        if self._hyde is not None and route == "VECTOR":
            hyde_text, detected_domain, _ = await self._hyde.generate(question, domain=detected_domain)

        vector_queries: list[str] = [hyde_text if hyde_text else norm_retrieval_query]
        if len(sub_queries) > 1:
            extra = [
                normalize_math_query(q) if self._math_normalize else q
                for q in sub_queries if q.strip().lower() != question.strip().lower()
            ]
            vector_queries.extend(extra[:2])

        patches.set_active_query_uuids(document_uuids)
        retrieval_start = time.perf_counter()

        try:
            # ── SOTA FIX: Passing the enriched/HyDE vector query to drive Graph retrieval
            graph_coro = self._run_graph_retrieval(
                norm_retrieval_query, trace_id, document_uuids=document_uuids
            )
            vector_coros = [self._run_vector_retrieval(vq, top_k, trace_id, document_uuids) for vq in vector_queries]

            all_results = await asyncio.gather(graph_coro, *vector_coros, return_exceptions=True)
        finally:
            patches.set_active_query_uuids([])

        retrieval_latency_ms = int((time.perf_counter() - retrieval_start) * 1000)
        
        graph_raw = all_results[0]
        vector_raw = all_results[1:]
        graph_text = graph_raw if isinstance(graph_raw, str) else ""
        vector_result_sets = [vr for vr in vector_raw if isinstance(vr, list)]

        all_vector_chunks: list[dict] = []
        valid_vector_sets = [vr for vr in vector_result_sets if vr]

        if valid_vector_sets:
            all_vector_chunks = valid_vector_sets[0] if len(valid_vector_sets) == 1 else multi_vector_rrf(valid_vector_sets)
        else:
            logger.warning("FusionEngine [%s]: Vector retrieval returned 0 chunks across all queries.", trace_id)

        if all_vector_chunks:
            if self._reranker is not None:
                all_vector_chunks = await self._reranker.rerank(question, all_vector_chunks)
            else:
                query_emb = await self._embed_query_for_maxsim(norm_retrieval_query, trace_id)
                all_vector_chunks = await async_rerank_with_maxsim(query_emb, all_vector_chunks)

        index_size = await self._get_index_size()
        graph_valid = bool(graph_text) and not _is_empty_result(graph_text)
        vector_valid = bool(all_vector_chunks)

        if not graph_valid and not vector_valid:
            return _build_empty_result(route, norm_retrieval_query, retrieval_latency_ms, index_size, trace_id, domain=detected_domain)

        vector_ranked, chunk_lookup, chunk_meta = _build_vector_ranked(all_vector_chunks)
        
        parent_texts = {}
        if self._parent_resolver:
            parent_ids = list({m["parent_id"] for m in chunk_meta.values() if m.get("parent_id")})
            if parent_ids:
                try:
                    parent_texts = await self._parent_resolver(parent_ids)
                    logger.info("FusionEngine [%s]: Resolved %d ParentChunks from %d unique Child IDs.", trace_id, len(parent_texts), len(parent_ids))
                except Exception as e:
                    logger.error("FusionEngine [%s]: Parent resolution failed: %s", trace_id, e)

        degradation_tier = 1 if graph_valid else 2

        context_parts, telemetry_chunks = _assemble_context(
            vector_ranked, chunk_lookup, chunk_meta, parent_texts, graph_text if graph_valid else None, top_k, trace_id
        )

        if not context_parts:
            return _build_empty_result(route, norm_retrieval_query, retrieval_latency_ms, index_size, trace_id, chunks=telemetry_chunks, domain=detected_domain)

        synthesis_prompt, synthesis_system = build_synthesis_prompt(
            question, context_parts, degradation_tier, is_multi_doc, document_uuids, detected_domain, hyde_text
        )

        answer, prompt_tokens, completion_tokens = await self._synthesis_with_usage(synthesis_prompt, synthesis_system)

        if self._cache is not None and answer and not _is_empty_result(answer):
            asyncio.create_task(self._cache.store(question, answer, trace_id, document_uuids=document_uuids))
            
        return QueryResult(
            answer=answer, route=route, expanded_query=vector_queries[0], chunks=telemetry_chunks,
            retrieval_latency_ms=retrieval_latency_ms, index_size=index_size, prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens, total_latency_ms=0, ttft_ms=None, trace_id=trace_id,
            domain=detected_domain, cache_hit=False, hyde_text=hyde_text or None, decomposed_queries=sub_queries,
        )

    async def _run_graph_retrieval(self, retrieval_query: str, trace_id: str, document_uuids: Optional[list[str]] = None) -> str:
        """
        SOTA Vector-to-Graph Bridge.
        Bypasses LLM keyword extraction by using ColBERT density vectors to find semantic entry nodes,
        then manually executes Cypher to extract edges exactly matching the enterprise schema.
        """
        graph_max_tokens = self.bridge.config.graph_max_tokens
        
        lightrag = getattr(self._rag_instance, "lightrag", None)
        if not lightrag: return ""
        
        ent_storage = getattr(lightrag, "entities_vdb", None)
        graph_storage = getattr(lightrag, "graph_storage", None)
        
        if not ent_storage or not graph_storage:
            logger.warning("FusionEngine [%s]: Native storages missing. Skipping graph retrieval.", trace_id)
            return ""

        try:
            # 1. Semantic Entry Point Discovery via Vector Search (ColBERT Math)
            top_k_entities = 10 
            entities = await ent_storage.query(retrieval_query, top_k=top_k_entities)
            
            if not entities:
                logger.info("FusionEngine [%s]: No semantic entry nodes found in Graph.", trace_id)
                return ""
                
            entry_node_ids = []
            for e in entities:
                eid = e.get("entity_name") or e.get("id")
                if eid: entry_node_ids.append(eid)
                
            entry_node_ids = list(set(entry_node_ids))
            if not entry_node_ids:
                return ""
                
            logger.info("FusionEngine [%s]: Semantic Graph Entry Nodes: %s", trace_id, entry_node_ids)

            # 2. Direct Cypher Traversal
            # Architected specifically for our exact Neo4j interceptor schema
            cypher = """
            MATCH (n:Entity)-[r:CONNECTED_TO]-(m:Entity)
            WHERE n.id IN $node_ids
            RETURN n.id AS source, 
                   r.relationship_type AS rel_type, 
                   r.explanation AS explanation, 
                   m.id AS target
            LIMIT $limit
            """
            
            query_method = getattr(graph_storage, "query", None)
            if not query_method:
                return ""
                
            limit = 50 
            results = await query_method(cypher, param={"node_ids": entry_node_ids, "limit": limit})
            
            if not results:
                logger.info("FusionEngine [%s]: Semantic nodes found, but no edges attached.", trace_id)
                return ""
                
            # 3. Assemble Edge Context
            graph_context = []
            for row in results:
                src = row.get("source", "Unknown")
                rel = row.get("rel_type", "INTERACTS_WITH")
                tgt = row.get("target", "Unknown")
                exp = row.get("explanation", "")
                
                edge_text = f"({src}) -[{rel}]-> ({tgt})"
                if exp:
                    edge_text += f" : {exp}"
                graph_context.append(edge_text)
                
            res_text = "\n".join(graph_context)
            
            max_chars = graph_max_tokens * 4
            if len(res_text) > max_chars:
                res_text = res_text[:max_chars] + "\n\n... [Graph Context Truncated to strictly enforce VRAM Boundaries]"
                
            return res_text

        except Exception as e:
            logger.error("FusionEngine [%s]: SOTA Graph retrieval failed: %s", trace_id, e)
            return ""

    async def _run_vector_retrieval(self, query: str, top_k: int, trace_id: str, document_uuids: Optional[list[str]] = None) -> list[dict]:
        if not self._chunk_storage:
            return []
        try:
            return await self._chunk_storage.query(query, top_k=top_k)
        except Exception:
            return []

    async def _embed_query_for_maxsim(self, query: str, trace_id: str) -> Optional[np.ndarray]:
        try:
            matrices = await self.bridge.local_embedding_func([query])
            if matrices and isinstance(matrices[0], np.ndarray):
                q = matrices[0]
                return q.reshape(1, -1) if q.ndim == 1 else q
        except Exception:
            pass
        return None

    async def _synthesis_with_usage(self, prompt: str, system_prompt: str) -> tuple[str, Optional[int], Optional[int]]:
        p_tok, c_tok = None, None
        if hasattr(self.bridge, "_call_gemini_with_usage"):
            try:
                return await self.bridge._call_gemini_with_usage(prompt, system_prompt=system_prompt)
            except Exception:
                pass

        answer = await self.bridge.llm_synthesis_func(prompt, system_prompt=system_prompt)
        return answer, p_tok, c_tok

    async def _get_index_size(self) -> Optional[int]:
        if not self._chunk_storage: return None
        try:
            client = getattr(self._chunk_storage, "_client", None)
            coll = getattr(self._chunk_storage, "collection_name", "chunks")
            if client:
                info = await asyncio.to_thread(client.get_collection, coll)
                return int(getattr(info, "vectors_count", getattr(info, "points_count", 0)))
        except Exception:
            pass
        return None

def _is_empty_result(result: str) -> bool:
    return not result.strip() or any(p in result.lower() for p in EMPTY_RESULT_PHRASES)

def _build_vector_ranked(chunks: list[dict]) -> tuple[list[tuple[str, float]], dict[str, str], dict[str, dict]]:
    ranked, lookup, meta = [], {}, {}
    for i, c in enumerate(chunks):
        cid = c.get("id", f"chunk_{i}_{abs(hash(c.get('content', '')[:50]))}")
        content = c.get("content", c.get("text", ""))
        
        parent_id = c.get("parent_id")
        if not parent_id and "metadata" in c:
            parent_id = c["metadata"].get("parent_id")
            
        lookup[cid] = content
        meta[cid] = {
            "source": c.get("source", c.get("file_name", "")),
            "page": c.get("page"),
            "content_type": c.get("content_type", "TEXT"),
            "workspace_id": c.get("workspace_id", ""),
            "parent_id": parent_id,
        }
        ranked.append((cid, c.get("rerank_score", c.get("rrf_score", 0.0))))
    return ranked, lookup, meta

def _assemble_context(
    vector_ranked: list[tuple[str, float]], 
    lookup: dict, 
    meta: dict, 
    parent_texts: dict, 
    graph_text: Optional[str], 
    top_k: int, 
    trace_id: str
) -> tuple[list[str], list[dict]]:
    ctx_parts, telemetry = [], []
    if graph_text:
        ctx_parts.append(f"[Knowledge Graph Context]\n{graph_text.strip()}")
    
    limit = int(os.getenv("CONTEXT_VECTOR_CHUNKS", str(top_k)))
    added_parents = set()
    added_count = 0
    
    for cid, score in vector_ranked:
        if added_count >= limit:
            break
            
        m = meta.get(cid, {})
        parent_id = m.get("parent_id")
        
        if parent_id and parent_texts and parent_id in parent_texts:
            if parent_id in added_parents:
                continue
            content = parent_texts[parent_id]
            added_parents.add(parent_id)
            tag = f"[Parent Chunk Context | Child_Rerank={score:.4f}]"
        else:
            content = lookup.get(cid, "")
            tag = f"[Vector Chunk | Rerank={score:.4f}]"

        if content:
            ctx_parts.append(f"{tag}\n{content.strip()}")
            telemetry.append({"id": cid, "parent_id": parent_id, "text": content[:800], "score": round(score, 4), **m})
            added_count += 1
            
    return ctx_parts, telemetry

def _build_cached_result(cache: dict, route: str, trace_id: str) -> QueryResult:
    return QueryResult(answer=cache.get("answer", ""), route=route, expanded_query=cache.get("original_question", ""), chunks=[], retrieval_latency_ms=0, index_size=None, prompt_tokens=None, completion_tokens=None, total_latency_ms=0, ttft_ms=None, trace_id=trace_id, domain=None, cache_hit=True, hyde_text=None, decomposed_queries=None)

def _build_empty_result(route: str, query: str, lat_ms: int, size: Optional[int], trace_id: str, chunks: Optional[list]=None, domain: Optional[str]=None) -> QueryResult:
    return QueryResult(answer="", route=route, expanded_query=query, chunks=chunks or [], retrieval_latency_ms=lat_ms, index_size=size, prompt_tokens=None, completion_tokens=None, total_latency_ms=0, ttft_ms=None, trace_id=trace_id, domain=domain, cache_hit=False, hyde_text=None, decomposed_queries=None)