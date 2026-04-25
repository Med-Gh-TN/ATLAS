from __future__ import annotations

from dataclasses import dataclass

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
    "POST /v1/forums/posts/{id}/vote": CacheInvalidation(
        endpoint="POST /v1/forums/posts/{id}/vote",
        keys=("leaderboard:*",),
    ),
    "PATCH /v1/admin/contributions/{id}": CacheInvalidation(
        endpoint="PATCH /v1/admin/contributions/{id}",
        keys=("admin_dashboard:*", "leaderboard:*"),
    ),
    "POST /v1/study-groups": CacheInvalidation(
        endpoint="POST /v1/study-groups",
        keys=("user_profile:*",),
    ),
    "POST /v1/study-groups/{id}/join": CacheInvalidation(
        endpoint="POST /v1/study-groups/{id}/join",
        keys=("user_profile:*",),
    ),
    "PATCH /v1/study-groups/{id}/notes": CacheInvalidation(
        endpoint="PATCH /v1/study-groups/{id}/notes",
        keys=("user_profile:*",),
    ),
    "POST /v1/live-sessions": CacheInvalidation(
        endpoint="POST /v1/live-sessions",
        keys=("admin_dashboard:*",),
    ),
    "DELETE /v1/live-sessions/{id}": CacheInvalidation(
        endpoint="DELETE /v1/live-sessions/{id}",
        keys=("admin_dashboard:*",),
    ),
}


async def invalidate_cache_patterns(redis_client: Redis, *patterns: str) -> None:
    for pattern in patterns:
        cursor = "0"
        while cursor != 0:
            cursor, keys = await redis_client.scan(cursor=cursor, match=pattern, count=200)
            if keys:
                await redis_client.delete(*keys)
            if cursor == "0":
                break
