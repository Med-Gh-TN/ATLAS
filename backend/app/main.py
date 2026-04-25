"""
ATLAS API: Main Entry Point
Architecture: SOTA Modular Monolith (Lego Blocks)
Lifespan: Handles resilient infrastructure bootstrapping (DB, Redis, Meilisearch)
Security: OWASP-Hardened via custom Middleware and strict CORS
"""

import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import meilisearch

from app.core.config import settings
from app.core.logging_config import configure_logging
from app.core.exceptions import install_exception_handlers
from app.db.session import init_db
from app.routers.registry import register_v1_routers

# ARCHITECTURAL FIX: Unified Domain-Driven Router Inclusions
from app.api.v1.endpoints import (
    auth,
    contributions,
    search,
    moderation,
    admin,
    rag,
    study,
    notifications,
    gamification,
    dashboard,
    annotations,
    files,
    ai,
    intelligence,
)

logger = logging.getLogger("app.main")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    DEFENSIVE ARCHITECTURE: US-24 Security Hardening.
    Injects OWASP-recommended HTTP security headers.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Enforce HTTPS (HSTS)
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
        # Prevent Clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Restrict powerful browser features
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), browsing-topics=()"
        )
        # Legacy XSS protection
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    SOTA Lifespan Management:
    Orchestrates the lifecycle of distributed infrastructure.
    """
    # 1. Initialize Telemetry & Database
    configure_logging()
    await init_db()

    # 2. Bootstrap Meilisearch (Centralized Config Alignment)
    try:
        # Resolve from settings to ensure environment parity
        meili_url = getattr(settings, "MEILI_URL", "http://localhost:7700")
        meili_key = getattr(settings, "MEILI_MASTER_KEY", "meili_master_key")
        meili_client = meilisearch.Client(meili_url, meili_key)

        # Configure faceted search attributes for the 'documents' index
        task = meili_client.index("documents").update_filterable_attributes(
            ["level", "academic_year", "course_type", "language", "is_official"]
        )
        logger.info(f"Meilisearch index bootstrapped. Task: {task.task_uid}")
    except Exception as e:
        logger.error(f"CRITICAL: Failed to bootstrap Search Engine: {e}")

    # 3. Initialize Redis Infrastructure (Rate Limiting & Multi-Tenant Caching)
    try:
        from fastapi_limiter import FastAPILimiter
        import redis.asyncio as redis

        # Connection Pool 1: Identity & Rate Limiting
        redis_client = redis.from_url(
            settings.CELERY_BROKER_URL, encoding="utf-8", decode_responses=True
        )

        # Connection Pool 2: Dedicated Cache (US-25)
        redis_cache = redis.from_url(
            settings.REDIS_CACHE_URL, encoding="utf-8", decode_responses=True
        )

        # Attach to app state for library compatibility (FastAPILimiter)
        app.state.redis = redis_client
        app.state.redis_cache = redis_cache

        # Resilient Retry Logic for Container Orchestration
        for attempt in range(1, 6):
            try:
                await redis_client.ping()
                await FastAPILimiter.init(redis_client)
                logger.info("Distributed Redis pools (Limiter + Cache) initialized.")
                break
            except Exception as e:
                if attempt == 5:
                    logger.error(f"CRITICAL: Redis failed after 5 retries: {e}")
                    break
                logger.warning(f"Redis not reachable. Retrying ({attempt}/5)...")
                await asyncio.sleep(2)

    except Exception as e:
        logger.error(f"CRITICAL: Redis Infrastructure offline: {e}")

    yield  # --- Serving Requests ---

    # 4. Graceful Shutdown Sequence
    logger.info("Shutting down infrastructure...")
    if hasattr(app.state, "redis"):
        await app.state.redis.close()
    if hasattr(app.state, "redis_cache"):
        await app.state.redis_cache.close()
    logger.info("Infrastructure teardown complete.")


# FastAPI Application Instance
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)
install_exception_handlers(app)

# CORS Configuration (Strict Environment Gating)
allowed_origins = getattr(settings, "BACKEND_CORS_ORIGINS", ["http://localhost:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ==========================================
# LEGO ROUTER REGISTRY
# ==========================================
# Mount all refactored domain routers. Prefixes are managed here centrally.
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Identity"])
app.include_router(
    contributions.router,
    prefix=f"{settings.API_V1_STR}/contributions",
    tags=["Contributions"],
)
app.include_router(
    search.router, prefix=f"{settings.API_V1_STR}/search", tags=["Search"]
)
app.include_router(
    moderation.router, prefix=f"{settings.API_V1_STR}/moderation", tags=["Moderation"]
)
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin"])
app.include_router(rag.router, prefix=f"{settings.API_V1_STR}/rag", tags=["AI Engine"])
app.include_router(
    study.router, prefix=f"{settings.API_V1_STR}/study", tags=["Study Tools"]
)
app.include_router(
    notifications.router,
    prefix=f"{settings.API_V1_STR}/notifications",
    tags=["Notifications"],
)
app.include_router(
    gamification.router,
    prefix=f"{settings.API_V1_STR}/gamification",
    tags=["Gamification"],
)
app.include_router(
    dashboard.router, prefix=f"{settings.API_V1_STR}/dashboard", tags=["Analytics"]
)
app.include_router(
    annotations.router,
    prefix=f"{settings.API_V1_STR}/annotations",
    tags=["Collaboration"],
)
app.include_router(
    files.router, prefix=f"{settings.API_V1_STR}/files", tags=["Storage"]
)
app.include_router(ai.router, prefix=f"{settings.API_V1_STR}/ai", tags=["AI Command"])
app.include_router(
    intelligence.router,
    prefix=f"{settings.API_V1_STR}/intelligence",
    tags=["User Intelligence"],
)
register_v1_routers(app)


@app.get("/health", tags=["System"])
def health_check():
    """Satisfies container orchestration health probes."""
    return {"status": "active", "version": "1.2.0-modular"}
