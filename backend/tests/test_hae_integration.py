"""Validate HAE (Health Auto Export) ingestion against a real one-day sample payload."""
import hashlib
import hmac
import importlib
import json
import sys
import types
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Sample payload — one day of real Health Auto Export data (2026-05-19)
# ---------------------------------------------------------------------------
SAMPLE_PAYLOAD = {
    "data": {
        "metrics": [
            {"name": "apple_exercise_time", "units": "min", "data": [{"date": "2026-05-19 00:00:00 -0700", "qty": 4, "source": "William's Apple Watch"}]},
            {"name": "active_energy", "units": "kcal", "data": [{"qty": 515.69638429138649, "source": "William's Apple Watch", "date": "2026-05-19 00:00:00 -0700"}]},
            {"name": "apple_sleeping_wrist_temperature", "units": "degF", "data": [{"qty": 95.170452880859315, "date": "2026-05-19 00:00:00 -0700", "source": "William's Apple Watch"}]},
            {"name": "apple_stand_hour", "units": "count", "data": [{"date": "2026-05-19 00:00:00 -0700", "qty": 12, "source": ""}]},
            {"name": "apple_stand_time", "units": "min", "data": [{"date": "2026-05-19 00:00:00 -0700", "source": "William's Apple Watch", "qty": 146}]},
            {"name": "breathing_disturbances", "units": "count", "data": [{"date": "2026-05-19 00:00:00 -0700", "source": "William's Apple Watch", "qty": 0.94398015737533569}]},
            {"name": "environmental_audio_exposure", "units": "dBASPL", "data": [{"date": "2026-05-19 00:00:00 -0700", "source": "William's Apple Watch", "qty": 63.990700962442752}]},
            {"name": "flights_climbed", "units": "count", "data": [{"date": "2026-05-19 00:00:00 -0700", "source": "William's Apple Watch|L4z0r-Kitt3n", "qty": 5}]},
            # heart_rate has Min/Avg/Max structure (no qty) — must be gracefully skipped
            {"name": "heart_rate", "units": "count/min", "data": [{"Min": 52, "Avg": 74.613139994679827, "date": "2026-05-19 00:00:00 -0700", "source": "William's Apple Watch", "Max": 116}]},
            {"name": "heart_rate_variability", "units": "ms", "data": [{"date": "2026-05-19 00:00:00 -0700", "qty": 59.771549595894335, "source": "William's Apple Watch"}]},
            {"name": "physical_effort", "units": "kcal/hr·kg", "data": [{"qty": 3.3450520830228925, "source": "William's Apple Watch", "date": "2026-05-19 00:00:00 -0700"}]},
            {"name": "basal_energy_burned", "units": "kcal", "data": [{"source": "William's Apple Watch", "qty": 2264.7115533249325, "date": "2026-05-19 00:00:00 -0700"}]},
            {"name": "resting_heart_rate", "units": "count/min", "data": [{"source": "William's Apple Watch", "qty": 61.999999999999993, "date": "2026-05-19 00:00:00 -0700"}]},
            {"name": "respiratory_rate", "units": "count/min", "data": [{"source": "William's Apple Watch", "date": "2026-05-19 00:00:00 -0700", "qty": 17.222222222222221}]},
            {"name": "step_count", "units": "count", "data": [{"source": "William's Apple Watch|L4z0r-Kitt3n", "qty": 7369.1420323996308, "date": "2026-05-19 00:00:00 -0700"}]},
            {"name": "stair_speed_down", "units": "ft/s", "data": [{"qty": 1.0937208852430027, "source": "William's Apple Watch", "date": "2026-05-19 00:00:00 -0700"}]},
            {"name": "stair_speed_up", "units": "ft/s", "data": [{"qty": 0.68338807877593155, "source": "William's Apple Watch", "date": "2026-05-19 00:00:00 -0700"}]},
            {"name": "time_in_daylight", "units": "min", "data": [{"qty": 37, "source": "William's Apple Watch", "date": "2026-05-19 00:00:00 -0700"}]},
            {"name": "walking_running_distance", "units": "mi", "data": [{"source": "William's Apple Watch|L4z0r-Kitt3n", "qty": 3.2878305909330341, "date": "2026-05-19 00:00:00 -0700"}]},
            {"name": "walking_heart_rate_average", "units": "count/min", "data": [{"date": "2026-05-19 00:00:00 -0700", "source": "William's Apple Watch", "qty": 99}]},
            {"name": "walking_asymmetry_percentage", "units": "%", "data": [{"qty": 0.82758620689655171, "date": "2026-05-19 00:00:00 -0700", "source": "L4z0r-Kitt3n"}]},
            {"name": "walking_speed", "units": "mi/hr", "data": [{"date": "2026-05-19 00:00:00 -0700", "qty": 2.6729106101996991, "source": "L4z0r-Kitt3n"}]},
            {"name": "walking_double_support_percentage", "units": "%", "data": [{"source": "L4z0r-Kitt3n", "date": "2026-05-19 00:00:00 -0700", "qty": 30.017391304347836}]},
            {"name": "walking_step_length", "units": "in", "data": [{"source": "L4z0r-Kitt3n", "qty": 27.76795757673149, "date": "2026-05-19 00:00:00 -0700"}]},
        ]
    }
}

