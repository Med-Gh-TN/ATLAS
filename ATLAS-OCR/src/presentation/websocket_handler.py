"""
@file websocket_handler.py
@description Dedicated WebSocket router featuring SOTA async scatter-gather ingestion logic.
@layer Core Logic
@dependencies asyncio, traceback, fastapi, presentation.telemetry, orchestrator
"""

import asyncio
import traceback
import gc
import time
import shutil
import re
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from presentation.telemetry import _stats, active_websockets, console, make_progress, logger
from infrastructure.database import list_documents, DocumentStatus
from services.document_slicer import sync_slice_pdf

router = APIRouter()

_pipeline = None
_GLOBAL_INGEST_LOCK = asyncio.Lock()
MAX_PAGES_PER_SLICE = int(os.getenv("MAX_PAGES_PER_SLICE", "5"))

def set_ws_pipeline(pipeline):
    global _pipeline
    _pipeline = pipeline

async def _send(ws: WebSocket, msg_type: str, msg: str = "", meta: dict = None):
    try:
        await ws.send_json({"type": msg_type, "msg": msg, "meta": meta or {}})
    except Exception:
        pass

@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_websockets.add(ws)
    _stats["active_connections"] += 1
    logger.info(f"[WS] Client connected. Active: [bold cyan]{_stats['active_connections']}[/]")

    try:
        while True:
            data   = await ws.receive_json()
            action = data.get("action", "").lower()

            # ── ACTION: INGEST ─────────────────────────────────────────────
            if action == "ingest":
                file_path = data.get("path", "").strip()
                if not file_path:
                    await _send(ws, "error", "Ingest action requires a 'path' field.")
                    continue
                source = Path(file_path)
                if not source.exists():
                    await _send(ws, "error", f"File not found: {source}")
                    continue
                    
                fvo_payload = data.get("force_vlm_ocr", None)
                force_vlm_ocr = (
                    fvo_payload if isinstance(fvo_payload, bool) 
                    else (fvo_payload.lower() == "true" if isinstance(fvo_payload, str) else None)
                )

                async def run_ingest(src: Path, fvo: Optional[bool]):
                    if _GLOBAL_INGEST_LOCK.locked():
                        await _send(ws, "log", f"Pipeline busy. '{src.name}' queued for processing...")
                        logger.info(f"[Ingest] '{src.name}' placed in ingestion queue.")

                    async with _GLOBAL_INGEST_LOCK:
                        _stats["ingestions_attempted"] += 1
                        slices_dir: Optional[Path] = None
                        try:
                            # ── SOTA AUTONOMOUS VISION FALLBACK ──
                            if fvo is None or fvo is False:
                                from services.vision_renderer import detect_handwriting_risk
                                logger.info(f"[Ingest] Probing '{src.name}' for multimodal/scan risk...")
                                is_scan = await asyncio.to_thread(detect_handwriting_risk, str(src))
                                if is_scan:
                                    fvo = True
                                    await _send(ws, "log", f"⚠️ Low text density detected in {src.name}. Engaging Sovereign VLM OCR bypass.")
                                    logger.info(f"[Ingest] Sovereign VLM bypass autonomously engaged for '{src.name}'.")
                            
                            import fitz
                            doc = fitz.open(str(src))
                            total_pages = len(doc)
                            doc.close()
                            del doc
                            gc.collect()

                            logger.info(f"[Ingest] [bold white]'{src.name}'[/] — [magenta]{total_pages}[/] pages.")
                            if fvo is True:
                                _stats["vlm_ocr_ingestions"] += 1

                            if total_pages <= MAX_PAGES_PER_SLICE:
                                with console.status(f"[bold cyan]Ingesting {src.name}..."):
                                    summary = await _pipeline.ingest(str(src.resolve()), force_vlm_ocr=fvo)
                            else:
                                logger.info(f"[Ingest] '{src.name}' — large doc, slicing for parallel scatter-gather...")
                                slice_paths = await asyncio.to_thread(
                                    sync_slice_pdf, str(src.resolve()), MAX_PAGES_PER_SLICE
                                )
                                if slice_paths:
                                    slices_dir = Path(slice_paths[0]).parent
                                
                                summary = {
                                    "file": src.name, "total_chunks": 0,
                                    "distribution": {}, "status": "success", "ocr_mode": "docling",
                                }
                                
                                # ── SOTA FIX: ASYNC SCATTER-GATHER INGESTION ──
                                slice_concurrency = 3  # Process 3 slices concurrently
                                slice_sem = asyncio.Semaphore(slice_concurrency)
                                
                                async def process_slice_task(s_path: str):
                                    async with slice_sem:
                                        return await _pipeline.ingest(s_path, force_vlm_ocr=fvo)

                                with make_progress() as slice_progress:
                                    s_task = slice_progress.add_task(
                                        f"[bold blue]Parallel Ingestion: {src.name}", total=len(slice_paths)
                                    )
                                    
                                    # Launch all slice tasks concurrently
                                    tasks = [process_slice_task(sp) for sp in slice_paths]
                                    
                                    # Reduce results as they complete
                                    for coro in asyncio.as_completed(tasks):
                                        slice_summary = await coro
                                        if slice_summary:
                                            summary["total_chunks"] += slice_summary.get("total_chunks", 0)
                                            summary["ocr_mode"]      = slice_summary.get("ocr_mode", "docling")
                                            for ct, count in slice_summary.get("distribution", {}).items():
                                                summary["distribution"][ct] = summary["distribution"].get(ct, 0) + count
                                        slice_progress.advance(s_task)

                            _stats["ingestions_succeeded"] += 1
                            doc_uuid = summary.get("doc_uuid", "")
                            await _send(
                                ws, "upload_complete",
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
                            await _send(ws, "error", f"Ingestion of '{src.name}' failed: {exc}", meta={"traceback": tb})
                        finally:
                            if slices_dir and slices_dir.exists():
                                shutil.rmtree(slices_dir, ignore_errors=True)

                asyncio.create_task(run_ingest(source, force_vlm_ocr))

            # ── ACTION: QUERY ──────────────────────────────────────────────
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

                    if d_uuids and len(d_uuids) == 1:
                        try:
                            target_id = d_uuids[0]
                            all_docs = await list_documents(status=DocumentStatus.COMPLETED, limit=1000)
                            target_doc = next((d for d in all_docs if d["uuid"] == target_id or d.get("original_filename") == target_id), None)
                            
                            if target_doc:
                                orig_name = target_doc.get("original_filename", "")
                                slice_pattern = re.compile(r"^slice_\d{4}_to_\d{4}_(.+)$")
                                match = slice_pattern.match(orig_name)
                                parent_name = match.group(1) if match else orig_name
                                
                                expanded_uuids = [d["uuid"] for d in all_docs if (slice_pattern.match(d.get("original_filename", "")) and slice_pattern.match(d.get("original_filename", "")).group(1) == parent_name) or d.get("original_filename", "") == parent_name]
                                
                                if expanded_uuids:
                                    d_uuids = expanded_uuids
                            else:
                                logger.warning(f"[Query] Could not resolve documentId '{target_id}'.")
                        except Exception as e:
                            logger.error(f"[Query] Sibling expansion failed: {e}")

                    try:
                        await ws.send_json({"type": "llm_span_start", "traceId": trace_id or "pending", "startMs": span_start_ms, "route": "PENDING"})
                    except Exception:
                        pass
                        
                    try:
                        with console.status("[bold cyan]Synthesizing response..."):
                            result = await _pipeline.query(q, trace_id=trace_id, document_uuids=d_uuids)
                            
                        resolved_trace_id = result.get("trace_id", trace_id or "unknown")
                        ui_chunks = [
                            {
                                "id": str(c.get("id", f"chunk_{idx}")),
                                "text": str(c.get("content", c.get("text", str(c)))),
                                "score": float(c.get("score") or 0.0),
                                "source": str(c.get("source", "document")),
                                "page": int(c.get("page") or 1),
                                "content_type": str(c.get("content_type", "TEXT")),
                            } if isinstance(c, dict) else {
                                "id": f"chunk_{idx}", "text": str(c), "score": 0.0, "source": "document", "page": 1, "content_type": "TEXT"
                            } for idx, c in enumerate(result.get("chunks", []))
                        ]

                        try:
                            await ws.send_json({
                                "type": "retrieval_span", "traceId": resolved_trace_id, "chunks": ui_chunks,
                                "topK": len(ui_chunks), "retrievalLatencyMs": int(result.get("retrieval_latency_ms", 0)),
                                "indexSize": result.get("index_size"), "queryVector": "computed",
                            })
                        except Exception: pass

                        p_tok = result.get("prompt_tokens") or getattr(_pipeline.bridge, "last_prompt_tokens", None)
                        c_tok = result.get("completion_tokens") or getattr(_pipeline.bridge, "last_completion_tokens", None)

                        try:
                            await ws.send_json({
                                "type": "llm_span_end", "traceId": resolved_trace_id,
                                "promptTokens": p_tok, "completionTokens": c_tok,
                                "totalLatencyMs": int(result.get("total_latency_ms", 0)),
                                "ttftMs": result.get("ttft_ms"), "route": str(result.get("route", "GRAPH")),
                            })
                        except Exception: pass

                        _stats["queries_succeeded"] += 1
                        await _send(ws, "chat", msg=str(result.get("answer", "")), meta={
                            "route": str(result.get("route", "GRAPH")), "traceId": resolved_trace_id,
                            "expandedQuery": str(result.get("expanded_query", "")), "cacheHit": bool(result.get("cache_hit", False)),
                            "domain": str(result.get("domain", "UNKNOWN")), "hydeText": str(result.get("hyde_text", "")),
                            "decomposedQueries": result.get("decomposed_queries", []),
                        })
                        logger.info(f"[Query] [bold green]Complete[/] — traceId={resolved_trace_id} | total={result.get('total_latency_ms')}ms")
                    except Exception as exc:
                        _stats["queries_failed"] += 1
                        tb = traceback.format_exc()
                        logger.error(f"[Query] [bold red]FATAL:[/] {exc}\n{tb}")
                        await _send(ws, "error", f"Query failed: {exc}", meta={"traceback": tb, "traceId": trace_id or "unknown"})

                asyncio.create_task(run_query(question, client_trace_id, document_uuids))

            # ── ACTION: STATS ──────────────────────────────────────────────
            elif action == "stats":
                live_stats = dict(_stats)
                if _pipeline and _pipeline.bridge:
                    live_stats["rpd_used_today"] = getattr(_pipeline.bridge, "_rpd_counter", 0)
                    live_stats["rpd_soft_limit"] = getattr(_pipeline.bridge, "_rpd_soft_limit", 400)
                await _send(ws, "stats", "Live telemetry snapshot.", meta=live_stats)

            elif action == "invalidate_cache":
                if _pipeline and getattr(_pipeline, "_cache", None):
                    count = await _pipeline._cache.invalidate_all()
                    await _send(ws, "log", f"Semantic Cache invalidated. {count} entries removed.")
                else:
                    await _send(ws, "error", "Semantic cache is not active.")

            else:
                await _send(ws, "error", f"Unknown action '{action}'. Valid: ingest | query | stats | invalidate_cache.")

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error(f"[WS] Unexpected error: {exc}")
        logger.error(traceback.format_exc())
    finally:
        active_websockets.discard(ws)
        _stats["active_connections"] = max(0, _stats["active_connections"] - 1)
        logger.info(f"[WS] Client disconnected. Active: [bold cyan]{_stats['active_connections']}[/]")