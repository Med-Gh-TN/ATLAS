"""
@file backend/app/schemas/dashboard.py
@description Contract models for the student dashboard endpoint.
@layer Core Logic
@dependencies pydantic
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DashboardProgress(BaseModel):
    """Aggregated study metrics for the student dashboard."""

    overall_completion_percentage: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Overall course completion percentage across enrolled/active courses.",
    )
    active_streak_days: int = Field(
        default=0,
        description="Current daily study streak count from userstreak table.",
    )
    today_study_minutes: int = Field(
        default=0,
        description="Minutes spent studying today (from readingprogress or session logs).",
    )


class AIGoal(BaseModel):
    """A daily study goal suggested by the system or set by the user."""

    id: UUID
    description: str
    is_completed: bool
    priority: Optional[int] = None


class CourseRecommendation(BaseModel):
    """A course recommended to the student based on their activity."""

    course_id: UUID
    title: str
    progress_percentage: int = Field(ge=0, le=100)
    thumbnail_url: Optional[str] = None


class WeakTopic(BaseModel):
    """A topic where the student has low accuracy, identified from quiz results."""

    topic_name: str
    accuracy_percentage: int = Field(ge=0, le=100)
    suggested_action: str


class SuggestedFlashcardDeck(BaseModel):
    """A flashcard deck with due cards, suggested for review."""

    deck_id: UUID
    title: str
    due_cards_count: int


class WeeklyActivityData(BaseModel):
    """Aggregated study activity for a single day."""

    day: str  # "Sun", "Mon", etc.
    activities: int  # number of study actions (e.g., quiz attempts, reading sessions)


class SmartOverviewResponse(BaseModel):
    """Complete student dashboard overview payload."""

    greeting: str = Field(
        description="Personalised welcome message (e.g., 'Welcome back, Alice!')"
    )
    progress: DashboardProgress
    daily_goals: list[AIGoal]
    recommended_courses: list[CourseRecommendation]
    weak_topics: list[WeakTopic]
    suggested_flashcards: list[SuggestedFlashcardDeck]
    weekly_activity: Optional[list[WeeklyActivityData]] = None