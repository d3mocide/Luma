"""Unit tests for the Mifflin–St Jeor goal-recommendation math."""
from luma.services.body_metrics import (
    _activity_factor,
    _mifflin_st_jeor_bmr,
    resolve_synced_activity_level,
    steps_to_activity_level,
)


def test_mifflin_st_jeor_male():
    # 10*90 + 6.25*178 - 5*40 + 5 = 1817.5
    assert _mifflin_st_jeor_bmr(90, 178, 40, "male") == 1817.5


def test_mifflin_st_jeor_female():
    # 10*65 + 6.25*165 - 5*35 - 161 = 1345.25
    assert _mifflin_st_jeor_bmr(65, 165, 35, "female") == 1345.25


def test_mifflin_st_jeor_sex_term_difference():
    # The only difference between sexes is the constant (+5 vs -161) = 166.
    male = _mifflin_st_jeor_bmr(80, 175, 30, "male")
    female = _mifflin_st_jeor_bmr(80, 175, 30, "female")
    assert round(male - female, 2) == 166.0


def test_activity_factor_trusts_measured_steps_over_stale_profile():
    # 10k steps but "sedentary" self-report: objective data wins (conservatively).
    assert _activity_factor("sedentary", 10000, steps_days=7) == (1.55, "steps")
    assert _activity_factor("very_active", 3000, steps_days=7) == (1.2, "steps")


def test_activity_factor_steps_ladder_is_conservative():
    # 1.725 now requires >=12k steps; a typical 10k lands at moderate (1.55).
    assert _activity_factor(None, 12000, steps_days=5) == (1.725, "steps")
    assert _activity_factor(None, 10000, steps_days=5) == (1.55, "steps")
    assert _activity_factor(None, 8000, steps_days=5) == (1.55, "steps")
    assert _activity_factor(None, 6000, steps_days=5) == (1.375, "steps")
    assert _activity_factor(None, 3000, steps_days=5) == (1.2, "steps")


def test_activity_factor_falls_back_to_profile_when_steps_sparse():
    # Too few days of step data — defer to the self-reported level.
    assert _activity_factor("moderately_active", 9999, steps_days=2) == (1.55, "profile")
    assert _activity_factor("sedentary", 0, steps_days=0) == (1.2, "profile")


def test_activity_factor_defaults_to_sedentary():
    assert _activity_factor(None, 0, steps_days=0) == (1.2, "default")
    assert _activity_factor("unknown_value", 0, steps_days=0) == (1.2, "default")


def test_steps_to_activity_level_maps_to_profile_enums():
    # Used by the background profile-sync to write activity_level back.
    assert steps_to_activity_level(3000) == "sedentary"
    assert steps_to_activity_level(6000) == "lightly_active"
    assert steps_to_activity_level(10000) == "moderately_active"
    assert steps_to_activity_level(13000) == "very_active"


def test_synced_level_skips_on_sparse_step_data():
    assert resolve_synced_activity_level(10000, steps_days=2, stated_level="sedentary", weekly_exercise_min=0) is None
    assert resolve_synced_activity_level(0, steps_days=7, stated_level="very_active", weekly_exercise_min=999) is None


def test_synced_level_overwrites_stale_profile_without_exercise():
    # 3k steps, profile says "very_active", no real exercise → downgrade.
    assert resolve_synced_activity_level(3000, steps_days=7, stated_level="very_active", weekly_exercise_min=0) == "sedentary"
    # Steps exceed the self-report → upgrade regardless of exercise.
    assert resolve_synced_activity_level(13000, steps_days=7, stated_level="sedentary", weekly_exercise_min=0) == "very_active"


def test_synced_level_guards_cyclist_with_low_steps():
    # Cyclist: few steps but self-reports very_active and logs >=150 min/week
    # exercise → keep the higher self-report, don't downgrade.
    assert resolve_synced_activity_level(2500, steps_days=7, stated_level="very_active", weekly_exercise_min=200) == "very_active"
    # Same low steps but below the exercise threshold → downgrade applies.
    assert resolve_synced_activity_level(2500, steps_days=7, stated_level="very_active", weekly_exercise_min=120) == "sedentary"
    # Guard never lowers a self-report; if steps already imply more, steps win.
    assert resolve_synced_activity_level(13000, steps_days=7, stated_level="moderately_active", weekly_exercise_min=300) == "very_active"


def test_formula_tdee_stays_near_mayo_not_inflated_watch():
    # Regression for the 3,000-vs-2,000 complaint: a typical sedentary adult's
    # formula TDEE lands near the Mayo estimate, well below an over-reporting
    # watch's measured burn.
    bmr = _mifflin_st_jeor_bmr(90, 178, 40, "male")
    tdee = bmr * _activity_factor("sedentary", 0, steps_days=0)[0]
    assert 2000 <= round(tdee) <= 2300


def test_example_active_woman_not_underfed():
    # 5'10" / 28 / female, 200lb → 150lb, averaging 10k steps but profile says
    # "sedentary". Trusting the steps must NOT drop her to a sub-BMR target.
    weight_kg = 200 * 0.45359237
    height_cm = 70 * 2.54
    bmr = _mifflin_st_jeor_bmr(weight_kg, height_cm, 28, "female")
    factor, source = _activity_factor("sedentary", 10000, steps_days=7)
    assert source == "steps" and factor == 1.55
    tdee = bmr * factor
    target = max(1200.0, round((tdee - 500) / 50) * 50)  # deficit branch + female floor
    assert target == 2150
    assert target > bmr  # not eating below resting metabolism
