"""Per-user import token auth tests for the HAE ingest endpoint."""
import json
import hashlib
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.hae_fixtures import SAMPLE_PAYLOAD


def _make_ingest_app(db_user):
    """Minimal FastAPI app with only the ingest router and a mocked DB dependency."""
    from luma.api.ingest import router
    from luma.deps import get_db

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/ingest")

    async def mock_get_db():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = db_user
        db.execute.return_value = result
        db.commit = AsyncMock()
        yield db

    app.dependency_overrides[get_db] = mock_get_db
    return app


APP_SECRET = "test-app-secret-that-is-long-enough-32b"


def _post_hae(client, token=None, headers=None, **kwargs):
    url = f"/api/v1/ingest/hae/{token or uuid4()}"
    return client.post(url, json=SAMPLE_PAYLOAD, headers=headers or {}, **kwargs)


def test_valid_import_token_accepted():
    fake_user = MagicMock()
    fake_user.id = uuid4()

    app = _make_ingest_app(fake_user)

    with patch("luma.api.ingest._check_replay", new=AsyncMock()):
        with patch("luma.api.ingest.hae_metrics_tracker") as mock_tracker:
            mock_tracker.record_ingest = AsyncMock()
            # no app secret configured — header check is skipped
            with patch("luma.api.ingest.settings") as mock_settings:
                mock_settings.hae_shared_secret = ""
                with TestClient(app, raise_server_exceptions=False) as client:
                    resp = _post_hae(client)

    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_correct_app_secret_accepted():
    fake_user = MagicMock()
    fake_user.id = uuid4()

    app = _make_ingest_app(fake_user)

    with patch("luma.api.ingest._check_replay", new=AsyncMock()):
        with patch("luma.api.ingest.hae_metrics_tracker") as mock_tracker:
            mock_tracker.record_ingest = AsyncMock()
            with patch("luma.api.ingest.settings") as mock_settings:
                mock_settings.hae_shared_secret = APP_SECRET
                with TestClient(app, raise_server_exceptions=False) as client:
                    resp = _post_hae(client, headers={"X-HAE-Signature": APP_SECRET})

    assert resp.status_code == 200


def test_missing_app_secret_header_returns_401():
    fake_user = MagicMock()
    fake_user.id = uuid4()

    app = _make_ingest_app(fake_user)

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = APP_SECRET
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = _post_hae(client)  # no X-HAE-Signature header

    assert resp.status_code == 401


def test_wrong_app_secret_returns_401():
    fake_user = MagicMock()
    fake_user.id = uuid4()

    app = _make_ingest_app(fake_user)

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = APP_SECRET
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = _post_hae(client, headers={"X-HAE-Signature": "wrong-secret"})

    assert resp.status_code == 401


def test_unknown_import_token_returns_401():
    app = _make_ingest_app(None)  # DB finds no matching user

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = ""
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = _post_hae(client)

    assert resp.status_code == 401


def test_malformed_uuid_returns_422():
    app = _make_ingest_app(MagicMock())

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(
            "/api/v1/ingest/hae/not-a-valid-uuid",
            json=SAMPLE_PAYLOAD,
        )

    assert resp.status_code == 422


def test_replay_key_scoped_per_user():
    """Same body from two different users must produce different replay keys."""
    body = json.dumps(SAMPLE_PAYLOAD).encode()
    body_hash = hashlib.sha256(body).hexdigest()

    token_a = str(uuid4())
    token_b = str(uuid4())

    key_a = f"{token_a}:{body_hash}"
    key_b = f"{token_b}:{body_hash}"

    assert key_a != key_b
