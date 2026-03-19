import secrets
from typing import List, Union, Any
from pydantic import AnyHttpUrl, EmailStr, field_validator, ValidationInfo
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Application settings and environment variable handling.
    Updated for Pydantic v2 strict compliance and Railway.app deployment compatibility.
    """
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "ATLAS API"
    ENVIRONMENT: str = "development"
    
    # ==========================================
    # SECURITY
    # ==========================================
    # OWASP: Strictly prohibit hardcoded defaults for secrets. Must crash if not in .env.
    SECRET_KEY: str 
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8 # 8 days
    ALGORITHM: str = "HS256"
    
    # ==========================================
    # CORS
    # ==========================================
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # ==========================================
    # DATABASE
    # ==========================================
    POSTGRES_SERVER: str = "localhost:5433"
    POSTGRES_USER: str = "atlas_user"
    POSTGRES_PASSWORD: str = "atlas_password"
    POSTGRES_DB: str = "atlas_db"
    
    # Railway injects DATABASE_URL natively.
    DATABASE_URL: str | None = None
    SQLALCHEMY_DATABASE_URI: str | None = None

    @field_validator("SQLALCHEMY_DATABASE_URI", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: str | None, info: ValidationInfo) -> str:
        if isinstance(v, str):
            return v
            
        # 1. Prioritize Railway native DATABASE_URL if available
        db_url = info.data.get("DATABASE_URL")
        if db_url:
            # Enforce asyncpg driver for FastAPI compatibility
            if db_url.startswith("postgresql://"):
                return db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
            return db_url
            
        # 2. Fallback to local Docker setup
        return f"postgresql+asyncpg://{info.data.get('POSTGRES_USER')}:{info.data.get('POSTGRES_PASSWORD')}@{info.data.get('POSTGRES_SERVER')}/{info.data.get('POSTGRES_DB')}"

    # ==========================================
    # MINIO (S3 Compatible Storage)
    # ==========================================
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minio_admin"
    MINIO_SECRET_KEY: str = "minio_password"
    MINIO_BUCKET_NAME: str = "atlas-documents"
    MINIO_SECURE: bool = False

    # ==========================================
    # CELERY & REDIS
    # ==========================================
    # Railway provides REDIS_URL natively
    REDIS_URL: str | None = None
    CELERY_BROKER_URL: str | None = None
    CELERY_RESULT_BACKEND: str | None = None

    @field_validator("CELERY_BROKER_URL", "CELERY_RESULT_BACKEND", mode="before")
    @classmethod
    def assemble_redis_connection(cls, v: str | None, info: ValidationInfo) -> str:
        if isinstance(v, str):
            return v
        # Prioritize Railway REDIS_URL
        redis_url = info.data.get("REDIS_URL")
        if redis_url:
            return redis_url
        return "redis://localhost:6379/0"

    # ==========================================
    # CACHING (US-25 Performance Optimization)
    # ==========================================
    REDIS_CACHE_URL: str | None = None
    
    # TTL definitions in seconds for deterministic Redis expiry
    CACHE_TTL_SEARCH: int = 300       # 5 minutes
    CACHE_TTL_PROFILE: int = 1800     # 30 minutes
    CACHE_TTL_COURSE: int = 3600      # 1 hour

    @field_validator("REDIS_CACHE_URL", mode="before")
    @classmethod
    def assemble_redis_cache_url(cls, v: str | None, info: ValidationInfo) -> str:
        if isinstance(v, str):
            return v
        # Prioritize Railway REDIS_URL but route to db 1 to avoid Celery state collisions
        redis_url = info.data.get("REDIS_URL")
        if redis_url:
            # If standard URL is provided, append or replace DB index if necessary
            # For simplicity in local dev, we default to db 1. 
            return redis_url
        return "redis://localhost:6379/1"

    # ==========================================
    # OCR & DOCUMENT PROCESSING (US-07)
    # ==========================================
    OCR_QUALITY_ALERT_THRESHOLD: float = 50.0
    ADMIN_ALERT_EMAIL: EmailStr | None = None

    # ==========================================
    # SMTP / EMAIL (Gmail Integration)
    # ==========================================
    SMTP_TLS: bool = True
    SMTP_PORT: int = 587
    SMTP_HOST: str = "smtp.gmail.com"
    # Stripped hardcoded production values
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None 
    EMAILS_FROM_EMAIL: str | None = None
    EMAILS_FROM_NAME: str = "ATLAS Platform"
    
    # ==========================================
    # OTP CONFIGURATION
    # ==========================================
    # Activation & General OTP Limits
    OTP_EXPIRE_MINUTES: int = 1440
    OTP_LENGTH: int = 6
    
    # US-04: Strict limits for Password Recovery
    PASSWORD_RESET_OTP_EXPIRE_MINUTES: int = 15
    PASSWORD_RESET_MAX_ATTEMPTS: int = 3
    
    # US-05: Strict limits for Teacher Onboarding
    TEACHER_OTP_EXPIRE_MINUTES: int = 2880

    # ==========================================
    # LLM & RAG PIPELINE (US-13)
    # ==========================================
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    GROQ_API_KEY: str | None = None

    # Pydantic v2 standard configuration block
    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore" # Prevents crashes when Railway injects unrelated env vars (e.g., PORT)
    )

settings = Settings()