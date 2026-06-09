"""add token_version to users

Bumped on password change / admin reset to invalidate all outstanding
access and refresh tokens for that user.

Revision ID: 0022_add_token_version
Revises: 0021_drop_case_file
"""
import sqlalchemy as sa

from alembic import op

revision = '0022_add_token_version'
down_revision = '0021_drop_case_file'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
