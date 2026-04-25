"""
User Intelligence Layer - Public API
"""

from .profile_service import (
    get_or_create_profile,
    detect_learning_speed,
    update_profile_from_quiz,
)
from .knowledge_service import (
    update_topic_confidence,
    get_weak_topics,
    get_topic_knowledge,
)
from .recommendation_service import (
    generate_recommendations,
    get_ai_insights,
)

__all__ = [
    "get_or_create_profile",
    "detect_learning_speed",
    "update_profile_from_quiz",
    "update_topic_confidence",
    "get_weak_topics",
    "get_topic_knowledge",
    "generate_recommendations",
    "get_ai_insights",
]
