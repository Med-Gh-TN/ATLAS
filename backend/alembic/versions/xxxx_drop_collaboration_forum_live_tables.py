"""drop legacy collaboration & live tables

Revision ID: 0002_drop_legacy_collab
Revises: 0001_baseline
Create Date: 2026-05-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '0002_drop_legacy_collab'
down_revision: Union[str, None] = '0001_baseline'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop tables in correct order (child tables first, then parents)
    # Forum ecosystem
    op.drop_table('forumvote')
    op.drop_table('forumreply')
    op.drop_table('forumpost')
    # Study groups
    op.drop_table('studygroupmember')
    op.drop_table('studygroup')
    # Live sessions
    op.drop_table('livesession')


def downgrade() -> None:
    # Recreate tables in reverse order (not necessary for removal but provided for completeness)
    # Recreate livesession
    op.create_table('livesession',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('teacher_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), index=True),
        sa.Column('course_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('course.id'), index=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('current_page', sa.Integer(), default=1),
        sa.Column('is_active', sa.Boolean(), default=True, index=True),
        sa.Column('created_at', sa.DateTime(), index=True),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
    )
    # Recreate studygroup
    op.create_table('studygroup',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('course_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('course.id'), index=True, nullable=True),
        sa.Column('owner_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), index=True),
        sa.Column('name', sa.String(), index=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('notes_json', sa.dialects.postgresql.JSONB(), default=dict),
        sa.Column('created_at', sa.DateTime(), index=True),
        sa.Column('updated_at', sa.DateTime(), index=True),
    )
    # Recreate studygroupmember
    op.create_table('studygroupmember',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('group_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('studygroup.id'), index=True),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), index=True),
        sa.Column('joined_at', sa.DateTime()),
        sa.UniqueConstraint('group_id', 'user_id', name='uq_study_group_member'),
    )
    # Recreate forumpost
    op.create_table('forumpost',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('course_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('course.id'), index=True),
        sa.Column('author_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), index=True),
        sa.Column('title', sa.String(), index=True),
        sa.Column('content_json', sa.dialects.postgresql.JSONB(), default=dict),
        sa.Column('status', sa.Enum('OPEN', 'RESOLVED', name='forumpoststatus'), index=True, default='OPEN'),
        sa.Column('created_at', sa.DateTime(), index=True),
        sa.Column('updated_at', sa.DateTime(), index=True),
    )
    # Recreate forumreply
    op.create_table('forumreply',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('post_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('forumpost.id'), index=True),
        sa.Column('author_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), index=True),
        sa.Column('content_json', sa.dialects.postgresql.JSONB(), default=dict),
        sa.Column('is_pinned', sa.Boolean(), default=False, index=True),
        sa.Column('created_at', sa.DateTime(), index=True),
        sa.Column('updated_at', sa.DateTime(), index=True),
    )
    # Recreate forumvote
    op.create_table('forumvote',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('post_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('forumpost.id'), index=True),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), index=True),
        sa.Column('value', sa.Integer(), default=1),
        sa.Column('created_at', sa.DateTime()),
        sa.UniqueConstraint('post_id', 'user_id', name='uq_forum_vote_post_user'),
    )