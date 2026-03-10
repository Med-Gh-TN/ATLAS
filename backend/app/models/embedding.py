import uuid
from datetime import datetime
from typing import Optional, List

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlmodel import SQLModel, Field, Relationship


class DocumentEmbedding(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True)
    vector: Optional[List[float]] = Field(sa_column=sa.Column(Vector(768)))
    chunk_index: int = 0
    chunk_text: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    document_version: Optional["DocumentVersion"] = Relationship(back_populates="embeddings")

