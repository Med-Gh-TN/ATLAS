"""
Recommendation Service - AI-Powered Course Recommendations
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from app.models.all_models import (
    Course,
    Contribution,
    DocumentVersion,
    TopicKnowledge,
    UserProfile,
    UserMemory,
    LearningInsight,
    RAGSession,
)

logger = logging.getLogger(__name__)


async def generate_recommendations(
    session: AsyncSession, user_id: str, limit: int = 5
) -> List[Dict[str, Any]]:
    """
    Generate personalized course recommendations based on:
    1. Weak topics (topics user struggles with)
    2. RAG session history (questions asked)
    3. Similar users' paths
    """
    recommendations = []

    weak_topics = await _get_weak_topics_for_user(session, user_id)

    for topic in weak_topics[:3]:
        courses = await _find_courses_for_topic(session, topic["topic_name"])
        for course in courses[:2]:
            recommendations.append(
                {
                    "type": "weak_topic",
                    "reason": f"Vous avez des difficultés en {topic['topic_name']}",
                    "action": f"REVIEW_COURSE",
                    "course_id": course.id,
                    "course_title": course.name,
                    "priority": "high",
                }
            )

    recent_rag_questions = await _get_recent_rag_questions(session, user_id)
    for question in recent_rag_questions[:3]:
        recommendations.append(
            {
                "type": "rag_followup",
                "reason": f"Basé sur votre question: '{question}'",
                "action": "REVIEW_TOPIC",
                "priority": "medium",
            }
        )

    recommendations.sort(
        key=lambda x: {"high": 0, "medium": 1, "low": 2}.get(
            x.get("priority", "low"), 2
        )
    )

    return recommendations[:limit]


async def get_ai_insights(
    session: AsyncSession, user_id: str, limit: int = 3
) -> List[Dict[str, Any]]:
    """
    Generate AI insights about user's learning patterns.
    """
    insights = []

    profile = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile_result = profile.scalar_one_or_none()

    if profile_result and profile_result.total_quizzes_taken >= 3:
        if profile_result.learning_speed.value == "slow":
            insights.append(
                {
                    "type": "learning_speed",
                    "insight_text": "Vous prenez votre temps pour bien comprendre. C'est excellent pour la rétention à long terme!",
                    "action_type": "CONTINUE_LEARNING",
                    "action_payload": "",
                }
            )
        elif profile_result.learning_speed.value == "fast":
            insights.append(
                {
                    "type": "learning_speed",
                    "insight_text": "Vous apprenez rapidement! N'oubliez pas de revoir les concepts pour les mémoriser.",
                    "action_type": "TAKE_QUIZ",
                    "action_payload": "",
                }
            )

    weak_topics = await _get_weak_topics_for_user(session, user_id)
    if weak_topics:
        worst = weak_topics[0]
        insights.append(
            {
                "type": "weak_topic",
                "insight_text": f"Vous oubliez les concepts de '{worst['topic_name']}' après quelques jours. Une révision est conseillée.",
                "action_type": "REVIEW_FLASHCARDS",
                "action_payload": worst["topic_name"],
            }
        )

    return insights[:limit]


async def _get_weak_topics_for_user(
    session: AsyncSession, user_id: str, limit: int = 5
) -> List[Dict[str, Any]]:
    """Get user's weak topics from knowledge tracking."""
    result = await session.execute(
        select(TopicKnowledge)
        .where(TopicKnowledge.user_id == user_id, TopicKnowledge.confidence_score < 70)
        .order_by(TopicKnowledge.confidence_score.asc())
        .limit(limit)
    )
    topics = result.scalars().all()

    return [
        {"topic_name": t.topic_name, "confidence": t.confidence_score} for t in topics
    ]


async def _find_courses_for_topic(
    session: AsyncSession, topic_name: str
) -> List[Course]:
    """Find courses related to a topic."""
    result = await session.execute(
        select(Course).where(Course.name.ilike(f"%{topic_name}%")).limit(3)
    )
    return list(result.scalars().all())


async def _get_recent_rag_questions(
    session: AsyncSession, user_id: str, limit: int = 5
) -> List[str]:
    """Get recent questions asked via RAG chat."""
    from app.models.all_models import Message

    result = await session.execute(
        select(Message)
        .join(RAGSession, RAGSession.id == Message.session_id)
        .where(RAGSession.student_id == user_id, Message.role == "user")
        .order_by(desc(Message.timestamp))
        .limit(limit)
    )
    messages = result.scalars().all()

    return [m.content for m in messages if m.content]


async def create_learning_insight(
    session: AsyncSession,
    user_id: str,
    insight_type: str,
    insight_text: str,
    action_type: str,
    action_payload: str = "",
) -> LearningInsight:
    """Create a new learning insight for the user."""
    insight = LearningInsight(
        user_id=user_id,
        insight_type=insight_type,
        insight_text=insight_text,
        action_type=action_type,
        action_payload=action_payload,
    )
    session.add(insight)
    await session.commit()
    await session.refresh(insight)

    logger.info(f"[INSIGHT] Created for user {user_id}: {insight_text[:50]}...")

    return insight
