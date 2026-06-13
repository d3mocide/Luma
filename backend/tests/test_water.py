import uuid
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from luma.api.water import router
from luma.deps import get_current_user, get_db


def _make_fake_user(goal_ml: int = 2000, buddy: str = "frog"):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.water_goal_ml = goal_ml
    user.water_buddy = buddy
    return user


def _summary_result(total_ml: int, entries: int):
    row = MagicMock()
    row.total_ml = total_ml
    row.entries = entries
    result = MagicMock()
    result.one.return_value = row
    return result


def _make_app(fake_user, db):
    app = FastAPI()
    app.include_router(router, prefix="/water")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    return app


def test_water_today_returns_summary():
    user = _make_fake_user()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_summary_result(750, 3))

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.get("/water/today?tz=America/New_York")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_ml"] == 750
        assert body["entries"] == 3
        assert body["goal_ml"] == 2000
        assert body["glass_ml"] == 250
        assert body["goal_met"] is False
        assert body["buddy"] == "frog"


def test_water_today_goal_met():
    user = _make_fake_user(goal_ml=2000, buddy="axolotl")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_summary_result(2250, 9))

    app = _make_app(user, db)
    with TestClient(app) as client:
        body = client.get("/water/today").json()
        assert body["goal_met"] is True
        assert body["buddy"] == "axolotl"


def test_log_water_inserts_and_returns_updated_summary():
    user = _make_fake_user()
    db = AsyncMock()
    insert_result = MagicMock()
    db.execute = AsyncMock(side_effect=[insert_result, _summary_result(1000, 4)])
    db.commit = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.post("/water/log", json={"amount_ml": 250})
        assert resp.status_code == 201
        body = resp.json()
        assert body["total_ml"] == 1000
        assert body["entries"] == 4

    assert db.commit.called
    insert_params = db.execute.call_args_list[0][0][1]
    assert insert_params["uid"] == str(user.id)
    assert insert_params["amount"] == 250


def test_log_water_defaults_to_one_glass():
    user = _make_fake_user()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[MagicMock(), _summary_result(250, 1)])
    db.commit = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.post("/water/log", json={})
        assert resp.status_code == 201

    insert_params = db.execute.call_args_list[0][0][1]
    assert insert_params["amount"] == 250


def test_log_water_rejects_invalid_amounts():
    user = _make_fake_user()
    db = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        assert client.post("/water/log", json={"amount_ml": 0}).status_code == 422
        assert client.post("/water/log", json={"amount_ml": -100}).status_code == 422
        assert client.post("/water/log", json={"amount_ml": 5000}).status_code == 422


def test_undo_last_deletes_and_returns_summary():
    user = _make_fake_user()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[MagicMock(), _summary_result(500, 2)])
    db.commit = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.delete("/water/last")
        assert resp.status_code == 200
        assert resp.json()["total_ml"] == 500

    assert db.commit.called
    delete_params = db.execute.call_args_list[0][0][1]
    assert delete_params["uid"] == str(user.id)


def test_settings_updates_buddy():
    user = _make_fake_user()
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.put("/water/settings", json={"buddy": "cat"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["buddy"] == "cat"
        assert body["goal_ml"] == 2000

    update_params = db.execute.call_args_list[0][0][1]
    assert update_params["buddy"] == "cat"
    assert update_params["goal"] == 2000


def test_settings_rejects_unknown_buddy_and_bad_goal():
    user = _make_fake_user()
    db = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        assert client.put("/water/settings", json={"buddy": "dragon"}).status_code == 422
        assert client.put("/water/settings", json={"goal_ml": 100}).status_code == 422
        assert client.put("/water/settings", json={"goal_ml": 50000}).status_code == 422
