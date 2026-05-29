"""Normalize Health Auto Export webhook payloads into biometrics rows."""
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Standard metrics: data points have a single `qty` field.
HAE_METRIC_MAP: dict[str, str] = {
    # Body composition
    "weight_body_mass":             "weight_kg",
    "body_mass_index":              "bmi",
    "body_fat_percentage":          "body_fat_pct",
    # Cardiovascular
    "heart_rate_variability":       "hrv_ms",
    "resting_heart_rate":           "rhr_bpm",
    "walking_heart_rate_average":   "walking_hr_bpm",
    "respiratory_rate":             "respiratory_rate_bpm",
    # Energy
    "active_energy":                "active_kcal",
    "basal_energy_burned":          "bmr_kcal",
    "physical_effort":              "physical_effort_kcal_hr_kg",
    # Activity
    "step_count":                   "steps",
    "flights_climbed":              "flights_climbed",
    "apple_exercise_time":          "exercise_min",
    "apple_stand_time":             "stand_min",
    "apple_stand_hour":             "stand_hours",
    "walking_running_distance":     "distance_mi",
    "time_in_daylight":             "daylight_min",
    # Gait
    "walking_speed":                "walking_speed_mph",
    "walking_step_length":          "step_length_in",
    "walking_asymmetry_percentage": "walking_asymmetry_pct",
    "walking_double_support_percentage": "double_support_pct",
    "stair_speed_up":               "stair_speed_up_fps",
    "stair_speed_down":             "stair_speed_down_fps",
    # Environment / sleep
    "environmental_audio_exposure": "audio_exposure_db",
    "apple_sleeping_wrist_temperature": "wrist_temp_f",
    "breathing_disturbances":       "breathing_disturbances",
    # sleep_analysis handled separately via SLEEP_MAP (sub-type in name)
}

# Aggregate metrics: data points have Min/Avg/Max instead of qty.
# Value: (internal_metric_name, field_to_read)
HAE_AGGREGATE_MAP: dict[str, tuple[str, str]] = {
    "heart_rate": ("heart_rate_avg_bpm", "Avg"),
}

SLEEP_MAP: dict[str, str] = {
    "inBed":  "sleep_duration_min",
    "asleep": "sleep_asleep_min",
}


def _convert(value: float, hae_unit: str, internal_metric: str) -> float:
    if internal_metric in ("sleep_duration_min", "sleep_asleep_min") and hae_unit in ("hr", "hours"):
        return value * 60
    return value


def _parse_hae_ts(date_str: str) -> datetime:
    """Parse HAE date strings like '2026-05-22 07:14:00 -0700'."""
    # fromisoformat doesn't handle the ' -0700' offset format; use dateutil.
    from dateutil import parser as dtparser
    return dtparser.parse(date_str).astimezone(timezone.utc)


def _compute_sleep_scores(rows: list[dict], user_id: str) -> list[dict]:
    """Derive a sleep_score row for each timestamp that has sleep_duration_min.

    Score (0–100):
      Duration component  (0–60): scales linearly to 480 min (8 h), capped at 60.
      Efficiency component (0–40): asleep/inBed ratio × 40. Falls back to 20
                                   (neutral) when only inBed data is present.
    """
    sleep_by_ts: dict[datetime, dict[str, dict]] = {}
    for row in rows:
        if row["metric"] in ("sleep_duration_min", "sleep_asleep_min"):
            sleep_by_ts.setdefault(row["ts"], {})[row["metric"]] = row

    score_rows: list[dict] = []
    for ts, sleep_rows in sleep_by_ts.items():
        duration_row = sleep_rows.get("sleep_duration_min")
        if not duration_row:
            continue
        duration = duration_row["value"]
        asleep_row = sleep_rows.get("sleep_asleep_min")
        asleep = asleep_row["value"] if asleep_row else None

        duration_score = min(60.0, (duration / 480.0) * 60.0)
        if asleep is not None and duration > 0:
            efficiency_score = min(40.0, (asleep / duration) * 40.0)
        else:
            efficiency_score = 20.0  # neutral when efficiency is unknown

        score_rows.append({
            "user_id": user_id,
            "ts": ts,
            "metric": "sleep_score",
            "value": round(duration_score + efficiency_score, 1),
            "source": "hae",
            "source_meta": {
                "hae_source": duration_row["source_meta"]["hae_source"],
                "hae_metric": "computed",
            },
        })
    return score_rows


