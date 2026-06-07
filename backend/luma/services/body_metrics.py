"""Pure body-energy math shared by the goals API and the profile-sync worker.

Kept dependency-free (no FastAPI/DB) so background tasks can import it without
pulling in the API layer.
"""
from __future__ import annotations

# Standard Mifflin–St Jeor activity multipliers, keyed by the activity_level
# values the profile form stores.
_ACTIVITY_FACTORS: dict[str, float] = {
    "sedentary": 1.2,
    "lightly_active": 1.375,
    "moderately_active": 1.55,
    "very_active": 1.725,
}

# Reverse of _ACTIVITY_FACTORS — turns a step-derived multiplier back into the
# stored activity_level enum (for writing the profile field).
_LEVEL_FOR_FACTOR: dict[float, str] = {v: k for k, v in _ACTIVITY_FACTORS.items()}

# Minimum days of step data before we trust the measured signal over a
# self-reported activity level.
_MIN_STEP_DAYS = 3

# Ordering of the activity tiers, low → high, for comparing measured vs stated.
_LEVEL_RANK: dict[str, int] = {
    "sedentary": 0,
    "lightly_active": 1,
    "moderately_active": 2,
    "very_active": 3,
}

# Weekly Apple "exercise minutes" that mark a regular exerciser (WHO's 150
# min/week moderate-activity guideline). Above this we won't auto-downgrade
# below a higher self-reported level, since steps miss non-step workouts.
_EXERCISE_GUARD_WEEKLY_MIN = 150.0


def _steps_factor(steps_avg: float) -> float:
    """Map a 7-day average daily step count to a Mifflin–St Jeor multiplier.

    Deliberately conservative for weight loss: we'd rather slightly under-state
    activity (and bank a real deficit) than over-state it and stall progress,
    so the higher tiers demand more steps than a generic TDEE estimator would.
    A typical 10k-steps/day lands at 'moderate' (1.55), not 'very active'.
    """
    if steps_avg >= 12_000:
        return 1.725
    if steps_avg >= 7_500:
        return 1.55
    if steps_avg >= 5_000:
        return 1.375
    return 1.2


def steps_to_activity_level(steps_avg: float) -> str:
    """Step average → stored activity_level enum (e.g. 'moderately_active')."""
    return _LEVEL_FOR_FACTOR[_steps_factor(steps_avg)]


def resolve_synced_activity_level(
    steps_avg: float,
    steps_days: int,
    stated_level: str | None,
    weekly_exercise_min: float,
) -> str | None:
    """Decide what activity_level the background sync should write.

    Returns the level to store, or None to leave the profile untouched (we only
    sync when step data is robust, so we never clobber a profile on sparse data).

    Guard: steps miss non-step exercise (cycling, swimming, rowing), so a
    regular exerciser can log few steps. When the user's self-reported level is
    higher than the step-derived one *and* their weekly exercise minutes show
    real activity, keep the higher self-report rather than auto-downgrading.
    """
    if steps_days < _MIN_STEP_DAYS or steps_avg <= 0:
        return None
    measured = steps_to_activity_level(steps_avg)
    if (
        stated_level in _LEVEL_RANK
        and _LEVEL_RANK[stated_level] > _LEVEL_RANK[measured]
        and weekly_exercise_min >= _EXERCISE_GUARD_WEEKLY_MIN
    ):
        return stated_level
    return measured


def _activity_factor(activity_level: str | None, steps_avg: float, steps_days: int) -> tuple[float, str]:
    """Pick a Mifflin–St Jeor activity multiplier.

    Objective measured steps win when we have a few days of them — a self-
    reported activity level is often a stale default and shouldn't override
    hard data (a "sedentary" setting next to 10k steps/day under-counts burn,
    which under-feeds a weight-loss target). Self-report fills in only when
    step data is sparse; fall back to sedentary when there's nothing to go on.
    """
    if steps_days >= _MIN_STEP_DAYS and steps_avg > 0:
        return _steps_factor(steps_avg), "steps"
    if activity_level in _ACTIVITY_FACTORS:
        return _ACTIVITY_FACTORS[activity_level], "profile"
    return 1.2, "default"


def _mifflin_st_jeor_bmr(weight_kg: float, height_cm: float, age: int, sex: str) -> float:
    """Mifflin–St Jeor resting metabolic rate — the same equation the Mayo
    Clinic calculator is built on. `sex` must be 'male' or 'female'."""
    s = 5 if sex == "male" else -161
    return 10 * weight_kg + 6.25 * height_cm - 5 * age + s
