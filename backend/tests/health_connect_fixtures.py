"""Shared sample payload for Health Connect ingest tests.

Mirrors the mcnaveen/health-connect-webhook envelope: a flat object with a
`timestamp` / `app_version` plus one snake_case array per data type.
"""
from datetime import UTC, datetime

SAMPLE_HC_PAYLOAD = {
    "timestamp": "2026-05-20T08:00:00Z",
    "app_version": "1.4.0",
    "steps": [
        {"count": 8421, "start_time": "2026-05-19T00:00:00Z", "end_time": "2026-05-19T23:59:59Z"}
    ],
    "distance": [
        {"meters": 5000, "start_time": "2026-05-19T00:00:00Z", "end_time": "2026-05-19T23:59:59Z"}
    ],
    "active_calories": [
        {"calories": 515, "start_time": "2026-05-19T00:00:00Z", "end_time": "2026-05-19T23:59:59Z"}
    ],
    "weight": [
        {"kilograms": 80.5, "time": "2026-05-19T07:00:00Z"}
    ],
    "height": [
        {"meters": 1.8, "time": "2026-05-19T07:00:00Z"}
    ],
    "resting_heart_rate": [
        {"bpm": 58, "time": "2026-05-19T07:00:00Z"}
    ],
    "oxygen_saturation": [
        {"percentage": 97.5, "time": "2026-05-19T07:00:00Z"}
    ],
    "body_temperature": [
        {"celsius": 36.6, "time": "2026-05-19T07:00:00Z"}
    ],
    "respiratory_rate": [
        {"rate": 16.0, "time": "2026-05-19T07:00:00Z"}
    ],
    "body_fat": [
        {"percentage": 18.2, "time": "2026-05-19T07:00:00Z"}
    ],
    "lean_body_mass": [
        {"kilograms": 65.0, "time": "2026-05-19T07:00:00Z"}
    ],
    "blood_pressure": [
        {"systolic": 120, "diastolic": 80, "time": "2026-05-19T07:00:00Z"}
    ],
    "sleep": [
        {
            "session_end_time": "2026-05-19T06:30:00Z",
            "duration_seconds": 28800,  # 8h in bed
            "stages": [
                {"stage": "deep",  "start_time": "2026-05-18T22:30:00Z", "end_time": "2026-05-19T00:30:00Z"},   # 2h
                {"stage": "light", "start_time": "2026-05-19T00:30:00Z", "end_time": "2026-05-19T04:30:00Z"},   # 4h
                {"stage": "rem",   "start_time": "2026-05-19T04:30:00Z", "end_time": "2026-05-19T06:00:00Z"},   # 1.5h
                {"stage": "awake", "start_time": "2026-05-19T06:00:00Z", "end_time": "2026-05-19T06:30:00Z"},   # 0.5h (excluded)
            ],
        }
    ],
    # Unmapped types — must be ignored, never routed into biometrics.
    "heart_rate": [{"bpm": 72, "time": "2026-05-19T07:00:00Z"}],
    "nutrition": [{"calories": 600, "name": "lunch", "start_time": "2026-05-19T12:00:00Z", "end_time": "2026-05-19T12:30:00Z"}],
}

# "2026-05-19T23:59:59Z" — additive metrics land on end_time.
EXPECTED_ADDITIVE_TS = datetime(2026, 5, 19, 23, 59, 59, tzinfo=UTC)
# "2026-05-19T07:00:00Z" — scalar metrics land on time.
EXPECTED_SCALAR_TS = datetime(2026, 5, 19, 7, 0, 0, tzinfo=UTC)
