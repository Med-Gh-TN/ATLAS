"""
@file telemetry.py
@description Centralized logging, Rich console formatting, and live WebSocket telemetry state.
@layer Side Effect
@dependencies asyncio, logging, fastapi, rich
"""

import asyncio
import logging
from typing import Optional, Set

from fastapi import WebSocket
from rich.console import Console
from rich.logging import RichHandler
from rich.text import Text
from rich.theme import Theme
from rich.progress import (
    BarColumn, Progress, SpinnerColumn,
    TaskProgressColumn, TextColumn, TimeElapsedColumn,
)

# ── SHARED STATE ─────────────────────────────────────────────────────────────
active_websockets: Set[WebSocket] = set()
MAIN_LOOP: Optional[asyncio.AbstractEventLoop] = None

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

# ── RICH CONSOLE & LOGGING ───────────────────────────────────────────────────
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
                    
        message = {
            "type": "log", 
            "level": record.levelname, 
            "msg": clean_entry, 
            "meta": meta
        }
        
        for ws in list(active_websockets):
            try:
                asyncio.run_coroutine_threadsafe(ws.send_json(message), MAIN_LOOP)
            except Exception:
                pass

logger.addHandler(WebSocketLogHandler())


def make_progress() -> Progress:
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