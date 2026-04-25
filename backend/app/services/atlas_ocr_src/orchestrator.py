"""
src/orchestrator.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Hybrid RAG Orchestrator Facade (Production Build v6.3)

Architecture: Full SOTA Advanced RAG — Pre-Retrieval → Retrieval → Rerank → Synthesize
Pattern: Pure Headless Facade (Presentation decoupled to src/presentation/cli.py)

Changelog v6.3 — SOTA Graph Decoupling
──────────────────────────────────────
• Severed graph extraction from default LightRAG ingestion.
• Wired dedicated GraphExtractionService for strict Hogan-based ontology mapping.
• Added Stage 4 ingestion phase for deterministic Neo4j Cypher generation.

Changelog v6.2 — SOTA Quality Enhancements
──────────────────────────────────────────
• Wired SemanticCacheService to protect RPD budget.
• Wired HyDEService for domain-aware query expansion.
• Wired QueryDecomposer for multi-hop question resolution.
• Wired CrossEncoderReranker to replace ColBERT MaxSim fallback.
• Fixed TypeError strings/Nones bleeding into token telemetry.

Changelog v6.1 — CPU Thread Alignment
──────────────────────────────────────
[FIX-THREAD-01] Thread override bootstrap reads .env BEFORE setting os.environ.
[FIX-THREAD-02] Added TOKENIZERS_PARALLELISM=false to prevent fork deadlocks.
[FIX-THREAD-03] Thread var ordering prioritizes .env overrides cleanly.

════════════════════════════════════════════════════════════════════════════════
FACADE PATTERN
════════════════════════════════════════════════════════════════════════════════
This file is the single entry point for server.py and the CLI. It exposes
exactly two public methods:
    await pipeline.ingest(file_path, ...) → dict
    await pipeline.query(question, ...)   → QueryResult

All heavy lifting is delegated to domain services.
════════════════════════════════════════════════════════════════════════════════
"""

import asyncio
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Optional

# ──────────────────────────────────────────────────────────────────────────────
# [FIX-THREAD-01/02/03] CPU THREAD BOOTSTRAP
# MUST execute before ANY numpy / torch / onnxruntime import.
# ──────────────────────────────────────────────────────────────────────────────

_PROJECT_ROOT_BOOTSTRAP = Path(__file__).resolve().parent.parent
_ENV_FILE_BOOTSTRAP     = _PROJECT_ROOT_BOOTSTRAP / ".env"

# Step 1: Read .env as a dict (no side-effects on os.environ)
try:
    from dotenv import dotenv_values as _dotenv_values
    _env_dict = _dotenv_values(_ENV_FILE_BOOTSTRAP) if _ENV_FILE_BOOTSTRAP.exists() else {}
except Exception:
    _env_dict = {}

# Step 2+3: Set thread vars — .env wins over Python fallback
_DEFAULT_THREAD_COUNT = str(_env_dict.get("FASTEMBED_THREADS", "6"))

os.environ["OMP_NUM_THREADS"]      = _env_dict.get("OMP_NUM_THREADS",      _DEFAULT_THREAD_COUNT)
os.environ["MKL_NUM_THREADS"]      = _env_dict.get("MKL_NUM_THREADS",      _DEFAULT_THREAD_COUNT)
os.environ["OPENBLAS_NUM_THREADS"] = _env_dict.get("OPENBLAS_NUM_THREADS", _DEFAULT_THREAD_COUNT)

# Step 4: Prevent HuggingFace tokenizer fork deadlock
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

# ──────────────────────────────────────────────────────────────────────────────
# PATH RESOLUTION (safe after thread bootstrap)
# ──────────────────────────────────────────────────────────────────────────────

from dotenv import load_dotenv  # noqa: E402

PROJECT_ROOT     = _PROJECT_ROOT_BOOTSTRAP
RAG_ANYTHING_DIR = PROJECT_ROOT / "RAG-Anything"
SRC_DIR          = PROJECT_ROOT / "src"

load_dotenv(dotenv_path=PROJECT_ROOT / ".env")

sys.path.insert(0, str(RAG_ANYTHING_DIR))
sys.path.insert(0, str(SRC_DIR))

logger = logging.getLogger(__name__)

