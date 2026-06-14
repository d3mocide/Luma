"""add_favorites_tags

Revision ID: 531a666d106e
Revises: 0029_notification_type_prefs
Create Date: 2026-06-14 21:41:31.758837
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '531a666d106e'
down_revision: str | None = '0029_notification_type_prefs'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('favorites', sa.Column('tags', sa.ARRAY(sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('favorites', 'tags')
