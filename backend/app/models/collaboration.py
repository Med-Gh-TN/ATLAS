"""
@file backend/app/models/collaboration.py
@description Legacy collaboration models removed. Only LearningPathJob remains.
@layer Core Logic
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
import uuid

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class LearningPathJobStatus(str, Enum):
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class LearningPathJob(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    input_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    result_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    status: LearningPathJobStatus = Field(default=LearningPathJobStatus.PROCESSING, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)