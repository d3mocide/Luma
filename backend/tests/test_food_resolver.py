"""Meal item resolution: DB-sourced nutrients vs tagged LLM estimates."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from luma.db.models import Food
from luma.services import food_resolver
from luma.services.food_resolver import _is_confident


def _food(name, brand=None, source="usda", per100=None):
    return Food(
        id=uuid.uuid4(),
        source=source,
        name=name,
        brand=brand,
        serving_size_g=100.0,
        nutrients_per_100g=per100 or {"calories": 17.0, "fat_g": 1.0, "saturated_fat_g": 0.1},
        household_measures=[],
        tags=[],
    )


# ── Confidence gate (precision-first) ───────────────────────────────────────

def test_confident_on_near_exact_name():
    assert _is_confident("almond milk", "Almond Milk")


def test_confident_when_candidate_adds_descriptor():
    assert _is_confident("almond milk", "Almond milk, unsweetened")


def test_not_confident_when_item_has_extra_word():
    # "almond milk latte" must NOT collapse onto plain "almond milk".
    assert not _is_confident("almond milk latte", "Almond milk")


def test_not_confident_on_unrelated_food():
    assert not _is_confident("almond milk", "Whole cow's milk")


# ── Resolution ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_confident_match_uses_db_nutrients():
    db = AsyncMock()
    ref = _food("Almond milk, unsweetened", brand="USDA Reference",
                per100={"calories": 17.0, "fat_g": 1.0, "saturated_fat_g": 0.1})
    item = {"name": "almond milk", "estimated_weight_g": 240.0,
            "nutrients": {"calories": 100.0, "fat_g": 10.0, "saturated_fat_g": 10.0}}

    with patch.object(food_resolver, "rank_local_foods", AsyncMock(return_value=[(ref, 3.0)])):
        out = await food_resolver.resolve_items(db, [item], allow_live=False)

    n = out[0]["nutrients"]
    assert out[0]["food_id"] == str(ref.id)
    assert out[0]["nutrient_source"] == "reference"
    # Scaled to 240g: 0.1 sat * 2.4 = 0.24, not the LLM's bogus 10g.
    assert round(n["saturated_fat_g"], 2) == 0.24
    assert round(n["fat_g"], 2) == 2.4


@pytest.mark.asyncio
async def test_no_match_falls_back_to_clamped_estimate():
    db = AsyncMock()
    item = {"name": "grandma's mystery casserole", "estimated_weight_g": 200.0,
            "nutrients": {"calories": 300.0, "fat_g": 8.0, "saturated_fat_g": 20.0}}

    with patch.object(food_resolver, "rank_local_foods", AsyncMock(return_value=[])):
        out = await food_resolver.resolve_items(db, [item], allow_live=False)

    assert out[0]["nutrient_source"] == "estimate"
    assert "food_id" not in out[0]
    # Estimate path still clamps the impossible sat>fat split.
    assert out[0]["nutrients"]["saturated_fat_g"] == 8.0


@pytest.mark.asyncio
async def test_live_fallback_caches_then_rematches():
    db = AsyncMock()
    ref = _food("Almond milk, unsweetened", brand="USDA Reference")
    item = {"name": "almond milk", "estimated_weight_g": 100.0, "nutrients": {"fat_g": 5.0}}

    ranks = [[], [(ref, 3.0)]]  # first miss, then hit after caching
    with patch.object(food_resolver, "rank_local_foods", AsyncMock(side_effect=ranks)), \
         patch.object(food_resolver, "fetch_and_cache_usda", AsyncMock(return_value=True)) as cache:
        out = await food_resolver.resolve_items(db, [item], allow_live=True)

    cache.assert_awaited_once()
    assert out[0]["food_id"] == str(ref.id)
