"""
 * @file orchestrator.py
 * @description Hybrid RAG Orchestrator Facade. Coordinates decoupled services and executes strict sequential map-reduce ingestion.
 * @layer Core Logic
 * @dependencies asyncio, logging, os, sys, time, uuid, gc, pathlib, dotenv, infrastructure.patches, infrastructure.database
 """


import asyncio
import logging
import os
import sys
import time
import uuid
import gc
import inspect
from pathlib import Path
from typing import Optional

# ──────────────────────────────────────────────────────────────────────────────
# [FIX-THREAD-01/02/03] CPU THREAD BOOTSTRAP & ANTI-SWAP-DEATH
# ──────────────────────────────────────────────────────────────────────────────

_PROJECT_ROOT_BOOTSTRAP = Path(__file__).resolve().parent.parent
_ENV_FILE_BOOTSTRAP     = _PROJECT_ROOT_BOOTSTRAP / ".env"

try:
    from dotenv import dotenv_values as _dotenv_values
    _env_dict = _dotenv_values(_ENV_FILE_BOOTSTRAP) if _ENV_FILE_BOOTSTRAP.exists() else {}
except Exception:
    _env_dict = {}

_DEFAULT_THREAD_COUNT = str(_env_dict.get("FASTEMBED_THREADS", "6"))

os.environ["OMP_NUM_THREADS"]      = _env_dict.get("OMP_NUM_THREADS",      _DEFAULT_THREAD_COUNT)
os.environ["MKL_NUM_THREADS"]      = _env_dict.get("MKL_NUM_THREADS",      _DEFAULT_THREAD_COUNT)
os.environ["OPENBLAS_NUM_THREADS"] = _env_dict.get("OPENBLAS_NUM_THREADS", _DEFAULT_THREAD_COUNT)
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

# 🚨 CRITICAL ANTI-SWAP-DEATH GUARDS
os.environ["DOCLING_NUM_THREADS"] = "1"
os.environ["RAY_NUM_CPUS"]        = "1"
os.environ["OMP_THREAD_LIMIT"]    = "1"

# ──────────────────────────────────────────────────────────────────────────────
# PATH RESOLUTION 
# ──────────────────────────────────────────────────────────────────────────────

from dotenv import load_dotenv  # noqa: E402

PROJECT_ROOT     = _PROJECT_ROOT_BOOTSTRAP
RAG_ANYTHING_DIR = PROJECT_ROOT / "RAG-Anything"
SRC_DIR          = PROJECT_ROOT / "src"

load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)

sys.path.insert(0, str(RAG_ANYTHING_DIR))
sys.path.insert(0, str(SRC_DIR))

logger = logging.getLogger(__name__)

logger.info(
    "Orchestrator: Thread environment → OMP=%s MKL=%s OPENBLAS=%s DOCLING=%s",
    os.environ["OMP_NUM_THREADS"], os.environ["MKL_NUM_THREADS"], 
    os.environ["OPENBLAS_NUM_THREADS"], os.environ.get("DOCLING_NUM_THREADS", "1")
)

def _is_enterprise_mode() -> bool:
    enabled      = os.getenv("ENTERPRISE_STORAGE_ENABLED", "false").lower() == "true"
    redis_uri    = os.getenv("REDIS_URI")
    neo4j_uri    = os.getenv("NEO4J_URI")
    postgres_uri = os.getenv("POSTGRES_URI")

    if not enabled: return False
    missing = []
    if not redis_uri: missing.append("REDIS_URI")
    if not neo4j_uri: missing.append("NEO4J_URI")
    if not postgres_uri: missing.append("POSTGRES_URI")

    if missing:
        logger.warning("Orchestrator: Missing env vars: %s. Falling back to disk.", missing)
        return False
    return True

import infrastructure.patches as patches
patches.apply_all_patches(ingestion_active_getter=lambda: patches.INGESTION_ACTIVE)

import infrastructure.database as db
from infrastructure.database import DocumentStatus

