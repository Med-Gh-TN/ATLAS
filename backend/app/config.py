from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    project_name: str = "ATLAS API"
    api_v1_prefix: str = "/v1"
    environment: Literal["development", "testing", "production"] = "development"

    secret_key: str = Field(..., alias="SECRET_KEY")
    jwt_algorithm: str = Field("HS256", alias="ALGORITHM")
    access_token_expire_minutes: int = Field(
        15,
        alias="ACCESS_TOKEN_EXPIRE_MINUTES",
    )
    refresh_token_expire_days: int = Field(7, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    database_url: str = Field(..., alias="DATABASE_URL")
    redis_url: str = Field(..., alias="REDIS_URL")
    redis_cache_url: str = Field(..., alias="REDIS_CACHE_URL")
    celery_broker_url: str = Field(..., alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field(..., alias="CELERY_RESULT_BACKEND")

    qdrant_url: str = Field("http://localhost:6333", alias="QDRANT_URL")
    minio_endpoint: str = Field("localhost:9000", alias="MINIO_ENDPOINT")
    minio_access_key: str = Field(..., alias="MINIO_ACCESS_KEY")
    minio_secret_key: str = Field(..., alias="MINIO_SECRET_KEY")
    minio_bucket_name: str = Field("atlas-documents", alias="MINIO_BUCKET_NAME")
    minio_secure: bool = Field(False, alias="MINIO_SECURE")

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    cohere_api_key: str | None = Field(default=None, alias="COHERE_API_KEY")
    sendgrid_api_key: str | None = Field(default=None, alias="SENDGRID_API_KEY")
    sentry_dsn: str | None = Field(default=None, alias="SENTRY_DSN")

    frontend_origin: AnyHttpUrl = Field(
        "http://localhost:3000",
        alias="FRONTEND_ORIGIN",
    )
    frontend_origin_www: AnyHttpUrl = Field(
        "https://www.atlas.tn",
        alias="FRONTEND_ORIGIN_WWW",
    )
    frontend_origin_root: AnyHttpUrl = Field(
        "https://atlas.tn",
        alias="FRONTEND_ORIGIN_ROOT",
    )

    @property
    def cors_origins(self) -> list[str]:
        origins = [
            str(self.frontend_origin_root),
            str(self.frontend_origin_www),
        ]
        if self.environment != "production":
            origins.append(str(self.frontend_origin))
        return origins


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