logger.info(
    "Orchestrator: Thread environment → "
    "OMP=%s MKL=%s OPENBLAS=%s TOKENIZERS_PARALLELISM=%s",
    os.environ["OMP_NUM_THREADS"],
    os.environ["MKL_NUM_THREADS"],
    os.environ["OPENBLAS_NUM_THREADS"],
    os.environ.get("TOKENIZERS_PARALLELISM", "unset"),
)

# ──────────────────────────────────────────────────────────────────────────────
# INFRASTRUCTURE — patches MUST be applied before any LightRAG import
# ──────────────────────────────────────────────────────────────────────────────

import app.services.atlas_ocr_src.infrastructure as infrastructure.patches as patches
patches.apply_all_patches(ingestion_active_getter=lambda: patches.INGESTION_ACTIVE)

# ──────────────────────────────────────────────────────────────────────────────
# DATABASE (import after patches, no LightRAG dependency)
# ──────────────────────────────────────────────────────────────────────────────

import app.services.atlas_ocr_src.infrastructure as infrastructure.database as db
from app.services.atlas_ocr_src.infrastructure.database import DocumentStatus

# ──────────────────────────────────────────────────────────────────────────────
# FRAMEWORK IMPORTS (safe after patches)
# ──────────────────────────────────────────────────────────────────────────────

try:
    from raganything.raganything import RAGAnything
    from raganything.config import RAGAnythingConfig
    from lightrag.utils import EmbeddingFunc
    from lightrag.lightrag import LightRAG
    from colbert_qdrant import ColbertQdrantStorage
    from app.services.atlas_ocr_src.infrastructure.llm.bridge import OmniModelBridge
    import app.services.atlas_ocr_src.infrastructure as infrastructure.llm.bridge as _mb_module
    from pdf_worker import (
        IORouter,
        get_docling_markdown_for_file,
        sync_slice_pdf,
        detect_handwriting_risk,
        extract_pages_as_images,
    )
except ImportError as e:
    raise ImportError(f"CRITICAL BOOT FAILURE: {e}") from e

# ──────────────────────────────────────────────────────────────────────────────
# DOMAIN & SERVICE IMPORTS
# ──────────────────────────────────────────────────────────────────────────────

from app.services.atlas_ocr_src.domain.models import QueryResult
from services.content_tagger import ContentTaggingPipeline
from services.fusion_engine import FusionEngine

# SOTA Enhancements
from services.semantic_cache import SemanticCacheService
from services.hyde import HyDEService
from services.query_decomposer import QueryDecomposer
from services.reranker import CrossEncoderReranker

# Defensive Import for SOTA Graph Extraction (Allows iterative compilation)
try:
    from services.graph_extractor import GraphExtractionService
except ImportError:
    GraphExtractionService = None


# ──────────────────────────────────────────────────────────────────────────────
# ENTERPRISE MODE DETECTION
# ──────────────────────────────────────────────────────────────────────────────

def _is_enterprise_mode() -> bool:
    enabled      = os.getenv("ENTERPRISE_STORAGE_ENABLED", "false").lower() == "true"
    redis_uri    = os.getenv("REDIS_URI")
    neo4j_uri    = os.getenv("NEO4J_URI")
    postgres_uri = os.getenv("POSTGRES_URI")

    if not enabled:
        return False

    missing = []
    if not redis_uri: missing.append("REDIS_URI")
    if not neo4j_uri: missing.append("NEO4J_URI")
    if not postgres_uri: missing.append("POSTGRES_URI")

    if missing:
        logger.warning(
            "Orchestrator: ENTERPRISE_STORAGE_ENABLED=true but the following "
            "env vars are missing: %s. Falling back to disk-based storage.",
            missing,
        )
        return False

    return True


# ──────────────────────────────────────────────────────────────────────────────
# GLOBAL BRIDGE PROXY (LightRAG callbacks must be module-level functions)
# ──────────────────────────────────────────────────────────────────────────────

_GLOBAL_BRIDGE: Optional[OmniModelBridge] = None

async def proxy_vision_translation(prompt: str, system_prompt: str = "", **kwargs) -> str:
    return await _GLOBAL_BRIDGE.vision_translation_func(prompt, system_prompt, **kwargs)

async def proxy_llm_synthesis(prompt: str, system_prompt: str = "", **kwargs) -> str:
    return await _GLOBAL_BRIDGE.llm_synthesis_func(prompt, system_prompt, **kwargs)

