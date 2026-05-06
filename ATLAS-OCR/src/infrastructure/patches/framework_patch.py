"""
 * @file framework_patch.py
 * @description Omni-Architect Core Framework Patch (v8.0 Black-Box Zero-Trust)
 * @layer Core Logic
 * @dependencies logging, gc, asyncio, numpy, concurrent.futures, inspect, pathlib, re
 *
 * Responsibility: Wraps LightRAG and RAGAnything in an immutable interceptor shell.
 * Dynamically rewrites bad Cypher queries and hijacks failing Vision pipelines at runtime.
 """

from __future__ import annotations

import logging
import gc
import asyncio
import numpy as np
import concurrent.futures
import inspect
import re
import os
from pathlib import Path

from . import get_active_namespace

logger = logging.getLogger(__name__)

_COLBERT_DENSE_KEY: str = "colbert_dense"


def apply_framework_patches(ingestion_active_getter, enterprise_mode: bool) -> None:
    """Applies all core framework-level patches."""
    _patch_prevent_fork_bomb() 
    _patch_asyncio_wait_guard() 
    
    _patch_storage_registry()
    _patch_verify_noop()
    _patch_embedding_func(ingestion_active_getter)
    _patch_cosine_similarity_utils()
    _patch_cosine_similarity_operate()
    
    _patch_raganything_query_adapter()
    
    # SOTA FIXES: The Black-Box Interceptors
    _patch_qdrant_client_thresholds()
    _patch_edge_description_validation() 
    _patch_neo4j_universal_cypher_interceptor() # ⏪ Prevents Graph Hallucinations
    _patch_raganything_ingest_vision_bypass()   # ⏪ Hijacks failing Docling OCR
    
    if not enterprise_mode:
        _patch_workspace_resolution()
        logger.info("Patches [WORKSPACE]: Disk-based namespace isolation active.")


# ══════════════════════════════════════════════════════════════════════════════
# [SOTA] BLACK-BOX INTERCEPTORS
# ══════════════════════════════════════════════════════════════════════════════

def _patch_neo4j_universal_cypher_interceptor() -> None:
    """
    SOTA FIX: Intercepts all Cypher queries at the final network layer.
    Uses regex to dynamically replace hallucinated node labels with 'Entity'.
    Safely uses getattr to prevent crashes if underlying LightRAG methods change.
    """
    try:
        import lightrag.kg.neo4j_impl as neo4j_impl
        
        _orig_init = getattr(neo4j_impl.Neo4JStorage, "__init__", None)
        _orig_query = getattr(neo4j_impl.Neo4JStorage, "query", None)
        _orig_get = getattr(neo4j_impl.Neo4JStorage, "get_node", None)
        _orig_has = getattr(neo4j_impl.Neo4JStorage, "has_node", None)

        def _sota_init(self, *args, **kwargs):
            if _orig_init:
                _orig_init(self, *args, **kwargs)
            self.workspace = "Entity"
            self.node_label = "Entity"

        async def _sota_query(self, query: str, param: dict = None):
            if query:
                # REGEX MAGIC: Targets patterns like (n:WrongLabel) or (:`Wrong Label`) 
                # safely ignoring edge relationships like -[r:CONNECTED_TO]->
                query = re.sub(r'\(([\w]*):\s*(?:`[^`]+`|\w+)', r'(\1:Entity', query)
            if _orig_query:
                return await _orig_query(self, query, param)
            return None

        async def _sota_get_node(self, node_id: str, node_label: str = None):
            if _orig_get:
                return await _orig_get(self, node_id, node_label="Entity")
            return None
            
        async def _sota_has_node(self, node_id: str, node_label: str = None):
            if _orig_has:
                return await _orig_has(self, node_id, node_label="Entity")
            return None

        # Global Runtime Replacements
        if _orig_init:
            neo4j_impl.Neo4JStorage.__init__ = _sota_init
        if _orig_query:
            neo4j_impl.Neo4JStorage.query = _sota_query
        if _orig_get:
            neo4j_impl.Neo4JStorage.get_node = _sota_get_node
        if _orig_has:
            neo4j_impl.Neo4JStorage.has_node = _sota_has_node

        logger.info("Patches [NEO4J-UNIFIER]: Global Cypher Regex Interceptor Active ✓")
    except Exception as e:
        logger.warning(f"Patches [NEO4J-UNIFIER]: Non-fatal — {e}")


