"""Add collaboration models and contract fields

Revision ID: b5d6a4f3c210
Revises: 412e8feb15b2
Create Date: 2026-03-31 15:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b5d6a4f3c210"
down_revision: Union[str, None] = "412e8feb15b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    userrole = sa.Enum("STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", name="userrole", create_type=False)
    userrole.create(op.get_bind(), checkfirst=True)
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'SUPERADMIN'")

    op.add_column("user", sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index(op.f("ix_user_onboarding_completed"), "user", ["onboarding_completed"], unique=False)

    op.create_table(
        "forumpost",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_forumpost_author_id"), "forumpost", ["author_id"], unique=False)
    op.create_index(op.f("ix_forumpost_course_id"), "forumpost", ["course_id"], unique=False)
    op.create_index(op.f("ix_forumpost_created_at"), "forumpost", ["created_at"], unique=False)
    op.create_index(op.f("ix_forumpost_status"), "forumpost", ["status"], unique=False)
    op.create_index(op.f("ix_forumpost_title"), "forumpost", ["title"], unique=False)
    op.create_index(op.f("ix_forumpost_updated_at"), "forumpost", ["updated_at"], unique=False)

    op.create_table(
        "forumreply",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["post_id"], ["forumpost.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_forumreply_author_id"), "forumreply", ["author_id"], unique=False)
    op.create_index(op.f("ix_forumreply_created_at"), "forumreply", ["created_at"], unique=False)
    op.create_index(op.f("ix_forumreply_is_pinned"), "forumreply", ["is_pinned"], unique=False)
    op.create_index(op.f("ix_forumreply_post_id"), "forumreply", ["post_id"], unique=False)
    op.create_index(op.f("ix_forumreply_updated_at"), "forumreply", ["updated_at"], unique=False)

    op.create_table(
        "forumvote",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("value >= -1 AND value <= 1", name="ck_forumvote_value"),
        sa.ForeignKeyConstraint(["post_id"], ["forumpost.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_forum_vote_post_user"),
    )
    op.create_index(op.f("ix_forumvote_post_id"), "forumvote", ["post_id"], unique=False)
    op.create_index(op.f("ix_forumvote_user_id"), "forumvote", ["user_id"], unique=False)

    op.create_table(
        "studygroup",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("notes_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_studygroup_course_id"), "studygroup", ["course_id"], unique=False)
    op.create_index(op.f("ix_studygroup_created_at"), "studygroup", ["created_at"], unique=False)
    op.create_index(op.f("ix_studygroup_name"), "studygroup", ["name"], unique=False)
    op.create_index(op.f("ix_studygroup_owner_id"), "studygroup", ["owner_id"], unique=False)
    op.create_index(op.f("ix_studygroup_updated_at"), "studygroup", ["updated_at"], unique=False)

    op.create_table(
        "studygroupmember",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("group_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["studygroup.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "user_id", name="uq_study_group_member"),
    )
    op.create_index(op.f("ix_studygroupmember_group_id"), "studygroupmember", ["group_id"], unique=False)
    op.create_index(op.f("ix_studygroupmember_user_id"), "studygroupmember", ["user_id"], unique=False)

    op.create_table(
        "livesession",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("current_page", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"]),
        sa.ForeignKeyConstraint(["teacher_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_livesession_course_id"), "livesession", ["course_id"], unique=False)
    op.create_index(op.f("ix_livesession_created_at"), "livesession", ["created_at"], unique=False)
    op.create_index(op.f("ix_livesession_is_active"), "livesession", ["is_active"], unique=False)
    op.create_index(op.f("ix_livesession_teacher_id"), "livesession", ["teacher_id"], unique=False)

    op.create_table(
        "learningpathjob",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("input_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("result_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_learningpathjob_created_at"), "learningpathjob", ["created_at"], unique=False)
    op.create_index(op.f("ix_learningpathjob_status"), "learningpathjob", ["status"], unique=False)
    op.create_index(op.f("ix_learningpathjob_updated_at"), "learningpathjob", ["updated_at"], unique=False)
    op.create_index(op.f("ix_learningpathjob_user_id"), "learningpathjob", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_learningpathjob_user_id"), table_name="learningpathjob")
    op.drop_index(op.f("ix_learningpathjob_updated_at"), table_name="learningpathjob")
    op.drop_index(op.f("ix_learningpathjob_status"), table_name="learningpathjob")
    op.drop_index(op.f("ix_learningpathjob_created_at"), table_name="learningpathjob")
    op.drop_table("learningpathjob")

    op.drop_index(op.f("ix_livesession_teacher_id"), table_name="livesession")
    op.drop_index(op.f("ix_livesession_is_active"), table_name="livesession")
    op.drop_index(op.f("ix_livesession_created_at"), table_name="livesession")
    op.drop_index(op.f("ix_livesession_course_id"), table_name="livesession")
    op.drop_table("livesession")

    op.drop_index(op.f("ix_studygroupmember_user_id"), table_name="studygroupmember")
    op.drop_index(op.f("ix_studygroupmember_group_id"), table_name="studygroupmember")
    op.drop_table("studygroupmember")

    op.drop_index(op.f("ix_studygroup_updated_at"), table_name="studygroup")
    op.drop_index(op.f("ix_studygroup_owner_id"), table_name="studygroup")
    op.drop_index(op.f("ix_studygroup_name"), table_name="studygroup")
    op.drop_index(op.f("ix_studygroup_created_at"), table_name="studygroup")
    op.drop_index(op.f("ix_studygroup_course_id"), table_name="studygroup")
    op.drop_table("studygroup")

    op.drop_index(op.f("ix_forumvote_user_id"), table_name="forumvote")
    op.drop_index(op.f("ix_forumvote_post_id"), table_name="forumvote")
    op.drop_table("forumvote")

    op.drop_index(op.f("ix_forumreply_updated_at"), table_name="forumreply")
    op.drop_index(op.f("ix_forumreply_post_id"), table_name="forumreply")
    op.drop_index(op.f("ix_forumreply_is_pinned"), table_name="forumreply")
    op.drop_index(op.f("ix_forumreply_created_at"), table_name="forumreply")
    op.drop_index(op.f("ix_forumreply_author_id"), table_name="forumreply")
    op.drop_table("forumreply")

    op.drop_index(op.f("ix_forumpost_updated_at"), table_name="forumpost")
    op.drop_index(op.f("ix_forumpost_title"), table_name="forumpost")
    op.drop_index(op.f("ix_forumpost_status"), table_name="forumpost")
    op.drop_index(op.f("ix_forumpost_created_at"), table_name="forumpost")
    op.drop_index(op.f("ix_forumpost_course_id"), table_name="forumpost")
    op.drop_index(op.f("ix_forumpost_author_id"), table_name="forumpost")
    op.drop_table("forumpost")

    op.drop_index(op.f("ix_user_onboarding_completed"), table_name="user")
    op.drop_column("user", "onboarding_completed")