try:
    from raganything.raganything import RAGAnything
    from raganything.config import RAGAnythingConfig
    from lightrag.utils import EmbeddingFunc
    from lightrag.lightrag import LightRAG
    from colbert_qdrant import ColbertQdrantStorage
    
    from infrastructure.llm.bridge import OmniModelBridge
    import infrastructure.llm.bridge as _mb_module
    
    from services.document_slicer import IORouter, get_docling_markdown_for_file
    from services.vision_renderer import detect_handwriting_risk
except ImportError as e:
    raise ImportError(f"CRITICAL BOOT FAILURE: {e}") from e

from domain.models import QueryResult
from services.content_tagger import ContentTaggingPipeline
from services.fusion import FusionEngine
from services.semantic_cache import SemanticCacheService
from services.hyde import HyDEService
from services.query_decomposer import QueryDecomposer
from services.reranker import CrossEncoderReranker


_GLOBAL_BRIDGE: Optional[OmniModelBridge] = None

async def proxy_vision_translation(prompt: str, system_prompt: str = "", **kwargs) -> str:
    return await _GLOBAL_BRIDGE.vision_translation_func(prompt, system_prompt, **kwargs)

async def proxy_llm_synthesis(prompt: str, system_prompt: str = "", **kwargs) -> str:
    return await _GLOBAL_BRIDGE.llm_synthesis_func(prompt, system_prompt, **kwargs)

async def proxy_local_embedding(texts: list[str], *args, **kwargs):
    return await _GLOBAL_BRIDGE.local_embedding_func(texts, *args, **kwargs)

# ══════════════════════════════════════════════════════════════════════════════
# HYBRID RAG PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

