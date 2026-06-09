"""add nutrition and food_id to meal_plan_slots

Revision ID: 0003
Revises: 3b462ff2024e
Create Date: 2026-05-26
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "3b462ff2024e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "meal_plan_slots",
        sa.Column("nutrition", postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "meal_plan_slots",
        sa.Column(
            "food_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("foods.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("meal_plan_slots", "food_id")
    op.drop_column("meal_plan_slots", "nutrition")
