"""
src/presentation/cli.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Interactive Terminal Interface (v5.2)

Architecture: Pure Presentation Layer.
Delegates all business logic to the headless HybridRAGPipeline.
Resolves the rich.live nested display constraints by managing a single
top-level progress context, allowing the orchestrator to emit logs freely.

v5.2 - Added OS-level hard exit to prevent C-extension zombie thread hangs.
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────────────
# MEMORY & PATH CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "4")

# Resolve paths to allow importing from src/ and RAG-Anything/
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "RAG-Anything"))
sys.path.insert(0, str(PROJECT_ROOT / "src"))

# ──────────────────────────────────────────────────────────────────────────────
# RICH TUI CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────
from rich.console import Console
from rich.logging import RichHandler
from rich.progress import (
    BarColumn,
    Progress,
    SpinnerColumn,
    TaskProgressColumn,
    TextColumn,
    TimeElapsedColumn,
)
from rich.theme import Theme

_CONSOLE_THEME = Theme({
    "progress.description": "bold cyan",
    "progress.percentage":  "bold green",
    "bar.complete":         "green",
    "bar.finished":         "bright_green",
    "bar.pulse":            "cyan",
})
console = Console(theme=_CONSOLE_THEME)

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[
        RichHandler(
            console=console,
            rich_tracebacks=True,
            show_path=False,
            markup=True,
        )
    ],
)
logger = logging.getLogger("CLI")

# ──────────────────────────────────────────────────────────────────────────────
# DOMAIN IMPORTS
# ──────────────────────────────────────────────────────────────────────────────
try:
    from orchestrator import HybridRAGPipeline
    from pdf_worker import sync_slice_pdf
except ImportError as e:
    logger.error(f"Failed to import domain modules. Ensure running from project root. {e}")
    sys.exit(1)


def _make_progress() -> Progress:
    """Returns a configured Rich Progress instance for sliced document ingestion."""
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


async def interactive_loop() -> None:
    """Main interactive terminal loop."""
    llm_model     = os.getenv("GEMINI_MODEL_NAME",   "UNKNOWN")
    embed_model   = os.getenv("EMBEDDER_MODEL_NAME", "UNKNOWN")
    embed_dim     = os.getenv("EMBEDDING_DIMENSION",  "UNKNOWN")
    qdrant_target = os.getenv("QDRANT_URL") or os.getenv("QDRANT_PATH") or "UNCONFIGURED"
    max_pages     = os.getenv("MAX_PAGES_PER_SLICE", "5")

    console.print("\n" + "=" * 70, style="bold blue")
    console.print(" 🧠 OMNI-ARCHITECT SOTA RAG TERMINAL (v5.2) ", style="bold white on blue")
    console.print("=" * 70, style="bold blue")
    console.print(f" [LLM]        : {llm_model}")
    console.print(f" [Embedder]   : {embed_model} (dim={embed_dim}, MaxSim + BM25-IDF)")
    console.print(f" [VectorDB]   : {qdrant_target}")
    console.print(f" [Fusion]     : Dual-Level Graph ∥ Vector → Secondary RRF (k=60)")
    console.print(f" [Degradation]: Tier 1 Hybrid / Tier 2 Vector+Corrective / Tier 3 Empty")
    console.print(f" [Slice Limit]: {max_pages} pages/slice")
    console.print(f" [Namespace]  : Per-document KG + Qdrant isolation")
    console.print("-" * 70, style="dim")
    console.print("   [cyan]/ingest <path>[/]       — Full pipeline: OCR → chunk → tag → embed")
    console.print("   [cyan]/ingest <path> --vlm[/] — Force VLM OCR (handwritten PDFs)")
    console.print("   [cyan]/query  <text>[/]       — Route → expand → dual-fuse → synthesize")
    console.print("   [cyan]/exit[/]                — Graceful shutdown")
    console.print("=" * 70 + "\n", style="bold blue")

    pipeline = HybridRAGPipeline()
    await pipeline.initialize()

    max_pages_per_slice = int(max_pages)
    loop = asyncio.get_running_loop()

    try:
        while True:
            try:
                user_input = await loop.run_in_executor(None, input, "Omni-RAG> ")
            except (EOFError, KeyboardInterrupt):
                # Break loop instantly on Ctrl+C at the prompt
                break

            user_input = user_input.strip()
            if not user_input:
                continue
            if user_input.lower() in ("/exit", "/quit"):
                break

            # ── INGEST COMMAND ────────────────────────────────────────────────
            if user_input.startswith("/ingest "):
                parts     = user_input[8:].strip().split()
                force_vlm = "--vlm" in parts
                file_path = " ".join(p for p in parts if p != "--vlm")
                source    = Path(file_path)
                
                if not source.exists():
                    logger.error(f"CLI: File not found — {source.resolve()}")
                    continue

                from pypdf import PdfReader
                try:
                    total_pages = len(PdfReader(str(source)).pages)
                except Exception as e:
                    logger.error(f"CLI: Failed to read PDF {source.name}: {e}")
                    continue

                if total_pages <= max_pages_per_slice:
                    # Single pass - use simple status spinner
                    with console.status(f"[bold cyan]Ingesting {source.name}...") as status:
                        summary = await pipeline.ingest(
                            str(source.resolve()),
                            force_vlm_ocr=force_vlm if force_vlm else None,
                        )
                else:
                    # Multi-slice pass - use tracked progress bar
                    slice_paths = await asyncio.to_thread(
                        sync_slice_pdf, str(source.resolve()), max_pages_per_slice
                    )
                    summary = {"total_chunks": 0, "distribution": {}}

                    with _make_progress() as slice_progress:
                        slice_task = slice_progress.add_task(
                            f"[bold blue]Slicing {source.name}",
                            total=len(slice_paths),
                        )
                        for i, sp in enumerate(slice_paths):
                            slice_progress.update(
                                slice_task,
                                description=f"[bold blue]Slice {i + 1}/{len(slice_paths)}: [dim]{Path(sp).name}"
                            )
                            s = await pipeline.ingest(
                                sp,
                                force_vlm_ocr=force_vlm if force_vlm else None,
                            )
                            summary["total_chunks"] += s.get("total_chunks", 0)
                            for ct, count in s.get("distribution", {}).items():
                                summary["distribution"][ct] = summary["distribution"].get(ct, 0) + count
                            slice_progress.advance(slice_task)

                console.print(f"\n[bold green]✅ Ingestion complete:[/] {summary}\n")

            # ── QUERY COMMAND ─────────────────────────────────────────────────
            elif user_input.startswith("/query "):
                question = user_input[7:].strip()
                if not question:
                    continue
                
                with console.status("[bold cyan]Synthesizing response..."):
                    result = await pipeline.query(question)
                    
                console.print("\n" + "-" * 65)
                console.print(" [bold]SYNTHESIZED RESPONSE[/]")
                console.print("-" * 65)
                console.print(result["answer"])
                console.print(
                    f"\n[dim][Telemetry] route={result['route']} | "
                    f"chunks={len(result['chunks'])} | "
                    f"retrieval={result['retrieval_latency_ms']}ms | "
                    f"total={result['total_latency_ms']}ms | "
                    f"prompt_tok={result['prompt_tokens']} | "
                    f"completion_tok={result['completion_tokens']}[/dim]"
                )
                console.print("-" * 65 + "\n")

            else:
                logger.warning("CLI: Unknown command. Use /ingest, /query, or /exit.")

    finally:
        await pipeline.shutdown()


if __name__ == "__main__":
    # Suppress verbose asyncio loop closed warnings
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)
    
    try:
        asyncio.run(interactive_loop())
        # Normal exit: Hard kill to prevent C-extension thread hangs after graceful shutdown
        os._exit(0)
    except KeyboardInterrupt:
        # Dirty exit: Hard kill to immediately terminate zombie threads
        console.print("\n[bold red]Force quit detected (Ctrl+C). Terminating background threads...[/]")
        os._exit(1)