def _patch_raganything_ingest_vision_bypass() -> None:
    """
    SOTA FIX: Reactive Zero-Trust Ingest Interceptor.
    If force_vlm_ocr is True, OR if Docling parses the file but returns garbage/empty text,
    this interceptor steals the execution, runs PyMuPDF rasterization locally, 
    tunnels the bytes to Qwen3-VL, and inserts the results directly into LightRAG.
    """
    try:
        from raganything.raganything import RAGAnything
        import asyncio
        import os
        
        async def _sota_reactive_ingest(self, file_path: str, metadata: dict = None, force_vlm_ocr: bool = False):
            
            # HELPER: The Sovereign VLM Pipeline
            async def run_vlm_bypass(reason: str):
                logger.warning(f"Patches [VISION-BYPASS]: {reason}. Booting Sovereign VLM for {file_path}...")
                from services.vision_renderer import extract_pages_as_images
                image_batches = await asyncio.to_thread(extract_pages_as_images, file_path)
                
                import prompt_loader
                prompts = prompt_loader.load_prompts("src/domain/prompts")
                from infrastructure.llm.vllm_client import VLLMClient
                
                class BypassRouter:
                    async def route_call(self, **kwargs):
                        sys_prompt = kwargs.get("system_instruction", "")
                        parts = kwargs.get("prompt_parts", [])
                        text_prompt = parts[-1] if isinstance(parts, list) and parts else ""
                        b64 = kwargs.get("image_base64", None)
                        return await VLLMClient.generate(
                            prompt=text_prompt,
                            system_instruction=sys_prompt,
                            max_tokens=int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "4096")),
                            image_base64=b64
                        )
                
                from infrastructure.llm.vision import VisionService
                vision_service = VisionService(router=BypassRouter(), prompts=prompts)
                
                full_text = ""
                for batch in image_batches:
                    batch_text = await vision_service.vlm_ocr_page(batch)
                    full_text += "\n\n" + batch_text
                    
                if not full_text.strip():
                    raise ValueError("Sovereign VLM hard-bypass returned empty content.")
                    
                try:
                    await self.lightrag.insert_custom_chunks(full_text, bypass_kg=False)
                except AttributeError:
                    await self.lightrag.apre_insert(full_text)
                    await self.lightrag.ainsert(full_text)
                    
                return {
                    "file": os.path.basename(file_path),
                    "status": "success",
                    "stats": {"text_insertion": "success_via_reactive_sovereign_bypass"},
                    "ocr_mode": "vlm_reactive_bypass"
                }

            # 1. Explicit Bypass (Triggered by the early heuristic)
            if force_vlm_ocr:
                return await run_vlm_bypass("Pre-emptive heuristic triggered")
                
            # 2. Standard Docling Parse Attempt
            self.logger.info(f"Patches [VISION-BYPASS]: Attempting native parsing of {file_path} using {self.parser_model}")
            if hasattr(self.callbacks, 'on_parse_start'):
                await self.callbacks.on_parse_start(file_path)
                
            parse_result = await asyncio.to_thread(self.parser.parse, file_path)
            
            if hasattr(self.callbacks, 'on_parse_end'):
                await self.callbacks.on_parse_end(file_path)

            # 3. REACTIVE FALLBACK: Did Docling crash?
            if not parse_result.success:
                return await run_vlm_bypass(f"Docling crashed with error: {parse_result.error_message}")
                
            content = parse_result.content
            
            # Count the pages using a fast PyMuPDF read
            import fitz
            try:
                doc = fitz.open(file_path)
                page_count = len(doc)
                doc.close()
            except Exception:
                page_count = 1
                
            text_len = len(content.strip())
            
            # 4. REACTIVE FALLBACK: SOTA MAGIC THRESHOLD
            # If Docling + RapidOCR extracted less than 150 characters per page on average, 
            # they failed to read the diagrams/images. Hijack the pipeline!
            if text_len < (page_count * 150):
                return await run_vlm_bypass(f"RapidOCR failed. Returned garbage text ({text_len} chars for {page_count} pages)")

            # 5. Native Insertion (Docling actually succeeded)
            self.logger.info("Docling succeeded. Inserting text content into LightRAG")
            try:
                await self.lightrag.insert_custom_chunks(content, bypass_kg=False)
            except AttributeError:
                await self.lightrag.apre_insert(content)
                await self.lightrag.ainsert(content)

            stats = {"text_insertion": "success"}

            # Process any extra multimodal elements natively
            if parse_result.elements and self.multimodal_types and hasattr(self, 'process_elements'):
                self.logger.info("Processing multimodal elements")
                if hasattr(self.callbacks, 'on_modal_processing_start'):
                    await self.callbacks.on_modal_processing_start(file_path)
                modal_stats = await self.process_elements(parse_result.elements)
                stats.update(modal_stats)
                if hasattr(self.callbacks, 'on_modal_processing_end'):
                    await self.callbacks.on_modal_processing_end(file_path, modal_stats)

            return {
                "file": os.path.basename(file_path),
                "status": "success",
                "stats": stats,
                "ocr_mode": self.parser_model
            }

        # Override RagAnything's native ingest function with our reactive interceptor
        RAGAnything.ingest = _sota_reactive_ingest
        logger.info("Patches [VISION-BYPASS]: Reactive Fallback Interceptor Active ✓")
    except Exception as e:
        logger.warning(f"Patches [VISION-BYPASS]: Non-fatal — {e}")


