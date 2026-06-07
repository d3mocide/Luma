"""Unit tests for the Mifflin–St Jeor goal-recommendation math."""
from luma.api.goals import _activity_factor, _mifflin_st_jeor_bmr


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


def test_activity_factor_prefers_explicit_profile():
    assert _activity_factor("very_active", 0) == (1.725, "profile")
    assert _activity_factor("sedentary", 99999) == (1.2, "profile")


def test_activity_factor_infers_from_steps_when_unset():
    assert _activity_factor(None, 12000) == (1.725, "steps")
    assert _activity_factor(None, 8000) == (1.55, "steps")
    assert _activity_factor(None, 6000) == (1.375, "steps")
    assert _activity_factor(None, 3000) == (1.2, "steps")


def test_activity_factor_defaults_to_sedentary():
    assert _activity_factor(None, 0) == (1.2, "default")
    assert _activity_factor("unknown_value", 0) == (1.2, "default")


def test_formula_tdee_stays_near_mayo_not_inflated_watch():
    # Regression for the 3,000-vs-2,000 complaint: a typical sedentary adult's
    # formula TDEE lands near the Mayo estimate, well below an over-reporting
    # watch's measured burn.
    bmr = _mifflin_st_jeor_bmr(90, 178, 40, "male")
    tdee = bmr * _activity_factor("sedentary", 0)[0]
    assert 2000 <= round(tdee) <= 2300
