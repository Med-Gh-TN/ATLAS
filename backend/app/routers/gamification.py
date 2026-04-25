from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.gamification import Badge, UserBadge, XPTransaction
from app.models.user import User
from app.services.study_engine import gamification_service


router = APIRouter(tags=["Gamification"])


@router.get("/users/{user_id}/xp")
async def get_user_xp(
    user_id: UUID,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await db.get(User, user_id)
    if user is None:
        raise atlas_error("USER_001", "User not found.", status_code=404)

    total_xp = await gamification_service.get_total_xp(db, user.id)
    level = gamification_service.get_level_for_xp(total_xp)
    transactions_result = await db.execute(
        select(XPTransaction).where(XPTransaction.user_id == user.id).order_by(desc(XPTransaction.created_at)).limit(50)
    )
    transactions = transactions_result.scalars().all()

    return {
        "user_id": str(user.id),
        "total_xp": total_xp,
        "level": level,
        "breakdown": [
            {
                "id": str(item.id),
                "type": item.transaction_type,
                "amount": item.amount,
                "created_at": item.created_at,
            }
            for item in transactions
        ],
    }


@router.get("/users/{user_id}/badges")
async def get_user_badges(
    user_id: UUID,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await db.get(User, user_id)
    if user is None:
        raise atlas_error("USER_001", "User not found.", status_code=404)

    result = await db.execute(
        select(Badge, UserBadge)
        .join(UserBadge, UserBadge.badge_id == Badge.id)
        .where(UserBadge.user_id == user_id)
        .order_by(desc(UserBadge.awarded_at))
    )
    badges = result.all()
    return {
        "user_id": str(user_id),
        "items": [
            {
                "id": str(badge.id),
                "code": badge.code,
                "name": badge.name,
                "description": badge.description,
                "icon": badge.icon,
                "awarded_at": user_badge.awarded_at,
            }
            for badge, user_badge in badges
        ],
    }


@router.get("/leaderboard")
async def leaderboard(
    filiere: str | None = None,
    anonymous: bool = False,
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    stmt = (
        select(User, func.coalesce(func.sum(XPTransaction.amount), 0).label("xp"))
        .outerjoin(XPTransaction, XPTransaction.user_id == User.id)
        .group_by(User.id)
        .order_by(desc("xp"))
        .limit(20)
    )
    if filiere:
        stmt = stmt.where(User.filiere == filiere)

    rows = (await db.execute(stmt)).all()
    return [
        {
            "user_id": str(user.id),
            "name": f"User {index + 1}" if anonymous else (user.full_name or user.email),
            "filiere": user.filiere,
            "xp": int(xp or 0),
        }
        for index, (user, xp) in enumerate(rows)
    ]


@router.get("/profile/{username}")
async def public_profile(
    username: str,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    result = await db.execute(
        select(User).where((User.full_name == username) | (User.email == username))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise atlas_error("USER_001", "User not found.", status_code=404)

    total_xp = await gamification_service.get_total_xp(db, user.id)
    return {
        "id": str(user.id),
        "username": user.full_name or user.email,
        "role": user.role,
        "filiere": user.filiere,
        "xp": total_xp,
    }
