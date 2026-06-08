"""add household_measures to foods

Revision ID: 0017_food_household_measures
Revises: 0016_family_sharing
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0017_food_household_measures'
down_revision = '0016_family_sharing'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'foods',
        sa.Column('household_measures', JSONB(), nullable=False, server_default='[]'),
    )


def downgrade() -> None:
    op.drop_column('foods', 'household_measures')
