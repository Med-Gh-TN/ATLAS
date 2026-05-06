"""add major table and link to user / course

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-04 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Create major table
    op.create_table(
        'major',
        sa.Column('id', sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column('name', sa.String(), nullable=False, index=True),
        sa.Column('department_id', sa.UUID(), sa.ForeignKey('department.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('level', sa.Enum('L1','L2','L3','M1','M2','DOCTORAT','OTHER', name='courselevel', create_type=True), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('department_id', 'name', 'level', name='uq_major_department_name_level'),
    )

    # Add major_id to user
    op.add_column('user', sa.Column('major_id', sa.UUID(), sa.ForeignKey('major.id'), nullable=True, index=True))

    # Add major_id and filiere to course
    op.add_column('course', sa.Column('major_id', sa.UUID(), sa.ForeignKey('major.id'), nullable=True, index=True))
    op.add_column('course', sa.Column('filiere', sa.String(), nullable=True, index=True))

def downgrade() -> None:
    op.drop_column('course', 'filiere')
    op.drop_column('course', 'major_id')
    op.drop_column('user', 'major_id')
    op.drop_table('major')