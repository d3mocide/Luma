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
                "InBed": 5.85,
                "Asleep": 4.858333,
                "Core": 2.291667,
                "Deep": 0.608333,
                "Rem": 0.958333,
                "Awake": 0.416667,
                "Unspecified": 0.0,
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
                "InBed": 7.0,
                "Awake": 0.5,
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
