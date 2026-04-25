from enum import Enum
from typing import Optional
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import UniqueConstraint


class XPTransactionType(str, Enum):
    UPLOAD = "UPLOAD"
    APPROVAL = "APPROVAL"
    REFERRAL = "REFERRAL"


class XPTransaction(SQLModel, table=True):
    # US-11: Defensive Architecture.
    # Prevent double-crediting XP for the same action (e.g., clicking "Approve" twice causing a race condition)
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "transaction_type",
            "reference_id",
            name="uq_xp_transaction_reference",
        ),
    )

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    amount: int = Field(
        description="Amount of XP awarded. Can be negative for penalties."
    )
    transaction_type: XPTransactionType

    # US-11 Gamification Tracking: Link the XP gain explicitly to the Contribution ID that triggered it
    reference_id: Optional[uuid.UUID] = Field(
        default=None,
        index=True,
        description="ID of the entity (e.g., Contribution) that triggered this transaction",
    )

    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Use string reference "User" to avoid circular imports
    user: Optional["User"] = Relationship(back_populates="xp_transactions")


class Badge(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(unique=True, index=True)
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    min_xp: int = Field(default=0, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserBadge(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "badge_id", name="uq_user_badge"),)

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    badge_id: uuid.UUID = Field(foreign_key="badge.id", index=True)
    awarded_at: datetime = Field(default_factory=datetime.utcnow)


class UserStreak(SQLModel, table=True):
    """US-XX: Tracks daily learning streaks for gamification."""

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

    user: Optional["User"] = Relationship()
