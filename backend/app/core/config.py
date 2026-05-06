import secrets
from typing import List, Union
from pydantic import AnyHttpUrl, EmailStr, field_validator, ValidationInfo
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

class Settings(BaseSettings):
    """
    Application settings, strictly refactored to support Omni-Architect.
    Legacy Celery, MinIO, and MeiliSearch bindings have been eradicated.
    """
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "ATLAS API (Omni-Architect)"
    ENVIRONMENT: str = "development"
    
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    TEMPLATES_DIR: Path = BASE_DIR / "templates" / "emails"
    
    SECRET_KEY: str 
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    ALGORITHM: str = "HS256"
    
    # ══════════════════════════════════════════════════════════════
    # CORS Origins – field MUST be declared before its validator
    # ══════════════════════════════════════════════════════════════
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            defaults = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]
            if isinstance(v, list):
                for d in defaults:
                    if d not in v:
                        v.append(d)
            return v
        raise ValueError(v)

    # ==========================================
    # RELATIONAL DATABASE (Postgres)
    # ==========================================
    POSTGRES_SERVER: str = "localhost:5433"
    POSTGRES_USER: str = "atlas_user"
    POSTGRES_PASSWORD: str = "atlas_password"
    POSTGRES_DB: str = "atlas_db"
    DATABASE_URL: str | None = None
    SQLALCHEMY_DATABASE_URI: str | None = None

    @field_validator("SQLALCHEMY_DATABASE_URI", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: str | None, info: ValidationInfo) -> str:
        if isinstance(v, str):
            return v
        db_url = info.data.get("DATABASE_URL")
        if db_url:
            if db_url.startswith("postgresql://"):
                return db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
            return db_url
        return f"postgresql+asyncpg://{info.data.get('POSTGRES_USER')}:{info.data.get('POSTGRES_PASSWORD')}@{info.data.get('POSTGRES_SERVER')}/{info.data.get('POSTGRES_DB')}"

    # ==========================================
    # OMNI-ARCHITECT PIPELINE RESOURCES
    # ==========================================
    QDRANT_URL: str = "http://localhost:6333"
    
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "atlas_neo4j_secret"
    
    GEMINI_API_KEY: str | None = None
    GOOGLE_AI_FALLBACK_MODEL: str = "gemini-2.0-flash" 

    # ==========================================
    # MEILISEARCH (Unified Search & AI Retrieval)
    # ==========================================
    MEILISEARCH_URL: str = "http://localhost:7700"
    MEILISEARCH_API_KEY: str = "atlas_meili_master_key_change_me"

    # ==========================================
    # CACHING & MEMORY (Redis)
    # ==========================================
    REDIS_URL: str | None = "redis://localhost:6379/0"
    REDIS_CACHE_URL: str | None = "redis://localhost:6379/1"
    
    CACHE_TTL_SEARCH: int = 300
    CACHE_TTL_PROFILE: int = 1800
    CACHE_TTL_COURSE: int = 3600

    # ==========================================
    # GENERAL ADMINISTRATION
    # ==========================================
    ADMIN_ALERT_EMAIL: EmailStr | None = None

    # ==========================================
    # SMTP / EMAIL
    # ==========================================
    SMTP_TLS: bool = True
    SMTP_PORT: int = 587
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None 
    EMAILS_FROM_EMAIL: str | None = None
    EMAILS_FROM_NAME: str = "ATLAS Platform"
    
    # ==========================================
    # OTP CONFIGURATION
    # ==========================================
    OTP_EXPIRE_MINUTES: int = 1440
    OTP_LENGTH: int = 6
    PASSWORD_RESET_OTP_EXPIRE_MINUTES: int = 15
    PASSWORD_RESET_MAX_ATTEMPTS: int = 3
    TEACHER_OTP_EXPIRE_MINUTES: int = 2880

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore" 
    )

settings = Settings()