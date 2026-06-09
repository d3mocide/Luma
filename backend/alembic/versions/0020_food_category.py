"""add category to foods + backfill curated reference rows

Revision ID: 0020_food_category
Revises: 0019_meal_event_favorite_id
Create Date: 2026-06-09
"""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = '0020_food_category'
down_revision = '0019_meal_event_favorite_id'
branch_labels = None
depends_on = None

# Ships with the app; the same file the reference seeder ingests.
_SEED_FILE = Path(__file__).resolve().parents[2] / "luma" / "scripts" / "usda_seed_foods.json"


def upgrade() -> None:
    op.add_column('foods', sa.Column('category', sa.Text(), nullable=True))
    op.create_index('ix_foods_category', 'foods', ['category'])

    # Backfill already-seeded reference rows so the category browse works without
    # forcing a manual re-seed. Keyed by (source='usda', name) — the same identity
    # the seeder uses.
    if not _SEED_FILE.exists():
        return
    seed = json.loads(_SEED_FILE.read_text())
    conn = op.get_bind()
    stmt = sa.text(
        "UPDATE foods SET category = :category "
        "WHERE source = 'usda' AND name = :name AND category IS NULL"
    )
    for item in seed:
        category = item.get("category")
        if not category:
            continue
        conn.execute(stmt, {"category": category, "name": item["name"]})


def downgrade() -> None:
    op.drop_index('ix_foods_category', table_name='foods')
    op.drop_column('foods', 'category')
