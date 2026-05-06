"""add GIN indexes for document_version_ids arrays

Revision ID: <your_revision_id>
Revises: <previous_revision>
Create Date: <current_date>

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b17c7639f8ad'
down_revision = '1b8e1bcbd230'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # GIN indexes speed up lookups like:
    #   WHERE document_version_ids @> ARRAY[<uuid>]::uuid[]
    # which SQLAlchemy generates for list equality comparisons.
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_flashcarddeck_document_version_ids "
        "ON flashcarddeck USING GIN (document_version_ids)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_quizsession_document_version_ids "
        "ON quizsession USING GIN (document_version_ids)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_summary_document_version_ids "
        "ON summary USING GIN (document_version_ids)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_mindmap_document_version_ids "
        "ON mindmap USING GIN (document_version_ids)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_flashcarddeck_document_version_ids")
    op.execute("DROP INDEX IF EXISTS ix_quizsession_document_version_ids")
    op.execute("DROP INDEX IF EXISTS ix_summary_document_version_ids")
    op.execute("DROP INDEX IF EXISTS ix_mindmap_document_version_ids")
