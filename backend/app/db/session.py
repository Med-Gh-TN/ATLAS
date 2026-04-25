import asyncio
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError
from sqlmodel import SQLModel
from app.core.config import settings

# Initialize basic logging for the database session module
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Core asynchronous engine instance
engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI, echo=True, future=True)

async def init_db(max_retries: int = 5, delay_seconds: int = 5):
    """
    Initialize the database connection and schema with resilient retry logic.
    This prevents the application from crashing if the database container is still booting.
    """
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Attempting database connection ({attempt}/{max_retries})...")

            async with engine.begin() as conn:
                # Ensure the pgvector extension exists before any models attempt to use it
                await conn.run_sync(lambda c: c.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector"))

                # Auto-generate schema (Note: Alembic is typically preferred for migrations in production,
                # but this ensures the baseline exists for local development/testing)
                await conn.run_sync(SQLModel.metadata.create_all)

            logger.info("Database connection established and initialized successfully.")
            return  # Exit the retry loop upon success

        except (OperationalError, OSError) as e:
            logger.warning(f"Database connection failed on attempt {attempt}: {e}")
            if attempt == max_retries:
                logger.error("CRITICAL: Maximum database connection retries reached. Backend startup failed.")
                raise e

            logger.info(f"Retrying in {delay_seconds} seconds...")
            await asyncio.sleep(delay_seconds)

async def get_session() -> AsyncSession:
    """
    Dependency injection function for FastAPI endpoints.
    Yields an active database session for the request lifecycle.
    """
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        yield session