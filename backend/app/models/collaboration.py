from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
import uuid

from sqlalchemy import Column, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel


class ForumPostStatus(str, Enum):
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"


class ForumPost(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: uuid.UUID = Field(foreign_key="course.id", index=True)
    author_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    title: str = Field(index=True)
    content_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    status: ForumPostStatus = Field(default=ForumPostStatus.OPEN, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    replies: list["ForumReply"] = Relationship(
        back_populates="post",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    votes: list["ForumVote"] = Relationship(
        back_populates="post",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ForumReply(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    post_id: uuid.UUID = Field(foreign_key="forumpost.id", index=True)
    author_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    content_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    is_pinned: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    post: Optional[ForumPost] = Relationship(back_populates="replies")


class ForumVote(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_forum_vote_post_user"),)

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    post_id: uuid.UUID = Field(foreign_key="forumpost.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    value: int = Field(default=1, ge=-1, le=1)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    post: Optional[ForumPost] = Relationship(back_populates="votes")


class StudyGroup(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: Optional[uuid.UUID] = Field(default=None, foreign_key="course.id", index=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    notes_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    members: list["StudyGroupMember"] = Relationship(
        back_populates="group",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class StudyGroupMember(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_study_group_member"),)

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    group_id: uuid.UUID = Field(foreign_key="studygroup.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    joined_at: datetime = Field(default_factory=datetime.utcnow)

    group: Optional[StudyGroup] = Relationship(back_populates="members")


class LiveSession(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    teacher_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    course_id: uuid.UUID = Field(foreign_key="course.id", index=True)
    title: str
    current_page: int = Field(default=1)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    ended_at: Optional[datetime] = None


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
