"""re-add case_file columns to coach_context

Revision ID: 0027_readd_case_file
Revises: 0026_llm_events
Create Date: 2026-06-12
"""
import sqlalchemy as sa

from alembic import op

revision = '0027_readd_case_file'
down_revision = '0026_llm_events'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('coach_context', sa.Column('case_file', sa.Text(), nullable=True))
    op.add_column('coach_context', sa.Column('case_file_updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('coach_context', 'case_file_updated_at')
    op.drop_column('coach_context', 'case_file')
