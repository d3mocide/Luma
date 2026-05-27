from uuid import UUID

from fastapi import HTTPException, status

from luma.db.models import Food, MealPlanSlot
from luma.services.nutrition import ZERO_NUTRIENTS

NUTRITION_KEYS = list(ZERO_NUTRIENTS.keys())


def _slot_dict(s: MealPlanSlot) -> dict:
    return {
        "id":          str(s.id),
        "slot_date":   s.slot_date.isoformat(),
        "slot":        s.slot,
        "custom_name": s.custom_name,
        "notes":       s.notes,
        "food_id":     str(s.food_id) if s.food_id else None,
        "recipe_id":   str(s.recipe_id) if s.recipe_id else None,
        "nutrition":   s.nutrition or {},
    }


def _sum_nutrition(slots: list[MealPlanSlot]) -> dict:
    totals: dict[str, float] = {k: 0.0 for k in NUTRITION_KEYS}
    for s in slots:
        for k in NUTRITION_KEYS:
            totals[k] += float((s.nutrition or {}).get(k) or 0.0)
    return totals


def _nutrition_from_food(food: Food, serving_g: float) -> dict:
    factor = serving_g / 100.0
    per100 = food.nutrients_per_100g or {}
    return {k: round(float(per100.get(k) or 0.0) * factor, 2) for k in NUTRITION_KEYS}


def _parse_uuid(value: str, label: str = "UUID") -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {label} format")
