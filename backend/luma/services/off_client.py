"""Open Food Facts client — Phase 1."""

import httpx
import logging
from typing import Dict, Any, Optional

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
            
            # Sodium is in grams in OFF, we store in milligrams
            sodium_g = nutr.get("sodium_100g", 0.0)
            sodium_mg = float(sodium_g) * 1000.0 if sodium_g is not None else 0.0
            
            mapped_nutrients = {
                "calories": float(kcal or 0.0),
                "saturated_fat_g": float(nutr.get("saturated-fat_100g") or 0.0),
                "soluble_fiber_g": float(nutr.get("soluble-fiber_100g") or 0.0),
                "protein_g": float(nutr.get("proteins_100g") or 0.0),
                "carbohydrates_g": float(nutr.get("carbohydrates_100g") or 0.0),
                "fat_g": float(nutr.get("fat_100g") or 0.0),
                "fiber_g": float(nutr.get("fiber_100g") or 0.0),
                "sodium_mg": sodium_mg
            }
            
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
                "source_id": f"off_{barcode}"
            }
    except Exception as e:
        logger.exception(f"Error looking up barcode {barcode} from OFF: {e}")
        return None
