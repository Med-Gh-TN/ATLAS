"""
 * @file backend/app/main.py
 * @description FastAPI application entrypoint, middleware configuration, and lifespan orchestration.
 * @layer Core Logic
 * @dependencies app.core.config, app.core.logging_config, app.core.exceptions, app.db.session, app.routers.registry
 """

import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# Infrastructure Drivers
from neo4j import AsyncGraphDatabase

from app.core.config import settings
from app.core.logging_config import configure_logging
from app.core.exceptions import install_exception_handlers
from app.db.session import init_db
from app.routers.registry import register_v1_routers

logger = logging.getLogger("app.main")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    DEFENSIVE ARCHITECTURE: US-24 Security Hardening.
    Injects OWASP-recommended HTTP security headers.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if settings.ENVIRONMENT != "development":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), browsing-topics=()"
        )
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    SOTA Lifespan Management:
    Orchestrates the lifecycle of distributed infrastructure.
    """
    # 1. Initialize Telemetry & Relational Database (Postgres)
    configure_logging()
    await init_db()

    # 2. Bootstrap Neo4j Knowledge Graph
    try:
        neo4j_driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
        )
        # Validate connection
        await neo4j_driver.verify_connectivity()
        app.state.neo4j = neo4j_driver
        logger.info("✅ Neo4j Knowledge Graph connected.")
    except Exception as e:
        logger.error(f"CRITICAL: Neo4j offline: {e}")

    # 3. Initialize Redis Infrastructure (Rate Limiting & KV Cache)
    try:
        from fastapi_limiter import FastAPILimiter
        import redis.asyncio as redis

        redis_client = redis.from_url(
            settings.REDIS_URL, encoding="utf-8", decode_responses=True
        )

        redis_cache = redis.from_url(
            settings.REDIS_CACHE_URL, encoding="utf-8", decode_responses=True
        )

        app.state.redis = redis_client
        app.state.redis_cache = redis_cache

        for attempt in range(1, 6):
            try:
                await redis_client.ping()
                await FastAPILimiter.init(redis_client)
                logger.info("✅ Redis pools (Limiter + Cache) initialized.")
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
    if hasattr(app.state, "neo4j"):
        await app.state.neo4j.close()
    if hasattr(app.state, "redis"):
        await app.state.redis.close()
    if hasattr(app.state, "redis_cache"):
        await app.state.redis_cache.close()
    logger.info("Infrastructure teardown complete.")


# FastAPI Application Instance
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/openapi.json",
    lifespan=lifespan,
)
install_exception_handlers(app)

# ── CORS Configuration – explicitly allow both localhost and 127.0.0.1 ──
# Collect allowed origins from settings (includes defaults from config)
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]

# Extend with any additional origins from settings (e.g., comma-separated env var)
settings_origins = getattr(settings, "BACKEND_CORS_ORIGINS", [])
if settings_origins:
    for origin in settings_origins:
        if origin not in allowed_origins:
            allowed_origins.append(origin)

# Use a regex to also match any port variations on localhost/127.0.0.1
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)

register_v1_routers(app)


@app.get(f"{settings.API_V1_STR}/openapi.json", include_in_schema=False)
async def openapi_alias() -> JSONResponse:
    return JSONResponse(app.openapi())


@app.get("/health", tags=["System"])
def health_check():
    """Satisfies container orchestration health probes and frontend checks."""
    return {"status": "active", "version": "v3.0-omni-architect"}