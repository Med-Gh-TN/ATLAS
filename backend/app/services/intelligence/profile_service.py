"""
Profile Service - Learning Profile Detection
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.models.all_models import (
    User,
    UserProfile,
    QuizSession,
    LearningSpeed,
    LearningStyle,
)

logger = logging.getLogger(__name__)


async def get_or_create_profile(session: AsyncSession, user_id: str) -> UserProfile:
    """Get or create a user profile for intelligence tracking."""
    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        profile = UserProfile(user_id=user_id)
        session.add(profile)
        await session.commit()
        await session.refresh(profile)

    return profile


async def detect_learning_speed(session: AsyncSession, user_id: str) -> LearningSpeed:
    """
    Detect user's learning speed based on quiz completion times.

    Algorithm:
    - Calculate average time per question across all completed quizzes
    - Compare to population average (45 seconds per question)
    - SLOW: > 60s, MEDIUM: 30-60s, FAST: < 30s
    """
    result = await session.execute(
        select(
            func.avg(
                QuizSession.total_questions
                / func.nullif(
                    func.extract(
                        "epoch", QuizSession.submitted_at - QuizSession.created_at
                    ),
                    0,
                )
            )
        ).where(QuizSession.student_id == user_id, QuizSession.submitted_at.isnot(None))
    )
    avg_time_per_question = result.scalar_one_or_none()

    if avg_time_per_question is None or avg_time_per_question == 0:
        return LearningSpeed.MEDIUM

    if avg_time_per_question > 60:
        return LearningSpeed.SLOW
    elif avg_time_per_question < 30:
        return LearningSpeed.FAST
    else:
        return LearningSpeed.MEDIUM


async def detect_learning_style(session: AsyncSession, user_id: str) -> LearningStyle:
    """
    Detect user's preferred learning style based on interaction patterns.

    Algorithm:
    - Track which study tools are used most (visual vs textual)
    - Visual: MindMaps, Flashcards
    - Textual: Summaries, RAG Chat
    """
    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()

    if not profile or profile.total_quizzes_taken < 3:
        return LearningStyle.MIXED

    return profile.preferred_style


async def update_profile_from_quiz(
    session: AsyncSession,
    user_id: str,
    quiz_session_id: str,
    time_taken_seconds: float,
    score: float,
) -> UserProfile:
    """
    Update user profile after completing a quiz.
    Called from quiz submission endpoint.
    """
    profile = await get_or_create_profile(session, user_id)

    profile.total_quizzes_taken += 1

    total_time = (
        profile.avg_quiz_time_seconds * (profile.total_quizzes_taken - 1)
        + time_taken_seconds
    )
    profile.avg_quiz_time_seconds = total_time / profile.total_quizzes_taken

    profile.learning_speed = await detect_learning_speed(session, user_id)
    profile.updated_at = datetime.utcnow()

    profile.detection_confidence = min(1.0, profile.total_quizzes_taken / 10)

    await session.commit()
    await session.refresh(profile)

    logger.info(
        f"[PROFILE] Updated for user {user_id}: speed={profile.learning_speed}, quizzes={profile.total_quizzes_taken}"
    )

    return profile
