"""Open Food Facts client — Phase 1."""

import logging
from typing import Any

import httpx

from luma.services.food_flags import compute_threshold_flags

logger = logging.getLogger("off_client")


def _off_val(nutr: dict[str, Any], key: str) -> float | None:
    """Return float if the OFF nutriment key is present, else None.

    Distinguishes 'reported as zero' from 'not reported at all' — callers
    treat None as unknown rather than coercing to 0.0.
    """
    v = nutr.get(key)
    return float(v) if v is not None else None


async def lookup_barcode(barcode: str) -> dict[str, Any] | None:
    """Fetch product details from Open Food Facts API and normalize to Luma schema."""
    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
    headers = {"User-Agent": "LumaHealthTracker/1.0 (health@yourdomain.com)"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"OFF API returned status code {resp.status_code} for barcode {barcode}")
                return None

            data = resp.json()
            if data.get("status") != 1 or "product" not in data:
                logger.warning(f"Barcode {barcode} not found in OFF")
                return None

            prod = data["product"]
            nutr = prod.get("nutriments", {})

            # Extract and convert energy values
            kcal = nutr.get("energy-kcal_100g")
            if kcal is None:
                kj = nutr.get("energy_100g")
                kcal = float(kj) / 4.184 if kj is not None else 0.0

            # Sodium and potassium are in grams in OFF, we store in milligrams
            sodium_g = nutr.get("sodium_100g")
            sodium_mg = float(sodium_g) * 1000.0 if sodium_g is not None else 0.0
            potassium_g = nutr.get("potassium_100g")
            potassium_mg = float(potassium_g) * 1000.0 if potassium_g is not None else 0.0

            mapped_nutrients: dict[str, float | None] = {
                # Core macros — always expected on a US nutrition label; default 0.0
                "calories":              float(kcal or 0.0),
                "protein_g":             float(nutr.get("proteins_100g") or 0.0),
                "fat_g":                 float(nutr.get("fat_100g") or 0.0),
                "saturated_fat_g":       float(nutr.get("saturated-fat_100g") or 0.0),
                "carbohydrates_g":       float(nutr.get("carbohydrates_100g") or 0.0),
                "sugars_g":              float(nutr.get("sugars_100g") or 0.0),
                "fiber_g":               float(nutr.get("fiber_100g") or 0.0),
                "sodium_mg":             sodium_mg,
                "potassium_mg":          potassium_mg,
                # Extended — None when OFF doesn't report them (not the same as zero)
                "soluble_fiber_g":       _off_val(nutr, "soluble-fiber_100g"),
                "monounsaturated_fat_g": _off_val(nutr, "monounsaturated-fat_100g"),
                "polyunsaturated_fat_g": _off_val(nutr, "polyunsaturated-fat_100g"),
                "trans_fat_g":           _off_val(nutr, "trans-fat_100g"),
                "cholesterol_mg":        _off_val(nutr, "cholesterol_100g"),
                # Minerals (OFF stores these in mg/100g)
                "calcium_mg":            _off_val(nutr, "calcium_100g"),
                "iron_mg":               _off_val(nutr, "iron_100g"),
                "magnesium_mg":          _off_val(nutr, "magnesium_100g"),
                "phosphorus_mg":         _off_val(nutr, "phosphorus_100g"),
                "zinc_mg":               _off_val(nutr, "zinc_100g"),
                "selenium_mcg":          _off_val(nutr, "selenium_100g"),
                # Vitamins (mg or mcg per 100g in OFF)
                "vitamin_a_mcg":         _off_val(nutr, "vitamin-a_100g"),
                "vitamin_c_mg":          _off_val(nutr, "vitamin-c_100g"),
                "vitamin_d_mcg":         _off_val(nutr, "vitamin-d_100g"),
                "vitamin_e_mg":          _off_val(nutr, "vitamin-e_100g"),
                "vitamin_k_mcg":         _off_val(nutr, "vitamin-k_100g"),
                "thiamin_mg":            _off_val(nutr, "vitamin-b1_100g"),
                "riboflavin_mg":         _off_val(nutr, "vitamin-b2_100g"),
                "niacin_mg":             _off_val(nutr, "vitamin-pp_100g"),
                "vitamin_b6_mg":         _off_val(nutr, "vitamin-b6_100g"),
                "folate_mcg":            _off_val(nutr, "vitamin-b9_100g"),
                "vitamin_b12_mcg":       _off_val(nutr, "vitamin-b12_100g"),
            }

            # OFF rarely carries an explicit soluble-fiber value; estimate it from
            # total fiber so barcode-logged foods feed the LDL-lowering fiber goal.
            # See usda_client._SOLUBLE_FIBER_FRACTION (~0.25).
            if not mapped_nutrients["soluble_fiber_g"] and mapped_nutrients["fiber_g"]:
                mapped_nutrients["soluble_fiber_g"] = round(mapped_nutrients["fiber_g"] * 0.25, 1)

            serving_quantity = prod.get("serving_quantity")
            if serving_quantity is not None:
                serving_size = float(serving_quantity)
            else:
                serving_size = 100.0  # Default fallback

            # Surface the product's own serving as a one-tap household measure so
            # users can log "1 serving" instead of guessing grams.
            household_measures: list[dict[str, Any]] = []
            if serving_quantity:
                label = str(prod.get("serving_size") or "").strip() or "1 serving"
                household_measures.append({"label": label, "grams": round(serving_size, 1)})

            return {
                "name": prod.get("product_name") or prod.get("product_name_en") or f"Product {barcode}",
                "brand": prod.get("brands") or "Unknown Brand",
                "serving_size_g": serving_size,
                "nutrients_per_100g": mapped_nutrients,
                "household_measures": household_measures,
                "tags": [t.replace("en:", "") for t in prod.get("categories_tags", [])[:5]],
                "flags": compute_threshold_flags(mapped_nutrients),
                "source_id": f"off_{barcode}",
            }
    except Exception as e:
        logger.exception(f"Error looking up barcode {barcode} from OFF: {e}")
        return None
