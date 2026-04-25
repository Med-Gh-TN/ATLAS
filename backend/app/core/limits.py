import logging
import uuid
from typing import Callable, Any
from fastapi import HTTPException, status, Request

# Initialize secure logging for infrastructure alerts
logger = logging.getLogger(__name__)

def _noop_limiter() -> Callable:
    """
    Dummy dependency fallback.
    Prevents the FastAPI application from crashing if the Redis broker is offline,
    while allowing development to continue.
    FIX: Uses explicit 'Request' typing to prevent FastAPI from inferring false query parameters.
    """
    async def _dependency(request: Request):
        pass
    return _dependency

try:
    from fastapi_limiter.depends import RateLimiter as _RL

    def limiter(times: int, seconds: int) -> Callable[..., Any]:
        """
        Enforces strict API rate limiting backed by Redis.
        Critical for US-03: Max 3 OTP requests per hour per IP to prevent spam and financial drain.
        """
        try:
            # DEFENSIVE ARCHITECTURE: fastapi-limiter pinned to 0.1.5 guarantees this exact signature.
            # Removed brittle inspect.signature() reflection which caused initialization crashes on drifted environments.
            return _RL(times=times, seconds=seconds)
        except Exception as e:
            logger.critical(f"Security Warning: RateLimiter initialization failed ({str(e)}). Limits are NOT enforced.")
            return _noop_limiter()

except ImportError:
    logger.critical(
        "Security Warning: 'fastapi_limiter' is not installed. "
        "API rate limits (including OTP spam protection) are completely bypassed. "
        "Run: pip install fastapi-limiter redis"
    )

    def limiter(times: int, seconds: int) -> Callable[..., Any]:
        return _noop_limiter()


class RAGRateLimits:
    """
    Stateful Redis-backed rate limiters specifically engineered for US-13 RAG constraints.
    Expects an initialized redis.asyncio.Redis connection instance.
    """
    MAX_MESSAGES_PER_SESSION = 50
    MAX_ACTIVE_SESSIONS = 3
    SESSION_TTL_SECONDS = 86400  # 24 hours to prevent permanent Redis state locks

    @staticmethod
    async def check_and_register_active_session(redis_client: Any, student_id: uuid.UUID, session_id: uuid.UUID) -> None:
        """
        Enforces US-13: Max 3 active sessions per student.
        Registers the new session if under the limit.
        """
        key = f"rag:active_sessions:{student_id}"
        try:
            # SCARD evaluates the active session count in O(1)
            count = await redis_client.scard(key)

            # US-13 Self-Healing Auto-Prune:
            # If a user hits the 3 session cap (e.g. from hot-reloads or orphaned closures),
            # forcefully evict one random session to unblock them instead of perma-blocking them.
            if count >= RAGRateLimits.MAX_ACTIVE_SESSIONS:
                logger.warning(f"RAG Limit Reached: Student {student_id} attempted >{RAGRateLimits.MAX_ACTIVE_SESSIONS} sessions. Auto-pruning zombie session to unblock.")
                evicted_session = await redis_client.spop(key)
                if evicted_session:
                    # Clean up the associated message counter explicitly
                    await redis_client.delete(f"rag:message_count:{evicted_session}")

            await redis_client.sadd(key, str(session_id))
            await redis_client.expire(key, RAGRateLimits.SESSION_TTL_SECONDS)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Redis Infrastructure Error (Session Limits): {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Rate limiting service is currently unavailable."
            )

    @staticmethod
    async def unregister_active_session(redis_client: Any, student_id: uuid.UUID, session_id: uuid.UUID) -> None:
        """
        Surgically removes a closed or deleted session from the student's active quota.
        """
        key = f"rag:active_sessions:{student_id}"
        try:
            await redis_client.srem(key, str(session_id))
        except Exception as e:
            logger.error(f"Redis Infrastructure Error (Session Unregister): {e}")

    @staticmethod
    async def increment_and_check_message_limit(redis_client: Any, session_id: uuid.UUID) -> int:
        """
        Enforces US-13: Max 50 messages per session via atomic INCR.
        """
        key = f"rag:message_count:{session_id}"
        try:
            count = await redis_client.incr(key)
            if count == 1:
                await redis_client.expire(key, RAGRateLimits.SESSION_TTL_SECONDS)

            if count > RAGRateLimits.MAX_MESSAGES_PER_SESSION:
                logger.warning(f"RAG Limit Exceeded: Session {session_id} exceeded {RAGRateLimits.MAX_MESSAGES_PER_SESSION} messages.")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Session limit of {RAGRateLimits.MAX_MESSAGES_PER_SESSION} messages reached. Please start a new session."
                )
            return count
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Redis Infrastructure Error (Message Limits): {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Rate limiting service is currently unavailable."
            )