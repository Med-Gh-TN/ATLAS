from enum import Enum
from typing import Optional
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Relationship


class LearningSpeed(str, Enum):
    SLOW = "slow"
    MEDIUM = "medium"
    FAST = "fast"


class LearningStyle(str, Enum):
    VISUAL = "visual"
    TEXTUAL = "textual"
    MIXED = "mixed"


class UserProfile(SQLModel, table=True):
    """US-XX: AI-driven learning profile for adaptive personalization."""

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, unique=True)

    learning_speed: LearningSpeed = Field(default=LearningSpeed.MEDIUM)
    preferred_style: LearningStyle = Field(default=LearningStyle.MIXED)

    avg_quiz_time_seconds: float = Field(default=0.0)
    total_quizzes_taken: int = Field(default=0)

    detection_confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TopicKnowledge(SQLModel, table=True):
    """US-XX: Tracks user's confidence level per course/topic for adaptive learning."""

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    course_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="course.id", index=True
    )

    topic_name: str = Field(index=True)
    confidence_score: float = Field(default=0.0, ge=0.0, le=100.0)

    total_attempts: int = Field(default=0)
    correct_attempts: int = Field(default=0)

    last_quiz_id: Optional[uuid.UUID] = Field(default=None)
    last_attempt_at: Optional[datetime] = Field(default=None)

    needs_review: bool = Field(default=False)
    review_due_at: Optional[datetime] = Field(default=None)

    updated_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = ({"schema": None},)


class UserMemory(SQLModel, table=True):
    """US-XX: Stores user interaction history for enhanced RAG context."""

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    memory_type: str = Field(index=True)
    content: str

    related_course_id: Optional[uuid.UUID] = Field(default=None)
    related_document_id: Optional[uuid.UUID] = Field(default=None)

    importance_score: float = Field(default=1.0, ge=0.0, le=1.0)
    is_forgotten: bool = Field(default=False)

    created_at: datetime = Field(default_factory=datetime.utcnow)


class LearningInsight(SQLModel, table=True):
    """US-XX: AI-generated insights about user's learning patterns."""

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    insight_type: str
    insight_text: str
    action_type: str
    action_payload: str

    is_read: bool = Field(default=False)
    is_actioned: bool = Field(default=False)

    created_at: datetime = Field(default_factory=datetime.utcnow)
