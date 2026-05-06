from enum import Enum
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime, date
import uuid
from sqlmodel import SQLModel, Field, Relationship
import sqlalchemy as sa

# Defensive Forward Referencing to prevent Circular Imports
if TYPE_CHECKING:
    from .contribution import Contribution
    from .contribution import ContributorRequest
    from .course import Course
    from .major import Major  # new


class UserRole(str, Enum):
    STUDENT = "STUDENT"
    TEACHER = "TEACHER"
    ADMIN = "ADMIN"
    SUPERADMIN = "SUPERADMIN"


class AccountStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    SUSPENDED = "SUSPENDED"


class TeacherRequestStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class StudentLevel(str, Enum):
    L1 = "L1"
    L2 = "L2"
    L3 = "L3"
    M1 = "M1"
    M2 = "M2"
    DOCTORAT = "Doctorat"


class OTPPurpose(str, Enum):
    ACCOUNT_ACTIVATION = "ACCOUNT_ACTIVATION"
    TEACHER_ONBOARDING = "TEACHER_ONBOARDING"
    PASSWORD_RESET = "PASSWORD_RESET"


class Establishment(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True)
    domain: str = Field(index=True)
    is_authorized: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    departments: List["Department"] = Relationship(back_populates="establishment", cascade_delete=True)
    users: List["User"] = Relationship(back_populates="establishment", cascade_delete=True)


class Department(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True)
    establishment_id: uuid.UUID = Field(foreign_key="establishment.id", ondelete="CASCADE")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False, index=True, description="Soft‑delete flag for archiving")
    establishment: Optional[Establishment] = Relationship(back_populates="departments")
    teacher_profiles: List["TeacherProfile"] = Relationship(back_populates="department")
    courses: List["Course"] = Relationship(back_populates="department")
    majors: List["Major"] = Relationship(back_populates="department")  # new


class Gender(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"
    PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY"


class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    full_name: Optional[str] = None
    role: UserRole = UserRole.STUDENT
    status: AccountStatus = Field(default=AccountStatus.ACTIVE)
    establishment_id: Optional[uuid.UUID] = Field(default=None, foreign_key="establishment.id", nullable=True)

    trust_score: int = Field(default=0)
    profile_completeness: int = Field(default=0)

    is_active: bool = False
    is_verified: bool = False
    verified_at: Optional[datetime] = Field(default=None)
    is_contributor: bool = Field(default=False, index=True)
    contributor_badge_awarded_at: Optional[datetime] = Field(default=None)

    filiere: Optional[str] = None  # kept for backward compat, will be removed later
    major_id: Optional[uuid.UUID] = Field(default=None, foreign_key="major.id", index=True, nullable=True)  # new
    level: Optional[StudentLevel] = None
    student_id: Optional[str] = Field(default=None, index=True)
    program: Optional[str] = Field(default=None)
    academic_year: Optional[str] = Field(default=None)
    date_of_birth: Optional[date] = Field(default=None)
    gender: Optional[Gender] = Field(default=None)
    phone_number: Optional[str] = Field(default=None)
    address: Optional[str] = Field(default=None)
    preferred_language: Optional[str] = Field(default=None)
    profile_picture_url: Optional[str] = Field(default=None)

    onboarding_completed: bool = Field(default=False, index=True)
    push_notifications_enabled: bool = Field(default=True)
    email_digest_enabled: bool = Field(default=False)
    notification_types: list[str] = Field(
        default_factory=lambda: ["contributions", "achievements", "reminders", "leaderboard"],
        sa_column=sa.Column(sa.JSON(), nullable=False)
    )
    is_rtl: bool = Field(default=False)


class TeacherProfile(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", unique=True, ondelete="CASCADE")
    department_id: Optional[uuid.UUID] = Field(foreign_key="department.id", nullable=True, ondelete="SET NULL")
    specialization: Optional[str] = None
    modules: Optional[str] = None
    invite_token: Optional[str] = Field(default=None, unique=True, index=True)
    invite_expires_at: Optional[datetime] = None

    user: Optional["User"] = Relationship(back_populates="teacher_profile")
    department: Optional[Department] = Relationship(back_populates="teacher_profiles")


class TeacherVerificationRequest(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", unique=True, ondelete="CASCADE")
    requested_department: str = Field(index=True)
    requested_domain: str = Field(index=True)
    establishment_id: Optional[uuid.UUID] = Field(default=None, foreign_key="establishment.id", nullable=True)
    status: TeacherRequestStatus = Field(default=TeacherRequestStatus.PENDING, index=True)
    reviewed_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id", nullable=True)
    review_note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_at: Optional[datetime] = None

    user: Optional["User"] = Relationship(
        back_populates="teacher_request",
        sa_relationship_kwargs={"foreign_keys": "[TeacherVerificationRequest.user_id]"},
    )
    establishment: Optional[Establishment] = Relationship()


class UserStreak(SQLModel, table=True):
    """Tracks daily learning streaks (decoupled from XP)."""

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, unique=True)

    current_streak: int = Field(
        default=0, description="Current consecutive days of activity"
    )
    longest_streak: int = Field(
        default=0, description="All-time longest streak achieved"
    )
    last_activity_date: Optional[datetime] = Field(
        default=None, description="Date of last recorded activity"
    )
    total_active_days: int = Field(
        default=0, description="Total unique days with activity"
    )

    freeze_start: Optional[datetime] = Field(default=None)
    freeze_end: Optional[datetime] = Field(default=None)

    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="streak")


class User(UserBase, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    contributions: List["Contribution"] = Relationship(back_populates="uploader")
    otp_tokens: List["OTPToken"] = Relationship(back_populates="user", cascade_delete=True)
    teacher_profile: Optional[TeacherProfile] = Relationship(back_populates="user", cascade_delete=True)
    establishment: Optional[Establishment] = Relationship(back_populates="users")
    teacher_request: Optional[TeacherVerificationRequest] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"foreign_keys": "[TeacherVerificationRequest.user_id]"},
        cascade_delete=True,
    )
    contributor_requests: List["ContributorRequest"] = Relationship(
        back_populates="student",
        sa_relationship_kwargs={"foreign_keys": "[ContributorRequest.student_id]"},
        cascade_delete=True,
    )
    major: Optional["Major"] = Relationship()
    # Study streak (replaces gamification streak)
    streak: Optional[UserStreak] = Relationship(back_populates="user", cascade_delete=True)


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: uuid.UUID
    created_at: datetime


class OTPToken(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    purpose: OTPPurpose
    otp_code_hash: str
    expires_at: datetime
    attempts: int = Field(default=0)
    max_attempts: int = Field(default=5)
    is_used: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    consumed_at: Optional[datetime] = None

    user: Optional[User] = Relationship(back_populates="otp_tokens")