async def normalize_hae_payload(payload: dict[str, Any], db: AsyncSession, user_id: Any) -> int:
    """Ingest an HAE webhook payload for the given user. Returns number of rows inserted."""
    from sqlalchemy import text

    metrics_list: list[dict] = payload.get("data", {}).get("metrics", [])
    rows: list[dict] = []

    for metric_block in metrics_list:
        hae_name: str = metric_block.get("name", "")
        hae_unit: str = metric_block.get("units", "")
        data_points: list[dict] = metric_block.get("data", [])

        # Resolve internal metric name and which field to read from each point.
        qty_field = "qty"
        if hae_name.startswith("sleep_analysis"):
            if "." in hae_name:
                sub = hae_name.split(".")[-1]
                internal = SLEEP_MAP.get(sub)
            elif data_points and "InBed" in data_points[0]:
                # HAE v4 aggregated format: one record per night with InBed/Asleep/Core/Deep/Rem/Awake
                for point in data_points:
                    try:
                        ts = _parse_hae_ts(point["date"])
                        source = point.get("source", "hae")
                    except (KeyError, ValueError, TypeError) as exc:
                        logger.warning("Malformed HAE sleep point %s: %s", point, exc)
                        continue
                    for hae_field, iname in (("InBed", "sleep_duration_min"), ("Asleep", "sleep_asleep_min")):
                        raw = point.get(hae_field)
                        if raw is None:
                            continue
                        try:
                            rows.append({
                                "user_id": str(user_id),
                                "ts": ts,
                                "metric": iname,
                                "value": _convert(float(raw), hae_unit, iname),
                                "source": "hae",
                                "source_meta": {"hae_source": source, "hae_metric": hae_name},
                            })
                        except (ValueError, TypeError) as exc:
                            logger.warning("Bad HAE sleep field %s=%s: %s", hae_field, raw, exc)
                continue  # aggregated sleep handled; move to next metric_block
            else:
                # Legacy/simple qty format — treat as inBed duration
                internal = "sleep_duration_min"
        elif hae_name in HAE_AGGREGATE_MAP:
            internal, qty_field = HAE_AGGREGATE_MAP[hae_name]
        else:
            internal = HAE_METRIC_MAP.get(hae_name)

        if not internal:
            logger.debug("Unknown HAE metric %s — skipping", hae_name)
            continue

        for point in data_points:
            try:
                ts = _parse_hae_ts(point["date"])
                value = _convert(float(point[qty_field]), hae_unit, internal)
                source = point.get("source", "hae")
            except (KeyError, ValueError, TypeError) as exc:
                logger.warning("Malformed HAE data point %s: %s", point, exc)
                continue

            rows.append({
                "user_id": str(user_id),
                "ts": ts,
                "metric": internal,
                "value": value,
                "source": "hae",
                "source_meta": {"hae_source": source, "hae_metric": hae_name},
            })

    # Derive sleep_score from any sleep metrics in this payload.
    rows.extend(_compute_sleep_scores(rows, str(user_id)))

    if not rows:
        return 0

    # Upsert — idempotent on (user_id, ts, metric, source).
    # NB: bind param is wrapped in CAST(...) so SQLAlchemy's text() regex doesn't
    # see `:rows::jsonb` (negative-lookahead on `::` would clip the param name).
    await db.execute(
        text("""
            INSERT INTO biometrics (user_id, ts, metric, value, source, source_meta)
            SELECT
                (r->>'user_id')::uuid,
                (r->>'ts')::timestamptz,
                r->>'metric',
                (r->>'value')::double precision,
                r->>'source',
                (r->>'source_meta')::jsonb
            FROM jsonb_array_elements(CAST(:rows AS jsonb)) AS r
            ON CONFLICT (user_id, ts, metric, source) DO NOTHING
        """),
        {"rows": __import__("orjson").dumps(rows).decode()},
    )
    await db.commit()
    logger.info("HAE ingest: inserted up to %d rows for user %s", len(rows), user_id)
    return len(rows)
