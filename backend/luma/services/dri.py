"""Dietary Reference Intake (DRI) computation — personalised per-user RDA values.

Sources: NIH Office of Dietary Supplements, USDA DRI tables (2020 revision).
All values are per-day totals for adults aged 19+.

direction: "min" = aim to meet or exceed (calcium, fiber…)
           "max" = aim to stay at or under (sodium, sat fat, sugar…)
"""
from __future__ import annotations

from datetime import date

# ── Generic adult reference (sex-neutral, moderate activity, ~2000 kcal) ─────
# Used as fallback when profile fields are missing.
_BASE: dict[str, dict] = {
    # Macros
    "calories":              {"rda": 2000,  "unit": "kcal", "direction": "min"},
    "protein_g":             {"rda": 50,    "unit": "g",    "direction": "min"},
    "fat_g":                 {"rda": 65,    "unit": "g",    "direction": "min"},
    "saturated_fat_g":       {"rda": 20,    "unit": "g",    "direction": "max"},
    "monounsaturated_fat_g": {"rda": 25,    "unit": "g",    "direction": "min"},
    "polyunsaturated_fat_g": {"rda": 17,    "unit": "g",    "direction": "min"},
    "trans_fat_g":           {"rda": 2,     "unit": "g",    "direction": "max"},
    "cholesterol_mg":        {"rda": 300,   "unit": "mg",   "direction": "max"},
    "carbohydrates_g":       {"rda": 275,   "unit": "g",    "direction": "min"},
    "fiber_g":               {"rda": 28,    "unit": "g",    "direction": "min"},
    "soluble_fiber_g":       {"rda": 7,     "unit": "g",    "direction": "min"},
    "sugars_g":              {"rda": 50,    "unit": "g",    "direction": "max"},
    "sodium_mg":             {"rda": 2300,  "unit": "mg",   "direction": "max"},
    "potassium_mg":          {"rda": 3000,  "unit": "mg",   "direction": "min"},
    # Vitamins
    "vitamin_a_mcg":         {"rda": 800,   "unit": "mcg",  "direction": "min"},
    "vitamin_c_mg":          {"rda": 82,    "unit": "mg",   "direction": "min"},
    "vitamin_d_mcg":         {"rda": 15,    "unit": "mcg",  "direction": "min"},
    "vitamin_e_mg":          {"rda": 15,    "unit": "mg",   "direction": "min"},
    "vitamin_k_mcg":         {"rda": 105,   "unit": "mcg",  "direction": "min"},
    "thiamin_mg":            {"rda": 1.15,  "unit": "mg",   "direction": "min"},
    "riboflavin_mg":         {"rda": 1.2,   "unit": "mg",   "direction": "min"},
    "niacin_mg":             {"rda": 15,    "unit": "mg",   "direction": "min"},
    "vitamin_b6_mg":         {"rda": 1.3,   "unit": "mg",   "direction": "min"},
    "folate_mcg":            {"rda": 400,   "unit": "mcg",  "direction": "min"},
    "vitamin_b12_mcg":       {"rda": 2.4,   "unit": "mcg",  "direction": "min"},
    # Minerals
    "calcium_mg":            {"rda": 1000,  "unit": "mg",   "direction": "min"},
    "iron_mg":               {"rda": 13,    "unit": "mg",   "direction": "min"},
    "magnesium_mg":          {"rda": 365,   "unit": "mg",   "direction": "min"},
    "zinc_mg":               {"rda": 9.5,   "unit": "mg",   "direction": "min"},
    "phosphorus_mg":         {"rda": 700,   "unit": "mg",   "direction": "min"},
}

_ACTIVITY_MULTIPLIERS = {
    "sedentary":        1.2,
    "lightly_active":   1.375,
    "moderately_active": 1.55,
    "very_active":      1.725,
}


def _age(birth_year: int | None) -> int | None:
    if birth_year is None:
        return None
    return date.today().year - birth_year


def _bmr(sex: str, age: int, height_cm: float, weight_kg: float) -> float:
    """Mifflin-St Jeor BMR in kcal/day."""
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    return base + 5 if sex == "male" else base - 161


