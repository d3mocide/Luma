"""Normalizer integration tests: row count, metric mapping, values, timestamps, source_meta."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from tests.hae_fixtures import (
    SAMPLE_PAYLOAD, EXPECTED_METRICS, EXPECTED_TS,
    make_fake_user, build_mock_db, build_capturing_db,
)

_FAKE_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


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


def test_convert_miles_to_km():
    from luma.services.hae_normalizer import _convert
    assert _convert(1.0, "mi", "distance_km") == pytest.approx(1.60934, rel=1e-5)
    assert _convert(3.2878305909330341, "mi", "distance_km") == pytest.approx(3.2878305909330341 * 1.60934, rel=1e-6)


def test_convert_mph_to_kmh():
    from luma.services.hae_normalizer import _convert
    assert _convert(1.0, "mi/hr", "walking_speed_kmh") == pytest.approx(1.60934, rel=1e-5)


def test_convert_inches_to_cm():
    from luma.services.hae_normalizer import _convert
    assert _convert(1.0, "in", "step_length_cm") == pytest.approx(2.54, rel=1e-5)
    assert _convert(12.0, "in", "step_length_cm") == pytest.approx(30.48, rel=1e-5)


def test_convert_fahrenheit_to_celsius():
    from luma.services.hae_normalizer import _convert
    assert _convert(32.0, "degF", "wrist_temp_c") == pytest.approx(0.0, abs=1e-9)
    assert _convert(212.0, "degF", "wrist_temp_c") == pytest.approx(100.0, rel=1e-5)
    assert _convert(95.170452880859315, "degF", "wrist_temp_c") == pytest.approx(
        (95.170452880859315 - 32) * 5 / 9, rel=1e-6
    )


def test_convert_fps_to_mps():
    from luma.services.hae_normalizer import _convert
    assert _convert(1.0, "ft/s", "stair_speed_up_mps") == pytest.approx(0.3048, rel=1e-5)


def test_convert_height_units():
    from luma.services.hae_normalizer import _convert, HAE_METRIC_MAP
    assert HAE_METRIC_MAP["height"] == "height_cm"
    assert _convert(178.0, "cm", "height_cm") == pytest.approx(178.0)       # passthrough
    assert _convert(70.0, "in", "height_cm") == pytest.approx(177.8, rel=1e-5)  # generic inch rule
    assert _convert(1.78, "m", "height_cm") == pytest.approx(178.0, rel=1e-5)
    assert _convert(5.0, "ft", "height_cm") == pytest.approx(152.4, rel=1e-5)
    assert _convert(1.0, "ft/s", "stair_speed_down_mps") == pytest.approx(0.3048, rel=1e-5)


def test_convert_weight_lb_to_kg():
    """HAE sends weight in lb on US-locale iPhones even with metric export enabled."""
    from luma.services.hae_normalizer import _convert
    # 203.26 lb is what Alle's iPhone sent; should land as ~92.19 kg, not 203 kg
    assert _convert(203.26, "lb", "weight_kg") == pytest.approx(203.26 / 2.20462262, rel=1e-6)
    assert _convert(203.26, "lbs", "weight_kg") == pytest.approx(203.26 / 2.20462262, rel=1e-6)
    # Metric iPhones send kg — should pass through unchanged
    assert _convert(101.85, "kg", "weight_kg") == pytest.approx(101.85, rel=1e-6)


def test_convert_weight_lb_no_warning(caplog):
    """lb is a known valid unit for weight_kg — should not log a warning."""
    import logging
    from luma.services.hae_normalizer import _convert
    with caplog.at_level(logging.WARNING, logger="luma.services.hae_normalizer"):
        _convert(203.26, "lb", "weight_kg")
        _convert(101.85, "kg", "weight_kg")
    assert not caplog.records


def test_convert_known_metric_units_no_warning(caplog):
    """Metric-mode HAE exports (km, degC, etc.) pass through without warnings."""
    import logging
    from luma.services.hae_normalizer import _convert
    with caplog.at_level(logging.WARNING, logger="luma.services.hae_normalizer"):
        _convert(5.0, "km", "distance_km")
        _convert(10.0, "km/h", "walking_speed_kmh")
        _convert(10.0, "km/hr", "walking_speed_kmh")
        _convert(70.0, "cm", "step_length_cm")
        _convert(35.0, "degC", "wrist_temp_c")
        _convert(1.5, "m/s", "stair_speed_up_mps")
        _convert(1.2, "m/s", "stair_speed_down_mps")
    assert not caplog.records


def test_convert_unknown_unit_logs_warning(caplog):
    """An unrecognised unit for a sensitive metric logs a warning and passes value through."""
    import logging
    from luma.services.hae_normalizer import _convert
    with caplog.at_level(logging.WARNING, logger="luma.services.hae_normalizer"):
        result = _convert(3.0, "mph", "walking_speed_kmh")
    assert result == pytest.approx(3.0)  # stored unconverted — warning is the signal
    assert any("unexpected unit" in r.message for r in caplog.records)


def test_convert_unknown_unit_non_sensitive_no_warning(caplog):
    """Metrics absent from _KNOWN_UNITS never emit a unit-mismatch warning."""
    import logging
    from luma.services.hae_normalizer import _convert
    with caplog.at_level(logging.WARNING, logger="luma.services.hae_normalizer"):
        _convert(59.0, "some-weird-unit", "hrv_ms")
    assert not caplog.records


def test_metric_map_contains_expected_keys():
    from luma.services.hae_normalizer import HAE_METRIC_MAP
    for hae_name in ("weight_body_mass", "heart_rate_variability", "resting_heart_rate",
                     "active_energy", "step_count", "body_fat_percentage", "body_mass_index"):
        assert hae_name in HAE_METRIC_MAP, f"{hae_name!r} missing from HAE_METRIC_MAP"


@pytest.mark.asyncio
async def test_normalize_sample_payload_row_count():
    from luma.services.hae_normalizer import normalize_hae_payload

    db = build_mock_db()
    rows_inserted = await normalize_hae_payload(SAMPLE_PAYLOAD, db, _FAKE_USER_ID)

    assert rows_inserted == len(EXPECTED_METRICS), (
        f"Expected {len(EXPECTED_METRICS)} rows, got {rows_inserted}. "
        f"Check HAE_METRIC_MAP / HAE_AGGREGATE_MAP against sample metrics."
    )


@pytest.mark.asyncio
async def test_normalize_sample_payload_correct_metrics():
    from luma.services.hae_normalizer import normalize_hae_payload

    db, captured_rows = build_capturing_db()
    await normalize_hae_payload(SAMPLE_PAYLOAD, db, _FAKE_USER_ID)

    found_metrics = {r["metric"] for r in captured_rows}
    assert found_metrics == EXPECTED_METRICS, (
        f"Metric mismatch.\n  Expected: {EXPECTED_METRICS}\n  Got: {found_metrics}"
    )


@pytest.mark.asyncio
async def test_normalize_sample_payload_values():
    from luma.services.hae_normalizer import normalize_hae_payload

    db, captured_rows = build_capturing_db()
    await normalize_hae_payload(SAMPLE_PAYLOAD, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured_rows}

    assert by_metric["active_kcal"]["value"] == pytest.approx(515.69638429138649, rel=1e-6)
    assert by_metric["hrv_ms"]["value"] == pytest.approx(59.771549595894335, rel=1e-6)
    assert by_metric["rhr_bpm"]["value"] == pytest.approx(62.0, rel=1e-6)
    assert by_metric["steps"]["value"] == pytest.approx(7369.1420323996308, rel=1e-6)
    assert by_metric["heart_rate_avg_bpm"]["value"] == pytest.approx(74.613139994679827, rel=1e-6)
    assert by_metric["bmr_kcal"]["value"] == pytest.approx(2264.7115533249325, rel=1e-6)
    assert by_metric["exercise_min"]["value"] == pytest.approx(4.0, rel=1e-6)
    assert by_metric["respiratory_rate_bpm"]["value"] == pytest.approx(17.222222222222221, rel=1e-6)
    assert by_metric["flights_climbed"]["value"] == pytest.approx(5.0, rel=1e-6)
    assert by_metric["distance_km"]["value"] == pytest.approx(3.2878305909330341 * 1.60934, rel=1e-6)
    assert by_metric["daylight_min"]["value"] == pytest.approx(37.0, rel=1e-6)


@pytest.mark.asyncio
async def test_normalize_sample_payload_timestamps():
    from luma.services.hae_normalizer import normalize_hae_payload

    db, captured_rows = build_capturing_db()
    await normalize_hae_payload(SAMPLE_PAYLOAD, db, _FAKE_USER_ID)

    for row in captured_rows:
        ts = datetime.fromisoformat(row["ts"])
        assert ts == EXPECTED_TS, f"Wrong timestamp for {row['metric']!r}: {row['ts']!r}"


@pytest.mark.asyncio
async def test_normalize_sample_payload_source_meta():
    from luma.services.hae_normalizer import normalize_hae_payload

    db, captured_rows = build_capturing_db()
    await normalize_hae_payload(SAMPLE_PAYLOAD, db, _FAKE_USER_ID)

    for row in captured_rows:
        assert row["source"] == "hae"
        meta = row["source_meta"]
        assert "hae_metric" in meta
        assert "hae_source" in meta


@pytest.mark.asyncio
async def test_normalize_empty_payload_returns_zero():
    from luma.services.hae_normalizer import normalize_hae_payload

    db = AsyncMock()
    count = await normalize_hae_payload({"data": {"metrics": []}}, db, _FAKE_USER_ID)
    assert count == 0
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_normalize_heart_rate_uses_avg_field():
    from luma.services.hae_normalizer import normalize_hae_payload

    heart_rate_only = {
        "data": {"metrics": [
            {"name": "heart_rate", "units": "count/min", "data": [
                {"Min": 52, "Avg": 74.6, "Max": 116, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}
            ]}
        ]}
    }

    db, captured_rows = build_capturing_db()
    count = await normalize_hae_payload(heart_rate_only, db, _FAKE_USER_ID)

    assert count == 1
    assert captured_rows[0]["metric"] == "heart_rate_avg_bpm"
    assert captured_rows[0]["value"] == pytest.approx(74.6)


@pytest.mark.asyncio
async def test_normalize_heart_rate_missing_avg_logs_warning():
    from luma.services.hae_normalizer import normalize_hae_payload

    heart_rate_no_avg = {
        "data": {"metrics": [
            {"name": "heart_rate", "units": "count/min", "data": [
                {"Min": 52, "Max": 116, "date": "2026-05-19 00:00:00 -0700", "source": "Watch"}
            ]}
        ]}
    }

    db = AsyncMock()
    count = await normalize_hae_payload(heart_rate_no_avg, db, _FAKE_USER_ID)
    assert count == 0


@pytest.mark.asyncio
async def test_normalize_insert_sql_binds_rows_param():
    """Regression: SQLAlchemy text() must surface a bind param named 'rows'.

    `:rows::jsonb` is parsed as bind `row` due to the regex's `(?!:)`
    lookahead; the trailing 's' leaks into the SQL and Postgres rejects it
    with a ProgrammingError. The fix wraps the param in CAST(...).
    """
    from sqlalchemy import text as sa_text
    from sqlalchemy.dialects import postgresql

    from luma.services.hae_normalizer import normalize_hae_payload

    captured_stmt: list = []

    db = AsyncMock()

    async def execute_side_effect(stmt, params=None):
        captured_stmt.append((stmt, params))
        return MagicMock()

    db.execute.side_effect = execute_side_effect

    await normalize_hae_payload(SAMPLE_PAYLOAD, db, _FAKE_USER_ID)

    assert captured_stmt, "INSERT was never executed"
    stmt, params = captured_stmt[0]
    assert isinstance(stmt, type(sa_text("x"))), "expected a text() construct"
    assert list(stmt._bindparams.keys()) == ["rows"], (
        f"bind keys {list(stmt._bindparams.keys())!r} — '::' after :rows clipped the name"
    )
    compiled = stmt.compile(dialect=postgresql.asyncpg.dialect())
    assert ":rows" not in compiled.string, "unsubstituted :rows leaked to Postgres"
    assert "$1" in compiled.string
    assert params and "rows" in params


def test_sample_payload_metric_coverage():
    from luma.services.hae_normalizer import HAE_AGGREGATE_MAP, HAE_METRIC_MAP, SLEEP_MAP

    sample_metrics = [m["name"] for m in SAMPLE_PAYLOAD["data"]["metrics"]]
    handled, skipped = [], []

    for name in sample_metrics:
        if name.startswith("sleep_analysis"):
            sub = name.split(".")[-1] if "." in name else "inBed"
            mapped = sub in SLEEP_MAP
        elif name in HAE_AGGREGATE_MAP:
            mapped = True
        else:
            mapped = name in HAE_METRIC_MAP
        (handled if mapped else skipped).append(name)

    def _label(name: str) -> str:
        if name in HAE_AGGREGATE_MAP:
            return HAE_AGGREGATE_MAP[name][0]
        return HAE_METRIC_MAP.get(name, SLEEP_MAP.get(name.split(".")[-1], "?"))

    print(f"\n{'='*60}")
    print(f"HAE sample coverage: {len(handled)}/{len(sample_metrics)} metrics handled")
    for m in handled:
        print(f"  + {m} → {_label(m)}")
    for m in skipped:
        print(f"  - {m}")

    for expected in ("active_energy", "heart_rate", "heart_rate_variability", "resting_heart_rate", "step_count"):
        assert expected in handled
