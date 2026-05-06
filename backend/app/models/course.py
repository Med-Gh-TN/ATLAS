from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
import uuid
import enum
from sqlmodel import SQLModel, Field, Relationship
import sqlalchemy as sa
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import ARRAY

if TYPE_CHECKING:
    from .contribution import Contribution
    from .user import Department
    from .major import Major  # new

class CourseLevel(str, enum.Enum):
    L1 = "L1"
    L2 = "L2"
    L3 = "L3"
    M1 = "M1"
    M2 = "M2"
    DOCTORAT = "Doctorat"
    OTHER = "OTHER"

class CourseType(str, enum.Enum):
    LECTURE = "LECTURE"
    TD = "TD"
    TP = "TP"
    EXAM = "EXAM"
    SUMMARY = "SUMMARY"
    OTHER = "OTHER"

class CourseLanguage(str, enum.Enum):
    FR = "FR"
    EN = "EN"
    AR = "AR"

class Course(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(index=True)
    description: Optional[str] = None

    level: CourseLevel = Field(default=CourseLevel.OTHER, index=True)
    academic_year: str = Field(index=True)
    tags: Optional[List[str]] = Field(default=None, sa_column=Column(ARRAY(String)))

    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False, index=True)

    department_id: Optional[uuid.UUID] = Field(sa_column=sa.Column(sa.ForeignKey("department.id", ondelete="CASCADE"), index=True))
    department: Optional["Department"] = Relationship(back_populates="courses")

    major_id: Optional[uuid.UUID] = Field(default=None, foreign_key="major.id", index=True, nullable=True)  # new
    filiere: Optional[str] = Field(default=None, index=True, description="Denormalized major name for legacy use")  # new

    major: Optional["Major"] = Relationship()  # new

    contributions: List["Contribution"] = Relationship(back_populates="course", sa_relationship_kwargs={"cascade": "all, delete-orphan"})