from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "20260309_add_document_embedding"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "documentembedding",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_version_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("vector", Vector(384)),
        sa.Column("created_at", sa.DateTime(), nullable=False)
    )
    #op.create_index("ix_documentembedding_document_version_id", "documentembedding", ["document_version_id"])

def downgrade():
    op.drop_index("ix_documentembedding_document_version_id", table_name="documentembedding")
    op.drop_table("documentembedding")