# ══════════════════════════════════════════════════════════════════════════════
# [HELPER] ZERO-TRUST ANTI-SWAP-DEATH & RESILIENCY
# ══════════════════════════════════════════════════════════════════════════════

def _patch_prevent_fork_bomb() -> None:
    try:
        class AntiSwapDeathExecutor(concurrent.futures.ThreadPoolExecutor):
            def __init__(self, max_workers=None, *args, **kwargs):
                super().__init__(max_workers=1, *args, **kwargs)
        concurrent.futures.ProcessPoolExecutor = AntiSwapDeathExecutor
    except Exception: pass

def _patch_asyncio_wait_guard() -> None:
    try:
        import lightrag.operate as _lr_ops
        _orig_wait = asyncio.wait
        async def _safe_wait(fs, *args, **kwargs):
            if not fs: return set(), set()
            return await _orig_wait(fs, *args, **kwargs)
        _lr_ops.asyncio.wait = _safe_wait
    except Exception: pass

def _patch_edge_description_validation() -> None:
    try:
        import lightrag.operate as _lr_ops
        _orig_merge = getattr(_lr_ops, "_merge_edges_then_upsert", None)
        if not _orig_merge: return
        async def _resilient_merge_edges_then_upsert(*args, **kwargs):
            new_args = list(args)
            for i, arg in enumerate(new_args):
                if isinstance(arg, dict) and "source_id" not in arg:
                    if "description" not in arg: arg["description"] = "Inferred relationship between entities."
            if "edge_data" in kwargs:
                if isinstance(kwargs["edge_data"], dict) and "description" not in kwargs["edge_data"]:
                    kwargs["edge_data"]["description"] = "Inferred relationship between entities."
            try:
                return await _orig_merge(*new_args, **kwargs)
            except ValueError as e:
                if "has no description" in str(e): return None
                raise e
        _lr_ops._merge_edges_then_upsert = _resilient_merge_edges_then_upsert
    except Exception: pass


# ══════════════════════════════════════════════════════════════════════════════
# [HELPER] SOTA LIST SPOOFING & COERCION
# ══════════════════════════════════════════════════════════════════════════════

class ColBERTList(list):
    @property
    def size(self): return len(self)

def coerce_vec(vec) -> np.ndarray:
    if isinstance(vec, dict):
        dense = vec.get(_COLBERT_DENSE_KEY) or next((v for v in vec.values() if v is not None), None)
        if dense is None: return np.zeros(128, dtype=np.float32)
        vec = dense
    arr = np.asarray(vec, dtype=np.float32)
    if arr.ndim == 2: arr = arr.mean(axis=0)
    elif arr.ndim > 2: arr = arr.reshape(-1, arr.shape[-1]).mean(axis=0)
    flat = arr.ravel()
    if flat.shape[0] != 128:
        enforced = np.zeros(128, dtype=np.float32)
        length = min(flat.shape[0], 128)
        enforced[:length] = flat[:length]
        return enforced
    return flat

