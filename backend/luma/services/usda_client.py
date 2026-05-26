"""USDA FoodData Central API client.

Docs: https://api.nal.usda.gov/fdc/v1/
Free API key: https://fdc.nal.usda.gov/api-key-signup

Nutrient IDs used (FDC canonical):
  1008 Energy (kcal)
  1003 Protein
  1004 Total lipid (fat)
  1005 Carbohydrate
  1079 Fiber
  1258 Fatty acids, total saturated
  1082 Fiber, soluble   (not always present — derived from insoluble if missing)
  1093 Sodium
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from luma.config import settings

logger = logging.getLogger(__name__)

_FDC_BASE = "https://api.nal.usda.gov/fdc/v1"

# FDC nutrient ID → our internal key
_NUTRIENT_MAP: dict[int, str] = {
    1008: "calories",
    1003: "protein_g",
    1004: "fat_g",
    1005: "carbohydrates_g",
    1079: "fiber_g",
    1258: "saturated_fat_g",
    1082: "soluble_fiber_g",
    1093: "sodium_mg",
}

_EMPTY_NUTRIENTS: dict[str, float] = {k: 0.0 for k in _NUTRIENT_MAP.values()}


def _extract_nutrients(fdc_food: dict[str, Any]) -> dict[str, float]:
    out = dict(_EMPTY_NUTRIENTS)
    for n in fdc_food.get("foodNutrients", []):
        # Foundation / SR-Legacy shape: {"nutrient": {"id": 1008}, "amount": 375.0}
        # Survey shape: {"nutrientId": 1008, "value": 375.0}
        nid = (n.get("nutrient") or {}).get("id") or n.get("nutrientId")
        amount = n.get("amount") or n.get("value") or 0.0
        key = _NUTRIENT_MAP.get(nid)
        if key:
            out[key] = float(amount)
    return out


def _to_luma_food(fdc_food: dict[str, Any]) -> dict[str, Any]:
    description = fdc_food.get("description", "Unknown")
    brand = fdc_food.get("brandOwner") or fdc_food.get("brandName")
    fdc_id = str(fdc_food.get("fdcId", ""))
    serving_size = float(fdc_food.get("servingSize") or 100.0)

    return {
        "source": "usda",
        "source_id": f"fdc_{fdc_id}",
        "name": description,
        "brand": brand,
        "serving_size_g": serving_size,
        "nutrients_per_100g": _extract_nutrients(fdc_food),
        "tags": [],
    }


async def search_foods(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search USDA FoodData Central and return results shaped for the local foods table."""
    if not settings.usda_api_key:
        logger.warning("USDA_API_KEY not set — skipping live USDA search")
        return []

    params = {
        "query": query,
        "api_key": settings.usda_api_key,
        "pageSize": limit,
        # Foundation and SR Legacy have the best per-100g nutrient data.
        "dataType": "Foundation,SR Legacy,Branded",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{_FDC_BASE}/foods/search", params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("USDA search failed: %s", exc)
        return []

    return [_to_luma_food(f) for f in data.get("foods", [])]
