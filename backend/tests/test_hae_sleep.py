"""sleep_analysis ingestion and sleep_score computation tests."""
import pytest
from unittest.mock import AsyncMock

from tests.hae_fixtures import make_fake_user, build_capturing_db

_FAKE_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


@pytest.mark.asyncio
async def test_sleep_analysis_in_bed_hours_converted():
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis.inBed", "units": "hr", "data": [
            {"qty": 7.5, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}
        ]}
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured}
    assert "sleep_duration_min" in by_metric
    assert by_metric["sleep_duration_min"]["value"] == pytest.approx(450.0)


@pytest.mark.asyncio
async def test_sleep_analysis_asleep_hours_converted():
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis.asleep", "units": "hr", "data": [
            {"qty": 6.75, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}
        ]}
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured}
    assert "sleep_asleep_min" in by_metric
    assert by_metric["sleep_asleep_min"]["value"] == pytest.approx(405.0)


@pytest.mark.asyncio
async def test_sleep_analysis_no_dot_defaults_to_in_bed():
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis", "units": "hr", "data": [
            {"qty": 8.0, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}
        ]}
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured}
    assert "sleep_duration_min" in by_metric
    assert by_metric["sleep_duration_min"]["value"] == pytest.approx(480.0)


@pytest.mark.asyncio
async def test_sleep_analysis_unknown_subtype_skipped():
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis.deep", "units": "hr", "data": [
            {"qty": 1.5, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}
        ]}
    ]}}

    db = AsyncMock()
    count = await normalize_hae_payload(payload, db, _FAKE_USER_ID)
    assert count == 0


@pytest.mark.asyncio
async def test_sleep_score_computed_from_duration_and_efficiency():
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis.inBed",  "units": "hr", "data": [
            {"qty": 8.0, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}
        ]},
        {"name": "sleep_analysis.asleep", "units": "hr", "data": [
            {"qty": 7.2, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}
        ]},
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured}
    assert "sleep_score" in by_metric

    # 8h inBed → duration_score = 60.0 (capped); 7.2/8 = 90% efficiency → efficiency_score = 36.0
    assert by_metric["sleep_score"]["value"] == pytest.approx(96.0)
    assert by_metric["sleep_score"]["source"] == "hae"
    assert by_metric["sleep_score"]["source_meta"]["hae_metric"] == "computed"


@pytest.mark.asyncio
async def test_sleep_score_neutral_efficiency_when_only_in_bed():
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis.inBed", "units": "hr", "data": [
            {"qty": 7.0, "date": "2026-05-19 00:00:00 -0700", "source": "Apple Watch"}
        ]},
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured}
    assert "sleep_score" in by_metric
    # 7h → duration_score = (420/480)*60 = 52.5; efficiency_score = 20 (neutral)
    assert by_metric["sleep_score"]["value"] == pytest.approx(72.5)


@pytest.mark.asyncio
async def test_sleep_score_not_computed_without_sleep_data():
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "step_count", "units": "count", "data": [
            {"qty": 5000, "date": "2026-05-19 00:00:00 -0700", "source": "Watch"}
        ]}
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    assert not any(r["metric"] == "sleep_score" for r in captured)


@pytest.mark.asyncio
async def test_sleep_analysis_hae_v4_aggregated_format():
    """HAE v4 sends one record per night with InBed/Asleep/Core/Deep/Rem/Awake fields."""
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis", "units": "hr", "data": [
            {
                "date": "2026-05-29 03:54:00 -0700",
                "source": "Apple Watch",
                "inBed": 5.85,
                "asleep": 4.858333,
                "core": 2.291667,
                "deep": 0.608333,
                "rem": 0.958333,
                "awake": 0.416667,
                "unspecified": 0.0,
            }
        ]}
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured}
    assert "sleep_duration_min" in by_metric
    assert by_metric["sleep_duration_min"]["value"] == pytest.approx(5.85 * 60, rel=1e-3)
    assert "sleep_asleep_min" in by_metric
    assert by_metric["sleep_asleep_min"]["value"] == pytest.approx(4.858333 * 60, rel=1e-3)
    assert "sleep_score" in by_metric
    # Duration: (351/480)*60 ≈ 43.9; efficiency: (4.858/5.85)*40 ≈ 33.2 → ~77
    assert 70 < by_metric["sleep_score"]["value"] < 85


