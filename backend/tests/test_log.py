"""Meal logging endpoint tests — covers CRUD round-trip and auth gating."""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

SAMPLE_NUTRITION = {
    "calories": 380.0,
    "protein_g": 12.0,
    "fat_g": 8.0,
    "saturated_fat_g": 1.5,
    "carbohydrates_g": 60.0,
    "fiber_g": 6.0,
    "soluble_fiber_g": 3.0,
    "sodium_mg": 120.0,
}

SAMPLE_ITEMS = [
    {
        "name": "Steel cut oats",
        "quantity": 234.0,
        "unit": "g",
        "nutrients": SAMPLE_NUTRITION,
    }
]

MEAL_PAYLOAD = {
    "slot": "breakfast",
    "source": "manual",
    "items": SAMPLE_ITEMS,
    "nutrition": SAMPLE_NUTRITION,
}


def _make_fake_user():
    user = MagicMock()
    user.id = uuid4()
    return user


def _make_fake_event(user_id=None, event_id=None, slot="breakfast", favorite_id=None, raw_input=None):
    event = MagicMock()
    event.id = event_id or uuid4()
    event.user_id = user_id or uuid4()
    event.ts = datetime.now(UTC)
    event.slot = slot
    event.source = "manual"
    event.items = SAMPLE_ITEMS
    event.nutrition = SAMPLE_NUTRITION
    event.plan_slot_id = None
    event.favorite_id = favorite_id
    event.raw_input = raw_input
    event.confidence = None
    return event


def _make_log_app(fake_user, db_override=None):
    from luma.api.log import router
    from luma.deps import get_current_user, get_db

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/log")

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


# ── POST /log/meal ─────────────────────────────────────────────────────────────

def test_create_meal_returns_201_shape():
    fake_user = _make_fake_user()
    fake_event = _make_fake_event(user_id=fake_user.id)

    async def db_override():
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock(side_effect=lambda e: None)
        # refresh is called on the event — pre-populate it via the fake_event fixture
        yield db

    app = _make_log_app(fake_user, db_override)

    with patch("luma.api.log.uuid.uuid4", return_value=fake_event.id):
        with TestClient(app) as client:
            resp = client.post("/api/v1/log/meal", json=MEAL_PAYLOAD)

    assert resp.status_code == 200
    body = resp.json()
    assert body["slot"] == "breakfast"
    assert body["source"] == "manual"
    assert "id" in body
    assert "ts" in body


def test_create_meal_requires_auth():
    from luma.api.log import router
    from luma.deps import get_db

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/log")

    async def _mock_db():
        yield AsyncMock()
    app.dependency_overrides[get_db] = _mock_db
    # No get_current_user override — real dep requires valid cookie

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post("/api/v1/log/meal", json=MEAL_PAYLOAD)

    assert resp.status_code == 401


# ── GET /log/meals ─────────────────────────────────────────────────────────────

def test_list_meals_returns_events_for_user():
    fake_user = _make_fake_user()
    event1 = _make_fake_event(user_id=fake_user.id, slot="breakfast")
    event2 = _make_fake_event(user_id=fake_user.id, slot="lunch")

    async def db_override():
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [event1, event2]
        db.execute = AsyncMock(return_value=result)
        yield db

    app = _make_log_app(fake_user, db_override)

    with TestClient(app) as client:
        resp = client.get("/api/v1/log/meals")

    assert resp.status_code == 200
    body = resp.json()
    assert "meals" in body
    assert len(body["meals"]) == 2
    assert body["meals"][0]["slot"] == "breakfast"
    assert body["meals"][1]["slot"] == "lunch"


def test_list_meals_empty_returns_empty_list():
    fake_user = _make_fake_user()

    async def db_override():
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=result)
        yield db

    app = _make_log_app(fake_user, db_override)

    with TestClient(app) as client:
        resp = client.get("/api/v1/log/meals")

    assert resp.status_code == 200
    assert resp.json() == {"meals": []}


# ── GET /log/meals/frequent ────────────────────────────────────────────────────

