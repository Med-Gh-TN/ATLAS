"""
Knowledge Service - Topic Confidence Tracking
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.all_models import TopicKnowledge, QuizSession, Question, Course

logger = logging.getLogger(__name__)

WEAK_THRESHOLD = 60.0
SPACED_REPETITION_DAYS = [1, 3, 7, 14, 30]


async def get_topic_knowledge(
    session: AsyncSession, user_id: str, course_id: Optional[str] = None
) -> List[TopicKnowledge]:
    """Get all topic knowledge records for a user."""
    query = select(TopicKnowledge).where(TopicKnowledge.user_id == user_id)

    if course_id:
        query = query.where(TopicKnowledge.course_id == course_id)

    result = await session.execute(query)
    return list(result.scalars().all())


async def get_weak_topics(
    session: AsyncSession, user_id: str, days: int = 30, limit: int = 5
) -> List[TopicKnowledge]:
    """
    Get topics where user is struggling (confidence < 60%).
    Ordered by confidence (lowest first).
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    result = await session.execute(
        select(TopicKnowledge)
        .where(
            TopicKnowledge.user_id == user_id,
            TopicKnowledge.confidence_score < WEAK_THRESHOLD,
            TopicKnowledge.last_attempt_at >= cutoff,
        )
        .order_by(TopicKnowledge.confidence_score.asc())
        .limit(limit)
    )

    return list(result.scalars().all())


async def update_topic_confidence(
    session: AsyncSession,
    user_id: str,
    course_id: Optional[str],
    topic_name: str,
    quiz_session_id: str,
    score: float,
    is_correct: bool,
) -> TopicKnowledge:
    """
    Update topic confidence based on quiz result.
    Uses exponential moving average for smooth confidence tracking.
    """
    result = await session.execute(
        select(TopicKnowledge).where(
            TopicKnowledge.user_id == user_id, TopicKnowledge.topic_name == topic_name
        )
    )
    topic = result.scalar_one_or_none()

    if not topic:
        topic = TopicKnowledge(
            user_id=user_id,
            course_id=course_id,
            topic_name=topic_name,
            total_attempts=0,
            correct_attempts=0,
        )
        session.add(topic)

    topic.total_attempts += 1
    if is_correct:
        topic.correct_attempts += 1

    new_confidence = (score * 0.3) + (topic.confidence_score * 0.7)
    topic.confidence_score = min(100.0, max(0.0, new_confidence))

    topic.last_quiz_id = quiz_session_id
    topic.last_attempt_at = datetime.utcnow()
    topic.updated_at = datetime.utcnow()

    topic.needs_review = topic.confidence_score < WEAK_THRESHOLD

    if topic.needs_review:
        days_until_review = _calculate_review_schedule(topic.confidence_score)
        topic.review_due_at = datetime.utcnow() + timedelta(days=days_until_review)
    else:
        topic.review_due_at = None

    await session.commit()
    await session.refresh(topic)

    logger.info(
        f"[KNOWLEDGE] Updated {topic_name} for user {user_id}: {topic.confidence_score:.1f}%"
    )

    return topic


def _calculate_review_schedule(confidence: float) -> int:
    """
    Calculate days until next review based on confidence score.
    Lower confidence = sooner review (spaced repetition).
    """
    if confidence >= 90:
        return 30
    elif confidence >= 80:
        return 14
    elif confidence >= 70:
        return 7
    elif confidence >= 60:
        return 3
    else:
        return 1
