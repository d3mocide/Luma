"""add flags column to foods

Revision ID: 0010_food_flags
Revises: 0009_slot_locked
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = '0010_food_flags'
down_revision = '0009_slot_locked'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'foods',
        sa.Column('flags', ARRAY(sa.Text()), nullable=False, server_default='{}'),
    )
    op.create_index(
        'ix_foods_flags',
        'foods',
        ['flags'],
        postgresql_using='gin',
    )


def downgrade() -> None:
    op.drop_index('ix_foods_flags', table_name='foods')
    op.drop_column('foods', 'flags')
