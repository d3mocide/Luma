"""Health Connect ingest: normalization, conversions, gating, and endpoint auth."""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.hae_fixtures import build_capturing_db
from tests.health_connect_fixtures import (
    EXPECTED_ADDITIVE_TS,
    EXPECTED_SCALAR_TS,
    SAMPLE_HC_PAYLOAD,
)

_USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


async def _capture(payload, data_source=None):
    from luma.services.health_connect_normalizer import normalize_health_connect_payload
    db, captured = build_capturing_db()
    await normalize_health_connect_payload(payload, db, _USER, data_source=data_source)
    return captured


# ── Normalization & conversions ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_maps_and_converts_core_metrics():
    by_metric = {r["metric"]: r for r in await _capture(SAMPLE_HC_PAYLOAD)}

    assert by_metric["steps"]["value"] == pytest.approx(8421)
    assert by_metric["distance_km"]["value"] == pytest.approx(5.0)       # 5000 m → km
    assert by_metric["active_kcal"]["value"] == pytest.approx(515)
    assert by_metric["weight_kg"]["value"] == pytest.approx(80.5)
    assert by_metric["height_cm"]["value"] == pytest.approx(180.0)       # 1.8 m → cm
    assert by_metric["body_temp_c"]["value"] == pytest.approx(36.6)
    assert by_metric["rhr_bpm"]["value"] == pytest.approx(58)
    assert by_metric["spo2_pct"]["value"] == pytest.approx(97.5)
    assert by_metric["lean_body_mass_kg"]["value"] == pytest.approx(65.0)


@pytest.mark.asyncio
async def test_timestamps_use_end_time_for_additive_and_time_for_scalar():
    # build_capturing_db round-trips rows through JSON, so ts arrives as a string.
    by_metric = {r["metric"]: r for r in await _capture(SAMPLE_HC_PAYLOAD)}
    assert by_metric["steps"]["ts"] == str(EXPECTED_ADDITIVE_TS)
    assert by_metric["weight_kg"]["ts"] == str(EXPECTED_SCALAR_TS)


@pytest.mark.asyncio
async def test_blood_pressure_splits_into_two_rows():
    by_metric = {r["metric"]: r for r in await _capture(SAMPLE_HC_PAYLOAD)}
    assert by_metric["bp_systolic_mmhg"]["value"] == pytest.approx(120)
    assert by_metric["bp_diastolic_mmhg"]["value"] == pytest.approx(80)


@pytest.mark.asyncio
async def test_sleep_duration_asleep_and_score():
    by_metric = {r["metric"]: r for r in await _capture(SAMPLE_HC_PAYLOAD)}
    assert by_metric["sleep_duration_min"]["value"] == pytest.approx(480.0)   # 28800 s
    assert by_metric["sleep_asleep_min"]["value"] == pytest.approx(450.0)     # 2+4+1.5 h, awake excluded
    # duration 60 + efficiency (450/480)*40 = 37.5 → 97.5
    assert by_metric["sleep_score"]["value"] == pytest.approx(97.5)


@pytest.mark.asyncio
async def test_unmapped_types_are_skipped():
    metrics = {r["metric"] for r in await _capture(SAMPLE_HC_PAYLOAD)}
    # nutrition / heart_rate are intentionally not routed into biometrics
    assert "heart_rate_avg_bpm" not in metrics
    assert not any("nutrition" in m or "calorie" in m for m in metrics if m != "active_kcal")
    assert "active_kcal" in metrics  # sanity: the real additive energy metric is present


@pytest.mark.asyncio
async def test_source_is_health_connect():
    rows = await _capture(SAMPLE_HC_PAYLOAD)
    assert all(r["source"] == "health_connect" for r in rows)


# ── Gating ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_additive_dropped_when_primary_is_apple():
    metrics = {r["metric"] for r in await _capture(SAMPLE_HC_PAYLOAD, data_source="apple_health")}
    assert "steps" not in metrics
    assert "distance_km" not in metrics
    assert "active_kcal" not in metrics
    # scalars still merge
    assert "weight_kg" in metrics
    assert "spo2_pct" in metrics


@pytest.mark.asyncio
async def test_additive_kept_when_primary_is_health_connect():
    metrics = {r["metric"] for r in await _capture(SAMPLE_HC_PAYLOAD, data_source="health_connect")}
    assert {"steps", "distance_km", "active_kcal"} <= metrics


# ── Endpoint auth ─────────────────────────────────────────────────────────────

def _make_app(db_user):
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


def _user(data_source="health_connect"):
    u = MagicMock()
    u.id = uuid4()
    u.data_source = data_source
    return u


def test_valid_token_accepted():
    app = _make_app(_user())
    with patch("luma.api.ingest._check_replay", new=AsyncMock()):
        with patch("luma.api.ingest.hae_metrics_tracker") as tracker:
            tracker.record_ingest = AsyncMock()
            with TestClient(app, raise_server_exceptions=False) as client:
                resp = client.post(f"/api/v1/ingest/health-connect/{uuid4()}", json=SAMPLE_HC_PAYLOAD)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_unknown_token_returns_401():
    app = _make_app(None)
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(f"/api/v1/ingest/health-connect/{uuid4()}", json=SAMPLE_HC_PAYLOAD)
    assert resp.status_code == 401


def test_malformed_uuid_returns_422():
    app = _make_app(_user())
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post("/api/v1/ingest/health-connect/not-a-uuid", json=SAMPLE_HC_PAYLOAD)
    assert resp.status_code == 422


def test_app_secret_not_required_even_when_configured():
    """The HC endpoint must accept data without X-HAE-Signature even if a shared
    secret is set — the off-the-shelf exporter can't send headers."""
    app = _make_app(_user())
    with patch("luma.api.ingest._check_replay", new=AsyncMock()):
        with patch("luma.api.ingest.hae_metrics_tracker") as tracker:
            tracker.record_ingest = AsyncMock()
            with patch("luma.api.ingest.settings") as mock_settings:
                mock_settings.hae_shared_secret = "a-configured-secret-32-bytes-long!!"
                with TestClient(app, raise_server_exceptions=False) as client:
                    resp = client.post(f"/api/v1/ingest/health-connect/{uuid4()}", json=SAMPLE_HC_PAYLOAD)
    assert resp.status_code == 200


def test_invalid_json_returns_422():
    app = _make_app(_user())
    with patch("luma.api.ingest._check_replay", new=AsyncMock()):
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                f"/api/v1/ingest/health-connect/{uuid4()}",
                content=b"{not json",
                headers={"Content-Type": "application/json"},
            )
    assert resp.status_code == 422
