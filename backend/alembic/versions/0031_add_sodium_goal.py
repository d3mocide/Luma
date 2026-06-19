"""add daily_sodium_mg_max to goals

Sodium replaces added sugar as the third budgeted ceiling metric (activity ring,
budget widget, streak). The legacy daily_sugar_g_max column is left in place so
existing data is preserved and the change is reversible; it is simply no longer
read or written by the API.

Revision ID: 0031_add_sodium_goal
Revises: 0030
"""
import sqlalchemy as sa

from alembic import op

revision = '0031_add_sodium_goal'
down_revision = '0030'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "goals",
        sa.Column("daily_sodium_mg_max", sa.Numeric(7, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("goals", "daily_sodium_mg_max")
