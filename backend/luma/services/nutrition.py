"""Nutrition rollup helpers shared across log routes and agents."""
from __future__ import annotations

ZERO_NUTRIENTS: dict[str, float] = {
    "calories": 0.0,
    "protein_g": 0.0,
    "fat_g": 0.0,
    "saturated_fat_g": 0.0,
    "carbohydrates_g": 0.0,
    "sugars_g": 0.0,
    "fiber_g": 0.0,
    "soluble_fiber_g": 0.0,
    "sodium_mg": 0.0,
    "potassium_mg": 0.0,
}


def aggregate_items(items: list[dict]) -> dict[str, float]:
    """Sum nutrients across a list of food items returned by the food extractor."""
    totals = dict(ZERO_NUTRIENTS)
    for item in items:
        nutr = item.get("nutrients") or {}
        for key in totals:
            totals[key] += float(nutr.get(key) or 0.0)
    return totals
