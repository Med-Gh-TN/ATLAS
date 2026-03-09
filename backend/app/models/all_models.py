
import uuid
from typing import Optional, List
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship

class UserRole(str, Enum):
    STUDENT = "STUDENT"
    TEACHER = "TEACHER"
    ADMIN = "ADMIN"

class StudentLevel(str, Enum):
    L1 = "L1"
    L2 = "L2"
    L3 = "L3"
    M1 = "M1"
    M2 = "M2"

class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    full_name: Optional[str] = None
    role: UserRole = UserRole.STUDENT
    is_active: bool = True
    is_verified: bool = False
    
    # Student specific fields
    filiere: Optional[str] = None # Major/Department
    level: Optional[StudentLevel] = None

class User(UserBase, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    contributions: List["Contribution"] = Relationship(back_populates="uploader")

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: uuid.UUID
    created_at: datetime

# --- Contribution Models ---

class ContributionStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

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
    sha256_hash: str = Field(index=True) # For duplicate detection
    ocr_text: Optional[str] = None
    language: str = "fr"
    pipeline_status: DocumentPipelineStatus = DocumentPipelineStatus.QUEUED
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    
    contribution_id: uuid.UUID = Field(foreign_key="contribution.id")
    contribution: Optional["Contribution"] = Relationship(back_populates="document_versions")

class Contribution(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str
    description: Optional[str] = None
    status: ContributionStatus = ContributionStatus.PENDING
    
    uploader_id: uuid.UUID = Field(foreign_key="user.id")
    uploader: Optional[User] = Relationship(back_populates="contributions")
    
    document_versions: List[DocumentVersion] = Relationship(back_populates="contribution")

class ContributionCreate(SQLModel):
    title: str
    description: Optional[str] = None

class ContributionRead(ContributionCreate):
    id: uuid.UUID
    status: ContributionStatus
    uploader_id: uuid.UUID
