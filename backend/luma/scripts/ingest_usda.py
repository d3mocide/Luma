"""One-time USDA FoodData Central ingest — Phase 1.

Run with:
    docker compose exec api python -m luma.scripts.ingest_usda
"""
import asyncio
import logging
import uuid
from typing import Dict, Any, List

from sqlalchemy import select, delete
from luma.db.session import AsyncSessionLocal
from luma.db.models import Food

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ingest_usda")

# Seed dataset of highly representative USDA base foods with precise nutrition per 100g
SEED_FOODS: List[Dict[str, Any]] = [
    # Grains & Cereals
    {
        "name": "Steel Cut Oats",
        "brand": "USDA Reference",
        "serving_size_g": 40.0,
        "tags": ["grain", "fiber-rich", "cholesterol-lowering"],
        "nutrients": {
            "calories": 375.0,
            "saturated_fat_g": 1.25,
            "soluble_fiber_g": 5.0,
            "protein_g": 12.5,
            "carbohydrates_g": 67.5,
            "fat_g": 6.25,
            "fiber_g": 10.0,
            "sodium_mg": 0.0,
        }
    },
    {
        "name": "Rolled Oats",
        "brand": "USDA Reference",
        "serving_size_g": 40.0,
        "tags": ["grain", "fiber-rich", "cholesterol-lowering"],
        "nutrients": {
            "calories": 389.0,
            "saturated_fat_g": 1.2,
            "soluble_fiber_g": 4.5,
            "protein_g": 13.1,
            "carbohydrates_g": 66.3,
            "fat_g": 6.9,
            "fiber_g": 10.1,
            "sodium_mg": 2.0,
        }
    },
    {
        "name": "Quinoa (Cooked)",
        "brand": "USDA Reference",
        "serving_size_g": 185.0,
        "tags": ["grain", "protein-rich", "gluten-free"],
        "nutrients": {
            "calories": 120.0,
            "saturated_fat_g": 0.2,
            "soluble_fiber_g": 0.8,
            "protein_g": 4.4,
            "carbohydrates_g": 21.3,
            "fat_g": 1.9,
            "fiber_g": 2.8,
            "sodium_mg": 7.0,
        }
    },
    {
        "name": "Brown Rice (Cooked)",
        "brand": "USDA Reference",
        "serving_size_g": 195.0,
        "tags": ["grain", "complex-carb"],
        "nutrients": {
            "calories": 111.0,
            "saturated_fat_g": 0.2,
            "soluble_fiber_g": 0.3,
            "protein_g": 2.6,
            "carbohydrates_g": 23.0,
            "fat_g": 0.9,
            "fiber_g": 1.8,
            "sodium_mg": 5.0,
        }
    },
    {
        "name": "Whole Wheat Bread",
        "brand": "USDA Reference",
        "serving_size_g": 50.0,
        "tags": ["grain", "bread"],
        "nutrients": {
            "calories": 247.0,
            "saturated_fat_g": 0.4,
            "soluble_fiber_g": 1.5,
            "protein_g": 13.0,
            "carbohydrates_g": 41.0,
            "fat_g": 3.4,
            "fiber_g": 7.0,
            "sodium_mg": 400.0,
        }
    },
    # Fruits
    {
        "name": "Banana",
        "brand": "USDA Reference",
        "serving_size_g": 118.0,
        "tags": ["fruit", "potassium", "energy"],
        "nutrients": {
            "calories": 89.0,
            "saturated_fat_g": 0.1,
            "soluble_fiber_g": 0.6,
            "protein_g": 1.1,
            "carbohydrates_g": 22.8,
            "fat_g": 0.3,
            "fiber_g": 2.6,
            "sodium_mg": 1.0,
        }
    },
    {
        "name": "Apple (with skin)",
        "brand": "USDA Reference",
        "serving_size_g": 182.0,
        "tags": ["fruit", "fiber-rich", "pectin", "cholesterol-lowering"],
        "nutrients": {
            "calories": 52.0,
            "saturated_fat_g": 0.05,
            "soluble_fiber_g": 1.0,
            "protein_g": 0.3,
            "carbohydrates_g": 13.8,
            "fat_g": 0.2,
            "fiber_g": 2.4,
            "sodium_mg": 1.0,
        }
    },
    {
        "name": "Blueberries",
        "brand": "USDA Reference",
        "serving_size_g": 148.0,
        "tags": ["fruit", "antioxidant", "superfood"],
        "nutrients": {
            "calories": 57.0,
            "saturated_fat_g": 0.03,
            "soluble_fiber_g": 0.8,
            "protein_g": 0.7,
            "carbohydrates_g": 14.5,
            "fat_g": 0.3,
            "fiber_g": 2.4,
            "sodium_mg": 1.0,
        }
    },
    {
        "name": "Strawberries",
        "brand": "USDA Reference",
        "serving_size_g": 150.0,
        "tags": ["fruit", "vitamin-c"],
        "nutrients": {
            "calories": 32.0,
            "saturated_fat_g": 0.01,
            "soluble_fiber_g": 0.5,
            "protein_g": 0.7,
            "carbohydrates_g": 7.7,
            "fat_g": 0.3,
            "fiber_g": 2.0,
            "sodium_mg": 1.0,
        }
    },
    {
        "name": "Avocado",
        "brand": "USDA Reference",
        "serving_size_g": 150.0,
        "tags": ["fruit", "healthy-fat", "monounsaturated", "cholesterol-lowering"],
        "nutrients": {
            "calories": 160.0,
            "saturated_fat_g": 2.1,
            "soluble_fiber_g": 2.0,
            "protein_g": 2.0,
            "carbohydrates_g": 8.5,
            "fat_g": 14.7,
            "fiber_g": 6.7,
            "sodium_mg": 7.0,
        }
    },
    # Vegetables
    {
        "name": "Broccoli (Raw)",
        "brand": "USDA Reference",
        "serving_size_g": 91.0,
        "tags": ["vegetable", "green", "fiber-rich"],
        "nutrients": {
            "calories": 34.0,
            "saturated_fat_g": 0.04,
            "soluble_fiber_g": 1.2,
            "protein_g": 2.8,
            "carbohydrates_g": 6.6,
            "fat_g": 0.4,
            "fiber_g": 2.6,
            "sodium_mg": 33.0,
        }
    },
    {
        "name": "Spinach (Raw)",
        "brand": "USDA Reference",
        "serving_size_g": 30.0,
        "tags": ["vegetable", "green", "iron", "low-calorie"],
        "nutrients": {
            "calories": 23.0,
            "saturated_fat_g": 0.06,
            "soluble_fiber_g": 0.8,
            "protein_g": 2.9,
            "carbohydrates_g": 3.6,
            "fat_g": 0.4,
            "fiber_g": 2.2,
            "sodium_mg": 79.0,
        }
    },
    {
        "name": "Brussels Sprouts",
        "brand": "USDA Reference",
        "serving_size_g": 88.0,
        "tags": ["vegetable", "green", "fiber-rich", "cholesterol-lowering"],
        "nutrients": {
            "calories": 43.0,
            "saturated_fat_g": 0.06,
            "soluble_fiber_g": 2.0,
            "protein_g": 3.4,
            "carbohydrates_g": 9.0,
            "fat_g": 0.3,
            "fiber_g": 3.8,
            "sodium_mg": 25.0,
        }
    },
    {
        "name": "Sweet Potato (Baked)",
        "brand": "USDA Reference",
        "serving_size_g": 150.0,
        "tags": ["vegetable", "complex-carb", "fiber-rich"],
        "nutrients": {
            "calories": 90.0,
            "saturated_fat_g": 0.02,
            "soluble_fiber_g": 1.8,
            "protein_g": 2.0,
            "carbohydrates_g": 20.7,
            "fat_g": 0.1,
            "fiber_g": 3.3,
            "sodium_mg": 36.0,
        }
    },
    {
        "name": "Carrots (Raw)",
        "brand": "USDA Reference",
        "serving_size_g": 61.0,
        "tags": ["vegetable", "vitamin-a", "fiber-rich"],
        "nutrients": {
            "calories": 41.0,
            "saturated_fat_g": 0.04,
            "soluble_fiber_g": 1.1,
            "protein_g": 0.9,
            "carbohydrates_g": 9.6,
            "fat_g": 0.2,
            "fiber_g": 2.8,
            "sodium_mg": 69.0,
        }
    },
    # Proteins
    {
        "name": "Chicken Breast (Boneless Skinless Cooked)",
        "brand": "USDA Reference",
        "serving_size_g": 100.0,
        "tags": ["protein", "lean-protein", "low-fat"],
        "nutrients": {
            "calories": 165.0,
            "saturated_fat_g": 1.0,
            "soluble_fiber_g": 0.0,
            "protein_g": 31.0,
            "carbohydrates_g": 0.0,
            "fat_g": 3.6,
            "fiber_g": 0.0,
            "sodium_mg": 74.0,
        }
    },
    {
        "name": "Wild Atlantic Salmon (Cooked)",
        "brand": "USDA Reference",
        "serving_size_g": 100.0,
        "tags": ["protein", "healthy-fat", "omega-3", "cholesterol-lowering"],
        "nutrients": {
            "calories": 182.0,
            "saturated_fat_g": 1.3,
            "soluble_fiber_g": 0.0,
            "protein_g": 25.0,
            "carbohydrates_g": 0.0,
            "fat_g": 8.0,
            "fiber_g": 0.0,
            "sodium_mg": 60.0,
        }
    },
    {
        "name": "Egg (Large Whole)",
        "brand": "USDA Reference",
        "serving_size_g": 50.0,
        "tags": ["protein", "breakfast"],
        "nutrients": {
            "calories": 143.0,
            "saturated_fat_g": 3.1,
            "soluble_fiber_g": 0.0,
            "protein_g": 12.6,
            "carbohydrates_g": 0.7,
            "fat_g": 9.5,
            "fiber_g": 0.0,
            "sodium_mg": 142.0,
        }
    },
    {
        "name": "Egg White (Large)",
        "brand": "USDA Reference",
        "serving_size_g": 33.0,
        "tags": ["protein", "lean-protein", "fat-free"],
        "nutrients": {
            "calories": 52.0,
            "saturated_fat_g": 0.0,
            "soluble_fiber_g": 0.0,
            "protein_g": 10.9,
            "carbohydrates_g": 0.7,
            "fat_g": 0.2,
            "fiber_g": 0.0,
            "sodium_mg": 166.0,
        }
    },
    {
        "name": "Tofu (Extra Firm)",
        "brand": "USDA Reference",
        "serving_size_g": 85.0,
        "tags": ["protein", "plant-protein", "vegan"],
        "nutrients": {
            "calories": 83.0,
            "saturated_fat_g": 0.5,
            "soluble_fiber_g": 0.1,
            "protein_g": 10.0,
            "carbohydrates_g": 1.2,
            "fat_g": 5.0,
            "fiber_g": 0.9,
            "sodium_mg": 4.0,
        }
    },
    {
        "name": "Greek Yogurt (Nonfat Plain)",
        "brand": "USDA Reference",
        "serving_size_g": 150.0,
        "tags": ["protein", "dairy", "probiotic", "low-fat"],
        "nutrients": {
            "calories": 59.0,
            "saturated_fat_g": 0.1,
            "soluble_fiber_g": 0.0,
            "protein_g": 10.0,
            "carbohydrates_g": 3.6,
            "fat_g": 0.4,
            "fiber_g": 0.0,
            "sodium_mg": 36.0,
        }
    },
    # Legumes & Pulses
    {
        "name": "Lentils (Cooked)",
        "brand": "USDA Reference",
        "serving_size_g": 198.0,
        "tags": ["protein", "plant-protein", "fiber-rich", "cholesterol-lowering"],
        "nutrients": {
            "calories": 116.0,
            "saturated_fat_g": 0.1,
            "soluble_fiber_g": 3.0,
            "protein_g": 9.0,
            "carbohydrates_g": 20.0,
            "fat_g": 0.4,
            "fiber_g": 7.9,
            "sodium_mg": 2.0,
        }
    },
    {
        "name": "Chickpeas / Garbanzo Beans (Cooked)",
        "brand": "USDA Reference",
        "serving_size_g": 164.0,
        "tags": ["protein", "plant-protein", "fiber-rich", "cholesterol-lowering"],
        "nutrients": {
            "calories": 164.0,
            "saturated_fat_g": 0.6,
            "soluble_fiber_g": 2.5,
            "protein_g": 8.9,
            "carbohydrates_g": 27.4,
            "fat_g": 2.6,
            "fiber_g": 7.6,
            "sodium_mg": 24.0,
        }
    },
    {
        "name": "Black Beans (Cooked)",
        "brand": "USDA Reference",
        "serving_size_g": 172.0,
        "tags": ["protein", "plant-protein", "fiber-rich", "cholesterol-lowering"],
        "nutrients": {
            "calories": 132.0,
            "saturated_fat_g": 0.1,
            "soluble_fiber_g": 2.8,
            "protein_g": 8.9,
            "carbohydrates_g": 23.7,
            "fat_g": 0.5,
            "fiber_g": 8.7,
            "sodium_mg": 1.0,
        }
    },
    # Nuts & Seeds
    {
        "name": "Almonds (Raw)",
        "brand": "USDA Reference",
        "serving_size_g": 28.0,
        "tags": ["nuts", "healthy-fat", "monounsaturated", "fiber-rich", "cholesterol-lowering"],
        "nutrients": {
            "calories": 579.0,
            "saturated_fat_g": 3.8,
            "soluble_fiber_g": 1.5,
            "protein_g": 21.2,
            "carbohydrates_g": 21.6,
            "fat_g": 49.9,
            "fiber_g": 12.5,
            "sodium_mg": 1.0,
        }
    },
    {
        "name": "Chia Seeds",
        "brand": "USDA Reference",
        "serving_size_g": 15.0,
        "tags": ["seeds", "fiber-rich", "omega-3", "cholesterol-lowering"],
        "nutrients": {
            "calories": 486.0,
            "saturated_fat_g": 3.3,
            "soluble_fiber_g": 7.0,
            "protein_g": 16.5,
            "carbohydrates_g": 42.1,
            "fat_g": 30.7,
            "fiber_g": 34.4,
            "sodium_mg": 16.0,
        }
    },
    {
        "name": "Flax Seeds (Ground)",
        "brand": "USDA Reference",
        "serving_size_g": 10.0,
        "tags": ["seeds", "fiber-rich", "omega-3", "cholesterol-lowering"],
        "nutrients": {
            "calories": 534.0,
            "saturated_fat_g": 3.7,
            "soluble_fiber_g": 6.5,
            "protein_g": 18.3,
            "carbohydrates_g": 28.9,
            "fat_g": 42.2,
            "fiber_g": 27.3,
            "sodium_mg": 30.0,
        }
    },
    {
        "name": "Walnuts",
        "brand": "USDA Reference",
        "serving_size_g": 28.0,
        "tags": ["nuts", "omega-3", "healthy-fat", "cholesterol-lowering"],
        "nutrients": {
            "calories": 654.0,
            "saturated_fat_g": 6.1,
            "soluble_fiber_g": 1.2,
            "protein_g": 15.2,
            "carbohydrates_g": 13.7,
            "fat_g": 65.2,
            "fiber_g": 6.7,
            "sodium_mg": 2.0,
        }
    },
    # Oils & Fats
    {
        "name": "Extra Virgin Olive Oil",
        "brand": "USDA Reference",
        "serving_size_g": 14.0,
        "tags": ["oil", "healthy-fat", "monounsaturated", "cholesterol-lowering"],
        "nutrients": {
            "calories": 884.0,
            "saturated_fat_g": 13.8,
            "soluble_fiber_g": 0.0,
            "protein_g": 0.0,
            "carbohydrates_g": 0.0,
            "fat_g": 100.0,
            "fiber_g": 0.0,
            "sodium_mg": 0.0,
        }
    },
    {
        "name": "Avocado Oil",
        "brand": "USDA Reference",
        "serving_size_g": 14.0,
        "tags": ["oil", "healthy-fat", "monounsaturated"],
        "nutrients": {
            "calories": 884.0,
            "saturated_fat_g": 11.6,
            "soluble_fiber_g": 0.0,
            "protein_g": 0.0,
            "carbohydrates_g": 0.0,
            "fat_g": 100.0,
            "fiber_g": 0.0,
            "sodium_mg": 0.0,
        }
    },
]


async def main() -> None:
    logger.info("Initializing USDA reference database seed...")
    async with AsyncSessionLocal() as session:
        # Clear existing seed items with source = 'usda' to prevent duplicates on multiple runs
        q_delete = delete(Food).where(Food.source == "usda")
        await session.execute(q_delete)
        await session.commit()
        
        logger.info(f"Seeding {len(SEED_FOODS)} high-fidelity core USDA items...")
        for item in SEED_FOODS:
            db_food = Food(
                id=uuid.uuid4(),
                source="usda",
                source_id=f"usda_{item['name'].lower().replace(' ', '_')}",
                name=item["name"],
                brand=item["brand"],
                serving_size_g=item["serving_size_g"],
                nutrients_per_100g=item["nutrients"],
                tags=item["tags"],
                created_by=None,
            )
            session.add(db_food)
        
        await session.commit()
        logger.info("Seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
