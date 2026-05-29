"""Shared constants and helpers for HAE integration tests."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import orjson

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

EXPECTED_METRICS = {
    "active_kcal", "hrv_ms", "rhr_bpm", "steps",
    "bmr_kcal", "heart_rate_avg_bpm", "exercise_min", "respiratory_rate_bpm",
    "wrist_temp_c", "breathing_disturbances",
    "flights_climbed", "stand_min", "stand_hours", "distance_km",
    "walking_hr_bpm", "daylight_min", "physical_effort_kcal_hr_kg",
    "walking_speed_kmh", "step_length_cm", "walking_asymmetry_pct",
    "double_support_pct", "stair_speed_up_mps", "stair_speed_down_mps",
    "audio_exposure_db",
}

# "2026-05-19 00:00:00 -0700" → 07:00 UTC
EXPECTED_TS = datetime(2026, 5, 19, 7, 0, 0, tzinfo=timezone.utc)


def make_fake_user():
    user = MagicMock()
    user.id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    user.role = "operator"
    return user


def build_mock_db():
    """AsyncMock db session that accepts the INSERT call."""
    db = AsyncMock()
    db.execute.return_value = AsyncMock()
    return db


def build_capturing_db():
    """AsyncMock db that captures rows from the INSERT call."""
    db = AsyncMock()
    captured = []

    async def execute_side_effect(stmt, params=None):
        if params and "rows" in params:
            captured.extend(orjson.loads(params["rows"]))
        return MagicMock()

    db.execute.side_effect = execute_side_effect
    return db, captured
