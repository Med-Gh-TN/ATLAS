import os
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import meilisearch
from meilisearch.errors import MeilisearchApiError

from app.core.config import settings
from app.core.logging_config import configure_logging
from app.api.v1.endpoints import auth, upload, search, moderation, admin, rag, study, quiz, notifications
from app.db.session import init_db

logger = logging.getLogger(__name__)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    DEFENSIVE ARCHITECTURE: US-24 Security Hardening.
    Injects OWASP-recommended HTTP security headers into every response to mitigate
    XSS, clickjacking, MIME-sniffing, and enforce strict transport security.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Enforce HTTPS (HSTS) - 1 year max age, including subdomains
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        # Prevent Clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Control referrer information sent to other sites
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Restrict powerful browser features
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=(), browsing-topics=()"
        # Legacy XSS protection for older browsers
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Asynchronous context manager for FastAPI lifecycle events.
    Handles startup and shutdown of database, Redis connections, and Search indices cleanly.
    """
    # Initialize Core Services
    configure_logging()
    await init_db()
    
    # ==========================================
    # Bootstrapping Meilisearch (US-09 Architecture Hardening)
    # ==========================================
    try:
        # Cross-reference .env and search.py variable naming conventions defensively
        meili_url = os.getenv("MEILI_HOST", os.getenv("MEILI_URL", "http://localhost:7700"))
        meili_key = os.getenv("MEILI_MASTER_KEY", "meili_master_key")
        meili_client = meilisearch.Client(meili_url, meili_key)
        
        # This atomic action automatically creates the index if it does not exist
        # AND configures the strict attributes required for faceted search.
        task = meili_client.index("documents").update_filterable_attributes([
            "level",
            "academic_year",
            "course_type",
            "language",
            "is_official"
        ])
        logger.info(f"Meilisearch index 'documents' bootstrapped with filterable attributes. Task: {task.task_uid}")
    except Exception as e:
        logger.error(f"CRITICAL: Failed to bootstrap Meilisearch: {e}")

    # ==========================================
    # Initialize Redis Rate Limiter, Auth Blacklist, and Cache
    # ==========================================
    try:
        from fastapi_limiter import FastAPILimiter
        import redis.asyncio as redis
        
        # Original pool for limiter and auth
        redis_client = redis.from_url(
            settings.CELERY_BROKER_URL, 
            encoding="utf-8", 
            decode_responses=True
        )
        
        # US-25: Dedicated Cache Redis Pool to prevent state collisions
        redis_cache = redis.from_url(
            settings.REDIS_CACHE_URL,
            encoding="utf-8",
            decode_responses=True
        )
        
        # DEFENSIVE ARCHITECTURE: Attach Redis to app state IMMEDIATELY.
        # This ensures auth endpoints have access to the client even if the rate limiter throws an error.
        app.state.redis = redis_client
        app.state.redis_cache = redis_cache
        
        # Resilient Startup Logic for Redis
        for attempt in range(1, 6):
            try:
                await redis_client.ping()
                await FastAPILimiter.init(redis_client)
                logger.info("FastAPILimiter and Global Redis clients initialized successfully.")
                break
            except Exception as e:
                if attempt == 5:
                    logger.error(f"CRITICAL: Redis/Rate Limiter failed to initialize after 5 attempts: {e}")
                    break
                logger.warning(f"Waiting for Redis container... (Attempt {attempt}/5)")
                await asyncio.sleep(2)
                
    except Exception as e:
        # DEFENSIVE ARCHITECTURE: Never swallow infrastructure exceptions silently.
        logger.error(f"CRITICAL: Failed to initialize Redis infrastructure: {e}")
        # Application is allowed to start, but rate limiting, token revocation, and caching will be degraded/fail.

    yield  # Application serves requests here
    
    # Teardown logic
    logger.info("Initiating application shutdown sequence...")
    if hasattr(app.state, "redis"):
        await app.state.redis.close()
    if hasattr(app.state, "redis_cache"):
        await app.state.redis_cache.close()
        logger.info("Redis connections closed.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Secure CORS Middleware
# Falls back to a restrictive setup if BACKEND_CORS_ORIGINS is not explicitly defined.
# Note: allow_credentials=True strictly requires explicit origins (no wildcards '*').
allowed_origins = getattr(settings, "BACKEND_CORS_ORIGINS", ["http://localhost:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach Security Headers Middleware
# Executed after CORS middleware to ensure security headers are present even on rejected CORS requests.
app.add_middleware(SecurityHeadersMiddleware)

# US-25: Performance Optimization - Gzip Compression
# Injected with a strict 1000 byte minimum to prevent CPU thrashing on micro-payloads.
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Router Inclusions
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(upload.router, prefix=f"{settings.API_V1_STR}/contributions", tags=["contributions"])
app.include_router(search.router, prefix=f"{settings.API_V1_STR}", tags=["search"])
app.include_router(moderation.router, prefix=f"{settings.API_V1_STR}", tags=["moderation"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"])
app.include_router(rag.router, prefix=f"{settings.API_V1_STR}/rag", tags=["rag"])
app.include_router(study.router, prefix=f"{settings.API_V1_STR}/study", tags=["study"])
app.include_router(quiz.router, prefix=f"{settings.API_V1_STR}/quiz", tags=["quiz"])
app.include_router(notifications.router, prefix=f"{settings.API_V1_STR}/notifications", tags=["notifications"])

@app.get("/health", tags=["health"])
def health_check():
    """
    Basic health check endpoint to satisfy container orchestration (e.g., Railway/Docker).
    Returns 200 OK if the web server is responsive.
    """
    return {"status": "ok"}