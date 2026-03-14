from enum import Enum
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Relationship

# Defensive Forward Referencing to prevent Circular Imports
if TYPE_CHECKING:
    from .contribution import Contribution
    from .gamification import XPTransaction
    from .course import Course


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


class OTPPurpose(str, Enum):
    """
    Strictly defined OTP types per US-03 and US-05 specifications.
    """
    ACCOUNT_ACTIVATION = "ACCOUNT_ACTIVATION"
    TEACHER_ONBOARDING = "TEACHER_ONBOARDING"
    PASSWORD_RESET = "PASSWORD_RESET"


class Establishment(SQLModel, table=True):
    """
    Educational establishment (e.g., University, School) for teacher affiliation.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True)
    domain: str = Field(unique=True, index=True, description="Email domain associated with the establishment for CSV validation (e.g., univ-paris.fr)")
    
    departments: List["Department"] = Relationship(back_populates="establishment", cascade_delete=True)


class Department(SQLModel, table=True):
    """
    Department within an establishment (e.g., Computer Science, Mathematics).
    Merged to resolve Alembic MetaData collision. Acts as the single source of truth.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True)
    establishment_id: uuid.UUID = Field(foreign_key="establishment.id", ondelete="CASCADE")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    establishment: Optional[Establishment] = Relationship(back_populates="departments")
    teacher_profiles: List["TeacherProfile"] = Relationship(back_populates="department")
    # US-06: Bidirectional relationship to Course added during consolidation
    courses: List["Course"] = Relationship(back_populates="department")


class UserBase(SQLModel):
    """
    Base shared properties for User models.
    """
    email: str = Field(unique=True, index=True)
    full_name: Optional[str] = None
    role: UserRole = UserRole.STUDENT
    
    # Security: Accounts must be explicitly activated via OTP
    is_active: bool = False
    
    # Represents the "Enseignant Vérifié" badge or general verification
    is_verified: bool = False
    verified_at: Optional[datetime] = Field(default=None, description="Timestamp of when the user was verified")
    
    # Student specific fields
    filiere: Optional[str] = None  # Major/Department
    level: Optional[StudentLevel] = None


class TeacherProfile(SQLModel, table=True):
    """
    Teacher-specific profile data linked to a generic User account.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", unique=True, ondelete="CASCADE")
    department_id: Optional[uuid.UUID] = Field(foreign_key="department.id", nullable=True, ondelete="SET NULL")
    
    specialization: Optional[str] = Field(default=None, description="Teacher's primary field of expertise")
    modules: Optional[str] = Field(default=None, description="Comma-separated or JSON string of taught modules")
    
    user: Optional["User"] = Relationship(back_populates="teacher_profile")
    department: Optional[Department] = Relationship(back_populates="teacher_profiles")


class User(UserBase, table=True):
    """
    Database table for Users.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    contributions: List["Contribution"] = Relationship(back_populates="uploader")
    xp_transactions: List["XPTransaction"] = Relationship(back_populates="user")
    otp_tokens: List["OTPToken"] = Relationship(back_populates="user", cascade_delete=True)
    teacher_profile: Optional[TeacherProfile] = Relationship(back_populates="user", cascade_delete=True)


class UserCreate(UserBase):
    """
    Properties to receive via API on creation.
    """
    password: str


class UserRead(UserBase):
    """
    Properties to return via API.
    """
    id: uuid.UUID
    created_at: datetime


class OTPToken(SQLModel, table=True):
    """
    Database table for storing hashed One-Time Passwords (OTPs).
    Hiding the raw OTP and only storing the hash is a security best practice.
    Tracks validation attempts to prevent brute force attacks.
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    purpose: OTPPurpose
    otp_code_hash: str  # Stored as a hash to prevent database leak vulnerabilities
    expires_at: datetime
    
    # Usage and brute-force protection
    attempts: int = Field(default=0, description="Tracks the number of failed verification attempts")
    max_attempts: int = Field(default=5, description="Max allowed attempts (Strictly 1 for TEACHER_ONBOARDING)")
    is_used: bool = Field(default=False, description="Flagged true upon successful verification")
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    consumed_at: Optional[datetime] = None

    # Relationship back to User
    user: Optional[User] = Relationship(back_populates="otp_tokens")