def test_frequent_meals_carries_saved_favorite_name():
    """A meal logged from a favorite surfaces that favorite's current name."""
    fave_user = _make_fake_user()
    fav_id = uuid4()
    event = _make_fake_event(user_id=fave_user.id, slot="dinner", favorite_id=fav_id)

    async def db_override():
        db = AsyncMock()
        events_result = MagicMock()
        events_result.scalars.return_value.all.return_value = [event]
        fav_result = MagicMock()
        fav_result.all.return_value = [(fav_id, "Power Bowl")]
        db.execute = AsyncMock(side_effect=[events_result, fav_result])
        yield db

    app = _make_log_app(fave_user, db_override)

    with TestClient(app) as client:
        resp = client.get("/api/v1/log/meals/frequent")

    assert resp.status_code == 200
    suggestions = resp.json()["suggestions"]
    assert len(suggestions) == 1
    assert suggestions[0]["name"] == "Power Bowl"


def test_frequent_meals_falls_back_to_raw_input_name():
    """A user-named manual meal surfaces its raw_input; generic logs stay unnamed."""
    fake_user = _make_fake_user()
    named = _make_fake_event(user_id=fake_user.id, slot="lunch", raw_input="Sunday Brunch")
    generic = _make_fake_event(user_id=fake_user.id, slot="dinner", raw_input="Manual log")

    async def db_override():
        db = AsyncMock()
        events_result = MagicMock()
        events_result.scalars.return_value.all.return_value = [named, generic]
        db.execute = AsyncMock(return_value=events_result)
        yield db

    app = _make_log_app(fake_user, db_override)

    with TestClient(app) as client:
        resp = client.get("/api/v1/log/meals/frequent")

    assert resp.status_code == 200
    by_slot = {s["slot"]: s for s in resp.json()["suggestions"]}
    assert by_slot["lunch"]["name"] == "Sunday Brunch"
    assert by_slot["dinner"]["name"] is None


# ── PATCH /log/meal/{id} ───────────────────────────────────────────────────────

def test_patch_meal_updates_slot():
    fake_user = _make_fake_user()
    fake_event = _make_fake_event(user_id=fake_user.id, slot="breakfast")

    async def db_override():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = fake_event
        db.execute = AsyncMock(return_value=result)
        db.commit = AsyncMock()
        db.refresh = AsyncMock(side_effect=lambda e: None)
        yield db

    app = _make_log_app(fake_user, db_override)

    with TestClient(app) as client:
        resp = client.patch(
            f"/api/v1/log/meal/{fake_event.id}",
            json={"slot": "lunch"},
        )

    assert resp.status_code == 200
    assert resp.json()["slot"] == "lunch"


def test_patch_meal_not_found_returns_404():
    fake_user = _make_fake_user()

    async def db_override():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)
        yield db

    app = _make_log_app(fake_user, db_override)

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.patch(f"/api/v1/log/meal/{uuid4()}", json={"slot": "dinner"})

    assert resp.status_code == 404


def test_patch_meal_invalid_uuid_returns_400():
    fake_user = _make_fake_user()
    app = _make_log_app(fake_user)

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.patch("/api/v1/log/meal/not-a-uuid", json={"slot": "dinner"})

    assert resp.status_code == 400


# ── DELETE /log/meal/{id} ──────────────────────────────────────────────────────

def test_delete_meal_returns_ok():
    fake_user = _make_fake_user()
    fake_event = _make_fake_event(user_id=fake_user.id)

    async def db_override():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = fake_event
        db.execute = AsyncMock(return_value=result)
        db.delete = AsyncMock()
        db.commit = AsyncMock()
        yield db

    app = _make_log_app(fake_user, db_override)

    with TestClient(app) as client:
        resp = client.delete(f"/api/v1/log/meal/{fake_event.id}")

    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_delete_meal_not_found_returns_404():
    fake_user = _make_fake_user()

    async def db_override():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)
        yield db

    app = _make_log_app(fake_user, db_override)

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.delete(f"/api/v1/log/meal/{uuid4()}")

    assert resp.status_code == 404


def test_delete_meal_invalid_uuid_returns_400():
    fake_user = _make_fake_user()
    app = _make_log_app(fake_user)

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.delete("/api/v1/log/meal/not-a-uuid")

    assert resp.status_code == 400


# ── Cross-user isolation ───────────────────────────────────────────────────────

def test_patch_cannot_modify_another_users_meal():
    """PATCH returns 404 when the meal belongs to a different user (DB filters by user_id)."""
    attacker = _make_fake_user()

    async def db_override():
        db = AsyncMock()
        result = MagicMock()
        # Simulates DB returning nothing because user_id filter excludes other user's meal
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)
        yield db

    app = _make_log_app(attacker, db_override)

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.patch(f"/api/v1/log/meal/{uuid4()}", json={"slot": "dinner"})

    assert resp.status_code == 404
