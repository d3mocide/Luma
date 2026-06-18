"""Nutrition rollup helpers shared across log routes and agents."""
from __future__ import annotations

ZERO_NUTRIENTS: dict[str, float] = {
    # Core macros
    "calories": 0.0,
    "protein_g": 0.0,
    "fat_g": 0.0,
    "saturated_fat_g": 0.0,
    "monounsaturated_fat_g": 0.0,
    "polyunsaturated_fat_g": 0.0,
    "trans_fat_g": 0.0,
    "cholesterol_mg": 0.0,
    "carbohydrates_g": 0.0,
    "sugars_g": 0.0,
    "added_sugars_g": 0.0,
    "fiber_g": 0.0,
    "soluble_fiber_g": 0.0,
    "sodium_mg": 0.0,
    "potassium_mg": 0.0,
    # Minerals
    "calcium_mg": 0.0,
    "iron_mg": 0.0,
    "magnesium_mg": 0.0,
    "phosphorus_mg": 0.0,
    "zinc_mg": 0.0,
    "selenium_mcg": 0.0,
    # Vitamins
    "vitamin_a_mcg": 0.0,
    "vitamin_c_mg": 0.0,
    "vitamin_d_mcg": 0.0,
    "vitamin_e_mg": 0.0,
    "vitamin_k_mcg": 0.0,
    "thiamin_mg": 0.0,
    "riboflavin_mg": 0.0,
    "niacin_mg": 0.0,
    "vitamin_b6_mg": 0.0,
    "folate_mcg": 0.0,
    "vitamin_b12_mcg": 0.0,
}


def aggregate_items(items: list[dict]) -> dict[str, float]:
    """Sum nutrients across a list of food items returned by the food extractor."""
    totals = dict(ZERO_NUTRIENTS)
    for item in items:
        nutr = item.get("nutrients") or {}
        for key in totals:
            totals[key] += float(nutr.get(key) or 0.0)
    return totals
