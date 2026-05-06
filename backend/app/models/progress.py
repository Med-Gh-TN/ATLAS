from datetime import datetime
from typing import Optional
import uuid
from sqlmodel import SQLModel, Field


class ReadingProgress(SQLModel, table=True):
    """
    US-XX: Active Learning Panel persistence.
    Tracks the user's exact scroll position and active page for seamless resuming.
    """

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    document_version_id: uuid.UUID = Field(
        foreign_key="documentversion.id", index=True, ondelete="CASCADE"
    )

    last_page: int = Field(
        default=1, description="The last active page number read by the user."
    )
    scroll_y: float = Field(
        default=0.0, description="The exact vertical scroll coordinate."
    )

    last_accessed_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of the last telemetry ping.",
    )