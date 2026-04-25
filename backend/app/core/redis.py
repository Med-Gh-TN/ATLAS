import logging
from redis import asyncio as aioredis
from typing import AsyncGenerator
from app.core.config import settings

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------
# DEFENSIVE ARCHITECTURE: Connection Pooling
# Using a global connection pool prevents FastAPI from exhausting
# Redis socket connections during high-concurrency exam or RAG traffic.
# -------------------------------------------------------------------

# Construct the Redis URL dynamically based on environment (Railway vs Local)
redis_url = settings.REDIS_URL if settings.REDIS_URL else "redis://localhost:6379/0"

try:
    # Initialize the global connection pool
    redis_pool = aioredis.ConnectionPool.from_url(
        redis_url,
        decode_responses=True,
        max_connections=1000
    )
    logger.info("Core Redis connection pool initialized successfully.")
except Exception as e:
    logger.critical(f"Failed to initialize Core Redis connection pool: {e}")
    redis_pool = None


async def get_redis_client() -> AsyncGenerator[aioredis.Redis, None]:
    """
    FastAPI Dependency Injection for Redis.
    Yields an active Redis client from the global connection pool.
    Automatically closes/returns the connection to the pool after the request lifecycle.
    """
    if not redis_pool:
        logger.error("Redis pool is offline. Dependency injection failed.")
        raise RuntimeError("Redis connection pool is not initialized.")

    client = aioredis.Redis(connection_pool=redis_pool)
    try:
        yield client
    finally:
        # Crucial: Return the connection to the pool to prevent memory leaks
        await client.close()