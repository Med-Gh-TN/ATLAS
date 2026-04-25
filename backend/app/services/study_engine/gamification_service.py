from typing import List, Dict, Optional
from datetime import datetime, timedelta, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.models.all_models import XPTransaction, Badge, UserBadge, User, UserStreak


LEVEL_THRESHOLDS = [
    ("NEWCOMER", 0),
    ("LEARNER", 100),
    ("SCHOLAR", 300),
    ("EXPERT", 700),
    ("MENTOR", 1200),
]


DEFAULT_BADGES = [
    {
        "code": "FIRST_UPLOAD",
        "name": "First Upload",
        "description": "Uploaded your first contribution.",
        "min_xp": 10,
    },
    {
        "code": "HELPER_50",
        "name": "Helper 50",
        "description": "Earned 50 XP helping peers.",
        "min_xp": 50,
    },
    {
        "code": "RISING_200",
        "name": "Rising 200",
        "description": "Reached 200 XP milestone.",
        "min_xp": 200,
    },
    {
        "code": "MENTOR_500",
        "name": "Mentor 500",
        "description": "Reached 500 XP milestone.",
        "min_xp": 500,
    },
    # Streak badges
    {
        "code": "STREAK_3",
        "name": "3-Day Streak",
        "description": "Studied for 3 consecutive days.",
        "min_xp": 0,
    },
    {
        "code": "STREAK_7",
        "name": "Week Warrior",
        "description": "Studied for 7 consecutive days.",
        "min_xp": 0,
    },
    {
        "code": "STREAK_30",
        "name": "Month Master",
        "description": "Studied for 30 consecutive days.",
        "min_xp": 0,
    },
]


async def ensure_default_badges(session: AsyncSession) -> List[Badge]:
    existing = (await session.execute(select(Badge))).scalars().all()
    existing_codes = {b.code for b in existing}
    created: List[Badge] = []
    for badge_def in DEFAULT_BADGES:
        if badge_def["code"] not in existing_codes:
            badge = Badge(**badge_def)
            session.add(badge)
            created.append(badge)
    if created:
        await session.commit()
    return (await session.execute(select(Badge))).scalars().all()


async def get_total_xp(session: AsyncSession, user_id) -> int:
    total = (
        await session.execute(
            select(func.coalesce(func.sum(XPTransaction.amount), 0)).where(
                XPTransaction.user_id == user_id
            )
        )
    ).scalar_one()
    return int(total or 0)


def get_level_for_xp(total_xp: int) -> Dict[str, Optional[int]]:
    current = LEVEL_THRESHOLDS[0][0]
    next_level = None
    next_at = None
    for i, (name, threshold) in enumerate(LEVEL_THRESHOLDS):
        if total_xp >= threshold:
            current = name
            if i + 1 < len(LEVEL_THRESHOLDS):
                next_level = LEVEL_THRESHOLDS[i + 1][0]
                next_at = LEVEL_THRESHOLDS[i + 1][1]
        else:
            break
    return {"level": current, "next_level": next_level, "next_at": next_at}


async def award_badges_for_user(session: AsyncSession, user_id) -> List[Badge]:
    badges = await ensure_default_badges(session)
    total_xp = await get_total_xp(session, user_id)

    user_badges = (
        (
            await session.execute(
                select(UserBadge.badge_id).where(UserBadge.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    already = set(user_badges)

    newly_awarded: List[Badge] = []
    for badge in badges:
        if badge.id in already:
            continue
        if total_xp >= badge.min_xp:
            session.add(UserBadge(user_id=user_id, badge_id=badge.id))
            newly_awarded.append(badge)

    if newly_awarded:
        await session.commit()

    return newly_awarded


async def get_or_create_streak(session: AsyncSession, user_id) -> UserStreak:
    """Get or create a streak record for a user."""
    result = await session.execute(
        select(UserStreak).where(UserStreak.user_id == user_id)
    )
    streak = result.scalar_one_or_none()

    if not streak:
        streak = UserStreak(user_id=user_id)
        session.add(streak)
        await session.commit()
        await session.refresh(streak)

    return streak


async def record_activity(session: AsyncSession, user_id) -> UserStreak:
    """
    Record user activity and update streak.
    Should be called when user performs learning activities.
    """
    streak = await get_or_create_streak(session, user_id)
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_date = today.date()

    if streak.last_activity_date:
        last_date = streak.last_activity_date.replace(
            hour=0, minute=0, second=0, microsecond=0
        ).date()

        # Already recorded today
        if last_date == today_date:
            return streak

        # Check if streak should continue or reset
        days_diff = (today_date - last_date).days

        # Freeze period check
        if streak.freeze_start and streak.freeze_end:
            freeze_start = streak.freeze_start.replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            freeze_end = streak.freeze_end.replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            # Adjust last_date for freeze period
            if last_date < freeze_start.date() <= today_date:
                if freeze_start.date() - last_date <= 1:
                    days_diff = (today_date - freeze_end.date()).days

        if days_diff == 1:
            # Consecutive day - increment streak
            streak.current_streak += 1
        elif days_diff > 1:
            # Streak broken - reset
            streak.current_streak = 1
    else:
        # First activity
        streak.current_streak = 1

    # Update streak record
    streak.last_activity_date = today
    streak.total_active_days += 1
    streak.current_streak = min(streak.current_streak, streak.longest_streak + 1)

    if streak.current_streak > streak.longest_streak:
        streak.longest_streak = streak.current_streak

    streak.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(streak)

    return streak


async def award_streak_badges(session: AsyncSession, user_id: str) -> List[Badge]:
    """Award streak-based badges based on current streak."""
    streak = await get_or_create_streak(session, user_id)
    badges = await ensure_default_badges(session)

    streak_badges = [b for b in badges if b.code.startswith("STREAK_")]

    user_badges = (
        (
            await session.execute(
                select(UserBadge.badge_id).where(UserBadge.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    already = set(user_badges)

    newly_awarded: List[Badge] = []
    streak_threshold_map = {
        "STREAK_3": 3,
        "STREAK_7": 7,
        "STREAK_30": 30,
    }

    for badge in streak_badges:
        if badge.id in already:
            continue
        threshold = streak_threshold_map.get(badge.code, 0)
        if streak.current_streak >= threshold:
            session.add(UserBadge(user_id=user_id, badge_id=badge.id))
            newly_awarded.append(badge)

    if newly_awarded:
        await session.commit()

    return newly_awarded
