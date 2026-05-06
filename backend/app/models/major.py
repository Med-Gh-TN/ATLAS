"""
@file backend/app/models/major.py
@description Major (Filière) entity – belongs to a Department, has a level.
SOTA: Added is_deleted for soft‑delete (archiving).
@layer State Persistence
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

from .user import Department
from .course import CourseLevel

class Major(SQLModel, table=True):
    __tablename__ = "major"
    __table_args__ = (
        UniqueConstraint("department_id", "name", "level", name="uq_major_department_name_level"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True)
    department_id: uuid.UUID = Field(foreign_key="department.id", index=True, ondelete="CASCADE")
    level: CourseLevel = Field(index=True)

    is_deleted: bool = Field(default=False, index=True, description="Soft‑delete flag for archiving")
    
    created_at: datetime = Field(default_factory=datetime.utcnow)

    department: Optional[Department] = Relationship()