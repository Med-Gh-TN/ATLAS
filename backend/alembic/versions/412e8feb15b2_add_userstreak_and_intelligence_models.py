"""Add UserStreak and Intelligence models

Revision ID: 412e8feb15b2
Revises: 7ba4e1182a2b
Create Date: 2026-03-30 11:23:38.545482

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "412e8feb15b2"
down_revision: Union[str, None] = "7ba4e1182a2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # UserStreak table
    op.create_table(
        "userstreak",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("current_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("longest_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_activity_date", sa.Date(), nullable=True),
        sa.Column(
            "streak_freeze_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "total_active_days", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        op.f("ix_userstreak_user_id"), "userstreak", ["user_id"], unique=True
    )

    # TopicKnowledge table
    op.create_table(
        "topicknowledge",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("topic_name", sa.String(length=255), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_quiz_id", sa.Uuid(), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("review_due_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_topicknowledge_course_id"),
        "topicknowledge",
        ["course_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_topicknowledge_topic_name"),
        "topicknowledge",
        ["topic_name"],
        unique=False,
    )
    op.create_index(
        op.f("ix_topicknowledge_user_id"), "topicknowledge", ["user_id"], unique=False
    )

    # UserMemory table
    op.create_table(
        "usermemory",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("memory_type", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("related_course_id", sa.Uuid(), nullable=True),
        sa.Column("related_document_id", sa.Uuid(), nullable=True),
        sa.Column("importance_score", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("is_forgotten", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["related_course_id"], ["course.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_usermemory_memory_type"), "usermemory", ["memory_type"], unique=False
    )
    op.create_index(
        op.f("ix_usermemory_user_id"), "usermemory", ["user_id"], unique=False
    )

    # LearningInsight table
    op.create_table(
        "learninginsight",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("insight_type", sa.String(length=50), nullable=False),
        sa.Column("insight_text", sa.Text(), nullable=False),
        sa.Column("action_type", sa.String(length=50), nullable=False),
        sa.Column("action_payload", sa.Text(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_actioned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_learninginsight_insight_type"),
        "learninginsight",
        ["insight_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_learninginsight_user_id"), "learninginsight", ["user_id"], unique=False
    )

    # UserProfile table
    op.create_table(
        "userprofile",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("learning_speed", sa.String(length=20), nullable=True),
        sa.Column("preferred_style", sa.String(length=20), nullable=True),
        sa.Column(
            "avg_quiz_time_seconds", sa.Float(), nullable=False, server_default="0.0"
        ),
        sa.Column(
            "total_quizzes_taken", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "detection_confidence", sa.Float(), nullable=False, server_default="0.0"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        op.f("ix_userprofile_user_id"), "userprofile", ["user_id"], unique=True
    )


def downgrade() -> None:
    op.drop_table("userprofile")
    op.drop_table("learninginsight")
    op.drop_table("usermemory")
    op.drop_table("topicknowledge")
    op.drop_table("userstreak")
