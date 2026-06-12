"""add data_source to users

Records which health ecosystem a user ingests from ("apple_health" or
"health_connect"). Gates additive metrics so iOS + Android don't double-count.
Existing users default to apple_health (the only source until now).

Revision ID: 0025_user_data_source
Revises: fd4d67e176a7
"""
import sqlalchemy as sa

from alembic import op

revision = '0025_user_data_source'
down_revision = 'fd4d67e176a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("data_source", sa.String(length=20), nullable=False, server_default="apple_health"),
    )


def downgrade() -> None:
    op.drop_column("users", "data_source")
