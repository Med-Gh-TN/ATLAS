import json
import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc
from redis.asyncio import Redis

from app.db.session import get_session
# ARCHITECTURAL FIX: Explicitly import from the me.py dependency provider
from app.api.v1.endpoints.auth.me import get_current_user
from app.models.all_models import User, XPTransaction, UserBadge, Badge
from app.core.redis import get_redis_client

# ARCHITECTURAL FIX: Re-routed to the new Study Engine Bounded Context
from app.services.study_engine import gamification_service

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for Feature telemetry
logger = logging.getLogger("app.api.v1.endpoints.gamification")
router = APIRouter()


@router.get("/profile/me")
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    redis_cache: Redis = Depends(get_redis_client),
):
    """
    Retrieves the gamified profile for the current user.
    Includes XP totals, level progression, and awarded badges.
    Implements a 30-minute write-through cache to reduce DB load on frequent dashboard refreshes.
    """
    cache_key = f"profile:{current_user.id}"

    # 1. Cache Interception
    cached = await redis_cache.get(cache_key)
    if cached:
        return json.loads(cached)

    # 2. Domain Logic Execution (Study Engine)
    await gamification_service.ensure_default_badges(session)
    total_xp = await gamification_service.get_total_xp(session, current_user.id)
    level_info = gamification_service.get_level_for_xp(total_xp)
    await gamification_service.award_badges_for_user(session, current_user.id)

    # 3. Data Aggregation
    badge_rows = (
        await session.execute(
            select(Badge, UserBadge)
            .join(UserBadge, UserBadge.badge_id == Badge.id)
            .where(UserBadge.user_id == current_user.id)
            .order_by(desc(UserBadge.awarded_at))
        )
    ).all()

    badges = [
        {
            "id": str(b.id),
            "code": b.code,
            "name": b.name,
            "description": b.description,
            "icon": b.icon,
            "awarded_at": ub.awarded_at,
        }
        for b, ub in badge_rows
    ]

    payload = {
        "user_id": str(current_user.id),
        "total_xp": total_xp,
        "level": level_info["level"],
        "next_level": level_info["next_level"],
        "next_level_at": level_info["next_at"],
        "badges": badges,
    }

    # 4. Cache Hydration (1800s = 30m)
    await redis_cache.setex(cache_key, 1800, json.dumps(payload, default=str))

    return payload


@router.get("/leaderboard")
async def leaderboard(
    limit: int = 10,
    filiere: str | None = None,
    session: AsyncSession = Depends(get_session),
    redis_cache: Redis = Depends(get_redis_client),
):
    """
    Retrieves global or filiere-specific leaderboards.
    Implements a 5-minute cache to protect against 'Top 10' refresh spam.
    """
    cache_key = f"leaderboard:{filiere or 'all'}:{limit}"

    cached = await redis_cache.get(cache_key)
    if cached:
        return json.loads(cached)

    stmt = (
        select(User, func.coalesce(func.sum(XPTransaction.amount), 0).label("xp"))
        .outerjoin(XPTransaction, XPTransaction.user_id == User.id)
        .group_by(User.id)
        .order_by(desc("xp"))
        .limit(limit)
    )

    if filiere:
        stmt = stmt.where(User.filiere == filiere)

    rows = (await session.execute(stmt)).all()
    payload = [
        {
            "user_id": str(user.id),
            "name": user.full_name or user.email,
            "filiere": user.filiere,
            "xp": int(xp or 0),
        }
        for user, xp in rows
    ]

    # Cache for 5 minutes (Short-lived due to dynamic XP gains)
    await redis_cache.setex(cache_key, 300, json.dumps(payload, default=str))

    return payload


@router.get("/transactions/me")
async def my_transactions(
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves the audit trail of XP transactions for the current user.
    """
    rows = (
        await session.execute(
            select(XPTransaction)
            .where(XPTransaction.user_id == current_user.id)
            .order_by(desc(XPTransaction.created_at))
            .limit(limit)
        )
    ).scalars().all()

    return rows