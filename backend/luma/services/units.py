"""Unit conversion utilities — metric storage ↔ preferred display units."""
from __future__ import annotations

from typing import Literal

UnitSystem = Literal["metric", "imperial"]

_LB_PER_KG = 2.20462262185
_KG_PER_LB = 0.45359237


def kg_to_lbs(kg: float) -> float:
    return round(kg * _LB_PER_KG, 1)


def lbs_to_kg(lbs: float) -> float:
    return round(lbs * _KG_PER_LB, 3)


def cm_to_ft_in(cm: float) -> tuple[int, int]:
    total_inches = cm / 2.54
    feet = int(total_inches // 12)
    inches = round(total_inches % 12)
    if inches == 12:
        feet += 1
        inches = 0
    return feet, inches


def fmt_weight(kg: float, system: UnitSystem) -> str:
    if system == "imperial":
        return f"{kg_to_lbs(kg)} lbs"
    return f"{round(kg, 1)} kg"


def fmt_weight_trend(kg_per_week: float, system: UnitSystem) -> str:
    magnitude = abs(kg_per_week)
    if system == "imperial":
        return f"{round(magnitude * _LB_PER_KG, 2)} lbs/week"
    return f"{magnitude:.2f} kg/week"


def fmt_height(cm: float, system: UnitSystem) -> str:
    if system == "imperial":
        ft, inch = cm_to_ft_in(cm)
        return f"{ft}'{inch}\""
    return f"{round(cm):.0f} cm"
