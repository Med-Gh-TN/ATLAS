from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User, UserRole, UserStreak
from app.services.study_engine.gamification_service import (
    get_or_create_streak,
    record_activity,
    award_streak_badges,
)

router = APIRouter(prefix="/streaks", tags=["study-streaks"])


class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    total_active_days: int
    last_activity_date: Optional[datetime]
    is_frozen: bool


class FreezeRequest(BaseModel):
    start_date: datetime
    end_date: datetime


@router.get("/me", response_model=StreakResponse)
async def get_my_streak(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get current user's streak information."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students have learning streaks.",
        )

    streak = await get_or_create_streak(session, current_user.id)

    is_frozen = False
    if streak.freeze_start and streak.freeze_end:
        now = datetime.utcnow()
        is_frozen = streak.freeze_start <= now <= streak.freeze_end

    return StreakResponse(
        current_streak=streak.current_streak,
        longest_streak=streak.longest_streak,
        total_active_days=streak.total_active_days,
        last_activity_date=streak.last_activity_date,
        is_frozen=is_frozen,
    )


@router.post("/activity", response_model=StreakResponse)
async def record_learning_activity(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    US-XX: Record learning activity and update streak.
    Called automatically when user completes learning actions.
    """
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students have learning streaks.",
        )

    streak = await record_activity(session, current_user.id)

    # Check and award streak badges
    await award_streak_badges(session, current_user.id)

    is_frozen = False
    if streak.freeze_start and streak.freeze_end:
        now = datetime.utcnow()
        is_frozen = streak.freeze_start <= now <= streak.freeze_end

    return StreakResponse(
        current_streak=streak.current_streak,
        longest_streak=streak.longest_streak,
        total_active_days=streak.total_active_days,
        last_activity_date=streak.last_activity_date,
        is_frozen=is_frozen,
    )


@router.post("/freeze", response_model=StreakResponse)
async def set_streak_freeze(
    payload: FreezeRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Set a streak freeze period (vacation/holiday)."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students have learning streaks.",
        )

    if payload.end_date <= payload.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date must be after start date.",
        )

    streak = await get_or_create_streak(session, current_user.id)
    streak.freeze_start = payload.start_date
    streak.freeze_end = payload.end_date
    streak.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(streak)

    return StreakResponse(
        current_streak=streak.current_streak,
        longest_streak=streak.longest_streak,
        total_active_days=streak.total_active_days,
        last_activity_date=streak.last_activity_date,
        is_frozen=True,
    )
