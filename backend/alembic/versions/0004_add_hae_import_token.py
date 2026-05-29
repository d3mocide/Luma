"""add hae_import_token to users

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("hae_import_token", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute("UPDATE users SET hae_import_token = gen_random_uuid()")
    op.alter_column("users", "hae_import_token", nullable=False)
    op.create_unique_constraint("uq_users_hae_import_token", "users", ["hae_import_token"])


def downgrade() -> None:
    op.drop_constraint("uq_users_hae_import_token", "users", type_="unique")
    op.drop_column("users", "hae_import_token")
