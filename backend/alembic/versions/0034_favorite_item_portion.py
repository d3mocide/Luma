"""record the portion unit a favorite item was built with

Revision ID: 0034_favorite_item_portion
Revises: 0033_add_water_presets
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0034_favorite_item_portion'
down_revision: str | None = '0033_add_water_presets'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable: favorites saved before this migration have no recorded measure
    # and keep displaying in grams.
    op.add_column("favorite_items", sa.Column("quantity", sa.Float(), nullable=True))
    op.add_column("favorite_items", sa.Column("unit", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("favorite_items", "unit")
    op.drop_column("favorite_items", "quantity")
