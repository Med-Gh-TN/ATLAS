from enum import Enum
from typing import Optional, List
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field, Relationship

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
