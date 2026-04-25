"""
Omni-Architect: FastAPI & WebSocket Server (Production Build v4.0 — Academic Assets)
Architecture: Pure Transport Layer — delegates ALL RAG logic to HybridRAGPipeline.

Changelog v4.0.1 — Logical Document Aggregation
────────────────────────────────────
• Intercepts /documents to aggregate physical slices into logical parent documents.
• Implements Sibling Slice Expansion in WS /query to fan-out searches to all slices.
"""
import os
import sys
import site
import re

# --- CRITICAL CUDA INJECTION ---
try:
    site_packages = site.getsitepackages()[0]
    nvidia_base = os.path.join(site_packages, "nvidia")
    cuda_paths = [
        os.path.join(nvidia_base, "cublas", "lib"),
        os.path.join(nvidia_base, "cudnn", "lib"),
        os.path.join(nvidia_base, "curand", "lib"),
        os.path.join(nvidia_base, "cufft", "lib"),
        os.path.join(nvidia_base, "cusparse", "lib"),
        os.path.join(nvidia_base, "cusolver", "lib"),
    ]
    existing_ld = os.environ.get("LD_LIBRARY_PATH", "")
    new_ld = ":".join(cuda_paths) + (":" + existing_ld if existing_ld else "")
    os.environ["LD_LIBRARY_PATH"] = new_ld
    os.environ["CUDA_PATH"] = site_packages
except Exception as e:
    print(f"Warning: Failed to inject CUDA paths: {e}")

import time
import asyncio
import logging
import shutil
import traceback
import webbrowser
import threading
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from rich.console import Console
from rich.logging import RichHandler
from rich.text import Text
from rich.theme import Theme
from rich.progress import (
    BarColumn, Progress, SpinnerColumn,
    TaskProgressColumn, TextColumn, TimeElapsedColumn,
)

# ==============================================================================
# ENVIRONMENT & PATH BOOTSTRAP
# ==============================================================================
os.environ["OMP_NUM_THREADS"]      = "4"
os.environ["MKL_NUM_THREADS"]      = "4"
os.environ["OPENBLAS_NUM_THREADS"] = "4"

PROJECT_ROOT     = Path(__file__).resolve().parent.parent
RAG_ANYTHING_DIR = PROJECT_ROOT / "RAG-Anything"
SRC_DIR          = PROJECT_ROOT / "src"
PUBLIC_DIR       = PROJECT_ROOT / "public"

load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)
sys.path.insert(0, str(RAG_ANYTHING_DIR))
sys.path.insert(0, str(SRC_DIR))

# ==============================================================================
# SERVER PARAMETERS
# ==============================================================================
SERVER_HOST         = os.getenv("SERVER_HOST", "localhost")
SERVER_PORT         = int(os.getenv("SERVER_PORT", "8000"))
MAX_PAGES_PER_SLICE = int(os.getenv("MAX_PAGES_PER_SLICE", "5"))

# ==============================================================================
# LOCAL IMPORTS
# ==============================================================================
try:
    from orchestrator import HybridRAGPipeline
    from pdf_worker import IORouter, sync_slice_pdf, sync_save_upload
    from app.services.atlas_ocr_src.infrastructure.database import list_documents, DocumentStatus
    from presentation.asset_router import (
        router as asset_router,
        set_pipeline as asset_router_set_pipeline,
    )
except ImportError as e:
    raise ImportError(
        f"CRITICAL BOOT FAILURE: Could not import pipeline modules. "
        f"Ensure orchestrator.py, pdf_worker.py, and presentation/ are in {SRC_DIR}. "
        f"Error: {e}"
    ) from e

# ==============================================================================
# RICH TERMINAL CONFIGURATION
# ==============================================================================
_CONSOLE_THEME = Theme({
    "progress.description": "bold cyan",
    "progress.percentage":  "bold green",
    "bar.complete":         "green",
    "bar.finished":         "bright_green",
    "bar.pulse":            "cyan",
})
console = Console(theme=_CONSOLE_THEME)
logging.basicConfig(
    level   = logging.INFO,
    format  = "%(message)s",
    datefmt = "[%X]",
    handlers=[
        RichHandler(
            console        = console,
            rich_tracebacks= True,
            show_path      = False,
            markup         = True,
        )
    ],
)
logger = logging.getLogger("Omni-Architect")


def _make_progress() -> Progress:
    return Progress(
        SpinnerColumn(spinner_name="dots"),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(bar_width=38, style="cyan", complete_style="green"),
        TaskProgressColumn(),
        TextColumn("•"),
        TimeElapsedColumn(),
        console=console,
        transient=False,
    )

