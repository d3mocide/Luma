"""add medications and supplements tables

Revision ID: 0024_medications_supplements
Revises: 0023_add_sugar_goal
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = '0024_medications_supplements'
down_revision = '0023_add_sugar_goal'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "medications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("generic_name", sa.Text, nullable=True),
        sa.Column("dose", sa.Text, nullable=True),
        sa.Column("frequency", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_medications_user_id", "medications", ["user_id"])

    op.create_table(
        "supplements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("dose", sa.Text, nullable=True),
        sa.Column("frequency", sa.Text, nullable=True),
        sa.Column("nutrients_per_dose", JSONB, nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_supplements_user_id", "supplements", ["user_id"])


def downgrade() -> None:
    op.drop_table("supplements")
    op.drop_table("medications")
