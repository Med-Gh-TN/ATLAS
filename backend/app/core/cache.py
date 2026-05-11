from __future__ import annotations

from dataclasses import dataclass
import random

from redis.asyncio import Redis


CACHE_TTL: dict[str, int] = {
    "course_meta": 300,
    "search_autocomplete": 300,
    "leaderboard": 60,
    "admin_dashboard": 60,
    "user_profile": 120,
}


@dataclass(frozen=True)
class CacheInvalidation:
    endpoint: str
    keys: tuple[str, ...]


WRITE_INVALIDATIONS: dict[str, CacheInvalidation] = {
    "POST /v1/courses/upload": CacheInvalidation(
        endpoint="POST /v1/courses/upload",
        keys=("course_meta:*", "search_autocomplete:*"),
    ),
    "PATCH /v1/courses/{id}": CacheInvalidation(
        endpoint="PATCH /v1/courses/{id}",
        keys=("course_meta:*", "search_autocomplete:*"),
    ),
    "DELETE /v1/courses/{id}": CacheInvalidation(
        endpoint="DELETE /v1/courses/{id}",
        keys=("course_meta:*", "search_autocomplete:*"),
    ),
    "PATCH /v1/flashcards/{id}/review": CacheInvalidation(
        endpoint="PATCH /v1/flashcards/{id}/review",
        keys=("user_profile:*",),
    ),
    "PATCH /v1/admin/contributions/{id}": CacheInvalidation(
        endpoint="PATCH /v1/admin/contributions/{id}",
        keys=("admin_dashboard:*", "leaderboard:*"),
    ),
}


def ttl_with_jitter(base_ttl: int, *, jitter_ratio: float = 0.1) -> int:
    """
    Spread expirations slightly to reduce synchronized cache invalidation bursts.
    """
    if base_ttl <= 0:
        return 1

    jitter_window = max(1, int(base_ttl * jitter_ratio))
    return base_ttl + random.randint(0, jitter_window)


async def invalidate_cache_patterns(redis_client: Redis, *patterns: str) -> None:
    for pattern in patterns:
        cursor = "0"
        while cursor != 0:
            cursor, keys = await redis_client.scan(cursor=cursor, match=pattern, count=200)
            if keys:
                await redis_client.delete(*keys)
            if cursor == "0":
                break