# The 4 metrics in the sample that the normalizer currently maps
EXPECTED_METRICS = {"active_kcal", "hrv_ms", "rhr_bpm", "steps"}

# Expected UTC timestamp: "2026-05-19 00:00:00 -0700" → 07:00 UTC
EXPECTED_TS = datetime(2026, 5, 19, 7, 0, 0, tzinfo=timezone.utc)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_user():
    user = MagicMock()
    user.id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    user.role = "operator"
    return user


def _build_mock_db(fake_user):
    """Return an AsyncMock db session that yields fake_user on first execute."""
    db = AsyncMock()

    first_result = MagicMock()
    first_result.scalar_one_or_none.return_value = fake_user

    # First call → SELECT user; second call → INSERT biometrics
    db.execute.side_effect = [first_result, AsyncMock()]
    return db


# ---------------------------------------------------------------------------
# Unit tests: pure helpers
# ---------------------------------------------------------------------------

def test_parse_hae_ts_converts_to_utc():
    from luma.services.hae_normalizer import _parse_hae_ts
    ts = _parse_hae_ts("2026-05-19 00:00:00 -0700")
    assert ts == EXPECTED_TS
    assert ts.tzinfo == timezone.utc


def test_parse_hae_ts_positive_offset():
    from luma.services.hae_normalizer import _parse_hae_ts
    ts = _parse_hae_ts("2026-05-19 08:00:00 +0100")
    assert ts == datetime(2026, 5, 19, 7, 0, 0, tzinfo=timezone.utc)


def test_convert_sleep_hours_to_minutes():
    from luma.services.hae_normalizer import _convert
    assert _convert(7.5, "hr", "sleep_duration_min") == pytest.approx(450.0)
    assert _convert(6.0, "hours", "sleep_asleep_min") == pytest.approx(360.0)


def test_convert_passthrough_for_non_sleep():
    from luma.services.hae_normalizer import _convert
    assert _convert(515.69, "kcal", "active_kcal") == pytest.approx(515.69)
    assert _convert(7369.0, "count", "steps") == pytest.approx(7369.0)
    assert _convert(59.77, "ms", "hrv_ms") == pytest.approx(59.77)


def test_metric_map_contains_expected_keys():
    from luma.services.hae_normalizer import HAE_METRIC_MAP
    for hae_name in ("weight_body_mass", "heart_rate_variability", "resting_heart_rate",
                     "active_energy", "step_count", "body_fat_percentage", "body_mass_index"):
        assert hae_name in HAE_METRIC_MAP, f"{hae_name!r} missing from HAE_METRIC_MAP"


# ---------------------------------------------------------------------------
# Integration test: normalizer with full sample payload (mocked DB)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_normalize_sample_payload_row_count():
    from luma.services.hae_normalizer import normalize_hae_payload

    fake_user = _make_fake_user()
    db = _build_mock_db(fake_user)

    rows_inserted = await normalize_hae_payload(SAMPLE_PAYLOAD, db)

    assert rows_inserted == len(EXPECTED_METRICS), (
        f"Expected {len(EXPECTED_METRICS)} rows, got {rows_inserted}. "
        f"Check HAE_METRIC_MAP against sample metrics."
    )


