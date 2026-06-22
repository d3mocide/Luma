"""Unit tests for the shared streak day-scoring logic.

Mirrors the frontend rule in src/lib/streak.ts — if these change, change both.
"""
from luma.services.streak import score_day

# A representative four-target config (calories, sat fat, soluble fiber, sodium).
TARGETS = {"cal": 2000.0, "sat": 15.0, "fib": 20.0, "sod": 2300.0}


def _on_track(totals):
    return score_day(totals, TARGETS)["on_track"]


def test_calories_under_target_within_25pct_counts():
    # 1750 is 12.5% under a 2000 target — well within the 25% floor (1500), must count.
    s = score_day({"cal": 1750, "sat": 0, "fib": 99, "sod": 0}, TARGETS)
    assert s["cal_met"] is True


def test_calories_at_target_counts():
    s = score_day({"cal": 2000, "sat": 0, "fib": 99, "sod": 0}, TARGETS)
    assert s["cal_met"] is True


def test_calories_far_under_target_does_not_count():
    # 919 kcal against 2000 is far below the 25% floor (1500) — flagged as too low.
    s = score_day({"cal": 919, "sat": 0, "fib": 99, "sod": 0}, TARGETS)
    assert s["cal_met"] is False


def test_calorie_band_is_asymmetric():
    # 25% under is forgiven; the symmetric 25% over is NOT (cap is +10%).
    assert score_day({"cal": 1700, "sat": 0, "fib": 99, "sod": 0}, TARGETS)["cal_met"] is True
    assert score_day({"cal": 2300, "sat": 0, "fib": 99, "sod": 0}, TARGETS)["cal_met"] is False
    # Just inside the +10% cap still counts.
    assert score_day({"cal": 2200, "sat": 0, "fib": 99, "sod": 0}, TARGETS)["cal_met"] is True


def test_ceilings_and_floor():
    s = score_day({"cal": 2000, "sat": 15, "fib": 20, "sod": 2300}, TARGETS)
    assert s["sat_met"] is True   # at the ceiling
    assert s["fib_met"] is True   # at the floor
    assert s["sod_met"] is True   # at the ceiling


def test_ceiling_and_floor_grace_zone():
    # Values inside the 10% grace still count as met.
    grace = score_day({"cal": 2000, "sat": 16, "fib": 19, "sod": 2400}, TARGETS)
    assert grace["sat_met"] is True   # 16 <= 15 * 1.10 = 16.5
    assert grace["fib_met"] is True   # 19 >= 20 * 0.90 = 18
    assert grace["sod_met"] is True   # 2400 <= 2300 * 1.10 = 2530


def test_ceiling_and_floor_beyond_grace():
    # Values outside the 10% grace are missed.
    over = score_day({"cal": 2000, "sat": 17, "fib": 17, "sod": 2600}, TARGETS)
    assert over["sat_met"] is False   # 17 > 16.5
    assert over["fib_met"] is False   # 17 < 18
    assert over["sod_met"] is False   # 2600 > 2530


def test_on_track_needs_three_of_four():
    # cal + sat + sodium met, fiber missed → 3/4 → on track.
    assert _on_track({"cal": 2000, "sat": 10, "fib": 0, "sod": 10}) is True
    # only cal + sat met → 2/4 → not on track.
    assert _on_track({"cal": 2000, "sat": 10, "fib": 0, "sod": 9999}) is False


def test_unset_target_is_excluded_not_counted_against():
    # Fiber unset: only three configured targets, so all three must be met.
    targets = {"cal": 2000.0, "sat": 15.0, "fib": None, "sod": 2300.0}
    s = score_day({"cal": 2000, "sat": 10, "fib": 0, "sod": 10}, targets)
    assert s["targets_possible"] == 3
    assert s["targets_met"] == 3
    assert s["on_track"] is True
    assert s["fib_met"] is False  # unset never reads as met
    # Missing one of the three configured drops below the bar.
    miss = score_day({"cal": 2000, "sat": 10, "fib": 0, "sod": 9999}, targets)
    assert miss["targets_possible"] == 3
    assert miss["targets_met"] == 2
    assert miss["on_track"] is False


def test_threshold_caps_at_configured_count():
    # Two configured targets → both required (min(3, 2) == 2).
    targets = {"cal": 2000.0, "sat": 15.0, "fib": None, "sod": None}
    assert score_day({"cal": 2000, "sat": 10, "fib": 0, "sod": 0}, targets)["on_track"] is True
    assert score_day({"cal": 2000, "sat": 99, "fib": 0, "sod": 0}, targets)["on_track"] is False


def test_no_targets_configured_is_never_on_track():
    s = score_day({"cal": 2000, "sat": 1, "fib": 99, "sod": 1}, {"cal": None, "sat": None, "fib": None, "sod": None})
    assert s["targets_possible"] == 0
    assert s["on_track"] is False