# ==============================================================================
# THREAD-SAFE TELEMETRY & LOG STREAMING
# ==============================================================================
active_websockets: set[WebSocket] = set()
MAIN_LOOP: Optional[asyncio.AbstractEventLoop] = None


class WebSocketLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord):
        log_entry = self.format(record)
        if not active_websockets or not MAIN_LOOP or MAIN_LOOP.is_closed():
            return
        try:
            clean_entry = Text.from_markup(log_entry).plain
        except Exception:
            clean_entry = log_entry
        meta = {}
        standard_attrs = {
            "name", "msg", "args", "levelname", "levelno", "pathname",
            "filename", "module", "exc_info", "exc_text", "stack_info",
            "lineno", "funcName", "created", "msecs", "relativeCreated",
            "thread", "threadName", "processName", "process", "message",
        }
        for key, val in record.__dict__.items():
            if key not in standard_attrs and not key.startswith("_"):
                try:
                    meta[key] = str(val)
                except Exception:
                    pass
        message = {"type": "log", "level": record.levelname, "msg": clean_entry, "meta": meta}
        for ws in list(active_websockets):
            try:
                asyncio.run_coroutine_threadsafe(ws.send_json(message), MAIN_LOOP)
            except Exception:
                pass


logger.addHandler(WebSocketLogHandler())

# ==============================================================================
# LIVE TELEMETRY COUNTERS
# ==============================================================================
_stats = {
    "ingestions_attempted": 0,
    "ingestions_succeeded": 0,
    "ingestions_failed":    0,
    "queries_attempted":    0,
    "queries_succeeded":    0,
    "queries_failed":       0,
    "active_connections":   0,
    "vlm_ocr_ingestions":   0,
}

# ==============================================================================
# APPLICATION LIFECYCLE
# ==============================================================================
_pipeline: Optional[HybridRAGPipeline] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline, MAIN_LOOP
    MAIN_LOOP = asyncio.get_running_loop()

    try:
        max_async = int(os.getenv("GEMINI_MAX_ASYNC_CALLS", "1"))
        if max_async < 1:
            raise ValueError
    except (ValueError, TypeError):
        logger.warning("[SYSTEM] Invalid GEMINI_MAX_ASYNC_CALLS. Defaulting to 1.")
        max_async = 1

    semaphore = asyncio.Semaphore(max_async)

    llm_model     = os.getenv("GEMINI_MODEL_NAME",   "UNKNOWN")
    embed_model   = os.getenv("EMBEDDER_MODEL_NAME", "UNKNOWN")
    embed_dim     = os.getenv("EMBEDDING_DIMENSION",  "UNKNOWN")
    qdrant_target = os.getenv("QDRANT_URL") or os.getenv("QDRANT_PATH") or "UNCONFIGURED"

    console.print("\n" + "=" * 70, style="bold blue")
    console.print(" 🚀 OMNI-ARCHITECT SOTA RAG SERVER (v4.0) ", style="bold white on blue")
    console.print("=" * 70, style="bold blue")
    console.print(f" [LLM]        : {llm_model}")
    console.print(f" [Embedder]   : {embed_model} (dim={embed_dim})")
    console.print(f" [VectorDB]   : {qdrant_target}")
    console.print(f" [Host]       : http://{SERVER_HOST}:{SERVER_PORT}")
    console.print(f" [Concurrency]: {max_async} parallel requests")
    console.print(f" [SOTA Feat.] : HyDE | Decomp | Cache | Reranker | Vault | Assets")
    console.print("-" * 70, style="dim")

    _pipeline = HybridRAGPipeline(semaphore=semaphore)
    await _pipeline.initialize()

    # ── Initialize AssetGeneratorService ─────────────────────────────────────
    try:
        from services.asset_generator import AssetGeneratorService
        from app.services.atlas_ocr_src.infrastructure.llm.prompts import PromptLoader
        _pipeline._asset_generator = AssetGeneratorService(
            bridge        = _pipeline.bridge,
            chunk_storage = _pipeline._chunk_storage,
            prompt_loader = PromptLoader(),
        )
        asset_router_set_pipeline(_pipeline)
        logger.info("[SYSTEM] Academic AssetGeneratorService online ✓")
    except Exception as exc:
        logger.error(
            "[SYSTEM] AssetGeneratorService init FAILED (non-fatal): %s. "
            "Academic asset endpoints will return 503 until fixed.", exc,
        )
        _pipeline._asset_generator = None

    logger.info(f"[SYSTEM] Pipeline online. Listening on http://{SERVER_HOST}:{SERVER_PORT}")

    def _open_browser():
        logger.info("[SYSTEM] Auto-launching UI in default browser...")
        webbrowser.open(f"http://{SERVER_HOST}:{SERVER_PORT}")

    threading.Timer(1.5, _open_browser).start()

    yield

    logger.info("[SYSTEM] Initiating graceful shutdown...")
    if _pipeline:
        await _pipeline.shutdown()
    logger.info("[SYSTEM] Shutdown complete.")


