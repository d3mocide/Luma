"""Foods endpoint tests — covers the POST /foods upsert behavior used by the
scan/photo nutrition editor to persist corrected foods into the user's library."""
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _refresh_defaults(food):
    """Simulate the DB applying server_defaults on commit/refresh so the real
    Food instance serializes cleanly through FoodResponse in these unit tests."""
    if getattr(food, "household_measures", None) is None:
        food.household_measures = []
    if getattr(food, "flags", None) is None:
        food.flags = []

FOOD_PAYLOAD = {
    "name": "Homemade granola",
    "brand": "My kitchen",
    "serving_size_g": 45.0,
    "nutrients_per_100g": {
        "calories": 450.0,
        "protein_g": 11.0,
        "fat_g": 18.0,
        "saturated_fat_g": 3.0,
        "carbohydrates_g": 60.0,
        "fiber_g": 7.0,
        "sodium_mg": 30.0,
        "vitamin_c_mg": 2.0,
    },
}


def _make_fake_user():
    user = MagicMock()
    user.id = uuid4()
    return user


def _make_foods_app(fake_user, db_override=None):
    from luma.api.foods import router
    from luma.deps import get_current_user, get_db

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/foods")

    if db_override:
        app.dependency_overrides[get_db] = db_override
    else:
        async def _mock_db():
            yield AsyncMock()
        app.dependency_overrides[get_db] = _mock_db

    if fake_user is not None:
        async def _mock_user():
            return fake_user
        app.dependency_overrides[get_current_user] = _mock_user

    return app


def test_create_food_inserts_when_absent():
    """No existing user food with that name → a new row is added."""
    fake_user = _make_fake_user()
    added: list = []

    async def db_override():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)
        db.add = MagicMock(side_effect=added.append)
        db.commit = AsyncMock()
        db.refresh = AsyncMock(side_effect=_refresh_defaults)
        yield db

    app = _make_foods_app(fake_user, db_override)

    with TestClient(app) as client:
        resp = client.post("/api/v1/foods", json=FOOD_PAYLOAD)

    assert resp.status_code == 201
    assert len(added) == 1
    new_food = added[0]
    assert new_food.source == "user"
    assert new_food.created_by == fake_user.id
    assert new_food.name == "Homemade granola"
    # Micronutrient keys round-trip into storage.
    assert new_food.nutrients_per_100g["vitamin_c_mg"] == 2.0


def test_create_food_updates_existing_user_food():
    """A second save with the same name + user updates the row instead of inserting."""
    from luma.db.models import Food

    fake_user = _make_fake_user()
    existing = Food(
        id=uuid4(),
        source="user",
        name="Homemade granola",
        created_by=fake_user.id,
        nutrients_per_100g={"calories": 100.0},
        serving_size_g=30.0,
        household_measures=[],
        flags=[],
    )
    added: list = []

    async def db_override():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = existing
        db.execute = AsyncMock(return_value=result)
        db.add = MagicMock(side_effect=added.append)
        db.commit = AsyncMock()
        db.refresh = AsyncMock(side_effect=_refresh_defaults)
        yield db

    app = _make_foods_app(fake_user, db_override)

    with TestClient(app) as client:
        resp = client.post("/api/v1/foods", json=FOOD_PAYLOAD)

    assert resp.status_code == 201
    # Upsert path: no new row inserted, the existing one is mutated in place.
    assert added == []
    assert existing.nutrients_per_100g["calories"] == 450.0
    assert existing.nutrients_per_100g["vitamin_c_mg"] == 2.0
    assert float(existing.serving_size_g) == 45.0


def test_create_food_requires_auth():
    from luma.api.foods import router
    from luma.deps import get_db

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/foods")

    async def _mock_db():
        yield AsyncMock()
    app.dependency_overrides[get_db] = _mock_db

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post("/api/v1/foods", json=FOOD_PAYLOAD)

    assert resp.status_code == 401