@pytest.mark.asyncio
async def test_normalize_sample_payload_correct_metrics():
    """Verify each expected metric appears in the JSON sent to the DB insert."""
    import orjson
    from luma.services.hae_normalizer import normalize_hae_payload

    fake_user = _make_fake_user()
    db = AsyncMock()

    first_result = MagicMock()
    first_result.scalar_one_or_none.return_value = fake_user

    captured_rows = []
    call_count = [0]

    async def execute_side_effect(stmt, params=None):
        call_count[0] += 1
        if call_count[0] == 1:
            return first_result
        if params and "rows" in params:
            captured_rows.extend(orjson.loads(params["rows"]))
        return MagicMock()

    db.execute.side_effect = execute_side_effect

    await normalize_hae_payload(SAMPLE_PAYLOAD, db)

    # Exactly the expected metrics, no more, no less
    found_metrics = {r["metric"] for r in captured_rows}
    assert found_metrics == EXPECTED_METRICS, (
        f"Metric mismatch.\n  Expected: {EXPECTED_METRICS}\n  Got: {found_metrics}"
    )


@pytest.mark.asyncio
async def test_normalize_sample_payload_values():
    """Spot-check that specific metric values are correct."""
    import orjson
    from luma.services.hae_normalizer import normalize_hae_payload

    fake_user = _make_fake_user()
    db = AsyncMock()

    first_result = MagicMock()
    first_result.scalar_one_or_none.return_value = fake_user

    captured_rows = []
    call_count = [0]

    async def execute_side_effect(stmt, params=None):
        call_count[0] += 1
        if call_count[0] == 1:
            return first_result
        if params and "rows" in params:
            captured_rows.extend(orjson.loads(params["rows"]))
        return MagicMock()

    db.execute.side_effect = execute_side_effect
    await normalize_hae_payload(SAMPLE_PAYLOAD, db)

    by_metric = {r["metric"]: r for r in captured_rows}

    assert by_metric["active_kcal"]["value"] == pytest.approx(515.69638429138649, rel=1e-6)
    assert by_metric["hrv_ms"]["value"] == pytest.approx(59.771549595894335, rel=1e-6)
    assert by_metric["rhr_bpm"]["value"] == pytest.approx(62.0, rel=1e-6)
    assert by_metric["steps"]["value"] == pytest.approx(7369.1420323996308, rel=1e-6)


@pytest.mark.asyncio
async def test_normalize_sample_payload_timestamps():
    """All data points are dated 2026-05-19 00:00:00 -0700 → 07:00 UTC."""
    import orjson
    from luma.services.hae_normalizer import normalize_hae_payload

    fake_user = _make_fake_user()
    db = AsyncMock()

    first_result = MagicMock()
    first_result.scalar_one_or_none.return_value = fake_user

    captured_rows = []
    call_count = [0]

    async def execute_side_effect(stmt, params=None):
        call_count[0] += 1
        if call_count[0] == 1:
            return first_result
        if params and "rows" in params:
            captured_rows.extend(orjson.loads(params["rows"]))
        return MagicMock()

    db.execute.side_effect = execute_side_effect
    await normalize_hae_payload(SAMPLE_PAYLOAD, db)

    for row in captured_rows:
        ts = datetime.fromisoformat(row["ts"])
        assert ts == EXPECTED_TS, f"Wrong timestamp for {row['metric']!r}: {row['ts']!r}"


@pytest.mark.asyncio
async def test_normalize_sample_payload_source_meta():
    """source is always 'hae'; source_meta carries hae_metric and hae_source."""
    import orjson
    from luma.services.hae_normalizer import normalize_hae_payload

    fake_user = _make_fake_user()
    db = AsyncMock()

    first_result = MagicMock()
    first_result.scalar_one_or_none.return_value = fake_user

    captured_rows = []
    call_count = [0]

    async def execute_side_effect(stmt, params=None):
        call_count[0] += 1
        if call_count[0] == 1:
            return first_result
        if params and "rows" in params:
            captured_rows.extend(orjson.loads(params["rows"]))
        return MagicMock()

    db.execute.side_effect = execute_side_effect
    await normalize_hae_payload(SAMPLE_PAYLOAD, db)

    for row in captured_rows:
        assert row["source"] == "hae"
        meta = row["source_meta"]
        assert "hae_metric" in meta
        assert "hae_source" in meta


@pytest.mark.asyncio
async def test_normalize_no_operator_returns_zero():
    from luma.services.hae_normalizer import normalize_hae_payload

    db = AsyncMock()
    no_user_result = MagicMock()
    no_user_result.scalar_one_or_none.return_value = None
    db.execute.return_value = no_user_result

    count = await normalize_hae_payload(SAMPLE_PAYLOAD, db)
    assert count == 0


