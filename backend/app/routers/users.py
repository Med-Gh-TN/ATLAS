from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.annotation import DocumentAnnotation
from app.models.collaboration import ForumPost, ForumReply
from app.models.contribution import Contribution
from app.models.study_tools import FlashcardDeck, QuizSession
from app.models.user import (
    Department,
    Gender,
    StudentLevel,
    User,
    UserStreak,
)


router = APIRouter(tags=["Users"])


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    filiere: str | None = None
    level: str | None = None
    student_id: str | None = None
    program: str | None = None
    academic_year: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    phone_number: str | None = None
    address: str | None = None
    preferred_language: str | None = None
    profile_picture_url: str | None = None
    onboarding_completed: bool | None = None
    push_notifications_enabled: bool | None = None
    email_digest_enabled: bool | None = None
    notification_types: list[str] | None = None
    is_rtl: bool | None = None


@router.patch("/users/me")
async def update_me(
    payload: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    next_filiere = payload.filiere if payload.filiere is not None else current_user.filiere
    next_level = payload.level if payload.level is not None else (
        current_user.level.value if getattr(current_user, "level", None) else None
    )

    if next_filiere:
        department_result = await db.execute(
            select(Department).where(Department.name == next_filiere)
        )
        department = department_result.scalar_one_or_none()
        if department is None:
            raise atlas_error("DEPT_001", "Selected department was not found.", status_code=400)
        if next_level and next_level not in (department.allowed_levels or []):
            raise atlas_error(
                "USER_003",
                "Selected level is not enabled for this department.",
                field="level",
                status_code=400,
            )

    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.filiere is not None:
        current_user.filiere = payload.filiere
    if payload.level is not None:
        current_user.level = StudentLevel(payload.level)
    if payload.student_id is not None:
        current_user.student_id = payload.student_id
    if payload.program is not None:
        current_user.program = payload.program
    if payload.academic_year is not None:
        current_user.academic_year = payload.academic_year
    if payload.date_of_birth is not None:
        current_user.date_of_birth = payload.date_of_birth
    if payload.gender is not None:
        current_user.gender = Gender(payload.gender.upper())
    if payload.phone_number is not None:
        current_user.phone_number = payload.phone_number
    if payload.address is not None:
        current_user.address = payload.address
    if payload.preferred_language is not None:
        current_user.preferred_language = payload.preferred_language
    if payload.profile_picture_url is not None:
        current_user.profile_picture_url = payload.profile_picture_url
    if payload.onboarding_completed is not None:
        current_user.onboarding_completed = payload.onboarding_completed
    if payload.push_notifications_enabled is not None:
        current_user.push_notifications_enabled = payload.push_notifications_enabled
    if payload.email_digest_enabled is not None:
        current_user.email_digest_enabled = payload.email_digest_enabled
    if payload.notification_types is not None:
        current_user.notification_types = payload.notification_types
    if payload.is_rtl is not None:
        current_user.is_rtl = payload.is_rtl

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "filiere": current_user.filiere,
        "level": current_user.level,
        "student_id": current_user.student_id,
        "program": current_user.program,
        "academic_year": current_user.academic_year,
        "date_of_birth": current_user.date_of_birth,
        "gender": current_user.gender,
        "phone_number": current_user.phone_number,
        "address": current_user.address,
        "preferred_language": current_user.preferred_language,
        "profile_picture_url": current_user.profile_picture_url,
        "role": current_user.role,
        "onboarding_completed": current_user.onboarding_completed,
        "push_notifications_enabled": current_user.push_notifications_enabled,
        "email_digest_enabled": current_user.email_digest_enabled,
        "notification_types": current_user.notification_types,
        "is_rtl": current_user.is_rtl,
    }


