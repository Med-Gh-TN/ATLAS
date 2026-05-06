from typing import Optional
from datetime import datetime
import uuid
from sqlmodel import SQLModel, Field


class DocumentAnnotation(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    document_version_id: uuid.UUID = Field(
        foreign_key="documentversion.id", index=True
    )
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    page_number: int = Field(index=True)
    x: float = Field(description="Normalized X (0-1)")
    y: float = Field(description="Normalized Y (0-1)")
    content: str
    is_public: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
