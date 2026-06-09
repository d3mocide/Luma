"""drop case_file columns from coach_context

Revision ID: 0021_drop_case_file
Revises: 0020_food_category
Create Date: 2026-06-09
"""
import sqlalchemy as sa

from alembic import op

revision = '0021_drop_case_file'
down_revision = '0020_food_category'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('coach_context', 'case_file_updated_at')
    op.drop_column('coach_context', 'case_file')


def downgrade() -> None:
    op.add_column('coach_context', sa.Column('case_file', sa.Text(), nullable=True))
    op.add_column('coach_context', sa.Column('case_file_updated_at', sa.DateTime(timezone=True), nullable=True))