async def proxy_local_embedding(texts: list[str], *args, **kwargs):
    return await _GLOBAL_BRIDGE.local_embedding_func(texts, *args, **kwargs)

# ══════════════════════════════════════════════════════════════════════════════
# HYBRID RAG PIPELINE — the Facade
# ══════════════════════════════════════════════════════════════════════════════

class HybridRAGPipeline:
    def __init__(self, semaphore: Optional[asyncio.Semaphore] = None) -> None:
        logger.info(
            "[bold blue]Initializing SOTA Advanced RAG Orchestrator "
            "(v6.3 Enterprise Headless)...[/]"
        )

        global _GLOBAL_BRIDGE
        self.bridge      = OmniModelBridge()
        _GLOBAL_BRIDGE   = self.bridge

        self.semaphore   = semaphore or asyncio.Semaphore(1)
        self._enterprise = _is_enterprise_mode()

        self._rag_instance:    Optional[RAGAnything]            = None
        self._chunk_storage:   Optional[ColbertQdrantStorage]   = None
        self._tagger:          Optional[ContentTaggingPipeline] = None
        self._fusion_engine:   Optional[FusionEngine]           = None

        # SOTA Services
        self._cache:           Optional[SemanticCacheService]   = None
        self._hyde:            Optional[HyDEService]            = None
        self._decomposer:      Optional[QueryDecomposer]        = None
        self._reranker:        Optional[CrossEncoderReranker]   = None
        self._graph_extractor: Optional[Any]                    = None

        self._initialized:     bool                             = False
        self._rag_by_namespace: dict[str, tuple]                = {}

        logger.info(
            "Orchestrator: Mode → %s",
            "[bold green]ENTERPRISE[/] (Redis + Neo4j + PostgreSQL)"
            if self._enterprise
            else "[bold yellow]DISK[/] (legacy file-based)",
        )

    # ─────────────────────────────────────────────────────────────────────
    # LIFECYCLE
    # ─────────────────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        if self._initialized:
            return

        logger.info("[bold cyan]Orchestrator:[/] Starting initialization sequence...")

        # ── Phase 0: Circuit Breaker ─────────────────────────────────────
        logger.info("[bold cyan]Orchestrator:[/] Booting Global Circuit Breaker...")
        await self.bridge.async_init()

        # ── Phase 1: PostgreSQL ───────────────────────────────────────────
        postgres_uri = os.getenv("POSTGRES_URI")
        if postgres_uri and self._enterprise:
            try:
                await db.init_db(
                    dsn      = postgres_uri,
                    min_size = int(os.getenv("POSTGRES_POOL_MIN_SIZE", "2")),
                    max_size = int(os.getenv("POSTGRES_POOL_MAX_SIZE", "10")),
                )
            except Exception as exc:
                logger.error(
                    "Orchestrator: PostgreSQL initialization FAILED: %s.", exc
                )

        # ── Phase 2: SOTA Services ────────────────────────────────────────
        logger.info("[bold cyan]Orchestrator:[/] Booting SOTA Services...")

        if os.getenv("SEMANTIC_CACHE_ENABLED", "true").lower() == "true":
            self._cache = SemanticCacheService(self.bridge, self.bridge.config)
            await self._cache.initialize()

        if os.getenv("HYDE_ENABLED", "true").lower() == "true":
            self._hyde = HyDEService(self.bridge)
            logger.info("Orchestrator: HyDEService online.")

        if os.getenv("QUERY_DECOMP_ENABLED", "true").lower() == "true":
            self._decomposer = QueryDecomposer(self.bridge)
            logger.info("Orchestrator: QueryDecomposer online.")

        if os.getenv("RERANKER_ENABLED", "true").lower() == "true":
            self._reranker = CrossEncoderReranker(self.bridge.config)
            logger.info("Orchestrator: CrossEncoderReranker online (lazy-load).")

        if self._enterprise and GraphExtractionService:
            self._graph_extractor = GraphExtractionService(bridge=self.bridge, semaphore=self.semaphore)
            logger.info("Orchestrator: GraphExtractionService online (Hogan Ontology).")
        elif self._enterprise:
            logger.warning("Orchestrator: GraphExtractionService module not found. Awaiting Phase 2 compilation.")

        # ── Core RAG stack ───────────────────────────────────────────────
        logger.info("[bold cyan]Orchestrator:[/] Configuring [blue]RAG-Anything[/]...")

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

        logger.info("[bold cyan]Orchestrator:[/] Synchronizing with [magenta]storage backends[/]...")
        self._rag_instance.lightrag = LightRAG(
            working_dir    = config.working_dir,
            llm_model_func = proxy_llm_synthesis,
            embedding_func = embed_fn,
            **lg_kwargs,
        )
        await self._rag_instance.lightrag.initialize_storages()

        self._chunk_storage = self._resolve_chunk_storage(self._rag_instance)

        self._tagger = ContentTaggingPipeline(
            bridge    = self.bridge,
            semaphore = self.semaphore,
        )

        self._fusion_engine = FusionEngine(
            rag_instance   = self._rag_instance,
            chunk_storage  = self._chunk_storage,
            bridge         = self.bridge,
            reranker       = self._reranker,
            hyde           = self._hyde,
            decomposer     = self._decomposer,
            cache          = self._cache,
            math_normalize = os.getenv("MATH_LATEX_NORMALIZE", "true").lower() == "true"
        )

        self._initialized = True
        logger.info("[bold cyan]Orchestrator:[/] [bold green]Online[/].")

    # ─────────────────────────────────────────────────────────────────────
    # CONFIGURATION BUILDERS
    # ─────────────────────────────────────────────────────────────────────

    def _get_embed_dim(self) -> int:
        dim_str = os.getenv("EMBEDDING_DIMENSION")
        if not dim_str:
            raise ValueError("CONFIG HALT: EMBEDDING_DIMENSION missing from .env")
        return int(dim_str)

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
            "chunk_token_size":           int(os.getenv("CHUNK_TOKEN_SIZE", "400")),
            "chunk_overlap_token_size":   int(os.getenv("CHUNK_OVERLAP",    "40")),
            "vector_db_storage_cls_kwargs": {},
        }

        if not self._enterprise:
            return base_kwargs

        redis_uri    = os.getenv("REDIS_URI")
        neo4j_uri    = os.getenv("NEO4J_URI")
        neo4j_user   = os.getenv("NEO4J_USERNAME", "neo4j")
        neo4j_password = os.getenv("NEO4J_PASSWORD", "")

        enterprise_kwargs = {
            "kv_storage":          "RedisKVStorage",
            "doc_status_storage":  "RedisKVStorage",
            "graph_storage":       "Neo4JStorage",
            "addon_params": {
                "redis_uri":  redis_uri,
                "neo4j_url":  neo4j_uri,
                "neo4j_auth": (neo4j_user, neo4j_password),
            },
        }
        base_kwargs.update(enterprise_kwargs)
        return base_kwargs

    # ─────────────────────────────────────────────────────────────────────
    # CHUNK STORAGE RESOLUTION
    # ─────────────────────────────────────────────────────────────────────

    def _resolve_chunk_storage(self, rag_instance: "RAGAnything") -> Optional[ColbertQdrantStorage]:
        lg = rag_instance.lightrag
        candidate_fns = [
            lambda: lg.storages.get("chunks") if hasattr(lg, "storages") else None,
            lambda: getattr(lg, "vector_db_storage", None),
            lambda: getattr(lg, "chunks_vdb",        None),
            lambda: getattr(lg, "chunk_storage",     None),
        ]

        for fn in candidate_fns:
            try:
                candidate = fn()
                if candidate and isinstance(candidate, ColbertQdrantStorage) and getattr(candidate, "_initialized", False):
                    return candidate
            except Exception:
                continue

        for attr_name, attr_val in vars(lg).items():
            if isinstance(attr_val, ColbertQdrantStorage) and getattr(attr_val, "_initialized", False):
                return attr_val

        return None

    # ─────────────────────────────────────────────────────────────────────
    # NAMESPACE INSTANCE MANAGEMENT
    # ─────────────────────────────────────────────────────────────────────

    async def _initialize_for_namespace(self, namespace: str) -> tuple:
        if not self._initialized:
            await self.initialize()

        if self._enterprise:
            return (self._rag_instance, self._chunk_storage, self._fusion_engine)

        if namespace in self._rag_by_namespace:
            return self._rag_by_namespace[namespace]

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
            rag_instance   = rag_instance,
            chunk_storage  = chunk_storage,
            bridge         = self.bridge,
            reranker       = self._reranker,
            hyde           = self._hyde,
            decomposer     = self._decomposer,
            cache          = self._cache,
        )

        self._rag_by_namespace[namespace] = (rag_instance, chunk_storage, fusion_engine)
        return self._rag_by_namespace[namespace]

    async def shutdown(self) -> None:
        logger.info("[bold cyan]Orchestrator:[/] [yellow]Shutting down...[/]")
        if self._rag_instance and hasattr(self._rag_instance, "lightrag") and self._rag_instance.lightrag is not None:
            try:
                await self._rag_instance.finalize_storages()
            except Exception:
                pass

        if self._cache and getattr(self._cache, "_client", None):
            try:
                if hasattr(self._cache._client, "close"):
                    self._cache._client.close()
            except Exception:
                pass

        await db.close_db()
        logger.info("[bold cyan]Orchestrator:[/] [bold green]Shutdown complete.[/]")

    # ─────────────────────────────────────────────────────────────────────
    # QUERY PIPELINE
    # ─────────────────────────────────────────────────────────────────────

    async def query(
        self,
        question:       str,
        trace_id:       Optional[str]       = None,
        namespace:      str                 = "default",
        document_uuids: Optional[list[str]] = None,
    ) -> QueryResult:
        if not self._initialized:
            await self.initialize()

        if self._enterprise and document_uuids:
            patches.set_active_namespace(document_uuids[0])
            patches.set_active_query_uuids(document_uuids)
            ColbertQdrantStorage.GLOBAL_QUERY_TENANT_IDS = document_uuids
        elif self._enterprise:
            patches.set_active_namespace("global")
            patches.set_active_query_uuids([])
            ColbertQdrantStorage.GLOBAL_QUERY_TENANT_IDS = []
        else:
            patches.set_active_namespace(namespace)
            patches.set_active_query_uuids(document_uuids or [])
            ColbertQdrantStorage.GLOBAL_QUERY_TENANT_IDS = document_uuids or []

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

            from services.fusion_engine import _is_empty_result
            if _is_empty_result(fusion_result.get("answer", "")):
                fusion_result["answer"] = (
                    "I could not find sufficiently precise information in the knowledge base."
                )

            fusion_result["total_latency_ms"] = total_latency_ms
            fusion_result["trace_id"]         = trace_id
            return fusion_result
        finally:
            patches.set_active_query_uuids([])
            ColbertQdrantStorage.GLOBAL_QUERY_TENANT_IDS = None

    async def _expand_query(self, question: str, trace_id: str) -> str:
        expansion_prompt = (
            f"Original query: {question}\n\nExpanded retrieval query:"
        )
        try:
            expanded = await self.bridge._call_gemini(
                [expansion_prompt],
                system_instruction = "Output only the expanded query string, nothing else.",
                throttle   = False,
                force_json = False,
            )
            expanded = expanded.strip()
            if not expanded or len(expanded) < len(question): return question
            return expanded
        except Exception:
            return question

    # ─────────────────────────────────────────────────────────────────────
    # INGESTION PIPELINE
    # ─────────────────────────────────────────────────────────────────────

    async def ingest(
        self,
        file_path:     str,
        output_dir:    Optional[str]  = None,
        force_vlm_ocr: Optional[bool] = None,
        namespace:     str            = "default",
        user_id:       Optional[str]  = None,
    ) -> dict:
        if not self._initialized:
            await self.initialize()

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
        _mb_module._INGESTION_ACTIVE = True
        ColbertQdrantStorage.GLOBAL_TENANT_ID = active_namespace
        ColbertQdrantStorage.GLOBAL_FILE_PATH = source.name

        await self._db_update_status(doc_uuid, DocumentStatus.INGESTING)

        try:
            use_vlm_ocr = self._resolve_vlm_ocr_decision(str(source), force_vlm_ocr)
            extractor   = "VLM OCR" if use_vlm_ocr else "Docling"
            logger.info("Ingest [[bold white]%s[/]]: Stage 1/4 — [cyan]%s[/] extraction", source.name, extractor)

            if use_vlm_ocr:
                markdown_text = await self._run_vlm_ocr_ingestion(source)
            else:
                try:
                    await self._rag_instance.process_document_complete(
                        file_path=str(source.resolve()), output_dir=out_dir,
                    )
                    markdown_text = await asyncio.to_thread(get_docling_markdown_for_file, str(source.resolve()))
                except Exception:
                    markdown_text = await self._run_vlm_ocr_ingestion(source)
                    use_vlm_ocr   = True

            if not markdown_text:
                await self._db_update_status(doc_uuid, DocumentStatus.FAILED, error_message="No text extracted")
                return {"file": source.name, "status": "partial — no text extracted", "doc_uuid": doc_uuid}

            logger.info("Ingest [[bold white]%s[/]]: Stage 2/4 — [cyan]Content tagging[/]", source.name)
            typed_chunks = await self._tagger.process_markdown(markdown_text)

            logger.info("Ingest [[bold white]%s[/]]: Stage 3/4 — [cyan]Upserting chunks[/] to Qdrant", source.name)
            await self._inject_typed_chunks(typed_chunks)

            # SOTA Graph Routing Decoupled Phase
            if self._enterprise and self._graph_extractor:
                logger.info("Ingest [[bold white]%s[/]]: Stage 4/4 — [cyan]SOTA Graph Extraction[/] (Hogan Ontology)", source.name)
                await self._graph_extractor.extract_and_upsert(
                    chunks=typed_chunks,
                    doc_uuid=doc_uuid
                )

            await self._db_update_status(
                doc_uuid, DocumentStatus.COMPLETED,
                chunk_count = len(typed_chunks),
                ocr_mode    = "vlm" if use_vlm_ocr else "docling",
            )

            return {
                "file":         source.name,
                "total_chunks": len(typed_chunks),
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

    # ─────────────────────────────────────────────────────────────────────
    # INGESTION HELPERS
    # ─────────────────────────────────────────────────────────────────────

    async def _resolve_or_create_doc_uuid(self, source: Path, user_id: Optional[str]) -> str:
        canonical_path = str(source.resolve())
        if db.is_available():
            try:
                existing = await db.get_document_uuid(canonical_path)
                if existing: return existing
                return await db.create_document(
                    original_filename = source.name,
                    canonical_path    = canonical_path,
                    user_id           = user_id,
                )
            except Exception:
                pass
        return uuid.uuid4().hex

    async def _db_update_status(
        self,
        doc_uuid:      str,
        status:        DocumentStatus,
        chunk_count:   Optional[int] = None,
        ocr_mode:      Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        if not db.is_available(): return
        try:
            await db.update_document_status(
                doc_uuid      = doc_uuid,
                status        = status,
                chunk_count   = chunk_count,
                ocr_mode      = ocr_mode,
                error_message = error_message,
            )
        except Exception:
            pass

    def _resolve_vlm_ocr_decision(self, file_path: str, force_vlm_ocr: Optional[bool]) -> bool:
        if force_vlm_ocr is not None: return force_vlm_ocr
        if os.getenv("FORCE_VLM_OCR", "false").lower() == "true": return True
        try:
            return detect_handwriting_risk(file_path)
        except Exception:
            return False

    async def _run_vlm_ocr_ingestion(self, source: Path) -> str:
        from pdf_worker import HAS_PYMUPDF
        if not HAS_PYMUPDF: return ""
        page_batches = await asyncio.to_thread(extract_pages_as_images, str(source.resolve()))
        if not page_batches: return ""

        ocr_texts   = []
        page_cursor = 0
        for batch_idx, batch in enumerate(page_batches):
            try:
                page_text = await self.bridge.vlm_ocr_page(batch, page_num_start=page_cursor)
                if page_text and page_text.strip():
                    ocr_texts.append(page_text.strip())
            except Exception:
                pass
            finally:
                page_cursor += len(batch)

        return "\n\n".join(ocr_texts) if ocr_texts else ""

    async def _inject_typed_chunks(self, chunks: list[dict]) -> None:
        if not chunks: return
        content_list = [{"content": c["content"], "content_type": c["content_type"], "is_atomic": c["is_atomic"]} for c in chunks]
        try:
            await self._rag_instance.insert_content_list(content_list)
        except AttributeError:
            await self._rag_instance.lightrag.ainsert("\n\n".join(c["content"] for c in chunks))