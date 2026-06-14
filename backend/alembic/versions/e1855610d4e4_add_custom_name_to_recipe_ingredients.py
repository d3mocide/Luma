"""add custom_name to recipe_ingredients

Revision ID: e1855610d4e4
Revises: 531a666d106e
Create Date: 2026-06-14 22:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'e1855610d4e4'
down_revision: str | None = '531a666d106e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('recipe_ingredients', sa.Column('custom_name', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('recipe_ingredients', 'custom_name')
