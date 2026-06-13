"""Unit tests for the shared streak day-scoring logic.

Mirrors the frontend rule in src/lib/streak.ts — if these change, change both.
"""
from luma.services.streak import score_day

# A representative four-target config (calories, sat fat, soluble fiber, sugar).
TARGETS = {"cal": 2000.0, "sat": 15.0, "fib": 20.0, "sug": 25.0}


def _on_track(totals):
    return score_day(totals, TARGETS)["on_track"]


def test_calories_under_target_within_15pct_counts():
    # 1750 is 12.5% under a 2000 target — still on-plan, must count.
    s = score_day({"cal": 1750, "sat": 0, "fib": 99, "sug": 0}, TARGETS)
    assert s["cal_met"] is True


def test_calories_at_target_counts():
    s = score_day({"cal": 2000, "sat": 0, "fib": 99, "sug": 0}, TARGETS)
    assert s["cal_met"] is True


def test_calories_far_under_target_does_not_count():
    # 919 kcal against 2000 is far below the 15% floor (1700) — flagged as too low.
    s = score_day({"cal": 919, "sat": 0, "fib": 99, "sug": 0}, TARGETS)
    assert s["cal_met"] is False


def test_calorie_band_is_asymmetric():
    # 15% under is forgiven; the symmetric 15% over is NOT (cap is +10%).
    assert score_day({"cal": 1700, "sat": 0, "fib": 99, "sug": 0}, TARGETS)["cal_met"] is True
    assert score_day({"cal": 2300, "sat": 0, "fib": 99, "sug": 0}, TARGETS)["cal_met"] is False
    # Just inside the +10% cap still counts.
    assert score_day({"cal": 2200, "sat": 0, "fib": 99, "sug": 0}, TARGETS)["cal_met"] is True


def test_ceilings_and_floor():
    s = score_day({"cal": 2000, "sat": 15, "fib": 20, "sug": 25}, TARGETS)
    assert s["sat_met"] is True   # at the ceiling
    assert s["fib_met"] is True   # at the floor
    assert s["sug_met"] is True   # at the ceiling
    over = score_day({"cal": 2000, "sat": 16, "fib": 19, "sug": 26}, TARGETS)
    assert over["sat_met"] is False
    assert over["fib_met"] is False
    assert over["sug_met"] is False


def test_on_track_needs_three_of_four():
    # cal + sat + sug met, fiber missed → 3/4 → on track.
    assert _on_track({"cal": 2000, "sat": 10, "fib": 0, "sug": 10}) is True
    # only cal + sat met → 2/4 → not on track.
    assert _on_track({"cal": 2000, "sat": 10, "fib": 0, "sug": 999}) is False


def test_unset_target_is_excluded_not_counted_against():
    # Fiber unset: only three configured targets, so all three must be met.
    targets = {"cal": 2000.0, "sat": 15.0, "fib": None, "sug": 25.0}
    s = score_day({"cal": 2000, "sat": 10, "fib": 0, "sug": 10}, targets)
    assert s["targets_possible"] == 3
    assert s["targets_met"] == 3
    assert s["on_track"] is True
    assert s["fib_met"] is False  # unset never reads as met
    # Missing one of the three configured drops below the bar.
    miss = score_day({"cal": 2000, "sat": 10, "fib": 0, "sug": 999}, targets)
    assert miss["targets_possible"] == 3
    assert miss["targets_met"] == 2
    assert miss["on_track"] is False


def test_threshold_caps_at_configured_count():
    # Two configured targets → both required (min(3, 2) == 2).
    targets = {"cal": 2000.0, "sat": 15.0, "fib": None, "sug": None}
    assert score_day({"cal": 2000, "sat": 10, "fib": 0, "sug": 0}, targets)["on_track"] is True
    assert score_day({"cal": 2000, "sat": 99, "fib": 0, "sug": 0}, targets)["on_track"] is False


def test_no_targets_configured_is_never_on_track():
    s = score_day({"cal": 2000, "sat": 1, "fib": 99, "sug": 1}, {"cal": None, "sat": None, "fib": None, "sug": None})
    assert s["targets_possible"] == 0
    assert s["on_track"] is False
