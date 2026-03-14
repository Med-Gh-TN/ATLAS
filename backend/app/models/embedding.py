from typing import Optional, List
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Relationship
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa
from sqlalchemy import Index

class DocumentEmbedding(SQLModel, table=True):
    # US-08: HNSW Index for sub-100ms Approximate Nearest Neighbor (ANN) search
    # Using cosine similarity ops matching the MPNet model training objective
    __table_args__ = (
        Index(
            "ix_document_embedding_vector_hnsw",
            "vector",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"vector": "vector_cosine_ops"},
        ),
    )

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    document_version_id: uuid.UUID = Field(foreign_key="documentversion.id", index=True)
    
    # 768 dimensions for multilingual-mpnet-base-v2 (SOTA)
    vector: Optional[List[float]] = Field(sa_column=sa.Column(Vector(768)))
    
    chunk_index: int = 0
    chunk_text: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Use quotes to avoid circular imports if DocumentVersion is defined elsewhere
    document_version: Optional["DocumentVersion"] = Relationship(back_populates="embeddings")