class HybridRAGPipeline:
    def __init__(self, semaphore: Optional[asyncio.Semaphore] = None) -> None:
        logger.info("[bold blue]Initializing SOTA Advanced RAG Orchestrator (v8.0 Enterprise)...[/]")

        global _GLOBAL_BRIDGE
        self.bridge      = OmniModelBridge()
        _GLOBAL_BRIDGE   = self.bridge

        self.semaphore   = semaphore or asyncio.Semaphore(1)
        self._enterprise = _is_enterprise_mode()

        self._rag_instance:    Optional[RAGAnything]            = None
        self._chunk_storage:   Optional[ColbertQdrantStorage]   = None
        self._tagger:          Optional[ContentTaggingPipeline] = None
        self._fusion_engine:   Optional[FusionEngine]           = None
        
        self._cache:           Optional[SemanticCacheService]   = None
        self._hyde:            Optional[HyDEService]            = None
        self._decomposer:      Optional[QueryDecomposer]        = None
        self._reranker:        Optional[CrossEncoderReranker]   = None
        
        self._initialized:     bool                             = False
        self._rag_by_namespace: dict[str, tuple]                = {}

    async def initialize(self) -> None:
        if self._initialized: return

        logger.info("[bold cyan]Orchestrator:[/] Starting initialization sequence...")
        await self.bridge.async_init()

        postgres_uri = os.getenv("POSTGRES_URI")
        if postgres_uri and self._enterprise:
            try:
                await db.init_db(
                    dsn      = postgres_uri,
                    min_size = int(os.getenv("POSTGRES_POOL_MIN_SIZE", "2")),
                    max_size = int(os.getenv("POSTGRES_POOL_MAX_SIZE", "10")),
                )
            except Exception as exc:
                logger.error("Orchestrator: PostgreSQL init FAILED: %s.", exc)

        if os.getenv("SEMANTIC_CACHE_ENABLED", "true").lower() == "true":
            self._cache = SemanticCacheService(self.bridge, self.bridge.config)
            await self._cache.initialize()

        if os.getenv("HYDE_ENABLED", "true").lower() == "true":
            self._hyde = HyDEService(self.bridge)

        if os.getenv("QUERY_DECOMP_ENABLED", "true").lower() == "true":
            self._decomposer = QueryDecomposer(self.bridge)

        if os.getenv("RERANKER_ENABLED", "true").lower() == "true":
            self._reranker = CrossEncoderReranker(self.bridge.config)
            await self._reranker.initialize() 

        embed_dim  = self._get_embed_dim()
        embed_fn   = self._build_embedding_func(embed_dim)
        config     = self._build_rag_config()
        lg_kwargs  = self._build_lightrag_kwargs()

        self._rag_instance = RAGAnything(
            llm_model_func    = proxy_llm_synthesis,
            vision_model_func = proxy_vision_translation,
            embedding_func    = embed_fn,
            config            = config,
            lightrag_kwargs   = lg_kwargs,
        )

        self._rag_instance.lightrag = LightRAG(
            working_dir    = config.working_dir,
            llm_model_func = proxy_llm_synthesis,
            embedding_func = embed_fn,
            **lg_kwargs,
        )
        await self._rag_instance.lightrag.initialize_storages()
        self._chunk_storage = self._resolve_chunk_storage(self._rag_instance)
        
        if not getattr(ColbertQdrantStorage, "_rrf_patched", False):
            orig_query = ColbertQdrantStorage.query
            async def _patched_query(self_instance, *args, **kwargs):
                kwargs.pop("document_uuids", None)
                kwargs.pop("workspace_id", None)
                results = await orig_query(self_instance, *args, **kwargs)
                for r in results:
                    r["distance"] = 1.0 
                return results
            ColbertQdrantStorage.query = _patched_query
            ColbertQdrantStorage._rrf_patched = True
        
        self._tagger = ContentTaggingPipeline(bridge = self.bridge, semaphore = self.semaphore)
        self._fusion_engine = FusionEngine(
            rag_instance    = self._rag_instance,
            chunk_storage   = self._chunk_storage,
            bridge          = self.bridge,
            reranker        = self._reranker,
            hyde            = self._hyde,
            decomposer      = self._decomposer,
            cache           = self._cache,
            math_normalize  = os.getenv("MATH_LATEX_NORMALIZE", "true").lower() == "true",
            parent_resolver = db.resolve_parent_texts if db.is_available() else None
        )
        self._initialized = True
        logger.info("[bold cyan]Orchestrator:[/] [bold green]Online[/].")

    def _get_embed_dim(self) -> int:
        return int(os.getenv("EMBEDDING_DIMENSION", "128"))

    def _build_embedding_func(self, embed_dim: int) -> EmbeddingFunc:
        embedder_model_name = os.getenv("EMBEDDER_MODEL_NAME", "jina-colbert-v2")
        safe_embedder_name  = embedder_model_name.replace("/", "").replace("-", "")
        return EmbeddingFunc(
            embedding_dim  = embed_dim,
            max_token_size = 8192,
            func           = proxy_local_embedding,
            model_name     = safe_embedder_name,
        )

    def _build_rag_config(self) -> "RAGAnythingConfig":
        return RAGAnythingConfig(
            working_dir              = str(IORouter.get_workspace_dir()),
            parser                   = "docling",
            enable_image_processing  = True,
            enable_table_processing  = True,
            enable_equation_processing = True,
            max_concurrent_files     = 1,
        )

    def _build_lightrag_kwargs(self) -> dict:
        base_kwargs: dict = {
            "vector_storage":             "ColbertQdrantStorage",
            "chunk_token_size":           8192,
            "chunk_overlap_token_size":   0, 
            "vector_db_storage_cls_kwargs": {},
        }
        if not self._enterprise: return base_kwargs
        
        neo4j_user = os.getenv("NEO4J_USERNAME", "neo4j")
        neo4j_pass = os.getenv("NEO4J_PASSWORD", "omni_neo4j_change_me")
        if not neo4j_pass:
            neo4j_pass = "omni_neo4j_change_me"

        base_kwargs.update({
            "kv_storage":          "RedisKVStorage",
            "doc_status_storage":  "RedisKVStorage",
            "graph_storage":       "Neo4JStorage",
            "addon_params": {
                "redis_uri":  os.getenv("REDIS_URI"),
                "neo4j_url":  os.getenv("NEO4J_URI"),
                "neo4j_username": neo4j_user,
                "neo4j_password": neo4j_pass,
                "neo4j_auth": (neo4j_user, neo4j_pass),
            },
        })
        return base_kwargs
        
    def _resolve_chunk_storage(self, rag_instance: "RAGAnything") -> Optional[ColbertQdrantStorage]:
        lg = rag_instance.lightrag
        candidate_fns = [
            lambda: getattr(lg, "vector_db_storage", None),
            lambda: getattr(lg, "chunks_vdb",        None),
            lambda: getattr(lg, "chunk_storage",     None),
        ]
        for fn in candidate_fns:
            try:
                candidate = fn()
                if candidate and isinstance(candidate, ColbertQdrantStorage) and getattr(candidate, "_initialized", False):
                    return candidate
            except Exception: continue
        for attr_name, attr_val in vars(lg).items():
            if isinstance(attr_val, ColbertQdrantStorage) and getattr(attr_val, "_initialized", False):
                return attr_val
        return None

    async def _initialize_for_namespace(self, namespace: str) -> tuple:
        if not self._initialized:
            await self.initialize()

        if self._enterprise:
            return (self._rag_instance, self._chunk_storage, self._fusion_engine)

        if namespace in self._rag_by_namespace:
            return self._rag_by_namespace[namespace]

        logger.info(f"Orchestrator: Spawning isolated disk instance for namespace '{namespace}'...")
        embed_dim  = self._get_embed_dim()
        embed_fn   = self._build_embedding_func(embed_dim)
        config     = self._build_rag_config()
        lg_kwargs  = self._build_lightrag_kwargs()

        rag_instance = RAGAnything(
            llm_model_func    = proxy_llm_synthesis,
            vision_model_func = proxy_vision_translation,
            embedding_func    = embed_fn,
            config            = config,
            lightrag_kwargs   = lg_kwargs,
        )
        
        rag_instance.lightrag = LightRAG(
            working_dir    = config.working_dir,
            llm_model_func = proxy_llm_synthesis,
            embedding_func = embed_fn,
            **lg_kwargs,
        )
        await rag_instance.lightrag.initialize_storages()

        chunk_storage  = self._resolve_chunk_storage(rag_instance)
        fusion_engine  = FusionEngine(
            rag_instance    = rag_instance,
            chunk_storage   = chunk_storage,
            bridge          = self.bridge,
            reranker        = self._reranker,
            hyde            = self._hyde,
            decomposer      = self._decomposer,
            cache           = self._cache,
            parent_resolver = db.resolve_parent_texts if db.is_available() else None
        )

        self._rag_by_namespace[namespace] = (rag_instance, chunk_storage, fusion_engine)
        return self._rag_by_namespace[namespace]

    async def shutdown(self) -> None:
        logger.info("[bold cyan]Orchestrator:[/] [yellow]Shutting down...[/]")
        if self._rag_instance and hasattr(self._rag_instance, "lightrag") and self._rag_instance.lightrag is not None:
            try: await self._rag_instance.finalize_storages()
            except Exception: pass
        if self._cache and getattr(self._cache, "_client", None):
            try: self._cache._client.close()
            except Exception: pass
        await db.close_db()

    async def query(self, question: str, trace_id: Optional[str] = None, namespace: str = "default", document_uuids: Optional[list[str]] = None) -> QueryResult:
        if not self._initialized: await self.initialize()

        if self._enterprise and document_uuids:
            patches.set_active_namespace(document_uuids[0])
            patches.set_active_query_uuids(document_uuids)
            ColbertQdrantStorage.GLOBAL_QUERY_TENANT_IDS = document_uuids
        elif self._enterprise:
            patches.set_active_namespace("global")
            patches.set_active_query_uuids([])
            ColbertQdrantStorage.GLOBAL_QUERY_TENANT_IDS = []

        try:
            rag_instance, chunk_storage, fusion_engine = await self._initialize_for_namespace(namespace)
            if not trace_id: trace_id = uuid.uuid4().hex[:16]

            pipeline_start = time.perf_counter()
            route = await self.bridge.classify_query(question)
            
            retrieval_query = question
            if route == "VECTOR":
                retrieval_query = await self._expand_query(question, trace_id)

            async with self.semaphore:
                fusion_result = await fusion_engine.query_dual_fusion(
                    question       = question,
                    retrieval_query= retrieval_query,
                    route          = route,
                    trace_id       = trace_id,
                    document_uuids = document_uuids,
                )

            total_latency_ms = int((time.perf_counter() - pipeline_start) * 1000)

            from services.fusion.engine import _is_empty_result
            if _is_empty_result(fusion_result.get("answer", "")):
                fusion_result["answer"] = "I could not find sufficiently precise information in the knowledge base."

            fusion_result["total_latency_ms"] = total_latency_ms
            fusion_result["trace_id"]         = trace_id
            return fusion_result
        finally:
            patches.set_active_query_uuids([])
            ColbertQdrantStorage.GLOBAL_QUERY_TENANT_IDS = None

    async def _expand_query(self, question: str, trace_id: str) -> str:
        try:
            expanded = await self.bridge._call_gemini(
                [f"Original query: {question}\n\nExpanded retrieval query:"],
                system_instruction = "Output only the expanded query string, nothing else.",
                throttle   = False,
                force_json = False,
            )
            expanded = expanded.strip()
            if not expanded or len(expanded) < len(question): return question
            return expanded
        except Exception:
            return question

    async def ingest(self, file_path: str, output_dir: Optional[str] = None, force_vlm_ocr: Optional[bool] = None, namespace: str = "default", user_id: Optional[str] = None) -> dict:
        if not self._initialized: await self.initialize()

        source  = Path(file_path)
        out_dir = output_dir or str(IORouter.get_output_dir())

        doc_uuid = await self._resolve_or_create_doc_uuid(source=source, user_id=user_id)
        active_namespace = doc_uuid if self._enterprise else namespace
        
        patches.set_active_namespace(active_namespace)
        patches.set_active_query_uuids([doc_uuid])

        rag_instance, chunk_storage, _fusion_engine = await self._initialize_for_namespace(active_namespace)
        self._rag_instance  = rag_instance
        self._chunk_storage = chunk_storage
        self._fusion_engine = _fusion_engine

        patches.INGESTION_ACTIVE   = True
        import infrastructure.llm.bridge as _mb_module
        _mb_module._INGESTION_ACTIVE = True
        ColbertQdrantStorage.GLOBAL_TENANT_ID = active_namespace
        ColbertQdrantStorage.GLOBAL_FILE_PATH = source.name

        await self._db_update_status(doc_uuid, DocumentStatus.INGESTING)

        try:
            use_vlm_ocr = self._resolve_vlm_ocr_decision(str(source), force_vlm_ocr)
            extractor   = "VLM OCR" if use_vlm_ocr else "Docling (Direct In-Memory)"
            logger.info("Ingest [[bold white]%s[/]]: Stage 1/4 — [cyan]%s[/] extraction", source.name, extractor)

            if use_vlm_ocr:
                markdown_text = await self._run_vlm_ocr_ingestion(source)
            else:
                def _run_native_docling(filepath: str) -> str:
                    from docling.document_converter import DocumentConverter
                    converter = DocumentConverter()
                    result = converter.convert(filepath)
                    return result.document.export_to_markdown()

                try:
                    markdown_text = await asyncio.to_thread(_run_native_docling, str(source.resolve()))
                except Exception as doc_err:
                    logger.warning(f"Native Docling parsing failed: {doc_err}. Falling back to VLM OCR.")
                    markdown_text = await self._run_vlm_ocr_ingestion(source)
                    use_vlm_ocr   = True

            if not markdown_text or not markdown_text.strip():
                await self._db_update_status(doc_uuid, DocumentStatus.FAILED, error_message="No text extracted")
                return {
                    "file": source.name, 
                    "status": "partial — no text extracted", 
                    "doc_uuid": doc_uuid,
                    "total_chunks": 0, 
                    "ocr_mode": "failed"
                }

            logger.info("Ingest [[bold white]%s[/]]: Stage 2/4 — [cyan]AST Parent-Child Chunking[/]", source.name)
            from services.document_slicer import semantic_chunk_markdown
            parents = semantic_chunk_markdown(markdown_text, document_id=doc_uuid)

            if db.is_available():
                await db.save_parent_chunks(parents)

            del markdown_text
            gc.collect()

            logger.info("Ingest [[bold white]%s[/]]: Stage 3/4 — [cyan]Decoupled Upsert[/] to Graph & Qdrant", source.name)
            
            total_chunks = sum(len(p.children) for p in parents)
            await self._inject_parent_child_architecture(parents, source.name, doc_uuid)
            
            del parents
            gc.collect()

            await self._db_update_status(
                doc_uuid, DocumentStatus.COMPLETED,
                chunk_count = total_chunks,
                ocr_mode    = "vlm" if use_vlm_ocr else "docling",
            )

            return {
                "file":         source.name,
                "total_chunks": total_chunks,
                "status":       "success",
                "ocr_mode":     "vlm" if use_vlm_ocr else "docling",
                "namespace":    active_namespace,
                "doc_uuid":     doc_uuid,
            }

        except Exception as exc:
            await self._db_update_status(doc_uuid, DocumentStatus.FAILED, error_message=str(exc)[:1000])
            raise

        finally:
            patches.INGESTION_ACTIVE    = False
            _mb_module._INGESTION_ACTIVE = False
            patches.set_active_query_uuids([])
            ColbertQdrantStorage.GLOBAL_TENANT_ID = None
            ColbertQdrantStorage.GLOBAL_FILE_PATH = None

    async def _resolve_or_create_doc_uuid(self, source: Path, user_id: Optional[str]) -> str:
        canonical_path = str(source.resolve())
        if db.is_available():
            try:
                existing = await db.get_document_uuid(canonical_path)
                if existing: return existing
                return await db.create_document(
                    original_filename = source.name, canonical_path = canonical_path, user_id = user_id,
                )
            except Exception: pass
        return uuid.uuid4().hex

    async def _db_update_status(self, doc_uuid: str, status: DocumentStatus, chunk_count: Optional[int] = None, ocr_mode: Optional[str] = None, error_message: Optional[str] = None) -> None:
        if not db.is_available(): return
        try:
            await db.update_document_status(
                doc_uuid=doc_uuid, status=status, chunk_count=chunk_count, ocr_mode=ocr_mode, error_message=error_message,
            )
        except Exception: pass

    def _resolve_vlm_ocr_decision(self, file_path: str, force_vlm_ocr: Optional[bool]) -> bool:
        if force_vlm_ocr is not None: return force_vlm_ocr
        if os.getenv("FORCE_VLM_OCR", "false").lower() == "true": return True
        try: return detect_handwriting_risk(file_path)
        except Exception: return False

    async def _run_vlm_ocr_ingestion(self, source: Path) -> str:
        try:
            import fitz  # PyMuPDF
            HAS_PYMUPDF = True
        except ImportError:
            HAS_PYMUPDF = False
            
        if not HAS_PYMUPDF: return ""
        
        dpi = int(os.getenv("VLM_OCR_DPI", "300"))
        batch_size = int(os.getenv("VLM_OCR_BATCH_PAGES", "1"))
        ocr_texts = []
        
        def _get_page_batch(doc_path, start_idx, b_size, doc_dpi):
            doc = fitz.open(doc_path)
            batch = []
            
            total_pages_count = len(doc) 
            end_idx = min(start_idx + b_size, total_pages_count)
            
            for i in range(start_idx, end_idx):
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=doc_dpi)
                batch.append(pix.tobytes("jpeg"))
                del pix
                del page
            
            doc.close()
            del doc 
            return batch, total_pages_count
            
        def _get_total_pages(doc_path):
            doc = fitz.open(doc_path)
            t = len(doc)
            doc.close()
            del doc
            return t

        total_pages = await asyncio.to_thread(_get_total_pages, str(source.resolve()))
        logger.info(f"Orchestrator: Streaming {total_pages} pages to VLM at {dpi} DPI (Anti-OOM active).")
        
        for start_idx in range(0, total_pages, batch_size):
            batch_bytes, _ = await asyncio.to_thread(
                _get_page_batch, str(source.resolve()), start_idx, batch_size, dpi
            )
            
            try:
                page_text = await self.bridge.vlm_ocr_page(batch_bytes, page_num_start=start_idx)
                if page_text and page_text.strip():
                    ocr_texts.append(page_text.strip())
            except Exception as e:
                logger.error(f"VLM OCR failed at page {start_idx}: {e}")
            
            del batch_bytes
            gc.collect()
            await asyncio.sleep(0.5) 
            
        return "\n\n".join(ocr_texts) if ocr_texts else ""

    async def _inject_parent_child_architecture(self, parents: list, source_filename: str, doc_uuid: str) -> None:
        if not parents: return
        
        child_dicts = []
        children_dict_for_qdrant = {}
        for p in parents:
            for c in p.children:
                d = {
                    "id": c.id,
                    "content": c.content,
                    "parent_id": c.parent_id,
                    "chunk_index": c.chunk_index,
                    "content_type": "TEXT",
                    "source": source_filename
                }
                child_dicts.append(d)
                children_dict_for_qdrant[c.id] = d
        
        if self._tagger:
            logger.info("Orchestrator: Routing flattened ChildChunks through Tagging Pipeline...")
            await self._tagger.process_child_dicts(child_dicts)
            
        logger.info(f"Orchestrator: Bypassing Framework — Routing {len(child_dicts)} ChildChunks directly to Qdrant...")
        await self._chunk_storage.upsert(children_dict_for_qdrant)
        
        logger.info(f"Orchestrator: Routing {len(parents)} ParentChunks to Neo4j (Graph Extraction)...")
        from services.graph_extractor import GraphExtractionService
        graph_extractor = GraphExtractionService(bridge=self.bridge, semaphore=self.semaphore)
        try:
            all_nodes, all_rels = await graph_extractor.extract_and_upsert(parents, doc_uuid)
        finally:
            await graph_extractor.close()
            
        if all_nodes:
            logger.info(f"Orchestrator: Restoring Semantic Pointers in Qdrant for {len(all_nodes)} Entities & {len(all_rels)} Relationships...")
            lightrag_obj = getattr(self._rag_instance, "lightrag", None)
            if not lightrag_obj:
                logger.error("Orchestrator: LightRAG core missing.")
                return

            ent_storage = getattr(lightrag_obj, "entities_vdb", None)
            rel_storage = getattr(lightrag_obj, "relationships_vdb", None)

            if ent_storage:
                ent_payload = {}
                for n in all_nodes:
                    nid = str(n.get("id", ""))
                    desc = n.get("description", "")
                    
                    # ⏪ SOTA FIX: Extracting the metadata injected by the Graph Extractor
                    parent_id = n.get("parent_id")
                    chunk_index = n.get("chunk_index")
                    
                    if nid:
                        ent_payload[nid] = {
                            "content": f"{nid}: {desc}", 
                            "entity_name": nid, 
                            "source": source_filename,
                            "parent_id": parent_id,
                            "chunk_index": chunk_index
                        }
                if ent_payload:
                    await ent_storage.upsert(ent_payload)

            if rel_storage and all_rels:
                rel_payload = {}
                for r in all_rels:
                    src = str(r.get("source_id", ""))
                    tgt = str(r.get("target_id", ""))
                    desc = r.get("explanation", "")
                    
                    # ⏪ SOTA FIX: Extracting the metadata injected by the Graph Extractor
                    parent_id = r.get("parent_id")
                    chunk_index = r.get("chunk_index")
                    
                    if src and tgt:
                        rid = f"{src}-{tgt}"
                        rel_payload[rid] = {
                            "content": f"{src} -> {tgt}: {desc}", 
                            "src_id": src, 
                            "tgt_id": tgt, 
                            "source": source_filename,
                            "parent_id": parent_id,
                            "chunk_index": chunk_index
                        }
                if rel_payload:
                    await rel_storage.upsert(rel_payload)