# ==============================================================================
# FASTAPI APPLICATION
# ==============================================================================
app = FastAPI(title="Omni-Architect RAG API v4.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount Asset Router ────────────────────────────────────────────────────────
app.include_router(asset_router)

# ── Mount Static Frontend Assets ──────────────────────────────────────────────
js_dir = PUBLIC_DIR / "js"
if js_dir.exists():
    app.mount("/js", StaticFiles(directory=str(js_dir)), name="js")
else:
    logger.warning(f"[SYSTEM] Could not find static JS directory at {js_dir}")

# ==============================================================================
# HTTP ENDPOINTS
# ==============================================================================
@app.get("/", summary="Serve the Omni-Architect UI")
async def serve_ui():
    ui_path = PUBLIC_DIR / "index.html"
    if ui_path.exists():
        return FileResponse(ui_path)
    return JSONResponse(
        status_code=404,
        content={"error": f"index.html not found at {ui_path}."},
    )


@app.get("/health", summary="Pipeline health check")
async def health_check():
    initialized = _pipeline is not None and _pipeline._initialized
    rpd_counter = 0
    if _pipeline and _pipeline.bridge:
        rpd_counter = getattr(_pipeline.bridge, "_rpd_counter", 0)
    asset_gen_ready = (
        _pipeline is not None
        and getattr(_pipeline, "_asset_generator", None) is not None
    )
    return JSONResponse(
        content={
            "status":           "ok" if initialized else "initializing",
            "initialized":      initialized,
            "asset_gen_ready":  asset_gen_ready,
            "config": {
                "llm_model":        os.getenv("GEMINI_MODEL_NAME",   "unknown"),
                "embedder":         os.getenv("EMBEDDER_MODEL_NAME", "unknown"),
                "embed_dim":        int(os.getenv("EMBEDDING_DIMENSION", "0")),
                "qdrant_url":       os.getenv("QDRANT_URL") or os.getenv("QDRANT_PATH") or "unconfigured",
                "rpm_limit":        float(os.getenv("GEMINI_RPM_LIMIT", "2.0")),
                "max_async":        int(os.getenv("GEMINI_MAX_ASYNC_CALLS", "1")),
                "force_vlm_ocr":    os.getenv("FORCE_VLM_OCR", "false").lower() == "true",
                "vlm_ocr_dpi":      int(os.getenv("VLM_OCR_DPI", "150")),
                "chunk_token_size": int(os.getenv("CHUNK_TOKEN_SIZE", "1500")),
                "rpd_used_today":   rpd_counter,
                "rpd_soft_limit":   int(os.getenv("GEMINI_RPD_SOFT_LIMIT", "400")),
            },
        }
    )


@app.get("/documents", summary="Fetch indexed documents for Vault Selector")
async def get_documents():
    if not _pipeline or not _pipeline._enterprise:
        return JSONResponse(
            status_code=400,
            content={"error": "Enterprise mode is disabled. PostgreSQL is unavailable."},
        )
    try:
        docs = await list_documents(status=DocumentStatus.COMPLETED, limit=1000)

        # ── LOGICAL AGGREGATION ──
        grouped_docs = {}
        slice_pattern = re.compile(r"^slice_\d{4}_to_\d{4}_(.+)$")

        for doc in docs:
            orig_name = doc.get("original_filename", "unknown.pdf")
            match = slice_pattern.match(orig_name)
            parent_name = match.group(1) if match else orig_name

            if parent_name not in grouped_docs:
                grouped_docs[parent_name] = doc.copy()
                grouped_docs[parent_name]["original_filename"] = parent_name
                grouped_docs[parent_name]["slice_count"] = 1
            else:
                current_chunks = grouped_docs[parent_name].get("chunk_count") or 0
                new_chunks = doc.get("chunk_count") or 0
                grouped_docs[parent_name]["chunk_count"] = current_chunks + new_chunks
                grouped_docs[parent_name]["slice_count"] += 1

                # Keep the most recent timestamp
                if doc.get("upload_timestamp", "") > grouped_docs[parent_name].get("upload_timestamp", ""):
                    grouped_docs[parent_name]["upload_timestamp"] = doc.get("upload_timestamp")

        final_docs = list(grouped_docs.values())
        final_docs.sort(key=lambda x: x.get("upload_timestamp", ""), reverse=True)

        return {"documents": final_docs}
    except Exception as e:
        logger.error(f"Failed to fetch documents: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/cache/invalidate", summary="Invalidate Semantic Cache")
async def invalidate_cache():
    if _pipeline and getattr(_pipeline, "_cache", None):
        count = await _pipeline._cache.invalidate_all()
        return {"status": "success", "deleted_entries": count}
    return JSONResponse(
        status_code=400,
        content={"status": "error", "message": "Semantic cache not enabled"},
    )


@app.post("/upload", summary="Upload a document for ingestion")
async def upload_document(file: UploadFile = File(...)):
    saved_path = await asyncio.to_thread(sync_save_upload, file.file, file.filename)
    logger.info(f"[IO] Upload saved: [bold white]{file.filename}[/] → {saved_path}")
    return {"filename": file.filename, "path": str(saved_path)}


# ==============================================================================
# WEBSOCKET ENDPOINT
# ==============================================================================
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_websockets.add(ws)
    _stats["active_connections"] += 1
    logger.info(f"[WS] Client connected. Active: [bold cyan]{_stats['active_connections']}[/]")

    async def _send(msg_type: str, msg: str = "", meta: dict = None):
        try:
            await ws.send_json({"type": msg_type, "msg": msg, "meta": meta or {}})
        except Exception:
            pass

    try:
        while True:
            data   = await ws.receive_json()
            action = data.get("action", "").lower()

            # ── ACTION: ingest ─────────────────────────────────────────────
            if action == "ingest":
                file_path = data.get("path", "").strip()
                if not file_path:
                    await _send("error", "Ingest action requires a 'path' field.")
                    continue
                source = Path(file_path)
                if not source.exists():
                    await _send("error", f"File not found: {source}")
                    continue
                force_vlm_ocr_payload = data.get("force_vlm_ocr", None)
                if isinstance(force_vlm_ocr_payload, bool):
                    force_vlm_ocr = force_vlm_ocr_payload
                elif isinstance(force_vlm_ocr_payload, str):
                    force_vlm_ocr = force_vlm_ocr_payload.lower() == "true"
                else:
                    force_vlm_ocr = None

                async def run_ingest(src: Path, fvo: Optional[bool]):
                    _stats["ingestions_attempted"] += 1
                    slices_dir: Optional[Path] = None
                    try:
                        from pypdf import PdfReader
                        total_pages = len(PdfReader(str(src)).pages)
                        logger.info(f"[Ingest] [bold white]'{src.name}'[/] — [magenta]{total_pages}[/] pages.")
                        if fvo is True:
                            _stats["vlm_ocr_ingestions"] += 1
                        if total_pages <= MAX_PAGES_PER_SLICE:
                            with console.status(f"[bold cyan]Ingesting {src.name}..."):
                                summary = await _pipeline.ingest(str(src.resolve()), force_vlm_ocr=fvo)
                        else:
                            logger.info(f"[Ingest] '{src.name}' — large doc, slicing...")
                            slice_paths = await asyncio.to_thread(
                                sync_slice_pdf, str(src.resolve()), MAX_PAGES_PER_SLICE
                            )
                            if slice_paths:
                                slices_dir = Path(slice_paths[0]).parent
                            summary = {
                                "file": src.name, "total_chunks": 0,
                                "distribution": {}, "status": "success", "ocr_mode": "docling",
                            }
                            with _make_progress() as slice_progress:
                                slice_task = slice_progress.add_task(
                                    f"[bold blue]Processing {src.name}", total=len(slice_paths),
                                )
                                for i, slice_path in enumerate(slice_paths):
                                    slice_progress.update(
                                        slice_task,
                                        description=f"[bold blue]Phase {i+1}/{len(slice_paths)}: [dim]{Path(slice_path).name}",
                                    )
                                    slice_summary = await _pipeline.ingest(slice_path, force_vlm_ocr=fvo)
                                    summary["total_chunks"] += slice_summary.get("total_chunks", 0)
                                    summary["ocr_mode"]      = slice_summary.get("ocr_mode", "docling")
                                    for ct, count in slice_summary.get("distribution", {}).items():
                                        summary["distribution"][ct] = summary["distribution"].get(ct, 0) + count
                                    slice_progress.advance(slice_task)
                                    await asyncio.sleep(0.2)
                        _stats["ingestions_succeeded"] += 1
                        doc_uuid = summary.get("doc_uuid", "")
                        await _send(
                            "upload_complete",
                            msg=f"✅ **{src.name}** indexed. {summary['total_chunks']} chunks stored.",
                            meta={
                                "name":         src.name,
                                "chunks":       summary["total_chunks"],
                                "distribution": summary.get("distribution", {}),
                                "ocr_mode":     summary.get("ocr_mode", "docling"),
                                "status":       summary.get("status", "success"),
                                "doc_uuid":     doc_uuid,
                            },
                        )
                        logger.info(f"[Ingest] [bold green]SUCCESS:[/] {summary}")
                    except Exception as exc:
                        _stats["ingestions_failed"] += 1
                        tb = traceback.format_exc()
                        logger.error(f"[Ingest] [bold red]FATAL:[/] {exc}\n{tb}")
                        await _send(
                            "error",
                            f"Ingestion of '{src.name}' failed: {exc}",
                            meta={"traceback": tb},
                        )
                    finally:
                        if slices_dir and slices_dir.exists():
                            shutil.rmtree(slices_dir, ignore_errors=True)

                asyncio.create_task(run_ingest(source, force_vlm_ocr))

            # ── ACTION: query ──────────────────────────────────────────────
            elif action == "query":
                question = data.get("text", "").strip()
                if not question:
                    continue
                client_trace_id = data.get("traceId") or data.get("trace_id") or None
                document_id     = data.get("documentId")
                document_uuids  = [document_id] if document_id and document_id != "global" else None

                async def run_query(q: str, trace_id: Optional[str], d_uuids: Optional[list[str]]):
                    _stats["queries_attempted"] += 1
                    span_start_ms = int(time.time() * 1000)

                    # ── SIBLING SLICE EXPANSION ──
                    if d_uuids and len(d_uuids) == 1:
                        try:
                            target_uuid = d_uuids[0]
                            all_docs = await list_documents(status=DocumentStatus.COMPLETED, limit=1000)
                            target_doc = next((d for d in all_docs if d["uuid"] == target_uuid), None)

                            if target_doc:
                                orig_name = target_doc.get("original_filename", "")
                                slice_pattern = re.compile(r"^slice_\d{4}_to_\d{4}_(.+)$")
                                match = slice_pattern.match(orig_name)
                                parent_name = match.group(1) if match else orig_name

                                expanded_uuids = []
                                for d in all_docs:
                                    d_orig = d.get("original_filename", "")
                                    d_match = slice_pattern.match(d_orig)
                                    d_parent = d_match.group(1) if d_match else d_orig
                                    if d_parent == parent_name:
                                        expanded_uuids.append(d["uuid"])

                                if expanded_uuids:
                                    d_uuids = expanded_uuids
                                    logger.info(f"[Query] Expanded logical document '{parent_name}' to {len(d_uuids)} physical slices.")
                        except Exception as e:
                            logger.error(f"[Query] Sibling expansion failed: {e}")
                    # ─────────────────────────────

                    try:
                        await ws.send_json({
                            "type": "llm_span_start",
                            "traceId": trace_id or "pending",
                            "startMs": span_start_ms,
                            "route": "PENDING",
                        })
                    except Exception:
                        pass
                    try:
                        with console.status("[bold cyan]Synthesizing response..."):
                            result = await _pipeline.query(q, trace_id=trace_id, document_uuids=d_uuids)
                        resolved_trace_id = result.get("trace_id", trace_id or "unknown")
                        ui_chunks = []
                        for idx, c in enumerate(result.get("chunks", [])):
                            if isinstance(c, dict):
                                ui_chunks.append({
                                    "id":            str(c.get("id", f"chunk_{idx}")),
                                    "text":          str(c.get("content", c.get("text", str(c)))),
                                    "score":         float(c.get("score") or 0.0),
                                    "source":        str(c.get("source", "document")),
                                    "page":          int(c.get("page") or 1),
                                    "content_type":  str(c.get("content_type", "TEXT")),
                                })
                            else:
                                ui_chunks.append({
                                    "id": f"chunk_{idx}", "text": str(c),
                                    "score": 0.0, "source": "document",
                                    "page": 1, "content_type": "TEXT",
                                })
                        try:
                            await ws.send_json({
                                "type": "retrieval_span",
                                "traceId": resolved_trace_id,
                                "chunks": ui_chunks,
                                "topK": len(ui_chunks),
                                "retrievalLatencyMs": int(result.get("retrieval_latency_ms", 0)),
                                "indexSize": result.get("index_size"),
                                "queryVector": "computed",
                            })
                        except Exception:
                            pass
                        p_tok = result.get("prompt_tokens")
                        c_tok = result.get("completion_tokens")
                        if p_tok is None and hasattr(_pipeline.bridge, "last_prompt_tokens"):
                            p_tok = _pipeline.bridge.last_prompt_tokens
                        if c_tok is None and hasattr(_pipeline.bridge, "last_completion_tokens"):
                            c_tok = _pipeline.bridge.last_completion_tokens
                        p_tok_val = int(p_tok) if p_tok is not None else None
                        c_tok_val = int(c_tok) if c_tok is not None else None
                        try:
                            await ws.send_json({
                                "type": "llm_span_end",
                                "traceId": resolved_trace_id,
                                "promptTokens": p_tok_val,
                                "completionTokens": c_tok_val,
                                "totalLatencyMs": int(result.get("total_latency_ms", 0)),
                                "ttftMs": result.get("ttft_ms"),
                                "route": str(result.get("route", "GRAPH")),
                            })
                        except Exception:
                            pass
                        _stats["queries_succeeded"] += 1
                        await _send(
                            "chat",
                            msg=str(result.get("answer", "")),
                            meta={
                                "route":             str(result.get("route", "GRAPH")),
                                "traceId":           resolved_trace_id,
                                "expandedQuery":     str(result.get("expanded_query", "")),
                                "cacheHit":          bool(result.get("cache_hit", False)),
                                "domain":            str(result.get("domain", "UNKNOWN")),
                                "hydeText":          str(result.get("hyde_text", "")),
                                "decomposedQueries": result.get("decomposed_queries", []),
                            },
                        )
                        p_str = str(p_tok_val) if p_tok_val is not None else "N/A"
                        c_str = str(c_tok_val) if c_tok_val is not None else "N/A"
                        logger.info(
                            f"[Query] [bold green]Complete[/] — traceId={resolved_trace_id} | "
                            f"route=[cyan]{result.get('route')}[/] | chunks=[magenta]{len(ui_chunks)}[/] | "
                            f"total={result.get('total_latency_ms')}ms | p_tok={p_str} | c_tok={c_str}",
                        )
                    except Exception as exc:
                        _stats["queries_failed"] += 1
                        tb = traceback.format_exc()
                        logger.error(f"[Query] [bold red]FATAL:[/] {exc}\n{tb}")
                        await _send(
                            "error",
                            f"Query failed: {exc}",
                            meta={"traceback": tb, "traceId": trace_id or "unknown"},
                        )

                asyncio.create_task(run_query(question, client_trace_id, document_uuids))

            # ── ACTION: stats ──────────────────────────────────────────────
            elif action == "stats":
                live_stats = dict(_stats)
                if _pipeline and _pipeline.bridge:
                    live_stats["rpd_used_today"] = getattr(_pipeline.bridge, "_rpd_counter", 0)
                    live_stats["rpd_soft_limit"] = getattr(_pipeline.bridge, "_rpd_soft_limit", 400)
                await _send("stats", "Live telemetry snapshot.", meta=live_stats)

            elif action == "invalidate_cache":
                if _pipeline and getattr(_pipeline, "_cache", None):
                    count = await _pipeline._cache.invalidate_all()
                    await _send("log", f"Semantic Cache invalidated. {count} entries removed.")
                else:
                    await _send("error", "Semantic cache is not active.")

            else:
                await _send(
                    "error",
                    f"Unknown action '{action}'. Valid: ingest | query | stats | invalidate_cache.",
                )

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error(f"[WS] Unexpected error: {exc}")
        logger.error(traceback.format_exc())
    finally:
        active_websockets.discard(ws)
        _stats["active_connections"] = max(0, _stats["active_connections"] - 1)
        logger.info(f"[WS] Client disconnected. Active: [bold cyan]{_stats['active_connections']}[/]")


# ==============================================================================
# ENTRY POINT
# ==============================================================================
if __name__ == "__main__":
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)
    import uvicorn
    uvicorn.run(
        "server:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        workers=1,
        log_level="warning",
    )