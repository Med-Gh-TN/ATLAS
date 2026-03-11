import uuid
from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship

class RAGSession(SQLModel, table=True):
    """
    Tracks an active RAG chat session to enforce rate limits and track context.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True)
    message_count: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    messages: List["Message"] = Relationship(back_populates="session", cascade_delete=True)

class Message(SQLModel, table=True):
    """
    Stores individual chat messages. Includes cosine similarity guard tracking.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="ragsession.id", index=True)
    role: str  # "user" or "assistant"
    content: str
    source_page: Optional[int] = None
    cosine_similarity: Optional[float] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    session: Optional[RAGSession] = Relationship(back_populates="messages")