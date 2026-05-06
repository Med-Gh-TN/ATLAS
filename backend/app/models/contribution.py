"""
@file backend/app/models/contribution.py
@description Contribution and DocumentVersion schemas.
SOTA FIX: Added academic_year to Contribution for dynamic material versioning.
@layer State Persistence
@dependencies sqlmodel, uuid, datetime
"""

from enum import Enum
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .user import User
from .course import CourseType, CourseLanguage


class ContributionStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    # US-11: New state allowing students to submit an improved version
    REVISION_REQUESTED = "REVISION_REQUESTED"


class DocumentPipelineStatus(str, Enum):
    QUEUED = "QUEUED"
    OCR_PROCESSING = "OCR_PROCESSING"
    EMBEDDING = "EMBEDDING"
    READY = "READY"
    FAILED = "FAILED"


class ContributorRequestStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class DocumentVersion(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    version_number: int = Field(default=1)
    storage_path: str = Field(description="MinIO/S3 object key path")

    # US-06 Requirements: 50MB limit tracking and mime-type strictness
    file_size_bytes: int = Field(description="File size in bytes. Must be validated <= 50MB.")
    mime_type: str = Field(default="application/pdf", description="Strictly PDF, DOCX, or PPTX")

    # US-06 Requirement: Deduplication
    sha256_hash: str = Field(index=True, description="SHA-256 hash for duplicate detection")

    # US-07 Requirements: Multilingual OCR, Quality, and Semantic Deduplication
    ocr_text: Optional[str] = Field(default=None, description="Extracted OCR or native text")
    language: Optional[str] = Field(
        default=None, max_length=10, description="Detected language code (e.g., 'fr', 'ar')"
    )
    quality_score: Optional[float] = Field(
        default=None, description="Laplacian variance score for scan quality/blur detection"
    )
    simhash: Optional[str] = Field(
        default=None, index=True, description="SimHash of extracted text for semantic deduplication"
    )

    pipeline_status: DocumentPipelineStatus = Field(default=DocumentPipelineStatus.QUEUED)
    parser_used: Optional[str] = Field(
        default=None, description="Parser used for OCR: docling, pdfplumber_hybrid, ollama_vision"
    )
    has_structured_content: bool = Field(
        default=False, description="True if document contains equations, tables, or code blocks"
    )
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

    # US-11 Requirement: Soft-delete mechanism for rejected/archived versions
    is_deleted: bool = Field(
        default=False,
        index=True,
        description="Flag for soft-deleted documents (filtered from search)",
    )

    contribution_id: uuid.UUID = Field(foreign_key="contribution.id", index=True)
    contribution: Optional["Contribution"] = Relationship(back_populates="document_versions")

    embeddings: List["DocumentEmbedding"] = Relationship(
        back_populates="document_version",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class Contribution(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(index=True)
    description: Optional[str] = None
    status: ContributionStatus = Field(default=ContributionStatus.PENDING)
    is_demo_submission: bool = Field(
        default=False,
        index=True,
        description="True when this upload is the demo document backing a contributor request.",
    )
    course_type: CourseType = Field(default=CourseType.OTHER, index=True)
    language: CourseLanguage = Field(default=CourseLanguage.FR, index=True)
    
    # 🚨 SOTA FIX: Moved academic_year to the Contribution level to prevent global course overwrites
    academic_year: Optional[str] = Field(default=None, index=True, description="E.g. '2024-2025'")

    # ARCHITECTURAL FIX: Temporal field required for FIFO/LIFO Queue sorting
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    # US-11 Requirement: Mandatory audit trail for rejections/revisions
    rejection_reason: Optional[str] = Field(
        default=None, description="Required when status is REJECTED or REVISION_REQUESTED"
    )

    # US-07 Requirement: Flag degraded scans for admin review
    quality_flag: bool = Field(
        default=False,
        index=True,
        description="Auto-flagged true if document scan quality is below OCR_QUALITY_ALERT_THRESHOLD",
    )

    uploader_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="user.id",
        index=True,
        nullable=True,
        ondelete="SET NULL",
    )
    uploader: Optional["User"] = Relationship(back_populates="contributions")

    # US-06: Link the physical upload to the academic course taxonomy
    course_id: Optional[uuid.UUID] = Field(default=None, foreign_key="course.id", index=True)

    # US-12: Complete the bidirectional mapping back to Course
    course: Optional["Course"] = Relationship(back_populates="contributions")

    document_versions: List[DocumentVersion] = Relationship(
        back_populates="contribution",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    contributor_request: Optional["ContributorRequest"] = Relationship(
        back_populates="demo_contribution"
    )


class ContributorRequest(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    demo_contribution_id: uuid.UUID = Field(
        foreign_key="contribution.id",
        unique=True,
        index=True,
        ondelete="CASCADE",
    )
    status: ContributorRequestStatus = Field(default=ContributorRequestStatus.PENDING, index=True)
    ocr_quality_score: float = Field(default=0.0)
    reviewed_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id", nullable=True)
    review_note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    reviewed_at: Optional[datetime] = None

    student: Optional["User"] = Relationship(
        back_populates="contributor_requests",
        sa_relationship_kwargs={"foreign_keys": "[ContributorRequest.student_id]"},
    )
    reviewer: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ContributorRequest.reviewed_by]"},
    )
    demo_contribution: Optional[Contribution] = Relationship(back_populates="contributor_request")


class ContributionCreate(SQLModel):
    title: str
    description: Optional[str] = None
    course_id: Optional[uuid.UUID] = None


class ContributionRead(ContributionCreate):
    id: uuid.UUID
    status: ContributionStatus
    uploader_id: uuid.UUID
    rejection_reason: Optional[str] = None
    created_at: datetime
    quality_flag: bool
    academic_year: Optional[str] = None