from enum import Enum
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .contribution import Contribution
    from .gamification import XPTransaction

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
    VERIFY_EMAIL = "VERIFY_EMAIL"
    TEACHER_INVITE = "TEACHER_INVITE"
    RESET_PASSWORD = "RESET_PASSWORD"

class UserBase(SQLModel):
    """
    Base shared properties for User models.
    """
    email: str = Field(unique=True, index=True)
    full_name: Optional[str] = None
    role: UserRole = UserRole.STUDENT
    is_active: bool = True
    is_verified: bool = False
    
    # Student specific fields
    filiere: Optional[str] = None  # Major/Department
    level: Optional[StudentLevel] = None

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
    """
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    purpose: OTPPurpose
    otp_code_hash: str # Stored as a hash to prevent database leak vulnerabilities
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    consumed_at: Optional[datetime] = None

    # Relationship back to User
    user: Optional[User] = Relationship(back_populates="otp_tokens")