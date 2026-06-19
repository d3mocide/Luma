"""One-time USDA FoodData Central ingest — Phase 1.

Run with:
    docker compose exec api python -m luma.scripts.ingest_usda
"""
import asyncio
import json
import logging
import uuid
from pathlib import Path

from sqlalchemy import delete, select

from luma.db.models import Food
from luma.db.session import AsyncSessionLocal
from luma.services.food_flags import merge_flags

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ingest_usda")

_SEED_FILE = Path(__file__).parent / "usda_seed_foods.json"


async def main() -> None:
    with open(_SEED_FILE) as f:
        seed_foods = json.load(f)

    logger.info("Initializing USDA reference database seed...")
    async with AsyncSessionLocal() as session:
        # Load existing foods by source_id to perform updates rather than delete & insert,
        # which prevents foreign key violations on active meals/shopping list items.
        result = await session.execute(select(Food).where(Food.source == "usda"))
        existing_foods = {f.source_id: f for f in result.scalars().all()}

        logger.info(f"Seeding/Updating {len(seed_foods)} high-fidelity core USDA items...")
        for item in seed_foods:
            source_id = f"usda_{item['name'].lower().replace(' ', '_')}"
            computed_flags = merge_flags(item.get("flags", []), item["nutrients"])
            
            if source_id in existing_foods:
                db_food = existing_foods[source_id]
                db_food.name = item["name"]
                db_food.brand = item["brand"]
                db_food.serving_size_g = item["serving_size_g"]
                db_food.nutrients_per_100g = item["nutrients"]
                db_food.category = item.get("category")
                db_food.tags = item["tags"]
                db_food.flags = computed_flags
            else:
                session.add(Food(
                    id=uuid.uuid4(),
                    source="usda",
                    source_id=source_id,
                    name=item["name"],
                    brand=item["brand"],
                    serving_size_g=item["serving_size_g"],
                    nutrients_per_100g=item["nutrients"],
                    category=item.get("category"),
                    tags=item["tags"],
                    flags=computed_flags,
                    created_by=None,
                ))

        await session.commit()
        logger.info("Seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
