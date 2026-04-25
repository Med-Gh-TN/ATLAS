from app.models.user import (
    User,
    UserRole,
    StudentLevel,
    UserBase,
    UserCreate,
    UserRead,
    OTPToken,
    OTPPurpose,
    TeacherProfile,
    Establishment,
    Department,
)
from app.models.contribution import (
    Contribution,
    ContributionStatus,
    ContributionCreate,
    ContributionRead,
    DocumentVersion,
    DocumentPipelineStatus,
)
from app.models.gamification import (
    XPTransaction,
    XPTransactionType,
    Badge,
    UserBadge,
    UserStreak,
)
from app.models.course import Course
from app.models.embedding import DocumentEmbedding
from app.models.rag import RAGSession, Message
from app.models.study_tools import (
    FlashcardDeck,
    Flashcard,
    DifficultyLevel,
    QuizSession,
    Question,
    MindMap,
    Summary,
    SummaryFormat,
)
from app.models.annotation import DocumentAnnotation
from app.models.intelligence import (
    UserProfile,
    TopicKnowledge,
    UserMemory,
    LearningInsight,
    LearningSpeed,
    LearningStyle,
)
from app.models.collaboration import (
    ForumPost,
    ForumPostStatus,
    ForumReply,
    ForumVote,
    StudyGroup,
    StudyGroupMember,
    LiveSession,
    LearningPathJob,
    LearningPathJobStatus,
)

# US-11 & Active Learning Panel: Persistent models
from typing import Optional
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Relationship


class Notification(SQLModel, table=True):
    """
    US-11: In-app notification persistence.
    Tracks document status changes and feedback for students.
    """

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")

    title: str
    message: str
    is_read: bool = Field(default=False)

    # Contextual links
    contribution_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="contribution.id", ondelete="SET NULL"
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship()


class ReadingProgress(SQLModel, table=True):
    """
    US-XX: Active Learning Panel persistence.
    Tracks the user's exact scroll position and active page for seamless resuming.
    """

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    document_version_id: uuid.UUID = Field(
        foreign_key="documentversion.id", index=True, ondelete="CASCADE"
    )

    last_page: int = Field(
        default=1, description="The last active page number read by the user."
    )
    scroll_y: float = Field(
        default=0.0, description="The exact vertical scroll coordinate."
    )

    last_accessed_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of the last telemetry ping.",
    )


__all__ = [
    "User",
    "UserRole",
    "StudentLevel",
    "UserBase",
    "UserCreate",
    "UserRead",
    "TeacherProfile",
    "Establishment",
    "Contribution",
    "ContributionStatus",
    "ContributionCreate",
    "ContributionRead",
    "DocumentVersion",
    "DocumentPipelineStatus",
    "DocumentEmbedding",
    "XPTransaction",
    "XPTransactionType",
    "Badge",
    "UserBadge",
    "UserStreak",
    "OTPToken",
    "OTPPurpose",
    "Course",
    "Department",
    "RAGSession",
    "Message",
    "FlashcardDeck",
    "Flashcard",
    "DifficultyLevel",
    "QuizSession",
    "Question",
    "MindMap",
    "Summary",
    "SummaryFormat",
    "DocumentAnnotation",
    "Notification",
    "ReadingProgress",
    # US-XX: User Intelligence Layer
    "UserProfile",
    "TopicKnowledge",
    "UserMemory",
    "LearningInsight",
    "LearningSpeed",
    "LearningStyle",
    "ForumPost",
    "ForumPostStatus",
    "ForumReply",
    "ForumVote",
    "StudyGroup",
    "StudyGroupMember",
    "LiveSession",
    "LearningPathJob",
    "LearningPathJobStatus",
]
