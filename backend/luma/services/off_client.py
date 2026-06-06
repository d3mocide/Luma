"""Open Food Facts client — Phase 1."""

import httpx
import logging
from typing import Dict, Any, Optional

from luma.services.food_flags import compute_threshold_flags

logger = logging.getLogger("off_client")


async def lookup_barcode(barcode: str) -> Optional[Dict[str, Any]]:
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
            sodium_g = nutr.get("sodium_100g", 0.0)
            sodium_mg = float(sodium_g) * 1000.0 if sodium_g is not None else 0.0
            potassium_g = nutr.get("potassium_100g", 0.0)
            potassium_mg = float(potassium_g) * 1000.0 if potassium_g is not None else 0.0

            mapped_nutrients = {
                # Core macros
                "calories":              float(kcal or 0.0),
                "protein_g":             float(nutr.get("proteins_100g") or 0.0),
                "fat_g":                 float(nutr.get("fat_100g") or 0.0),
                "saturated_fat_g":       float(nutr.get("saturated-fat_100g") or 0.0),
                "monounsaturated_fat_g": float(nutr.get("monounsaturated-fat_100g") or 0.0),
                "polyunsaturated_fat_g": float(nutr.get("polyunsaturated-fat_100g") or 0.0),
                "trans_fat_g":           float(nutr.get("trans-fat_100g") or 0.0),
                "cholesterol_mg":        float(nutr.get("cholesterol_100g") or 0.0),
                "carbohydrates_g":       float(nutr.get("carbohydrates_100g") or 0.0),
                "sugars_g":              float(nutr.get("sugars_100g") or 0.0),
                "fiber_g":               float(nutr.get("fiber_100g") or 0.0),
                "soluble_fiber_g":       float(nutr.get("soluble-fiber_100g") or 0.0),
                "sodium_mg":             sodium_mg,
                "potassium_mg":          potassium_mg,
                # Minerals (OFF stores these in mg/100g)
                "calcium_mg":            float(nutr.get("calcium_100g") or 0.0),
                "iron_mg":               float(nutr.get("iron_100g") or 0.0),
                "magnesium_mg":          float(nutr.get("magnesium_100g") or 0.0),
                "phosphorus_mg":         float(nutr.get("phosphorus_100g") or 0.0),
                "zinc_mg":               float(nutr.get("zinc_100g") or 0.0),
                "selenium_mcg":          float(nutr.get("selenium_100g") or 0.0),
                # Vitamins (mg or mcg per 100g in OFF)
                "vitamin_a_mcg":         float(nutr.get("vitamin-a_100g") or 0.0),
                "vitamin_c_mg":          float(nutr.get("vitamin-c_100g") or 0.0),
                "vitamin_d_mcg":         float(nutr.get("vitamin-d_100g") or 0.0),
                "vitamin_e_mg":          float(nutr.get("vitamin-e_100g") or 0.0),
                "vitamin_k_mcg":         float(nutr.get("vitamin-k_100g") or 0.0),
                "thiamin_mg":            float(nutr.get("vitamin-b1_100g") or 0.0),
                "riboflavin_mg":         float(nutr.get("vitamin-b2_100g") or 0.0),
                "niacin_mg":             float(nutr.get("vitamin-pp_100g") or 0.0),
                "vitamin_b6_mg":         float(nutr.get("vitamin-b6_100g") or 0.0),
                "folate_mcg":            float(nutr.get("vitamin-b9_100g") or 0.0),
                "vitamin_b12_mcg":       float(nutr.get("vitamin-b12_100g") or 0.0),
            }

            # OFF rarely carries an explicit soluble-fiber value; estimate it from
            # total fiber so barcode-logged foods feed the LDL-lowering fiber goal.
            # See usda_client._SOLUBLE_FIBER_FRACTION (~0.25).
            if not mapped_nutrients["soluble_fiber_g"] and mapped_nutrients["fiber_g"]:
                mapped_nutrients["soluble_fiber_g"] = round(mapped_nutrients["fiber_g"] * 0.25, 1)

            serving_size = prod.get("serving_quantity")
            if serving_size is not None:
                serving_size = float(serving_size)
            else:
                serving_size = 100.0  # Default fallback
                
            return {
                "name": prod.get("product_name") or prod.get("product_name_en") or f"Product {barcode}",
                "brand": prod.get("brands") or "Unknown Brand",
                "serving_size_g": serving_size,
                "nutrients_per_100g": mapped_nutrients,
                "tags": [t.replace("en:", "") for t in prod.get("categories_tags", [])[:5]],
                "flags": compute_threshold_flags(mapped_nutrients),
                "source_id": f"off_{barcode}",
            }
    except Exception as e:
        logger.exception(f"Error looking up barcode {barcode} from OFF: {e}")
        return None
