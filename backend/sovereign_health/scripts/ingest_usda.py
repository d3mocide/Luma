"""One-time USDA FoodData Central ingest — Phase 1.

Run with:
    docker compose run --rm worker python -m sovereign_health.scripts.ingest_usda
"""
import asyncio


async def main() -> None:
    raise NotImplementedError("Phase 1 — USDA ingest not yet implemented")


if __name__ == "__main__":
    asyncio.run(main())