@pytest.mark.asyncio
async def test_normalize_heart_rate_gracefully_skipped():
    """heart_rate has Min/Avg/Max but no qty — must not raise, just skip."""
    import orjson
    from luma.services.hae_normalizer import normalize_hae_payload

    heart_rate_only = {
        "data": {"metrics": [
            {"name": "heart_rate", "units": "count/min", "data": [
                {"Min": 52, "Avg": 74.6, "Max": 116, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}
            ]}
        ]}
    }

    fake_user = _make_fake_user()
    db = AsyncMock()
    first_result = MagicMock()
    first_result.scalar_one_or_none.return_value = fake_user
    db.execute.return_value = first_result

    # Should not raise — heart_rate is not in HAE_METRIC_MAP so it's skipped entirely
    count = await normalize_hae_payload(heart_rate_only, db)
    assert count == 0


# ---------------------------------------------------------------------------
# HMAC signature verification
# ---------------------------------------------------------------------------

def test_hmac_signature_valid():
    """Correct HMAC-SHA256 signature passes verification."""
    from fastapi import HTTPException
    from luma.api.ingest import _verify_hae_signature

    secret = "testsecret_at_least_32_bytes_long_!!"
    body = json.dumps(SAMPLE_PAYLOAD).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = secret
        # Should not raise
        _verify_hae_signature(body, sig)


def test_hmac_signature_wrong_secret_rejected():
    from fastapi import HTTPException
    from luma.api.ingest import _verify_hae_signature

    body = b'{"data":{}}'
    good_sig = hmac.new(b"correct_secret_32bytes_long_xxxxx", body, hashlib.sha256).hexdigest()

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = "wrong_secret_32bytes_long_yyyyyy"
        with pytest.raises(HTTPException) as exc_info:
            _verify_hae_signature(body, good_sig)
    assert exc_info.value.status_code == 401


def test_hmac_signature_missing_header_rejected():
    from fastapi import HTTPException
    from luma.api.ingest import _verify_hae_signature

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = "any_secret_32bytes_long_xxxxxxxxx"
        with pytest.raises(HTTPException) as exc_info:
            _verify_hae_signature(b"body", None)
    assert exc_info.value.status_code == 401


def test_hmac_signature_tampered_body_rejected():
    from fastapi import HTTPException
    from luma.api.ingest import _verify_hae_signature

    secret = "testsecret_at_least_32_bytes_long_!!"
    original_body = b'{"data":{"metrics":[]}}'
    sig = hmac.new(secret.encode(), original_body, hashlib.sha256).hexdigest()
    tampered_body = b'{"data":{"metrics":[],"injected":true}}'

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = secret
        with pytest.raises(HTTPException) as exc_info:
            _verify_hae_signature(tampered_body, sig)
    assert exc_info.value.status_code == 401


def test_hmac_accepts_lowercase_signature():
    """Signature comparison is case-insensitive (signature.lower() is applied)."""
    from luma.api.ingest import _verify_hae_signature

    secret = "testsecret_at_least_32_bytes_long_!!"
    body = b'{"data":{}}'
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest().upper()

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = secret
        _verify_hae_signature(body, sig)  # should not raise


# ---------------------------------------------------------------------------
# Metric coverage report (informational — never fails)
# ---------------------------------------------------------------------------

def test_sample_payload_metric_coverage():
    """Document which metrics in the sample are handled vs. skipped."""
    from luma.services.hae_normalizer import HAE_METRIC_MAP, SLEEP_MAP

    sample_metrics = [m["name"] for m in SAMPLE_PAYLOAD["data"]["metrics"]]
    handled, skipped = [], []

    for name in sample_metrics:
        if name.startswith("sleep_analysis"):
            sub = name.split(".")[-1] if "." in name else "inBed"
            mapped = sub in SLEEP_MAP
        else:
            mapped = name in HAE_METRIC_MAP
        (handled if mapped else skipped).append(name)

    print(f"\n{'='*60}")
    print(f"HAE sample coverage: {len(handled)}/{len(sample_metrics)} metrics handled")
    print(f"\nHandled ({len(handled)}):")
    for m in handled:
        print(f"  + {m} → {HAE_METRIC_MAP.get(m, SLEEP_MAP.get(m.split('.')[-1]))}")
    print(f"\nSkipped ({len(skipped)}):")
    for m in skipped:
        print(f"  - {m}")

    # Structural assertion: at minimum the 4 metrics we care about are handled
    for expected in ("active_energy", "heart_rate_variability", "resting_heart_rate", "step_count"):
        assert expected in handled
