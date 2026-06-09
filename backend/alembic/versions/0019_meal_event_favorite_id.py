"""link meal_events to favorites for durable log-frequency tracking

Revision ID: 0019_meal_event_favorite_id
Revises: 0018_food_detail_enriched
Create Date: 2026-06-08
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = '0019_meal_event_favorite_id'
down_revision = '0018_food_detail_enriched'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'meal_events',
        sa.Column('favorite_id', UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_meal_events_favorite_id',
        'meal_events',
        'favorites',
        ['favorite_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_meal_events_favorite_id', 'meal_events', ['favorite_id'])

    # Backfill existing favorite logs by name so prior counts carry over. Future
    # logs set favorite_id directly, making the link durable across renames.
    op.execute(
        """
        UPDATE meal_events me
        SET favorite_id = f.id
        FROM favorites f
        WHERE me.favorite_id IS NULL
          AND me.source = 'favorite'
          AND me.user_id = f.user_id
          AND me.raw_input = f.name
        """
    )


def downgrade() -> None:
    op.drop_index('ix_meal_events_favorite_id')
    op.drop_constraint('fk_meal_events_favorite_id', 'meal_events', type_='foreignkey')
    op.drop_column('meal_events', 'favorite_id')
