from datetime import datetime
from typing import Optional, TYPE_CHECKING
import uuid
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.user import User


class Notification(SQLModel, table=True):
    """
    US-11: In-app notification persistence.
    Tracks document status changes and feedback for students.
    """

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")

    title: str
    message: str
    is_read: bool = Field(default=False)

    contribution_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="contribution.id", ondelete="SET NULL"
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship()