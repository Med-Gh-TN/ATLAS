"""drop_xp_gamification_tables

Revision ID: 1b8e1bcbd230
Revises: 0002
Create Date: 2026-05-04 22:50:34.518392

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "1b8e1bcbd230"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # drop dependent tables first (order matters because of foreign keys)
    op.drop_table("userbadge")
    op.drop_table("xptransaction")
    op.drop_table("badge")

    # drop orphaned enum type
    sa_enum = postgresql.ENUM("UPLOAD", "APPROVAL", "REFERRAL", name="xptransactiontype")
    sa_enum.drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # irreversible removal
    pass
