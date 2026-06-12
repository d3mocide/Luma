"""Normalize Health Auto Export webhook payloads into biometrics rows."""
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from luma.services.biometric_store import persist_biometric_rows

logger = logging.getLogger(__name__)

# Standard metrics: data points have a single `qty` field.
HAE_METRIC_MAP: dict[str, str] = {
    # Body composition
    "weight_body_mass":             "weight_kg",
    "weight_&_body_mass":           "weight_kg",
    "weight":                       "weight_kg",
    "body_mass":                    "weight_kg",
    "body_mass_index":              "bmi",
    "body_fat_percentage":          "body_fat_pct",
    "height":                       "height_cm",
    "body_height":                  "height_cm",
    # Cardiovascular
    "heart_rate_variability":       "hrv_ms",
    "resting_heart_rate":           "rhr_bpm",
    "walking_heart_rate":           "walking_hr_bpm",
    "respiratory_rate":             "respiratory_rate_bpm",
    "blood_oxygen_saturation":      "spo2_pct",
    "oxygen_saturation":            "spo2_pct",
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
    "walking_running_distance":     "distance_km",
    "time_in_daylight":             "daylight_min",
    "mindful_minutes":              "mindful_min",
    # Gait
    "walking_speed":                "walking_speed_kmh",
    "walking_step_length":          "step_length_cm",
    "walking_asymmetry_percentage": "walking_asymmetry_pct",
    "walking_double_support_percentage": "double_support_pct",
    "walking_heart_rate_average":   "walking_hr_bpm",
    "stair_speed_up":               "stair_speed_up_mps",
    "stair_speed_down":             "stair_speed_down_mps",
    "six_minute_walking_test_distance": "six_min_walk_m",
    # Body
    "body_temperature":             "body_temp_c",
    "lean_body_mass":               "lean_body_mass_kg",
    # Environment / sleep
    "environmental_audio_exposure": "audio_exposure_db",
    "apple_sleeping_wrist_temperature": "wrist_temp_c",
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

# All unit strings HAE is known to emit for each unit-sensitive metric,
# covering both imperial and metric export modes.  Anything outside this
# set is unexpected and logged as a warning so silent data corruption is
# caught in production logs rather than discovered later.
_KNOWN_UNITS: dict[str, frozenset[str]] = {
    "active_kcal":          frozenset({"kcal", "kJ"}),
    "bmr_kcal":             frozenset({"kcal", "kJ"}),
    "distance_km":          frozenset({"mi", "km"}),
    "walking_speed_kmh":    frozenset({"mi/hr", "km/hr", "km/h"}),
    "step_length_cm":       frozenset({"in", "cm"}),
    "wrist_temp_c":         frozenset({"degF", "degC"}),
    "stair_speed_up_mps":   frozenset({"ft/s", "m/s"}),
    "stair_speed_down_mps": frozenset({"ft/s", "m/s"}),
    # HAE exports weight in whatever unit Apple Health uses natively on the
    # device (controlled by iOS Language & Region, not the HAE metric toggle).
    # US-locale iPhones send lb even when HAE is set to metric.
    "weight_kg":            frozenset({"kg", "lb", "lbs"}),
    "height_cm":            frozenset({"cm", "m", "in", "ft"}),
    "spo2_pct":             frozenset({"%"}),
    "body_temp_c":          frozenset({"degC", "degF"}),
    "bp_systolic_mmhg":     frozenset({"mmHg"}),
    "bp_diastolic_mmhg":    frozenset({"mmHg"}),
    "lean_body_mass_kg":    frozenset({"kg", "lb", "lbs"}),
    "six_min_walk_m":       frozenset({"m", "ft"}),
    "audio_exposure_db":    frozenset({"dBASPL", "dB"}),
}


def _convert(value: float, hae_unit: str, internal_metric: str) -> float:
    if internal_metric in ("sleep_duration_min", "sleep_asleep_min") and hae_unit in ("hr", "hours"):
        return value * 60
    if internal_metric in ("active_kcal", "bmr_kcal") and hae_unit == "kJ":
        return value / 4.184
    if internal_metric in ("weight_kg", "lean_body_mass_kg") and hae_unit in ("lb", "lbs"):
        # HAE uses the device's regional unit (iOS Language & Region), not the
        # HAE metric toggle, for body mass. US-locale phones send lb.
        return value / 2.20462262
    if internal_metric == "six_min_walk_m" and hae_unit == "ft":
        return value * 0.3048
    if internal_metric == "height_cm":
        if hae_unit == "m":
            return value * 100
        if hae_unit == "ft":
            return value * 30.48
        # "in" falls through to the generic inch rule below (×2.54); "cm" passes through
    if hae_unit == "mi":
        return value * 1.60934
    if hae_unit == "mi/hr":
        return value * 1.60934
    if hae_unit == "in":
        return value * 2.54
    if hae_unit == "degF":
        return (value - 32) * 5 / 9
    if hae_unit == "ft/s":
        return value * 0.3048
    known = _KNOWN_UNITS.get(internal_metric)
    if known is not None and hae_unit not in known:
        logger.warning(
            "HAE unexpected unit %r for metric %r — stored unconverted; verify HAE export settings",
            hae_unit, internal_metric,
        )
    return value


def _parse_hae_ts(date_str: str) -> datetime:
    """Parse HAE date strings like '2026-05-22 07:14:00 -0700'."""
    # fromisoformat doesn't handle the ' -0700' offset format; use dateutil.
    from dateutil import parser as dtparser
    return dtparser.parse(date_str).astimezone(UTC)


async def normalize_hae_payload(
    payload: dict[str, Any],
    db: AsyncSession,
    user_id: Any,
    *,
    data_source: str | None = None,
) -> int:
    """Ingest an HAE webhook payload for the given user. Returns number of rows inserted."""
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
            elif data_points and "inBed" in data_points[0]:
                # HAE v2 aggregated format (Summarize Data ON): one record per night
                # with inBed/asleep/totalSleep/core/deep/rem/awake fields.
                for point in data_points:
                    try:
                        ts = _parse_hae_ts(point["date"])
                        source = point.get("source", "hae")
                    except (KeyError, ValueError, TypeError) as exc:
                        logger.warning("Malformed HAE sleep point %s: %s", point, exc)
                        continue

                    # HAE v2 sets inBed=0 and asleep=0; real data is in
                    # totalSleep/core/deep/rem/awake (all in hours).
                    # Derive: inBed time = totalSleep + awake; asleep = totalSleep.
                    raw_in_bed = point.get("inBed")
                    raw_asleep = point.get("asleep")
                    try:
                        in_bed_val = float(raw_in_bed) if raw_in_bed is not None else None
                        asleep_val = float(raw_asleep) if raw_asleep is not None else None
                    except (ValueError, TypeError):
                        in_bed_val = asleep_val = None

                    if in_bed_val == 0:
                        total = point.get("totalSleep")
                        awake = point.get("awake")
                        if total is not None:
                            try:
                                in_bed_val = float(total) + (float(awake) if awake is not None else 0.0)
                            except (ValueError, TypeError):
                                pass

                    if asleep_val == 0:
                        total = point.get("totalSleep")
                        if total is not None:
                            try:
                                asleep_val = float(total)
                            except (ValueError, TypeError):
                                pass

                    for val, iname in ((in_bed_val, "sleep_duration_min"), (asleep_val, "sleep_asleep_min")):
                        if val is None:
                            continue
                        try:
                            rows.append({
                                "user_id": str(user_id),
                                "ts": ts,
                                "metric": iname,
                                "value": _convert(val, hae_unit, iname),
                                "source": "hae",
                                "source_meta": {"hae_source": source, "hae_metric": hae_name, "hae_unit": hae_unit},
                            })
                        except (ValueError, TypeError) as exc:
                            logger.warning("Bad HAE sleep field %s=%s: %s", iname, val, exc)
                continue  # aggregated sleep handled; move to next metric_block
            elif data_points and "value" in data_points[0]:
                # HAE per-interval format: each point is one sleep stage interval; the
                # 'value' field names the stage (e.g. "HKCategoryValueSleepAnalysisAsleep"
                # or the shorter "Asleep" / "InBed" variants). Core/Deep/REM all count
                # toward actual sleep time.
                _STAGE_MAP = {
                    "inbed":  "sleep_duration_min",
                    "asleep": "sleep_asleep_min",
                    "core":   "sleep_asleep_min",
                    "deep":   "sleep_asleep_min",
                    "rem":    "sleep_asleep_min",
                }
                for point in data_points:
                    try:
                        ts = _parse_hae_ts(point["startDate"])
                        source = point.get("source", "hae")
                        # Strip spaces so "In Bed" → "inbed" matches the map key.
                        stage = str(point.get("value", "")).lower().replace(" ", "")
                        iname: str | None = next((n for k, n in _STAGE_MAP.items() if k in stage), None)  # type: ignore[no-redef]
                        if iname is None:
                            continue  # awake / unknown — skip
                        rows.append({
                            "user_id": str(user_id),
                            "ts": ts,
                            "metric": iname,
                            "value": _convert(float(point["qty"]), hae_unit, iname),
                            "source": "hae",
                            "source_meta": {"hae_source": source, "hae_metric": hae_name, "hae_unit": hae_unit},
                        })
                    except (KeyError, ValueError, TypeError) as exc:
                        logger.warning("Malformed HAE sleep point %s: %s", point, exc)
                continue  # per-interval sleep handled; move to next metric_block
            else:
                # Legacy/simple qty format — treat as inBed duration
                internal = "sleep_duration_min"
        elif hae_name == "blood_pressure":
            for point in data_points:
                try:
                    ts = _parse_hae_ts(point["date"])
                    source = point.get("source", "hae")
                except (KeyError, ValueError, TypeError) as exc:
                    logger.warning("Malformed HAE blood_pressure point %s: %s", point, exc)
                    continue
                for field, iname in (("systolic", "bp_systolic_mmhg"), ("diastolic", "bp_diastolic_mmhg")):
                    raw = point.get(field)
                    if raw is None:
                        continue
                    try:
                        rows.append({
                            "user_id": str(user_id),
                            "ts": ts,
                            "metric": iname,
                            "value": float(raw),
                            "source": "hae",
                            "source_meta": {"hae_source": source, "hae_metric": hae_name, "hae_unit": hae_unit},
                        })
                    except (ValueError, TypeError) as exc:
                        logger.warning("Bad HAE blood_pressure field %s=%s: %s", field, raw, exc)
            continue
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
                "source_meta": {"hae_source": source, "hae_metric": hae_name, "hae_unit": hae_unit},
            })

    return await persist_biometric_rows(
        rows, db, user_id, source_ecosystem="apple_health", data_source=data_source,
    )
