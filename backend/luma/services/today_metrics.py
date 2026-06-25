"""Assembly helpers for the /today dashboard payload.

These pull the heavier, self-contained pieces of the `get_today` handler out
of the route so the handler reads as an orchestrator. Every DB call here is
sequential on the passed-in session — never fan these out with asyncio.gather,
since an AsyncSession is not concurrency-safe (see CLAUDE.md / PR #193).
"""
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from luma.services.streak import score_day

# Cumulative activity metrics must be summed for today rather than latest-wins,
# because HAE sends many small interval readings throughout the day (e.g. 1 step
# per recent sample) and the newest row is never the day's running total.
_CUMULATIVE = (
    "steps", "active_kcal", "exercise_min",
    "stand_min", "stand_hours", "flights_climbed", "distance_mi",
)


async def compute_daily_totals(
    db: AsyncSession,
    user_id: str,
    today_events: list[Any],
    today_start: datetime,
    today_end: datetime,
) -> tuple[dict[str, float], dict[str, float]]:
    """Sum today's logged nutrition plus active-supplement contributions.

    Returns (logged_totals, supplement_nutrients) where logged_totals carries
    cal/sat/sol/sodium/protein keys.
    """
    logged = {"cal": 0.0, "sat": 0.0, "sol": 0.0, "sodium": 0.0, "protein": 0.0}
    for e in today_events:
        nutr = e.nutrition or {}
        logged["cal"] += float(nutr.get("calories") or 0.0)
        logged["sat"] += float(nutr.get("saturated_fat_g") or 0.0)
        logged["sol"] += float(nutr.get("soluble_fiber_g") or 0.0)
        # Sodium is the budgeted ceiling on the ring/budget/streak — the most
        # actionable heart-health lever, and one that (unlike added sugar) almost
        # always has a meaningful daily budget to manage.
        logged["sodium"] += float(nutr.get("sodium_mg") or 0.0)
        logged["protein"] += float(nutr.get("protein_g") or 0.0)

    # Add supplement nutrient contributions to daily totals — only for active
    # supplements the user actually logged as taken today. Without this gate,
    # supplements would inflate totals every day regardless of intake.
    from luma.db.models import Supplement, SupplementLog

    supp_rows = await db.execute(
        select(Supplement)
        .join(SupplementLog, SupplementLog.supplement_id == Supplement.id)
        .where(
            Supplement.user_id == user_id,
            Supplement.is_active.is_(True),
            SupplementLog.ts >= today_start,
            SupplementLog.ts < today_end,
        )
        .distinct()
    )
    active_supps = supp_rows.scalars().all()
    supplement_nutrients: dict[str, float] = {}
    for s in active_supps:
        for key, val in (s.nutrients_per_dose or {}).items():
            supplement_nutrients[key] = supplement_nutrients.get(key, 0.0) + float(val or 0.0)

    logged["cal"] += supplement_nutrients.get("calories", 0.0)
    logged["sat"] += supplement_nutrients.get("saturated_fat_g", 0.0)
    logged["sol"] += supplement_nutrients.get("soluble_fiber_g", 0.0)
    logged["sodium"] += supplement_nutrients.get("sodium_mg", 0.0)
    logged["protein"] += supplement_nutrients.get("protein_g", 0.0)

    return logged, supplement_nutrients


def build_recent_meals(today_events: list[Any], limit: int = 6) -> list[dict[str, Any]]:
    """Shape the most recent meal events into the dashboard's recent-meals cards."""
    recent_meals = []
    for event in today_events[:limit]:
        items = event.items if isinstance(event.items, list) else []
        first_item = items[0].get("name") if items and isinstance(items[0], dict) else None
        nutrition = event.nutrition if isinstance(event.nutrition, dict) else {}
        raw = event.raw_input or ""
        if event.source in ("favorite", "favorites") and raw:
            headline = raw
        elif event.source == "plan" and raw.startswith("Planned: "):
            headline = raw[len("Planned: "):]
        else:
            headline = first_item or "Logged meal"
        recent_meals.append(
            {
                "id": str(event.id),
                "ts": event.ts.isoformat(),
                "slot": event.slot,
                "source": event.source,
                "item_count": len(items),
                "calories": float(nutrition.get("calories") or 0.0),
                "headline": headline,
                "nutrition": nutrition,
                "items": items,
                "raw_input": event.raw_input,
            }
        )
    return recent_meals


