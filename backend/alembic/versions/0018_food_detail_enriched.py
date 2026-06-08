"""add detail_enriched flag to foods

Revision ID: 0018_food_detail_enriched
Revises: 0017_food_household_measures
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa

revision = '0018_food_detail_enriched'
down_revision = '0017_food_household_measures'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'foods',
        sa.Column('detail_enriched', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('foods', 'detail_enriched')
