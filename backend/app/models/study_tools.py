"""
@file backend/app/models/study_tools.py
@description Study Tool Models (Flashcards, Quizzes, Mindmaps).
SOTA FIX: Upgraded to multi-document arrays to support full-subject generation.
@layer State Persistence
"""

import uuid
import secrets
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from enum import Enum
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB, ARRAY, UUID as PG_UUID

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

class AcademicAssetType(str, Enum):
    FLASHCARDS = "FLASHCARDS"
    QUIZ = "QUIZ"
    SUMMARY = "SUMMARY"
    MINDMAP = "MINDMAP"

class FlashcardDeck(SQLModel, table=True):
    """
    Groups flashcards generated from documents.
    Upgraded for Multi-Document support.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    
    # 🚨 SOTA FIX: Array of UUIDs
    document_version_ids: Optional[List[uuid.UUID]] = Field(
        default_factory=list, 
        sa_column=Column(ARRAY(PG_UUID(as_uuid=True)))
    )
    
    title: str
    share_token: Optional[str] = Field(
        default_factory=lambda: secrets.token_urlsafe(16), 
        unique=True, 
        index=True
    )
    card_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)

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
    
    next_review_at: datetime = Field(default_factory=datetime.utcnow, index=True) 
    last_reviewed_at: Optional[datetime] = Field(default=None) 
    interval: int = Field(default=0)
    ease_factor: float = Field(default=2.5)
    repetitions: int = Field(default=0)

    deck: Optional[FlashcardDeck] = Relationship(back_populates="cards")

class QuizSession(SQLModel, table=True):
    """
    Tracks a student's attempt at an AI-generated quiz.
    Upgraded for Multi-Document Exam Simulation.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    
    # 🚨 SOTA FIX: Array of UUIDs
    document_version_ids: Optional[List[uuid.UUID]] = Field(
        default_factory=list, 
        sa_column=Column(ARRAY(PG_UUID(as_uuid=True)))
    )
    
    score: Optional[float] = None
    total_questions: int = Field(default=0)
    time_limit_minutes: int = Field(default=30)
    
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
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    quiz_session_id: uuid.UUID = Field(foreign_key="quizsession.id", index=True, ondelete="CASCADE")
    
    question_text: str = Field(alias="question") 
    question_type: str  
    options: List[str] = Field(default_factory=list, sa_column=Column(JSONB))
    correct_answer: str
    explanation: Optional[str] = None
    source_page: Optional[int] = None

    student_answer: Optional[str] = None
    is_correct: Optional[bool] = Field(default=None, index=True)
    ai_feedback: Optional[str] = None 

    quiz_session: Optional[QuizSession] = Relationship(back_populates="questions")

class MindMap(SQLModel, table=True):
    """
    Stores the JSON representation of an AI-generated concept map.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    
    # 🚨 SOTA FIX: Array of UUIDs
    document_version_ids: Optional[List[uuid.UUID]] = Field(
        default_factory=list, 
        sa_column=Column(ARRAY(PG_UUID(as_uuid=True)))
    )
    
    title: Optional[str] = Field(default=None)
    target_lang: str = Field(default="fr", index=True) 
    
    nodes_json: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    edges_json: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Summary(SQLModel, table=True):
    """
    Stores AI-generated summaries across multiple formats.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    
    # 🚨 SOTA FIX: Array of UUIDs
    document_version_ids: Optional[List[uuid.UUID]] = Field(
        default_factory=list, 
        sa_column=Column(ARRAY(PG_UUID(as_uuid=True)))
    )
    
    format: SummaryFormat = Field(default=SummaryFormat.EXECUTIVE, index=True)
    target_lang: str = Field(default="fr", index=True) 
    content: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AcademicAssetCache(SQLModel, table=True):
    """
    Document-scoped cache for generated academic assets.
    NOTE: Left as a single document_version_id because physical caching 
    is done at the individual document level, then aggregated dynamically.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    document_version_id: uuid.UUID = Field(
        foreign_key="documentversion.id",
        index=True,
        ondelete="CASCADE",
    )
    asset_type: AcademicAssetType = Field(index=True)
    target_lang: str = Field(default="fr", index=True)
    profile: str = Field(default="default", index=True)
    content: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    chunk_count: int = Field(default=0)
    source_pipeline_version: str = Field(default="atlas-v1")
    model_version: Optional[str] = None
    is_stale: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)