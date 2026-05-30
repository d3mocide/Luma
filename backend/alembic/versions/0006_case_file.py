"""add case_file to coach_context

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("coach_context", sa.Column("case_file", sa.Text(), nullable=True))
    op.add_column("coach_context", sa.Column("case_file_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("coach_context", "case_file_updated_at")
    op.drop_column("coach_context", "case_file")
