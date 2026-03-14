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
        UniqueConstraint("user_id", "transaction_type", "reference_id", name="uq_xp_transaction_reference"),
    )

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    
    amount: int = Field(description="Amount of XP awarded. Can be negative for penalties.")
    transaction_type: XPTransactionType
    
    # US-11 Gamification Tracking: Link the XP gain explicitly to the Contribution ID that triggered it
    reference_id: Optional[uuid.UUID] = Field(default=None, index=True, description="ID of the entity (e.g., Contribution) that triggered this transaction")
    
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Use string reference "User" to avoid circular imports
    user: Optional["User"] = Relationship(back_populates="xp_transactions")