async def _build_public_profile(user: User, db: AsyncSession) -> dict[str, Any]:
    """Build a clean public profile without XP or badges."""
    user_id = user.id

    # Streak
    streak_row = (
        await db.execute(select(UserStreak).where(UserStreak.user_id == user_id))
    ).scalar_one_or_none()
    current_streak = streak_row.current_streak if streak_row else 0
    longest_streak = streak_row.longest_streak if streak_row else 0

    # Stats
    total_contributions = (
        await db.execute(select(func.count(Contribution.id)).where(Contribution.uploader_id == user_id))
    ).scalar_one()

    total_flashcard_decks = (
        await db.execute(select(func.count(FlashcardDeck.id)).where(FlashcardDeck.student_id == user_id))
    ).scalar_one()

    total_quizzes = (
        await db.execute(select(func.count(QuizSession.id)).where(QuizSession.student_id == user_id))
    ).scalar_one()

    total_forum_posts = (
        await db.execute(select(func.count(ForumPost.id)).where(ForumPost.author_id == user_id))
    ).scalar_one()

    total_forum_replies = (
        await db.execute(select(func.count(ForumReply.id)).where(ForumReply.author_id == user_id))
    ).scalar_one()

    total_interactions = int(total_forum_posts or 0) + int(total_forum_replies or 0)

    # Recent activity: last 5 contributions and last 5 forum posts, merged
    recent_contributions = (
        await db.execute(
            select(Contribution)
            .where(Contribution.uploader_id == user_id)
            .order_by(desc(Contribution.created_at))
            .limit(5)
        )
    ).scalars().all()

    recent_posts = (
        await db.execute(
            select(ForumPost)
            .where(ForumPost.author_id == user_id)
            .order_by(desc(ForumPost.created_at))
            .limit(5)
        )
    ).scalars().all()

    recent_replies = (
        await db.execute(
            select(ForumReply)
            .where(ForumReply.author_id == user_id)
            .order_by(desc(ForumReply.created_at))
            .limit(5)
        )
    ).scalars().all()

    activity_feed: list[dict[str, Any]] = []

    for c in recent_contributions:
        activity_feed.append({
            "id": str(c.id),
            "type": "CONTRIBUTION",
            "title": c.title,
            "description": f"Contribution with status {c.status}.",
            "created_at": c.created_at,
        })
    for p in recent_posts:
        activity_feed.append({
            "id": str(p.id),
            "type": "FORUM_POST",
            "title": p.title,
            "description": "Started a discussion.",
            "created_at": p.created_at,
        })
    for r in recent_replies:
        activity_feed.append({
            "id": str(r.id),
            "type": "FORUM_REPLY",
            "title": "Reply",
            "description": "Replied to a discussion.",
            "created_at": r.created_at,
        })

    activity_feed.sort(key=lambda x: x["created_at"], reverse=True)
    activity_feed = activity_feed[:10]

    return {
        "user": {
            "id": str(user.id),
            "full_name": user.full_name,
            "role": user.role,
            "filiere": user.filiere,
            "is_verified": user.is_verified,
            "created_at": user.created_at,
        },
        "streak": {
            "current_streak": current_streak,
            "longest_streak": longest_streak,
        },
        "stats": {
            "total_contributions": int(total_contributions or 0),
            "flashcard_decks_created": int(total_flashcard_decks or 0),
            "quizzes_completed": int(total_quizzes or 0),
            "forum_posts": int(total_forum_posts or 0),
            "forum_replies": int(total_forum_replies or 0),
            "total_interactions": total_interactions,
        },
        "recent_activity": activity_feed,
    }


@router.get("/users/{user_id}/profile")
async def get_public_profile(
    user_id: UUID,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Public profile without XP, badges, or gamified activity."""
    user = await db.get(User, user_id)
    if user is None:
        raise atlas_error("USER_001", "User not found.", status_code=404)

    return await _build_public_profile(user, db)


@router.get("/users/me/profile")
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Current user's full profile (identical response shape)."""
    return await _build_public_profile(current_user, db)


@router.delete("/users/me")
async def delete_my_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Delete own account. This is a soft delete that marks the user as deleted.
    """
    current_user.is_deleted = True
    current_user.email = f"deleted_{current_user.id}@{current_user.email.split('@')[1]}"
    current_user.full_name = "Deleted User"
    current_user.is_active = False

    await db.commit()

    return {"message": "Your account has been deleted successfully."}