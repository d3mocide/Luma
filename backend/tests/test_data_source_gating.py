"""Additive-metric gating by the user's chosen data_source.

Scalar metrics (weight, heart rate, …) always merge across ecosystems; only
cumulative additive metrics (steps, distance, active energy) are gated so iOS
and Android don't double-count.
"""
from datetime import UTC, datetime

import pytest

from tests.hae_fixtures import build_capturing_db

_USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
_TS = datetime(2026, 5, 19, 7, 0, 0, tzinfo=UTC)


def _rows():
    """One additive metric (steps) and one scalar metric (weight)."""
    return [
        {"user_id": _USER, "ts": _TS, "metric": "steps", "value": 8421.0,
         "source": "x", "source_meta": {"hc_source": "x"}},
        {"user_id": _USER, "ts": _TS, "metric": "weight_kg", "value": 80.0,
         "source": "x", "source_meta": {"hc_source": "x"}},
    ]


async def _persist(source_ecosystem, data_source):
    from luma.services.biometric_store import persist_biometric_rows
    db, captured = build_capturing_db()
    await persist_biometric_rows(
        _rows(), db, _USER, source_ecosystem=source_ecosystem, data_source=data_source,
    )
    return {r["metric"] for r in captured}


@pytest.mark.asyncio
async def test_no_gate_when_data_source_unset():
    metrics = await _persist("health_connect", None)
    assert metrics == {"steps", "weight_kg"}


@pytest.mark.asyncio
async def test_matching_ecosystem_keeps_additive():
    metrics = await _persist("health_connect", "health_connect")
    assert metrics == {"steps", "weight_kg"}


@pytest.mark.asyncio
async def test_nonmatching_ecosystem_drops_additive_keeps_scalar():
    metrics = await _persist("health_connect", "apple_health")
    assert "steps" not in metrics
    assert "weight_kg" in metrics


@pytest.mark.asyncio
async def test_hae_additive_dropped_when_primary_is_health_connect():
    # Apple payload while the user has chosen Android as their source.
    metrics = await _persist("apple_health", "health_connect")
    assert "steps" not in metrics
    assert "weight_kg" in metrics


@pytest.mark.asyncio
async def test_all_additive_gated_returns_zero_without_db_write():
    from luma.services.biometric_store import persist_biometric_rows
    db, captured = build_capturing_db()
    rows = [{"user_id": _USER, "ts": _TS, "metric": "steps", "value": 1.0,
             "source": "x", "source_meta": {}}]
    count = await persist_biometric_rows(
        rows, db, _USER, source_ecosystem="health_connect", data_source="apple_health",
    )
    assert count == 0
    assert captured == []
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_hae_payload_respects_data_source_gate():
    # Integration: an Apple payload's steps drop when primary is Android.
    from luma.services.hae_normalizer import normalize_hae_payload
    payload = {"data": {"metrics": [
        {"name": "step_count", "units": "count", "data": [
            {"qty": 7000, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}]},
        {"name": "weight_body_mass", "units": "kg", "data": [
            {"qty": 80, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}]},
    ]}}
    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _USER, data_source="health_connect")
    metrics = {r["metric"] for r in captured}
    assert "steps" not in metrics
    assert "weight_kg" in metrics
