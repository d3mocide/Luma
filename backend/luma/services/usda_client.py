"""USDA FoodData Central API client.

Docs: https://api.nal.usda.gov/fdc/v1/
Free API key: https://fdc.nal.usda.gov/api-key-signup

Nutrient IDs used (FDC canonical):
  1008 Energy (kcal)
  1003 Protein
  1004 Total lipid (fat)
  1005 Carbohydrate
  2000 Total sugars
  1079 Fiber, total dietary
  1258 Fatty acids, total saturated
  1292 Fatty acids, total monounsaturated
  1293 Fatty acids, total polyunsaturated
  1257 Fatty acids, total trans
  1253 Cholesterol
  1082 Fiber, soluble   (not always present — derived from insoluble if missing)
  1093 Sodium
  1092 Potassium
  1087 Calcium
  1089 Iron
  1090 Magnesium
  1091 Phosphorus
  1095 Zinc
  1098 Copper
  1101 Manganese
  1103 Selenium
  1106 Vitamin A (RAE)
  1109 Vitamin E
  1114 Vitamin D
  1185 Vitamin K
  1162 Vitamin C
  1165 Thiamin (B1)
  1166 Riboflavin (B2)
  1167 Niacin (B3)
  1175 Vitamin B6
  1177 Folate (DFE)
  1178 Vitamin B12
"""
from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from luma.config import settings
from luma.services.food_flags import compute_threshold_flags

logger = logging.getLogger(__name__)

_FDC_BASE = "https://api.nal.usda.gov/fdc/v1"

# FDC nutrient ID → our internal key
_NUTRIENT_MAP: dict[int, str] = {
    # Macros
    1008: "calories",
    1003: "protein_g",
    1004: "fat_g",
    1005: "carbohydrates_g",
    2000: "sugars_g",
    1079: "fiber_g",
    1258: "saturated_fat_g",
    1292: "monounsaturated_fat_g",
    1293: "polyunsaturated_fat_g",
    1257: "trans_fat_g",
    1253: "cholesterol_mg",
    1082: "soluble_fiber_g",
    # Electrolytes
    1093: "sodium_mg",
    1092: "potassium_mg",
    # Minerals
    1087: "calcium_mg",
    1089: "iron_mg",
    1090: "magnesium_mg",
    1091: "phosphorus_mg",
    1095: "zinc_mg",
    1103: "selenium_mcg",
    # Vitamins
    1106: "vitamin_a_mcg",
    1109: "vitamin_e_mg",
    1114: "vitamin_d_mcg",
    1185: "vitamin_k_mcg",
    1162: "vitamin_c_mg",
    1165: "thiamin_mg",
    1166: "riboflavin_mg",
    1167: "niacin_mg",
    1175: "vitamin_b6_mg",
    1177: "folate_mcg",
    1178: "vitamin_b12_mcg",
}

_EMPTY_NUTRIENTS: dict[str, float] = {k: 0.0 for k in _NUTRIENT_MAP.values()}

# USDA FDC almost never reports "Fiber, soluble" (nutrient 1082) — foods carry
# only "Fiber, total dietary" (1079). Soluble fiber is the metric the LDL-lowering
# goal tracks, so without a fallback every searched food logs 0g fiber. Across our
# curated reference set the soluble share of total dietary fiber averages ~0.25,
# so estimate it at that ratio when USDA omits the explicit value.
_SOLUBLE_FIBER_FRACTION = 0.25


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
    if not out["soluble_fiber_g"] and out["fiber_g"]:
        out["soluble_fiber_g"] = round(out["fiber_g"] * _SOLUBLE_FIBER_FRACTION, 1)
    return out


# USDA reports gram weights for everything except liquids; only treat these
# serving units as gram-equivalent for branded household servings.
_GRAM_UNITS = {"g", "gm", "grm", "gram", "grams"}


