from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
import uuid
import enum
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import ARRAY

# Defensive Forward Referencing to prevent Circular Imports
if TYPE_CHECKING:
    from .user import Department
    from .contribution import Contribution

class CourseLevel(str, enum.Enum):
    """Defensive strictly typed levels to prevent invalid DB entries."""
    L1 = "L1"
    L2 = "L2"
    L3 = "L3"
    M1 = "M1"
    M2 = "M2"
    OTHER = "OTHER"

class CourseType(str, enum.Enum):
    """Resource types matching US-06 taxonomy."""
    LECTURE = "LECTURE"
    TD = "TD"
    TP = "TP"
    EXAM = "EXAM"
    SUMMARY = "SUMMARY"
    OTHER = "OTHER"

class CourseLanguage(str, enum.Enum):
    """Supported languages for courses."""
    FR = "FR"
    EN = "EN"
    AR = "AR"

class Course(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(index=True)
    description: Optional[str] = None

    # US-06 Complete Taxonomy: niveau, type, année, langue
    level: CourseLevel = Field(default=CourseLevel.OTHER, index=True)
    course_type: CourseType = Field(default=CourseType.OTHER, index=True)
    academic_year: str = Field(index=True, description="Strict format expectation: YYYY-YYYY, e.g., 2025-2026")
    language: CourseLanguage = Field(default=CourseLanguage.FR, index=True)

    # US-08: Auto-tagging output from KeyBERT
    # FIX: Moved 'description' to Field() instead of Column()
    tags: Optional[List[str]] = Field(
        default=None,
        description="Top 5 keywords extracted by KeyBERT",
        sa_column=Column(ARRAY(String))
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)

    # US-06 Taxonomy: département
    department_id: Optional[uuid.UUID] = Field(foreign_key="department.id", index=True)
    department: Optional["Department"] = Relationship(back_populates="courses")

    # US-12: Bidirectional relationship to fetch all versions/contributions for this course efficiently
    contributions: List["Contribution"] = Relationship(back_populates="course")