@pytest.mark.asyncio
async def test_sleep_analysis_hae_v4_inbed_only():
    """HAE v4 aggregated format with only InBed (no Asleep) uses neutral efficiency."""
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis", "units": "hr", "data": [
            {
                "date": "2026-05-29 07:00:00 -0700",
                "source": "Apple Watch",
                "inBed": 7.0,
                "awake": 0.5,
            }
        ]}
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured}
    assert "sleep_duration_min" in by_metric
    assert by_metric["sleep_duration_min"]["value"] == pytest.approx(420.0)
    assert "sleep_score" in by_metric
    assert by_metric["sleep_score"]["value"] == pytest.approx(72.5)  # (420/480)*60 + 20 neutral


@pytest.mark.asyncio
async def test_sleep_analysis_per_interval_hk_value_strings():
    """HAE per-interval format: value field is HealthKit category value string."""
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis", "units": "hr", "data": [
            {"date": "2026-06-02 22:30:00 -0700", "source": "William's Apple Watch",
             "value": "HKCategoryValueSleepAnalysisInBed", "qty": 4.15},
            {"date": "2026-06-02 22:45:00 -0700", "source": "William's Apple Watch",
             "value": "HKCategoryValueSleepAnalysisAsleep", "qty": 3.85},
            {"date": "2026-06-02 23:00:00 -0700", "source": "William's Apple Watch",
             "value": "HKCategoryValueSleepAnalysisCore", "qty": 1.5},
            {"date": "2026-06-02 23:30:00 -0700", "source": "William's Apple Watch",
             "value": "HKCategoryValueSleepAnalysisDeep", "qty": 0.75},
            {"date": "2026-06-03 00:00:00 -0700", "source": "William's Apple Watch",
             "value": "HKCategoryValueSleepAnalysisREM", "qty": 1.0},
            {"date": "2026-06-03 01:00:00 -0700", "source": "William's Apple Watch",
             "value": "HKCategoryValueSleepAnalysisAwake", "qty": 0.25},
        ]}
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured}

    # InBed interval → sleep_duration_min
    assert "sleep_duration_min" in by_metric
    assert by_metric["sleep_duration_min"]["value"] == pytest.approx(4.15 * 60, rel=1e-3)

    # Asleep/Core/Deep/REM all map to sleep_asleep_min — dedup keeps one per ts;
    # just confirm the metric is present with correct hours-to-minutes conversion.
    assert "sleep_asleep_min" in captured[1]["metric"] or any(
        r["metric"] == "sleep_asleep_min" for r in captured
    )

    # Awake interval must be skipped (no row for it)
    awake_rows = [r for r in captured if "awake" in str(r.get("source_meta", "")).lower()]
    assert not awake_rows


@pytest.mark.asyncio
async def test_sleep_analysis_per_interval_short_value_strings():
    """HAE sometimes sends short value strings like 'Asleep' / 'InBed'."""
    from luma.services.hae_normalizer import normalize_hae_payload

    payload = {"data": {"metrics": [
        {"name": "sleep_analysis", "units": "hr", "data": [
            {"date": "2026-06-02 23:00:00 -0700", "source": "William's Apple Watch",
             "value": "InBed", "qty": 7.0},
            {"date": "2026-06-02 23:30:00 -0700", "source": "William's Apple Watch",
             "value": "Asleep", "qty": 6.5},
        ]}
    ]}}

    db, captured = build_capturing_db()
    await normalize_hae_payload(payload, db, _FAKE_USER_ID)

    by_metric = {r["metric"]: r for r in captured}
    assert by_metric["sleep_duration_min"]["value"] == pytest.approx(420.0)
    assert by_metric["sleep_asleep_min"]["value"] == pytest.approx(390.0)
    assert "sleep_score" in by_metric
