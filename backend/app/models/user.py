import uuid
from enum import Enum
from datetime import datetime
from typing import Optional, List

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


class OTPPurpose(str, Enum):
    VERIFY_EMAIL = "VERIFY_EMAIL"
    TEACHER_INVITE = "TEACHER_INVITE"


class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    full_name: Optional[str] = None
    role: UserRole = UserRole.STUDENT
    is_active: bool = True
    is_verified: bool = False
    filiere: Optional[str] = None
    level: Optional[StudentLevel] = None


class User(UserBase, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    contributions: List["Contribution"] = Relationship(back_populates="uploader")
    otp_tokens: List["OTPToken"] = Relationship(back_populates="user")
    xp_transactions: List["XPTransaction"] = Relationship(back_populates="user")


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: uuid.UUID
    created_at: datetime


class OTPToken(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    purpose: OTPPurpose
    otp_code_hash: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    consumed_at: Optional[datetime] = None
    user: Optional[User] = Relationship(back_populates="otp_tokens")

