from app.models.user import (
    User, UserRole, StudentLevel, UserBase, UserCreate, UserRead, 
    OTPToken, OTPPurpose, TeacherProfile, Establishment, Department
)
from app.models.contribution import (
    Contribution, ContributionStatus, ContributionCreate, ContributionRead, 
    DocumentVersion, DocumentPipelineStatus
)
from app.models.gamification import XPTransaction, XPTransactionType
from app.models.course import Course
from app.models.embedding import DocumentEmbedding
from app.models.rag import RAGSession, Message
from app.models.study_tools import (
    FlashcardDeck, Flashcard, DifficultyLevel, QuizSession, Question, 
    MindMap, Summary, SummaryFormat
)

# US-11: New persistent notification model
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
    contribution_id: Optional[uuid.UUID] = Field(default=None, foreign_key="contribution.id", ondelete="SET NULL")
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    user: Optional["User"] = Relationship()

__all__ = [
    "User", "UserRole", "StudentLevel", "UserBase", "UserCreate", "UserRead",
    "TeacherProfile", "Establishment",
    "Contribution", "ContributionStatus", "ContributionCreate", "ContributionRead",
    "DocumentVersion", "DocumentPipelineStatus",
    "DocumentEmbedding",
    "XPTransaction", "XPTransactionType",
    "OTPToken", "OTPPurpose",
    "Course", "Department",
    "RAGSession", "Message",
    "FlashcardDeck", "Flashcard", "DifficultyLevel", 
    "QuizSession", "Question", "MindMap", "Summary", "SummaryFormat",
    "Notification"
]