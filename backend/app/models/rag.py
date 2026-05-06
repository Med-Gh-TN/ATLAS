"""
@file backend/app/models/rag.py
@description RAG Session Models.
SOTA FIX: Upgraded to multi-document arrays to support Omni-Architect full-subject queries.
@layer State Persistence
"""

import uuid
from typing import Optional, List
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PG_UUID

class RAGSession(SQLModel, table=True):
    """
    Tracks an active RAG chat session to enforce rate limits and track context.
    Upgraded for Multi-Document / Full-Subject Chat.
    """
    __tablename__ = "ragsession"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    
    # 🚨 SOTA FIX: PostgreSQL Array of UUIDs for Multi-Document RAG
    document_version_ids: Optional[List[uuid.UUID]] = Field(
        default_factory=list, 
        sa_column=Column(ARRAY(PG_UUID(as_uuid=True)))
    )
    
    message_count: int = Field(default=0, ge=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Strict cascade deletion to prevent orphaned messages if a session is purged
    messages: List["Message"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class Message(SQLModel, table=True):
    """
    Stores individual chat messages. Includes cosine similarity guard tracking 
    for strict anti-hallucination auditing.
    """
    __tablename__ = "message"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="ragsession.id", index=True)
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(...)
    source_page: Optional[int] = Field(default=None, description="Source page cited by the LLM")
    cosine_similarity: Optional[float] = Field(default=None, description="Vector search confidence score")
    chunk_text: Optional[str] = Field(default=None, description="The exact raw text substring matched by Qdrant hybrid search for X-Ray highlighting")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    session: Optional[RAGSession] = Relationship(back_populates="messages")