async def fetch_biometrics_latest(
    db: AsyncSession,
    user_id: str,
    today_start: datetime,
    today_end: datetime,
) -> dict[str, float]:
    """Latest point-in-time biometrics plus today's summed cumulative activity."""
    biometric_rows = await db.execute(
        text("""
            SELECT DISTINCT ON (metric)
                metric, value, ts
            FROM biometrics
            WHERE user_id = :user_id
              AND metric != ALL(:cumulative)
            ORDER BY metric, ts DESC
        """),
        {"user_id": user_id, "cumulative": list(_CUMULATIVE)},
    )
    latest: dict[str, float] = {}
    for row in biometric_rows:
        latest[row.metric] = row.value

    cumulative_rows = await db.execute(
        text("""
            SELECT metric, SUM(value) AS value
            FROM biometrics
            WHERE user_id = :user_id
              AND metric = ANY(:cumulative)
              AND ts >= :today_start
              AND ts < :today_end
            GROUP BY metric
        """),
        {
            "user_id": user_id,
            "cumulative": list(_CUMULATIVE),
            "today_start": today_start,
            "today_end": today_end,
        },
    )
    for row in cumulative_rows:
        latest[row.metric] = row.value

    return latest


async def compute_streak(
    db: AsyncSession,
    user_id: str,
    today_dt: date,
    resolved_tz: ZoneInfo,
    streak_targets: dict[str, float | None],
    today_end: datetime,
) -> int:
    """Count consecutive on-track days ending at (or just before) today.

    Each day is graded through score_day() so this headline number and
    /today/streak-history can never disagree.
    """
    tz_key = resolved_tz.key if hasattr(resolved_tz, "key") else str(resolved_tz)
    streak_start_utc = datetime.combine(
        today_dt - timedelta(days=365), time.min, tzinfo=resolved_tz
    ).astimezone(UTC)

    # Credit supplements to the day they were actually logged, bucketed in the
    # configured timezone — mirrors /today/streak-history. Adding today's
    # supplements to every historical day (the old bug) flipped earlier days
    # off-track, so the headline streak read 0 while the breakdown showed
    # on-track days.
    from luma.db.models import Supplement, SupplementLog

    streak_supp_rows = await db.execute(
        select(SupplementLog.ts, Supplement.nutrients_per_dose)
        .join(Supplement, SupplementLog.supplement_id == Supplement.id)
        .where(
            Supplement.user_id == user_id,
            Supplement.is_active.is_(True),
            SupplementLog.ts >= streak_start_utc,
            SupplementLog.ts < today_end,
        )
    )
    streak_supp_by_day: dict[date, dict[str, float]] = {}
    for log_ts, nutrients in streak_supp_rows:
        day = log_ts.astimezone(resolved_tz).date()
        bucket = streak_supp_by_day.setdefault(day, {"cal": 0.0, "sat": 0.0, "fib": 0.0, "sod": 0.0})
        for key, val in (nutrients or {}).items():
            v = float(val or 0.0)
            if key == "calories":
                bucket["cal"] += v
            elif key == "saturated_fat_g":
                bucket["sat"] += v
            elif key == "soluble_fiber_g":
                bucket["fib"] += v
            elif key == "sodium_mg":
                bucket["sod"] += v

    streak_rows = await db.execute(
        text("""
            SELECT
                DATE(ts AT TIME ZONE :tz) AS day,
                COALESCE(SUM(CAST(NULLIF(nutrition->>'calories', '') AS numeric)), 0)         AS cal,
                COALESCE(SUM(CAST(NULLIF(nutrition->>'saturated_fat_g', '') AS numeric)), 0)  AS sat,
                COALESCE(SUM(CAST(NULLIF(nutrition->>'soluble_fiber_g', '') AS numeric)), 0)  AS sol,
                COALESCE(SUM(CAST(NULLIF(nutrition->>'sodium_mg', '') AS numeric)), 0)        AS sod
            FROM meal_events
            WHERE user_id = :user_id
              AND ts >= :start_utc
              AND ts < :today_end
              AND nutrition IS NOT NULL
            GROUP BY day
        """),
        {"user_id": user_id, "tz": tz_key, "start_utc": streak_start_utc, "today_end": today_end},
    )
    on_track_days: set[date] = set()
    for row in streak_rows:
        supp = streak_supp_by_day.get(row.day, {"cal": 0.0, "sat": 0.0, "fib": 0.0, "sod": 0.0})
        totals = {
            "cal": float(row.cal) + supp["cal"],
            "sat": float(row.sat) + supp["sat"],
            "fib": float(row.sol) + supp["fib"],
            "sod": float(row.sod) + supp["sod"],
        }
        if score_day(totals, streak_targets)["on_track"]:
            on_track_days.add(row.day)

    # Days where the user logged only supplements (no meals) still count toward
    # the streak, consistent with the per-day breakdown.
    for day, supp in streak_supp_by_day.items():
        if day in on_track_days:
            continue
        if score_day(
            {"cal": supp["cal"], "sat": supp["sat"], "fib": supp["fib"], "sod": supp["sod"]},
            streak_targets,
        )["on_track"]:
            on_track_days.add(day)

    # Start from today; if today is not on-track yet (day still in progress) fall
    # back to yesterday so an unfinished day doesn't read as a broken streak.
    _start = today_dt if today_dt in on_track_days else today_dt - timedelta(days=1)
    streak_days = 0
    _check = _start
    while _check in on_track_days:
        streak_days += 1
        _check -= timedelta(days=1)

    return streak_days
