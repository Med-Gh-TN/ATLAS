"""add_gin_indexes_for_document_version_ids

Revision ID: c7c407600b95
Revises: b17c7639f8ad
Create Date: 2026-05-05 17:00:00.307616

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel # Added to support SQLModel specific types if needed


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_flashcarddeck_document_version_ids "
        "ON flashcarddeck USING GIN (document_version_ids)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_quizsession_document_version_ids "
        "ON quizsession USING GIN (document_version_ids)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_summary_document_version_ids "
        "ON summary USING GIN (document_version_ids)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_mindmap_document_version_ids "
        "ON mindmap USING GIN (document_version_ids)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_flashcarddeck_document_version_ids")
    op.execute("DROP INDEX IF EXISTS ix_quizsession_document_version_ids")
    op.execute("DROP INDEX IF EXISTS ix_summary_document_version_ids")
    op.execute("DROP INDEX IF EXISTS ix_mindmap_document_version_ids")