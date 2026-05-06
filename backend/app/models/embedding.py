"""
@file backend/app/models/embedding.py
@description Legacy compatibility model for document chunks.
@layer State Persistence
"""

from typing import Optional
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Relationship

class DocumentEmbedding(SQLModel, table=True):
    """
    Legacy compatibility model.

    The platform now stores embeddings in Qdrant. This model is kept strictly
    to satisfy existing foreign key relationships in `DocumentVersion` during
    cleanup and migration, but no longer stores vector data locally.
    """

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True)

    chunk_index: int = 0
    chunk_text: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Use quotes to avoid circular imports if DocumentVersion is defined elsewhere
    document_version: Optional["DocumentVersion"] = Relationship(back_populates="embeddings")