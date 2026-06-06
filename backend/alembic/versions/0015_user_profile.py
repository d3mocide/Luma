"""add demographic profile fields to users

Revision ID: 0015_user_profile
Revises: 0014_push_notifications
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa

revision = '0015_user_profile'
down_revision = '0014_push_notifications'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("birth_year", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("biological_sex", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("height_cm", sa.Numeric(5, 1), nullable=True))
    op.add_column("users", sa.Column("activity_level", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "activity_level")
    op.drop_column("users", "height_cm")
    op.drop_column("users", "biological_sex")
    op.drop_column("users", "birth_year")
