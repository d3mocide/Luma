import uuid
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from luma.api.notifications import router
from luma.deps import get_current_user, get_db


def _make_fake_user(*, nudge_enabled=True, nudge_hour=19, nudge_tz="America/New_York"):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.nudge_enabled = nudge_enabled
    user.nudge_hour = nudge_hour
    user.nudge_tz = nudge_tz
    return user


def _make_app(fake_user, db):
    app = FastAPI()
    app.include_router(router, prefix="/notifications")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    return app


def test_toggle_enabled_merges_stored_fields():
    # Only nudge_enabled is sent; hour/tz must be filled from the stored values.
    user = _make_fake_user(nudge_enabled=True, nudge_hour=8, nudge_tz="Europe/Paris")
    db = AsyncMock()
    db.commit = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.put("/notifications/preferences", json={"nudge_enabled": False})
        assert resp.status_code == 200
        assert resp.json() == {"nudge_enabled": False, "nudge_hour": 8, "nudge_tz": "Europe/Paris"}

    params = db.execute.call_args[0][1]
    assert params["enabled"] is False
    assert params["hour"] == 8
    assert params["tz"] == "Europe/Paris"


def test_toggle_enabled_succeeds_despite_unresolvable_stored_tz():
    # The enable/disable toggle must not be blocked by a stored timezone the
    # server can't resolve — that field isn't being changed.
    user = _make_fake_user(nudge_tz="Mars/Olympus_Mons")
    db = AsyncMock()
    db.commit = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.put("/notifications/preferences", json={"nudge_enabled": False})
        assert resp.status_code == 200
        assert resp.json()["nudge_tz"] == "Mars/Olympus_Mons"


def test_explicit_invalid_tz_is_rejected():
    user = _make_fake_user()
    db = AsyncMock()
    db.commit = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.put("/notifications/preferences", json={"nudge_tz": "Not/AZone"})
        assert resp.status_code == 422
        assert "Unknown timezone" in resp.json()["detail"]


def test_explicit_out_of_range_hour_is_rejected():
    user = _make_fake_user()
    db = AsyncMock()
    db.commit = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.put("/notifications/preferences", json={"nudge_hour": 25})
        assert resp.status_code == 422


def test_hour_only_update_merges_enabled_and_tz():
    user = _make_fake_user(nudge_enabled=True, nudge_hour=19, nudge_tz="UTC")
    db = AsyncMock()
    db.commit = AsyncMock()

    app = _make_app(user, db)
    with TestClient(app) as client:
        resp = client.put("/notifications/preferences", json={"nudge_hour": 7})
        assert resp.status_code == 200
        assert resp.json() == {"nudge_enabled": True, "nudge_hour": 7, "nudge_tz": "UTC"}
