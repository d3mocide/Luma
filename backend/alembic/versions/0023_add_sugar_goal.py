"""add daily_sugar_g_max to goals

Revision ID: 0023_add_sugar_goal
Revises: 0022_add_token_version
"""
import sqlalchemy as sa

from alembic import op

revision = '0023_add_sugar_goal'
down_revision = '0022_add_token_version'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "goals",
        sa.Column("daily_sugar_g_max", sa.Numeric(5, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("goals", "daily_sugar_g_max")