def _extract_household_measures(fdc_food: dict[str, Any]) -> list[dict[str, Any]]:
    """Pull household portion measures (label + gram weight) from an FDC food.

    Covers Foundation/SR ``foodPortions`` (e.g. "1 cup" -> 240g) and the
    Branded household serving (``householdServingFullText`` + ``servingSize``).
    """
    measures: list[dict[str, Any]] = []

    for p in fdc_food.get("foodPortions", []) or []:
        grams = p.get("gramWeight")
        if not grams:
            continue
        label = (p.get("portionDescription") or "").strip()
        if not label:
            amount = p.get("amount")
            unit = (p.get("modifier") or (p.get("measureUnit") or {}).get("name") or "").strip()
            if unit.lower() in ("undetermined", "", "quantity not specified"):
                unit = ""
            if amount and unit:
                label = f"{float(amount):g} {unit}"
            elif unit:
                label = unit
        if label:
            measures.append({"label": label, "grams": round(float(grams), 1)})

    household = (fdc_food.get("householdServingFullText") or "").strip()
    serving = fdc_food.get("servingSize")
    serving_unit = (fdc_food.get("servingSizeUnit") or "").strip().lower()
    if household and serving and serving_unit in _GRAM_UNITS:
        measures.append({"label": household, "grams": round(float(serving), 1)})

    # De-dupe by label (case-insensitive), drop non-positive weights, cap the list.
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for m in measures:
        key = m["label"].lower()
        if key in seen or m["grams"] <= 0:
            continue
        seen.add(key)
        out.append(m)
    return out[:6]


def _to_luma_food(fdc_food: dict[str, Any]) -> dict[str, Any]:
    description = fdc_food.get("description", "Unknown")
    brand = fdc_food.get("brandOwner") or fdc_food.get("brandName")
    fdc_id = str(fdc_food.get("fdcId", ""))
    serving_size = float(fdc_food.get("servingSize") or 100.0)

    nutrients = _extract_nutrients(fdc_food)
    return {
        "source": "usda",
        "source_id": f"fdc_{fdc_id}",
        "name": description,
        "brand": brand,
        "serving_size_g": serving_size,
        "nutrients_per_100g": nutrients,
        "household_measures": _extract_household_measures(fdc_food),
        "tags": [],
        "flags": compute_threshold_flags(nutrients),
    }


# Matches USDA FDC raw-ingredient naming convention: "Beef, loin, steak, raw"
# (comma-separated descriptors ending in ", raw").  Raw produce uses parentheses
# ("Carrots (Raw)") and won't match this pattern.
_RAW_PROTEIN_RE = re.compile(r",\s*raw\s*$", re.IGNORECASE)


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

    results = []
    for f in data.get("foods", []):
        food = _to_luma_food(f)
        # Drop zero-calorie entries — the search endpoint returns incomplete
        # foodNutrients for many Branded/Survey foods, defaulting calories to 0.
        if food["nutrients_per_100g"].get("calories", 0) == 0:
            continue
        # Drop raw-protein entries (USDA naming: "Beef, tenderloin steak, raw").
        # These are lab measurements, not meal-log values. Raw produce (fruits,
        # vegetables) is fine — those don't use the comma-descriptor convention.
        name = food.get("name", "")
        if _RAW_PROTEIN_RE.search(name):
            continue
        results.append(food)
    return results


async def get_food_detail(fdc_id: str) -> dict[str, Any] | None:
    """Fetch the full FDC record for one food.

    The search endpoint returns abridged foods (no foodPortions, often partial
    nutrients). The detail endpoint with ``format=full`` carries household
    portions and the complete nutrient panel, so we use it to enrich a food the
    first time a user reaches for it.
    """
    if not settings.usda_api_key:
        return None

    params = {"api_key": settings.usda_api_key, "format": "full"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{_FDC_BASE}/food/{fdc_id}", params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("USDA detail fetch failed for %s: %s", fdc_id, exc)
        return None

    return _to_luma_food(data)
