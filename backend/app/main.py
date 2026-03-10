from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging_config import configure_logging
from app.api.v1.endpoints import auth, upload, search, moderation, admin
from app.db.session import init_db

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Explicitly set for debugging
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(upload.router, prefix=f"{settings.API_V1_STR}/contributions", tags=["contributions"])
app.include_router(search.router, prefix=f"{settings.API_V1_STR}", tags=["search"])
app.include_router(moderation.router, prefix=f"{settings.API_V1_STR}", tags=["moderation"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}", tags=["admin"])

@app.on_event("startup")
async def on_startup():
    configure_logging()
    try:
        from fastapi_limiter import FastAPILimiter
        from redis.asyncio import from_url as redis_from_url
        redis = redis_from_url(settings.CELERY_BROKER_URL, encoding="utf-8", decode_responses=True)
        await FastAPILimiter.init(redis)
    except Exception:
        pass
    await init_db()

@app.get("/health")
def health_check():
    return {"status": "ok"}
