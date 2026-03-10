import uuid
from enum import Enum
from datetime import datetime
from typing import Optional, List

from sqlmodel import SQLModel, Field, Relationship


class ContributionStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class Contribution(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str
    description: Optional[str] = None
    status: ContributionStatus = ContributionStatus.PENDING
    uploader_id: uuid.UUID = Field(foreign_key="user.id")
    uploader: Optional["User"] = Relationship(back_populates="contributions")
    document_versions: List["DocumentVersion"] = Relationship(back_populates="contribution")


class ContributionCreate(SQLModel):
    title: str
    description: Optional[str] = None


class ContributionRead(ContributionCreate):
    id: uuid.UUID
    status: ContributionStatus
    uploader_id: uuid.UUID


class XPTransactionType(str, Enum):
    UPLOAD = "UPLOAD"
    APPROVAL = "APPROVAL"
    REFERRAL = "REFERRAL"


class XPTransaction(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    amount: int
    transaction_type: XPTransactionType
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user: Optional["User"] = Relationship(back_populates="xp_transactions")

