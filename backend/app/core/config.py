import secrets
from typing import List, Union
from pydantic import AnyHttpUrl, EmailStr, validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """
    Application settings and environment variable handling.
    Inherits from Pydantic BaseSettings for automatic environment variable parsing.
    """
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "ATLAS API"
    
    # ==========================================
    # SECURITY
    # ==========================================
    # Use 'openssl rand -hex 32' to generate a secure secret key
    SECRET_KEY: str = "change_this_to_a_secure_random_string" 
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8 # 8 days
    ALGORITHM: str = "HS256"
    
    # ==========================================
    # CORS
    # ==========================================
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = ["http://localhost:3000"]

    @validator("BACKEND_CORS_ORIGINS", pre=True)
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
    SQLALCHEMY_DATABASE_URI: str | None = None

    @validator("SQLALCHEMY_DATABASE_URI", pre=True)
    def assemble_db_connection(cls, v: str | None, values: dict[str, any]) -> str:
        if isinstance(v, str):
            return v
        return f"postgresql+asyncpg://{values.get('POSTGRES_USER')}:{values.get('POSTGRES_PASSWORD')}@{values.get('POSTGRES_SERVER')}/{values.get('POSTGRES_DB')}"

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
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # ==========================================
    # SMTP / EMAIL (Gmail Integration)
    # ==========================================
    SMTP_TLS: bool = True
    SMTP_PORT: int = 587
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_USER: str | None = "med56524755@gmail.com"
    # SMTP_PASSWORD must be a Google "App Password", not your standard Gmail password
    SMTP_PASSWORD: str | None = None 
    EMAILS_FROM_EMAIL: EmailStr | None = "med56524755@gmail.com"
    EMAILS_FROM_NAME: str | None = "ATLAS Platform"
    
    # ==========================================
    # OTP CONFIGURATION
    # ==========================================
    OTP_EXPIRE_MINUTES: int = 10
    OTP_LENGTH: int = 6

    class Config:
        case_sensitive = True
        # Allow environment variables to override these defaults
        env_file = ".env"

settings = Settings()