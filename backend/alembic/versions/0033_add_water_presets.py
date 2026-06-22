"""add water_presets to users

Revision ID: 0033_add_water_presets
Revises: 0032_seed_sodium_goal
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = '0033_add_water_presets'
down_revision: Union[str, None] = '0032_seed_sodium_goal'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
