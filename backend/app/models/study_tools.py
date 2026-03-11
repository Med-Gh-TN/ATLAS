import uuid
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

class FlashcardDeck(SQLModel, table=True):
    """
    Groups flashcards generated from a specific document.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True)
    title: str
    share_token: Optional[str] = Field(default_factory=lambda: uuid.uuid4().hex[:12], unique=True, index=True)
    card_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    cards: List["Flashcard"] = Relationship(back_populates="deck", cascade_delete=True)

class Flashcard(SQLModel, table=True):
    """
    Individual flashcard with SM-2 spaced repetition algorithm fields.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    deck_id: uuid.UUID = Field(foreign_key="flashcarddeck.id", index=True)
    question: str
    answer: str
    difficulty: DifficultyLevel = Field(default=DifficultyLevel.MEDIUM)
    
    # SM-2 Algorithm Fields
    next_review_at: datetime = Field(default_factory=datetime.utcnow)
    interval: int = Field(default=0)
    ease_factor: float = Field(default=2.5)
    repetitions: int = Field(default=0)

    deck: Optional[FlashcardDeck] = Relationship(back_populates="cards")

class QuizSession(SQLModel, table=True):
    """
    Tracks a student's attempt at an AI-generated quiz.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True)
    score: Optional[float] = None
    total_questions: int = Field(default=0)
    time_limit_minutes: int = Field(default=30)
    submitted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    questions: List["Question"] = Relationship(back_populates="quiz_session", cascade_delete=True)

class Question(SQLModel, table=True):
    """
    Individual AI-generated quiz question.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    quiz_session_id: uuid.UUID = Field(foreign_key="quizsession.id", index=True)
    content: str
    question_type: str  # e.g., "MCQ", "TF", "FILL"
    options: List[str] = Field(default_factory=list, sa_column=Column(JSONB))
    correct_answer: str
    explanation: Optional[str] = None
    source_page: Optional[int] = None

    quiz_session: Optional[QuizSession] = Relationship(back_populates="questions")

class MindMap(SQLModel, table=True):
    """
    Stores the JSON representation of an AI-generated concept map.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True)
    nodes_json: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    edges_json: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)