"""
@file server.py
@description Omni-Architect: FastAPI Server. Now acts purely as the HTTP Transport Layer.
@layer Core Logic / API
@dependencies fastapi, presentation routers, orchestrator
"""

import os
import sys
from pathlib import Path

# ==============================================================================
# ENVIRONMENT BOOTSTRAP & ANTI-SWAP-DEATH GUARDS (HOISTED)
# ==============================================================================
PROJECT_ROOT     = Path(__file__).resolve().parent.parent
RAG_ANYTHING_DIR = PROJECT_ROOT / "RAG-Anything"
SRC_DIR          = PROJECT_ROOT / "src"
PUBLIC_DIR       = PROJECT_ROOT / "public"

sys.path.insert(0, str(RAG_ANYTHING_DIR))
sys.path.insert(0, str(SRC_DIR))

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)
except ImportError:
    pass

# 🚨 CRITICAL ANTI-SWAP-DEATH GUARDS
os.environ.setdefault("DOCLING_NUM_THREADS",  "4") # SOTA FIX: Increased for parallel ingestion
os.environ.setdefault("RAY_NUM_CPUS",         "1")
os.environ.setdefault("OMP_THREAD_LIMIT",     "1")
os.environ.setdefault("OMP_NUM_THREADS",      "2")
os.environ.setdefault("MKL_NUM_THREADS",      "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import site
import re

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

import asyncio
import webbrowser
import threading
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Local Architecture Imports
from orchestrator import HybridRAGPipeline
from infrastructure.database import list_documents, DocumentStatus
from services.document_slicer import sync_save_upload
from presentation.asset_router import router as asset_router, set_pipeline as asset_router_set_pipeline
from presentation.websocket_handler import router as ws_router, set_ws_pipeline
from presentation.telemetry import logger, console
import presentation.telemetry as telemetry

SERVER_HOST = os.getenv("SERVER_HOST", "localhost")
SERVER_PORT = int(os.getenv("SERVER_PORT", "8000"))

_pipeline: Optional[HybridRAGPipeline] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline
    telemetry.MAIN_LOOP = asyncio.get_running_loop()

    try:
        max_async = int(os.getenv("GEMINI_MAX_ASYNC_CALLS", "1"))
        if max_async < 1: raise ValueError
    except (ValueError, TypeError):
        max_async = 1

    semaphore = asyncio.Semaphore(max_async)

    console.print("\n" + "=" * 70, style="bold blue")
    console.print(" 🚀 OMNI-ARCHITECT SOTA RAG SERVER (v4.4 Scatter-Gather) ", style="bold white on blue")
    console.print("=" * 70, style="bold blue")
    console.print(f" [Host]       : http://{SERVER_HOST}:{SERVER_PORT}")
    console.print("-" * 70, style="dim")

    _pipeline = HybridRAGPipeline(semaphore=semaphore)
    await _pipeline.initialize()

    # Pass pipeline to decoupled routers
    set_ws_pipeline(_pipeline)
    
    try:
        from services.asset_generator import AssetGeneratorService
        from infrastructure.llm.prompts import PromptLoader
        _pipeline._asset_generator = AssetGeneratorService(
            bridge        = _pipeline.bridge,
            chunk_storage = _pipeline._chunk_storage,
            prompt_loader = PromptLoader(),
        )
        asset_router_set_pipeline(_pipeline)
        logger.info("[SYSTEM] Academic AssetGeneratorService online ✓")
    except Exception as exc:
        logger.error(f"[SYSTEM] AssetGeneratorService init FAILED: {exc}")
        _pipeline._asset_generator = None

    def _open_browser():
        logger.info("[SYSTEM] Auto-launching UI in default browser...")
        webbrowser.open(f"http://{SERVER_HOST}:{SERVER_PORT}")

    threading.Timer(1.5, _open_browser).start()

    yield

    logger.info("[SYSTEM] Initiating graceful shutdown...")
    if _pipeline:
        await _pipeline.shutdown()


app = FastAPI(title="Omni-Architect RAG API v4.4", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(asset_router)
app.include_router(ws_router) # SOTA WebSocket Engine Mounted

js_dir = PUBLIC_DIR / "js"
if js_dir.exists():
    app.mount("/js", StaticFiles(directory=str(js_dir)), name="js")


@app.get("/")
async def serve_ui():
    ui_path = PUBLIC_DIR / "index.html"
    return FileResponse(ui_path) if ui_path.exists() else JSONResponse(status_code=404, content={"error": "UI missing."})

@app.get("/health")
async def health_check():
    init = _pipeline is not None and _pipeline._initialized
    return JSONResponse(content={"status": "ok" if init else "initializing", "initialized": init})

@app.get("/documents")
async def get_documents():
    if not _pipeline or not _pipeline._enterprise:
        return JSONResponse(status_code=400, content={"error": "Enterprise mode disabled."})
    try:
        docs = await list_documents(status=DocumentStatus.COMPLETED, limit=1000)
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
                grouped_docs[parent_name]["chunk_count"] = (grouped_docs[parent_name].get("chunk_count") or 0) + (doc.get("chunk_count") or 0)
                grouped_docs[parent_name]["slice_count"] += 1
                if doc.get("upload_timestamp", "") > grouped_docs[parent_name].get("upload_timestamp", ""):
                    grouped_docs[parent_name]["upload_timestamp"] = doc.get("upload_timestamp")
        
        final_docs = sorted(list(grouped_docs.values()), key=lambda x: x.get("upload_timestamp", ""), reverse=True)
        return {"documents": final_docs}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/cache/invalidate")
async def invalidate_cache():
    if _pipeline and getattr(_pipeline, "_cache", None):
        count = await _pipeline._cache.invalidate_all()
        return {"status": "success", "deleted_entries": count}
    return JSONResponse(status_code=400, content={"error": "Cache disabled"})

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    saved_path = await asyncio.to_thread(sync_save_upload, file.file, file.filename)
    return {"filename": file.filename, "path": str(saved_path)}

# ==============================================================================
# ENTRY POINT
# ==============================================================================
if __name__ == "__main__":
    import logging  # SOTA FIX: Re-inject native module for the runner scope
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)
    
    import uvicorn
    uvicorn.run(
        "server:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        workers=1,
        log_level="warning",
    )