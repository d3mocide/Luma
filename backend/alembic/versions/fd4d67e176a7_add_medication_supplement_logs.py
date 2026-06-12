"""add_medication_supplement_logs

Revision ID: fd4d67e176a7
Revises: 0024_medications_supplements
Create Date: 2026-06-11 02:56:26.557887
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'fd4d67e176a7'
down_revision: str | None = '0024_medications_supplements'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "medication_logs",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("medication_id", sa.UUID(), sa.ForeignKey("medications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_medication_logs_user_id", "medication_logs", ["user_id"])
    op.create_index("ix_medication_logs_medication_id", "medication_logs", ["medication_id"])
    op.create_index("ix_medication_logs_ts", "medication_logs", ["ts"])

    op.create_table(
        "supplement_logs",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("supplement_id", sa.UUID(), sa.ForeignKey("supplements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_supplement_logs_user_id", "supplement_logs", ["user_id"])
    op.create_index("ix_supplement_logs_supplement_id", "supplement_logs", ["supplement_id"])
    op.create_index("ix_supplement_logs_ts", "supplement_logs", ["ts"])


def downgrade() -> None:
    op.drop_table("supplement_logs")
    op.drop_table("medication_logs")
