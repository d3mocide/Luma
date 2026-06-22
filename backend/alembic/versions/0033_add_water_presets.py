"""add water_presets to users

Revision ID: 0033_add_water_presets
Revises: 0032_seed_sodium_goal
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0033_add_water_presets'
down_revision: str | None = '0032_seed_sodium_goal'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "water_presets",
            sa.ARRAY(sa.Integer()),
            nullable=False,
            server_default="{250,500,750}",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "water_presets")
