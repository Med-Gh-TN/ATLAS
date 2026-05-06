"""
@file backend/app/models/study_goals.py
@description Optional user-defined daily goals and study session tracking.
@layer State Persistence
@dependencies sqlmodel, uuid, datetime
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class DailyGoal(SQLModel, table=True):
    """User‑created daily goal (system goals are generated live, not stored)."""

    __tablename__ = "daily_goal"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    description: str
    is_completed: bool = Field(default=False)
    priority: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StudySession(SQLModel, table=True):
    """Logs a continuous block of study time."""

    __tablename__ = "study_session"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    started_at: datetime
    ended_at: Optional[datetime] = Field(default=None)   # null if still active
    source: Optional[str] = Field(default=None, description="e.g., 'reading', 'quiz'")