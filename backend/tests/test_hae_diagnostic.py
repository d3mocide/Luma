"""Tests for HAE diagnostic helper functions and the analyze endpoint logic."""

import pytest

from luma.api.hae_diagnostic import (
    _to_snake,
    _misalignment_match,
    _fuzzy_suggestions,
)


# ── name normalisation ────────────────────────────────────────────────────────

def test_to_snake_camel():
    assert _to_snake("stepCount") == "step_count"
    assert _to_snake("heartRateVariability") == "heart_rate_variability"


def test_to_snake_pascal():
    assert _to_snake("StepCount") == "step_count"
    assert _to_snake("BodyMassIndex") == "body_mass_index"


def test_to_snake_spaced():
    assert _to_snake("step count") == "step_count"
    assert _to_snake("heart rate") == "heart_rate"


def test_to_snake_hyphen():
    assert _to_snake("step-count") == "step_count"


def test_to_snake_already_snake():
    assert _to_snake("step_count") == "step_count"
    assert _to_snake("heart_rate_variability") == "heart_rate_variability"


# ── misalignment detection ───────────────────────────────────────────────────

def test_misalignment_camel_matches_known():
    # "stepCount" normalises to "step_count" which is a known HAE name
    result = _misalignment_match("stepCount")
    assert result == "step_count"


def test_misalignment_pascal_matches_known():
    result = _misalignment_match("HeartRate")
    assert result == "heart_rate"


def test_misalignment_exact_known_returns_self():
    result = _misalignment_match("step_count")
    assert result == "step_count"


def test_misalignment_unknown_returns_none():
    result = _misalignment_match("completely_unknown_xyz_metric")
    assert result is None


# ── fuzzy suggestions ────────────────────────────────────────────────────────

def test_fuzzy_suggestions_near_match():
    suggestions = _fuzzy_suggestions("step_counts")  # extra 's'
    assert "step_count" in suggestions


def test_fuzzy_suggestions_no_match():
    suggestions = _fuzzy_suggestions("zzz_totally_unrelated")
    assert suggestions == []


# ── payload analysis (unit-level, no DB) ─────────────────────────────────────

@pytest.mark.asyncio
async def test_analyze_mapped_metric():
    """A known standard metric resolves to mapped status with no fields_not_extracted."""
    from unittest.mock import MagicMock
    from luma.api.hae_diagnostic import hae_diagnostic_analyze, AnalyzeRequest

    payload = {
        "data": {
            "metrics": [
                {
                    "name": "step_count",
                    "units": "count",
                    "data": [{"date": "2026-05-19 00:00:00 -0700", "qty": 7369, "source": "Watch"}],
                }
            ]
        }
    }
    fake_user = MagicMock()
    result = await hae_diagnostic_analyze(AnalyzeRequest(payload=payload), fake_user)

    assert result["metrics_mapped"] == 1
    assert result["metrics_unmapped"] == 0
    entry = result["analysis"][0]
    assert entry["status"] == "mapped"
    assert entry["internal_names"] == ["steps"]
    assert entry["fields_not_extracted"] == []


@pytest.mark.asyncio
async def test_analyze_heart_rate_surfaces_unused_fields():
    """heart_rate is aggregate; Min and Max are present but not extracted."""
    from unittest.mock import MagicMock
    from luma.api.hae_diagnostic import hae_diagnostic_analyze, AnalyzeRequest

    payload = {
        "data": {
            "metrics": [
                {
                    "name": "heart_rate",
                    "units": "count/min",
                    "data": [
                        {"date": "2026-05-19 00:00:00 -0700", "Min": 52, "Avg": 74.0, "Max": 116, "source": "Watch"}
                    ],
                }
            ]
        }
    }
    fake_user = MagicMock()
    result = await hae_diagnostic_analyze(AnalyzeRequest(payload=payload), fake_user)

    entry = result["analysis"][0]
    assert entry["status"] == "mapped"
    assert entry["field_extracted"] == "Avg"
    assert "Min" in entry["fields_not_extracted"]
    assert "Max" in entry["fields_not_extracted"]
    assert result["metrics_with_unextracted_fields"] == 1


@pytest.mark.asyncio
async def test_analyze_sleep_v4_surfaces_stages():
    """sleep_analysis v4 surfaces Core/Deep/Rem/Awake as not-extracted."""
    from unittest.mock import MagicMock
    from luma.api.hae_diagnostic import hae_diagnostic_analyze, AnalyzeRequest

    payload = {
        "data": {
            "metrics": [
                {
                    "name": "sleep_analysis",
                    "units": "hr",
                    "data": [
                        {
                            "date": "2026-05-19 00:00:00 -0700",
                            "source": "Watch",
                            "InBed": 7.5,
                            "Asleep": 6.8,
                            "Core": 2.1,
                            "Deep": 1.3,
                            "Rem": 1.8,
                            "Awake": 0.5,
                        }
                    ],
                }
            ]
        }
    }
    fake_user = MagicMock()
    result = await hae_diagnostic_analyze(AnalyzeRequest(payload=payload), fake_user)

    entry = result["analysis"][0]
    assert entry["status"] == "sleep_v4_partial"
    assert "Core" in entry["fields_not_extracted"]
    assert "Deep" in entry["fields_not_extracted"]
    assert "Rem" in entry["fields_not_extracted"]
    assert "Awake" in entry["fields_not_extracted"]


@pytest.mark.asyncio
async def test_analyze_unmapped_with_misalignment():
    """A camelCase variant of a known name is flagged as a likely misalignment."""
    from unittest.mock import MagicMock
    from luma.api.hae_diagnostic import hae_diagnostic_analyze, AnalyzeRequest

    payload = {
        "data": {
            "metrics": [
                {
                    "name": "stepCount",  # camelCase mismatch
                    "units": "count",
                    "data": [{"date": "2026-05-19 00:00:00 -0700", "qty": 5000, "source": "Watch"}],
                }
            ]
        }
    }
    fake_user = MagicMock()
    result = await hae_diagnostic_analyze(AnalyzeRequest(payload=payload), fake_user)

    entry = result["analysis"][0]
    assert entry["status"] == "unmapped"
    assert entry.get("likely_misalignment") == "step_count"


@pytest.mark.asyncio
async def test_analyze_empty_payload():
    from unittest.mock import MagicMock
    from luma.api.hae_diagnostic import hae_diagnostic_analyze, AnalyzeRequest

    fake_user = MagicMock()
    result = await hae_diagnostic_analyze(AnalyzeRequest(payload={}), fake_user)

    assert result["metrics_in_payload"] == 0
    assert result["metrics_mapped"] == 0
    assert result["metrics_unmapped"] == 0
    assert result["analysis"] == []
