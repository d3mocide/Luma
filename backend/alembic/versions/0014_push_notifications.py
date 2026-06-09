"""add push notification subscriptions and per-user nudge prefs

Revision ID: 0014_push_notifications
Revises: 0013_add_favorites
Create Date: 2026-06-04
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = '0014_push_notifications'
down_revision = '0013_add_favorites'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.Text, unique=True, nullable=False),
        sa.Column("p256dh", sa.Text, nullable=False),
        sa.Column("auth", sa.Text, nullable=False),
        sa.Column("device_label", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])

    op.add_column("users", sa.Column("nudge_enabled", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("users", sa.Column("nudge_hour", sa.Integer, nullable=False, server_default="19"))
    op.add_column("users", sa.Column("nudge_tz", sa.Text, nullable=False, server_default="'UTC'"))


def downgrade() -> None:
    op.drop_column("users", "nudge_tz")
    op.drop_column("users", "nudge_hour")
    op.drop_column("users", "nudge_enabled")
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
