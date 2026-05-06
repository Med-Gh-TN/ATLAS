"""
@file backend/app/routers/health.py
@description Health check endpoints for container orchestration and status monitoring.
@layer Core Logic
@dependencies None
"""

from __future__ import annotations

import time
import logging

from fastapi import APIRouter, Request

router = APIRouter(tags=["Health"])
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check(request: Request) -> dict[str, object]:
    started = time.perf_counter()

    services = {
        "db": "ok",
        "redis": "ok",
        "storage": "ok",
    }

    if not hasattr(request.app.state, "redis"):
        services["redis"] = "degraded"
    if not hasattr(request.app.state, "redis_cache"):
        services["redis"] = "degraded"

    latency_ms = round((time.perf_counter() - started) * 1000, 2)

    return {
        "status": "ok" if all(value == "ok" for value in services.values()) else "degraded",
        "services": services,
        "latency_ms": latency_ms,
    }