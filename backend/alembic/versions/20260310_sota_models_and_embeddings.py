from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "20260310_sota_models_and_embeddings"
down_revision = "20260309_add_document_embedding"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "otptoken",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("otp_code_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_otptoken_user_id", "otptoken", ["user_id"])

    op.create_table(
        "xptransaction",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("transaction_type", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_xptransaction_user_id", "xptransaction", ["user_id"])

    op.create_table(
        "department",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_department_name", "department", ["name"], unique=True)

    op.create_table(
        "course",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("department_id", sa.Uuid(), sa.ForeignKey("department.id"), nullable=True),
    )
    op.create_index("ix_course_department_id", "course", ["department_id"])

    op.drop_index("ix_documentembedding_document_version_id", table_name="documentembedding")
    op.drop_table("documentembedding")

    op.create_table(
        "documentembedding",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_version_id", sa.Uuid(), sa.ForeignKey("documentversion.id"), nullable=False),
        sa.Column("vector", Vector(768), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_documentembedding_document_version_id", "documentembedding", ["document_version_id"])


def downgrade():
    op.drop_index("ix_documentembedding_document_version_id", table_name="documentembedding")
    op.drop_table("documentembedding")

    op.drop_index("ix_course_department_id", table_name="course")
    op.drop_table("course")

    op.drop_index("ix_department_name", table_name="department")
    op.drop_table("department")

    op.drop_index("ix_xptransaction_user_id", table_name="xptransaction")
    op.drop_table("xptransaction")

    op.drop_index("ix_otptoken_user_id", table_name="otptoken")
    op.drop_table("otptoken")