def compute_dri(
    birth_year: int | None,
    biological_sex: str | None,
    activity_level: str | None,
    height_cm: float | None = None,
    weight_kg: float | None = None,
) -> dict[str, dict]:
    """Return personalised DRI values for all tracked nutrients.

    Falls back to generic adult reference values for any unknown dimension.
    Each entry: {"rda": float, "unit": str, "direction": "min" | "max"}
    """
    dri = {k: dict(v) for k, v in _BASE.items()}  # deep copy

    age = _age(birth_year)
    sex = biological_sex if biological_sex in ("male", "female") else None

    # ── Calories (Mifflin-St Jeor if we have enough data) ─────────────────
    if sex and age and height_cm and weight_kg:
        bmr = _bmr(sex, age, height_cm, weight_kg)
        multiplier = _ACTIVITY_MULTIPLIERS.get(activity_level or "", 1.55)
        dri["calories"]["rda"] = round(bmr * multiplier)
    elif sex and age:
        # Simplified Harris-Benedict approximation without height/weight
        base = 1800 if sex == "male" else 1500
        base -= max(0, (age - 30) // 10) * 50  # ~50 kcal per decade over 30
        multiplier = _ACTIVITY_MULTIPLIERS.get(activity_level or "", 1.55)
        dri["calories"]["rda"] = round(base * multiplier / 1.55)

    # ── Protein (0.8 g/kg if weight known) ────────────────────────────────
    if weight_kg:
        dri["protein_g"]["rda"] = round(weight_kg * 0.8)

    # ── Sex-specific adjustments ──────────────────────────────────────────
    if sex == "male":
        dri["vitamin_a_mcg"]["rda"] = 900
        dri["vitamin_c_mg"]["rda"] = 90
        dri["vitamin_k_mcg"]["rda"] = 120
        dri["thiamin_mg"]["rda"] = 1.2
        dri["riboflavin_mg"]["rda"] = 1.3
        dri["niacin_mg"]["rda"] = 16
        dri["magnesium_mg"]["rda"] = 420 if (age or 0) >= 31 else 400
        dri["zinc_mg"]["rda"] = 11
        dri["iron_mg"]["rda"] = 8
        dri["potassium_mg"]["rda"] = 3400
        dri["fiber_g"]["rda"] = 38 if (age or 0) <= 50 else 30
    elif sex == "female":
        dri["vitamin_a_mcg"]["rda"] = 700
        dri["vitamin_c_mg"]["rda"] = 75
        dri["vitamin_k_mcg"]["rda"] = 90
        dri["thiamin_mg"]["rda"] = 1.1
        dri["riboflavin_mg"]["rda"] = 1.1
        dri["niacin_mg"]["rda"] = 14
        dri["magnesium_mg"]["rda"] = 320 if (age or 0) >= 31 else 310
        dri["zinc_mg"]["rda"] = 8
        # Iron: premenopausal women need substantially more
        dri["iron_mg"]["rda"] = 18 if (age or 0) < 51 else 8
        dri["potassium_mg"]["rda"] = 2600
        dri["fiber_g"]["rda"] = 25 if (age or 0) <= 50 else 21

    # ── Age-specific adjustments (after sex adjustments) ─────────────────
    if age:
        if age >= 71:
            dri["calcium_mg"]["rda"] = 1200
            dri["vitamin_d_mcg"]["rda"] = 20
        elif age >= 51 and sex == "female":
            dri["calcium_mg"]["rda"] = 1200

        if age >= 50:
            dri["vitamin_b12_mcg"]["rda"] = 2.4  # Some authorities recommend more; keep conservative
            if sex == "male":
                dri["vitamin_b6_mg"]["rda"] = 1.7
            elif sex == "female":
                dri["vitamin_b6_mg"]["rda"] = 1.5

    # ── Soluble fiber (always ~25% of total fiber target) ─────────────────
    dri["soluble_fiber_g"]["rda"] = round(dri["fiber_g"]["rda"] * 0.25, 1)

    return dri
