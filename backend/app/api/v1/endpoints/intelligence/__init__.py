"""
User Intelligence Layer API Endpoints
"""

import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User, UserRole, UserProfile
from app.services.intelligence import (
    get_or_create_profile,
    get_weak_topics,
    generate_recommendations,
    get_ai_insights,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@router.get("/profile")
async def get_learning_profile(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get user's learning profile."""
    if current_user.role != UserRole.STUDENT:
        return {"error": "Only students have learning profiles"}

    profile = await get_or_create_profile(session, str(current_user.id))

    return {
        "learning_speed": profile.learning_speed.value,
        "preferred_style": profile.preferred_style.value,
        "total_quizzes_taken": profile.total_quizzes_taken,
        "detection_confidence": profile.detection_confidence,
    }


@router.get("/weak-topics")
async def get_struggling_topics(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get topics where user is struggling."""
    if current_user.role != UserRole.STUDENT:
        return []

    weak_topics = await get_weak_topics(session, str(current_user.id))

    return [
        {
            "topic_name": t.topic_name,
            "confidence_score": t.confidence_score,
            "total_attempts": t.total_attempts,
            "review_due": t.review_due_at.isoformat() if t.review_due_at else None,
        }
        for t in weak_topics
    ]


@router.get("/recommendations")
async def get_recommendations(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get personalized course recommendations."""
    if current_user.role != UserRole.STUDENT:
        return []

    recommendations = await generate_recommendations(session, str(current_user.id))
    return recommendations


@router.get("/insights")
async def get_insights(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get AI-generated insights about user's learning."""
    if current_user.role != UserRole.STUDENT:
        return []

    insights = await get_ai_insights(session, str(current_user.id))
    return insights
