import uuid
from enum import Enum
from datetime import datetime
from typing import Optional, List

from sqlmodel import SQLModel, Field, Relationship


class Department(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    courses: List["Course"] = Relationship(back_populates="department")


class Course(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    department_id: Optional[uuid.UUID] = Field(default=None, foreign_key="department.id")
    department: Optional[Department] = Relationship(back_populates="courses")


class DocumentPipelineStatus(str, Enum):
    QUEUED = "QUEUED"
    OCR_PROCESSING = "OCR_PROCESSING"
    EMBEDDING = "EMBEDDING"
    READY = "READY"
    FAILED = "FAILED"


class DocumentVersion(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    version_number: int = 1
    storage_path: str
    file_size_bytes: int
    sha256_hash: str = Field(index=True)
    ocr_text: Optional[str] = None
    language: str = "fr"
    pipeline_status: DocumentPipelineStatus = DocumentPipelineStatus.QUEUED
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

    contribution_id: uuid.UUID = Field(foreign_key="contribution.id")
    contribution: Optional["Contribution"] = Relationship(back_populates="document_versions")
    embeddings: List["DocumentEmbedding"] = Relationship(back_populates="document_version")
