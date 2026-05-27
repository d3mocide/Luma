"""One-time USDA FoodData Central ingest — Phase 1.

Run with:
    docker compose exec api python -m luma.scripts.ingest_usda
"""
import asyncio
import json
import logging
import uuid
from pathlib import Path

from sqlalchemy import delete
from luma.db.session import AsyncSessionLocal
from luma.db.models import Food

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ingest_usda")

_SEED_FILE = Path(__file__).parent / "usda_seed_foods.json"


async def main() -> None:
    with open(_SEED_FILE) as f:
        seed_foods = json.load(f)

    logger.info("Initializing USDA reference database seed...")
    async with AsyncSessionLocal() as session:
        await session.execute(delete(Food).where(Food.source == "usda"))
        await session.commit()

        logger.info(f"Seeding {len(seed_foods)} high-fidelity core USDA items...")
        for item in seed_foods:
            session.add(Food(
                id=uuid.uuid4(),
                source="usda",
                source_id=f"usda_{item['name'].lower().replace(' ', '_')}",
                name=item["name"],
                brand=item["brand"],
                serving_size_g=item["serving_size_g"],
                nutrients_per_100g=item["nutrients"],
                tags=item["tags"],
                created_by=None,
            ))

        await session.commit()
        logger.info("Seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