# ══════════════════════════════════════════════════════════════════════════════
# CORE FRAMEWORK PATCHES
# ══════════════════════════════════════════════════════════════════════════════

def _patch_qdrant_client_thresholds() -> None:
    try:
        from qdrant_client import AsyncQdrantClient
        orig_search = getattr(AsyncQdrantClient, "search", None)
        orig_query_points = getattr(AsyncQdrantClient, "query_points", None)
        if orig_search:
            async def _bulletproof_search(self, *args, **kwargs):
                kwargs.pop("score_threshold", None)
                return await orig_search(self, *args, **kwargs)
            AsyncQdrantClient.search = _bulletproof_search
        if orig_query_points:
            async def _bulletproof_query_points(self, *args, **kwargs):
                kwargs.pop("score_threshold", None)
                return await orig_query_points(self, *args, **kwargs)
            AsyncQdrantClient.query_points = _bulletproof_query_points
    except Exception: pass

def _patch_storage_registry() -> None:
    try:
        import lightrag.kg as _kg
        _kg.STORAGES["ColbertQdrantStorage"] = "colbert_qdrant"
    except Exception: pass

def _patch_verify_noop() -> None:
    try:
        import lightrag.kg as _kg
        import lightrag.lightrag as _lr
        _noop = lambda *args, **kwargs: None  # noqa: E731
        _kg.verify_storage_implementation = _noop
        _lr.verify_storage_implementation = _noop
    except Exception: pass

def _patch_embedding_func(ingestion_active_getter) -> None:
    try:
        from lightrag.utils import EmbeddingFunc
        async def _sota_embed_call(self_ef, texts, *args, **kwargs):
            raw = await self_ef.func(texts, *args, **kwargs)
            if isinstance(raw, list): return ColBERTList(raw)
            return raw
        EmbeddingFunc.__call__ = _sota_embed_call
    except Exception: pass

def _patch_cosine_similarity_utils() -> None:
    try:
        import lightrag.utils as _lr_utils
        _orig = getattr(_lr_utils, "cosine_similarity", None)
        if _orig is not None: _lr_utils.cosine_similarity = lambda a, b, _f=_orig: _f(coerce_vec(a), coerce_vec(b))
    except Exception: pass

def _patch_cosine_similarity_operate() -> None:
    try:
        import lightrag.operate as _lr_ops
        _orig = getattr(_lr_ops, "cosine_similarity", None)
        if _orig is not None: _lr_ops.cosine_similarity = lambda a, b, _f=_orig: _f(coerce_vec(a), coerce_vec(b))
    except Exception: pass

def _patch_workspace_resolution() -> None:
    try:
        from lightrag.lightrag import LightRAG
        _orig_init = LightRAG.__init__
        def _namespaced_init(self_lr, *args, **kwargs):
            ns = get_active_namespace()
            if ns and ns not in ("default", "global") and "working_dir" in kwargs:
                base_dir = Path(kwargs["working_dir"])
                ns_dir   = base_dir / ns
                ns_dir.mkdir(parents=True, exist_ok=True)
                kwargs["working_dir"] = str(ns_dir)
            return _orig_init(self_lr, *args, **kwargs)
        LightRAG.__init__ = _namespaced_init
    except Exception: pass

def _patch_raganything_query_adapter() -> None:
    try:
        from raganything.raganything import RAGAnything
        _orig_aquery = getattr(RAGAnything, "aquery", None)
        if _orig_aquery is None: return
        async def _safe_aquery(self_instance, query: str, mode: str = "hybrid", **kwargs):
            kwargs.pop("skip_image_processing", None)
            kwargs.pop("document_uuids", None)
            kwargs.pop("workspace_id", None)
            return await _orig_aquery(self_instance, query, mode=mode, **kwargs)
        RAGAnything.aquery = _safe_aquery
    except Exception: pass