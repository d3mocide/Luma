"""Shared scoring for the Today streak flame and the streak-history breakdown.

The headline streak in ``/today`` and the per-day list in ``/today/streak-history``
MUST grade a day identically, otherwise the big number contradicts the breakdown
(the original bug: the headline counted any day a meal was logged while the list
counted days that hit the targets). Both now call :func:`score_day`. The frontend
mirrors this exact logic in ``src/lib/streak.ts`` — keep the two in sync.

Calorie scoring is intentionally asymmetric. A day still counts when intake runs
UNDER target (the whole point of a deficit) down to 15% below, but only 10% above,
because overshooting calories is what breaks a cut — landing under it does not.
Saturated fat and sugar are ceilings (at or below target); soluble fiber is a floor
(at or above target). A target the user has not set is excluded from the tally
entirely rather than scored as a miss, so an unconfigured metric can never sink a
streak.
"""
from __future__ import annotations

CAL_UNDER_TOL = 0.85   # intake down to 15% under target is still on-plan
CAL_OVER_TOL = 1.10    # only 10% over target is tolerated
ON_TRACK_MIN = 3       # hit at least this many targets — or all of them, if fewer are set


def score_day(
    totals: dict[str, float],
    targets: dict[str, float | None],
) -> dict[str, object]:
    """Grade one day's nutrient totals against the configured targets.

    ``totals`` and ``targets`` are keyed by ``"cal"``, ``"sat"``, ``"fib"``,
    ``"sug"``. Only targets that are set (non-``None``) count toward the
    denominator. Returns per-metric ``*_met`` flags plus ``targets_met`` (numerator),
    ``targets_possible`` (denominator) and the ``on_track`` verdict.
    """
    checks: dict[str, bool] = {}

    cal_t = targets.get("cal")
    if cal_t is not None:
        checks["cal"] = cal_t * CAL_UNDER_TOL <= totals.get("cal", 0.0) <= cal_t * CAL_OVER_TOL

    sat_t = targets.get("sat")
    if sat_t is not None:
        checks["sat"] = totals.get("sat", 0.0) <= sat_t

    fib_t = targets.get("fib")
    if fib_t is not None:
        checks["fib"] = totals.get("fib", 0.0) >= fib_t

    sug_t = targets.get("sug")
    if sug_t is not None:
        checks["sug"] = totals.get("sug", 0.0) <= sug_t

    configured = len(checks)
    met = sum(checks.values())
    on_track = configured > 0 and met >= min(ON_TRACK_MIN, configured)

    return {
        "cal_met": checks.get("cal", False),
        "sat_met": checks.get("sat", False),
        "fib_met": checks.get("fib", False),
        "sug_met": checks.get("sug", False),
        "targets_met": met,
        "targets_possible": configured,
        "on_track": on_track,
    }
