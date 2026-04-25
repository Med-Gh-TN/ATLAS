import uuid
import secrets
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from enum import Enum
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB

class DifficultyLevel(str, Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"

class SummaryFormat(str, Enum):
    """
    US-18: Defines the structural output format of the summary.
    """
    EXECUTIVE = "EXECUTIVE"   # 5 Bullets
    STRUCTURED = "STRUCTURED" # Hierarchical plan
    COMPARATIVE = "COMPARATIVE" # Diff between 2 versions

class FlashcardDeck(SQLModel, table=True):
    """
    Groups flashcards generated from a specific document.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True, ondelete="CASCADE")
    title: str

    # OWASP Security: Use cryptographically secure token for sharing to prevent enumeration
    share_token: Optional[str] = Field(
        default_factory=lambda: secrets.token_urlsafe(16),
        unique=True,
        index=True
    )
    card_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Enforce strict garbage collection for orphans
    cards: List["Flashcard"] = Relationship(
        back_populates="deck",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class Flashcard(SQLModel, table=True):
    """
    Individual flashcard with SM-2 spaced repetition algorithm fields.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    deck_id: uuid.UUID = Field(foreign_key="flashcarddeck.id", index=True, ondelete="CASCADE")
    question: str
    answer: str
    difficulty: DifficultyLevel = Field(default=DifficultyLevel.MEDIUM)

    # SM-2 Algorithm Fields
    next_review_at: datetime = Field(default_factory=datetime.utcnow, index=True) # Indexed for fast due-date queries
    last_reviewed_at: Optional[datetime] = Field(default=None) # Defensive: Prevent rapid double-submissions/race conditions
    interval: int = Field(default=0)
    ease_factor: float = Field(default=2.5)
    repetitions: int = Field(default=0)

    deck: Optional[FlashcardDeck] = Relationship(back_populates="cards")

class QuizSession(SQLModel, table=True):
    """
    Tracks a student's attempt at an AI-generated quiz.
    Enhanced for US-17 Exam Simulation.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True, ondelete="CASCADE")
    score: Optional[float] = None
    total_questions: int = Field(default=0)
    time_limit_minutes: int = Field(default=30)

    # State tracking
    is_completed: bool = Field(default=False, index=True)
    submitted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    questions: List["Question"] = Relationship(
        back_populates="quiz_session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class Question(SQLModel, table=True):
    """
    Individual AI-generated quiz question.
    Enhanced for US-17 to store student responses and targeted AI feedback.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    quiz_session_id: uuid.UUID = Field(foreign_key="quizsession.id", index=True, ondelete="CASCADE")

    # Generation Payload Data
    question_text: str = Field(alias="question") # Mapped alias to support frontend 'question' key easily
    question_type: str  # e.g., "MCQ", "TF", "FILL", "MATCH"
    options: List[str] = Field(default_factory=list, sa_column=Column(JSONB))
    correct_answer: str
    explanation: Optional[str] = None
    source_page: Optional[int] = None

    # US-17: Post-Submission Evaluation Data
    student_answer: Optional[str] = None
    is_correct: Optional[bool] = Field(default=None, index=True)
    ai_feedback: Optional[str] = None # Detailed feedback for missed questions

    quiz_session: Optional[QuizSession] = Relationship(back_populates="questions")

class MindMap(SQLModel, table=True):
    """
    Stores the JSON representation of an AI-generated concept map.
    US-18: Enhanced with multilingual targeting and title context.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True, ondelete="CASCADE")

    title: Optional[str] = Field(default=None)
    target_lang: str = Field(default="fr", index=True) # Multilingual support

    nodes_json: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    edges_json: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Summary(SQLModel, table=True):
    """
    US-18: Stores AI-generated summaries across multiple formats.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True, ondelete="CASCADE")

    format: SummaryFormat = Field(default=SummaryFormat.EXECUTIVE, index=True)
    target_lang: str = Field(default="fr", index=True) # Multilingual support

    # JSONB safely handles raw string arrays (Executive), nested dicts (Structured), or diff schemas (Comparative)
    content: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))

    created_at: datetime = Field(default_factory=datetime.utcnow)