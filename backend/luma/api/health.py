"""Health API — medications, supplements, interaction alerts, LDL simulator."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, text

from luma.config import settings
from luma.db.models import MealEvent, Medication, Supplement
from luma.deps import CurrentUser, DbDep

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MedicationIn(BaseModel):
    name: str
    generic_name: str | None = None
    dose: str | None = None
    frequency: str | None = None
    notes: str | None = None
    is_active: bool = True


class MedicationPatch(BaseModel):
    name: str | None = None
    generic_name: str | None = None
    dose: str | None = None
    frequency: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class SupplementIn(BaseModel):
    name: str
    dose: str | None = None
    frequency: str | None = None
    nutrients_per_dose: dict[str, float] = {}
    is_active: bool = True


class SupplementPatch(BaseModel):
    name: str | None = None
    dose: str | None = None
    frequency: str | None = None
    nutrients_per_dose: dict[str, float] | None = None
    is_active: bool | None = None


class LdlSimulateIn(BaseModel):
    target_sat_fat_pct: float
    target_soluble_fiber_g: float
    weeks: int = 8


class WeightSimulateIn(BaseModel):
    target_weekly_loss_kg: float
    weeks: int = 12


# ---------------------------------------------------------------------------
# Drug classification for interaction rules
# ---------------------------------------------------------------------------

_DRUG_CLASSES: list[tuple[str, list[str]]] = [
    ("warfarin", ["warfarin", "coumadin", "jantoven"]),
    ("statin", [
        "statin", "atorvastatin", "simvastatin", "lovastatin", "rosuvastatin",
        "pravastatin", "fluvastatin", "pitavastatin",
    ]),
    ("antihypertensive", [
        "lisinopril", "enalapril", "ramipril", "benazepril", "captopril",
        "losartan", "valsartan", "olmesartan", "irbesartan", "candesartan",
        "amlodipine", "nifedipine", "diltiazem", "verapamil",
        "metoprolol", "carvedilol", "bisoprolol", "atenolol", "propranolol",
        "hydrochlorothiazide", "chlorthalidone", "furosemide",
    ]),
    ("maoi", ["phenelzine", "tranylcypromine", "isocarboxazid", "selegiline"]),
]

_TYRAMINE_KEYWORDS = [
    "aged cheese", "cheddar", "parmesan", "blue cheese", "camembert", "brie",
    "gruyere", "stilton", "gorgonzola", "roquefort", "salami", "pepperoni",
    "chorizo", "prosciutto", "sausage", "chianti", "vermouth", "miso",
    "tempeh", "sauerkraut", "kimchi", "pickled herring", "anchovies",
]


def _drug_classes(med: Medication) -> set[str]:
    combined = ((med.name or "") + " " + (med.generic_name or "")).lower()
    result: set[str] = set()
    for cls, keywords in _DRUG_CLASSES:
        if any(kw in combined for kw in keywords):
            result.add(cls)
    return result


def _run_interaction_rules(
    meds: list[Medication],
    nutrients: dict[str, float],
    food_names: list[str],
) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []

    all_classes: set[str] = set()
    for med in meds:
        all_classes |= _drug_classes(med)

    names_lower = [n.lower() for n in food_names]

    if "warfarin" in all_classes:
        vk = nutrients.get("vitamin_k_mcg", 0.0)
        if vk > 200:
            alerts.append({
                "rule_id": "warfarin_vitamin_k",
                "severity": "medium",
                "title": "High vitamin K with warfarin",
                "message": (
                    f"You logged {vk:.0f} mcg of vitamin K today. High or variable vitamin K intake "
                    "can reduce warfarin's anticoagulant effect. Keep intake consistent day-to-day."
                ),
            })

    if "statin" in all_classes:
        grapefruit_found = any(
            "grapefruit" in n or "pomelo" in n for n in names_lower
        )
        if grapefruit_found:
            alerts.append({
                "rule_id": "statin_grapefruit",
                "severity": "high",
                "title": "Grapefruit with statin",
                "message": (
                    "Grapefruit inhibits CYP3A4 and can significantly raise statin levels in your blood, "
                    "increasing the risk of muscle damage. Avoid grapefruit and pomelo on days you take your statin."
                ),
            })

    if "antihypertensive" in all_classes:
        sodium = nutrients.get("sodium_mg", 0.0)
        if sodium > 2300:
            alerts.append({
                "rule_id": "antihypertensive_sodium",
                "severity": "low",
                "title": "High sodium with blood pressure medication",
                "message": (
                    f"You logged {sodium:.0f} mg of sodium today (limit: 2,300 mg). "
                    "High sodium may counteract your blood pressure medication."
                ),
            })

    if "maoi" in all_classes:
        tyramine_found = any(
            kw in n for kw in _TYRAMINE_KEYWORDS for n in names_lower
        )
        if tyramine_found:
            alerts.append({
                "rule_id": "maoi_tyramine",
                "severity": "high",
                "title": "Tyramine-rich food with MAOI",
                "message": (
                    "You logged foods high in tyramine. Combined with an MAOI, this can trigger "
                    "a hypertensive crisis — a sudden, severe rise in blood pressure. Avoid aged "
                    "cheeses, cured meats, fermented foods, and certain wines."
                ),
            })

    return alerts


# ---------------------------------------------------------------------------
# Medication CRUD
# ---------------------------------------------------------------------------

@router.get("/health/medications")
async def list_medications(user: CurrentUser, db: DbDep) -> list[dict[str, Any]]:
    rows = await db.execute(
        select(Medication)
        .where(Medication.user_id == user.id)
        .order_by(Medication.created_at)
    )
    meds = rows.scalars().all()
    return [
        {
            "id": str(m.id),
            "name": m.name,
            "generic_name": m.generic_name,
            "dose": m.dose,
            "frequency": m.frequency,
            "notes": m.notes,
            "is_active": m.is_active,
            "created_at": m.created_at.isoformat(),
        }
        for m in meds
    ]


@router.post("/health/medications", status_code=status.HTTP_201_CREATED)
async def create_medication(body: MedicationIn, user: CurrentUser, db: DbDep) -> dict[str, Any]:
    med = Medication(
        user_id=user.id,
        name=body.name,
        generic_name=body.generic_name,
        dose=body.dose,
        frequency=body.frequency,
        notes=body.notes,
        is_active=body.is_active,
    )
    db.add(med)
    await db.commit()
    await db.refresh(med)
    return {"id": str(med.id), "name": med.name}


@router.patch("/health/medications/{med_id}")
async def update_medication(
    med_id: str, body: MedicationPatch, user: CurrentUser, db: DbDep
) -> dict[str, Any]:
    row = await db.execute(
        select(Medication).where(Medication.id == uuid.UUID(med_id), Medication.user_id == user.id)
    )
    med = row.scalar_one_or_none()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(med, field, value)

    await db.commit()
    return {"id": str(med.id)}


@router.delete("/health/medications/{med_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medication(med_id: str, user: CurrentUser, db: DbDep) -> None:
    row = await db.execute(
        select(Medication).where(Medication.id == uuid.UUID(med_id), Medication.user_id == user.id)
    )
    med = row.scalar_one_or_none()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    await db.delete(med)
    await db.commit()


# ---------------------------------------------------------------------------
# Supplement CRUD
# ---------------------------------------------------------------------------

@router.get("/health/supplements")
async def list_supplements(user: CurrentUser, db: DbDep) -> list[dict[str, Any]]:
    rows = await db.execute(
        select(Supplement)
        .where(Supplement.user_id == user.id)
        .order_by(Supplement.created_at)
    )
    supps = rows.scalars().all()
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "dose": s.dose,
            "frequency": s.frequency,
            "nutrients_per_dose": s.nutrients_per_dose or {},
            "is_active": s.is_active,
            "created_at": s.created_at.isoformat(),
        }
        for s in supps
    ]


@router.post("/health/supplements", status_code=status.HTTP_201_CREATED)
async def create_supplement(body: SupplementIn, user: CurrentUser, db: DbDep) -> dict[str, Any]:
    supp = Supplement(
        user_id=user.id,
        name=body.name,
        dose=body.dose,
        frequency=body.frequency,
        nutrients_per_dose=body.nutrients_per_dose,
        is_active=body.is_active,
    )
    db.add(supp)
    await db.commit()
    await db.refresh(supp)
    return {"id": str(supp.id), "name": supp.name}


@router.patch("/health/supplements/{supp_id}")
async def update_supplement(
    supp_id: str, body: SupplementPatch, user: CurrentUser, db: DbDep
) -> dict[str, Any]:
    row = await db.execute(
        select(Supplement).where(Supplement.id == uuid.UUID(supp_id), Supplement.user_id == user.id)
    )
    supp = row.scalar_one_or_none()
    if not supp:
        raise HTTPException(status_code=404, detail="Supplement not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(supp, field, value)

    await db.commit()
    return {"id": str(supp.id)}


@router.delete("/health/supplements/{supp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplement(supp_id: str, user: CurrentUser, db: DbDep) -> None:
    row = await db.execute(
        select(Supplement).where(Supplement.id == uuid.UUID(supp_id), Supplement.user_id == user.id)
    )
    supp = row.scalar_one_or_none()
    if not supp:
        raise HTTPException(status_code=404, detail="Supplement not found")
    await db.delete(supp)
    await db.commit()


# ---------------------------------------------------------------------------
# Interaction alerts (local rule engine — no LLM)
# ---------------------------------------------------------------------------

@router.get("/health/interactions")
async def get_interactions(
    user: CurrentUser,
    db: DbDep,
    tz: str = Query(default=None, alias="tz"),
) -> dict[str, Any]:
    try:
        resolved_tz = ZoneInfo(tz) if tz else ZoneInfo(settings.server_timezone)
    except Exception:
        resolved_tz = ZoneInfo(settings.server_timezone)

    today_dt = datetime.now(resolved_tz).date()
    today_start = datetime.combine(today_dt, time.min, tzinfo=resolved_tz).astimezone(UTC)
    today_end = datetime.combine(today_dt + timedelta(days=1), time.min, tzinfo=resolved_tz).astimezone(UTC)

    # Load active medications
    med_rows = await db.execute(
        select(Medication).where(Medication.user_id == user.id, Medication.is_active.is_(True))
    )
    meds = med_rows.scalars().all()

    if not meds:
        return {"alerts": [], "checked_at": datetime.now(UTC).isoformat()}

    # Sum today's nutrients from meal events
    event_rows = await db.execute(
        select(MealEvent).where(
            MealEvent.user_id == user.id,
            MealEvent.ts >= today_start,
            MealEvent.ts < today_end,
        )
    )
    events = event_rows.scalars().all()

    nutrients: dict[str, float] = {}
    food_names: list[str] = []
    for event in events:
        nutr = event.nutrition or {}
        for key, val in nutr.items():
            nutrients[key] = nutrients.get(key, 0.0) + float(val or 0.0)
        for item in (event.items or []):
            if isinstance(item, dict) and item.get("name"):
                food_names.append(item["name"])

    alerts = _run_interaction_rules(list(meds), nutrients, food_names)

    return {
        "alerts": alerts,
        "checked_at": datetime.now(UTC).isoformat(),
        "medications_checked": len(meds),
        "meal_events_today": len(events),
    }


# ---------------------------------------------------------------------------
# LDL simulator (Mensink-Katan / Hegsted equations)
# ---------------------------------------------------------------------------

@router.post("/health/ldl-simulate")
async def ldl_simulate(body: LdlSimulateIn, user: CurrentUser, db: DbDep) -> dict[str, Any]:
    from luma.db.models import Goal

    # Load user's current LDL and calorie target
    goal_row = await db.execute(select(Goal).where(Goal.user_id == user.id))
    goal = goal_row.scalar_one_or_none()

    current_ldl = float(goal.current_ldl_mg_dl) if goal and goal.current_ldl_mg_dl else None

    # Compute 7-day average sat fat % and soluble fiber from meal events
    seven_days_ago = datetime.now(UTC) - timedelta(days=7)
    recent_rows = await db.execute(
        select(MealEvent).where(
            MealEvent.user_id == user.id,
            MealEvent.ts >= seven_days_ago,
        )
    )
    recent_events = recent_rows.scalars().all()

    if recent_events:
        total_cal = sum(float((e.nutrition or {}).get("calories") or 0.0) for e in recent_events)
        total_sat = sum(float((e.nutrition or {}).get("saturated_fat_g") or 0.0) for e in recent_events)
        total_fiber = sum(float((e.nutrition or {}).get("soluble_fiber_g") or 0.0) for e in recent_events)
        days = max(1, len({e.ts.date() for e in recent_events}))
        avg_cal = total_cal / days
        avg_sat_g = total_sat / days
        avg_fiber_g = total_fiber / days
        avg_sat_pct = (avg_sat_g * 9 / avg_cal * 100) if avg_cal > 0 else 8.0
    else:
        avg_sat_pct = 10.0
        avg_fiber_g = 5.0

    weeks = min(max(body.weeks, 1), 52)

    # Hegsted/Mensink-Katan: each 1% increase in SFA % energy raises LDL ~2.2 mg/dL
    # Soluble fiber: each additional 10 g/day lowers LDL ~7 mg/dL → 0.7 mg/dL per gram
    delta_sat = body.target_sat_fat_pct - avg_sat_pct
    delta_fiber = body.target_soluble_fiber_g - avg_fiber_g
    delta_ldl_final = (2.2 * delta_sat) - (0.7 * delta_fiber)

    # Linear ramp to the full effect over the requested weeks
    trajectory = []
    baseline = current_ldl or 130.0
    for w in range(weeks + 1):
        projected = round(baseline + delta_ldl_final * (w / weeks), 1)
        trajectory.append({"week": w, "ldl": projected})

    return {
        "baseline_ldl": current_ldl,
        "projected_ldl": round(baseline + delta_ldl_final, 1),
        "delta_ldl": round(delta_ldl_final, 1),
        "current_avg_sat_fat_pct": round(avg_sat_pct, 1),
        "current_avg_soluble_fiber_g": round(avg_fiber_g, 1),
        "target_sat_fat_pct": body.target_sat_fat_pct,
        "target_soluble_fiber_g": body.target_soluble_fiber_g,
        "trajectory": trajectory,
        "weeks": weeks,
        "note": "Projection based on Hegsted/Mensink-Katan dietary fat equations. Individual results vary.",
    }


# ---------------------------------------------------------------------------
# Weight loss simulator (Hall energy balance model)
# ---------------------------------------------------------------------------

@router.post("/health/weight-simulate")
async def weight_simulate(body: WeightSimulateIn, user: CurrentUser, db: DbDep) -> dict[str, Any]:
    from luma.db.models import Goal

    weeks = min(max(body.weeks, 4), 52)
    rate = min(max(body.target_weekly_loss_kg, 0.1), 1.5)

    goal_row = await db.execute(select(Goal).where(Goal.user_id == user.id))
    goal = goal_row.scalar_one_or_none()
    target_weight_kg = float(goal.target_weight_kg) if goal and goal.target_weight_kg else None
    calorie_target = int(goal.daily_calorie_target) if goal and goal.daily_calorie_target else None

    wt_row = await db.execute(
        text("SELECT value FROM biometrics WHERE user_id = :uid AND metric = 'weight_kg' ORDER BY ts DESC LIMIT 1"),
        {"uid": str(user.id)},
    )
    wt = wt_row.fetchone()
    current_weight_kg = float(wt[0]) if wt else None

    if current_weight_kg is None:
        raise HTTPException(status_code=400, detail="no_weight_data")

    # Hall model: 1 kg body fat ≈ 7,700 kcal
    required_daily_deficit = round((rate * 7700) / 7)
    suggested_daily_kcal = calorie_target - required_daily_deficit if calorie_target else None

    trajectory = [
        {"week": w, "kg": round(current_weight_kg - rate * w, 2)}
        for w in range(weeks + 1)
    ]

    weeks_to_goal: int | None = None
    if target_weight_kg is not None and target_weight_kg < current_weight_kg:
        weeks_to_goal = round((current_weight_kg - target_weight_kg) / rate)

    return {
        "current_weight_kg": round(current_weight_kg, 1),
        "goal_weight_kg": round(target_weight_kg, 1) if target_weight_kg is not None else None,
        "target_weekly_loss_kg": rate,
        "required_daily_deficit_kcal": required_daily_deficit,
        "suggested_daily_kcal": suggested_daily_kcal,
        "trajectory": trajectory,
        "weeks_to_goal": weeks_to_goal,
        "weeks": weeks,
        "note": "Projection based on the Hall energy balance model (1 kg ≈ 7,700 kcal). Actual rate varies with metabolic adaptation.",
    }


# ---------------------------------------------------------------------------
# Protein adequacy simulator (ISSN zones)
# ---------------------------------------------------------------------------

@router.get("/health/protein-simulate")
async def protein_simulate(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    from luma.db.models import Goal

    goal_row = await db.execute(select(Goal).where(Goal.user_id == user.id))
    goal = goal_row.scalar_one_or_none()
    target_protein_g = float(goal.daily_protein_g_min) if goal and goal.daily_protein_g_min else None

    wt_row = await db.execute(
        text("SELECT value FROM biometrics WHERE user_id = :uid AND metric = 'weight_kg' ORDER BY ts DESC LIMIT 1"),
        {"uid": str(user.id)},
    )
    wt = wt_row.fetchone()
    body_weight_kg = float(wt[0]) if wt else None

    seven_days_ago = datetime.now(UTC) - timedelta(days=7)
    recent_rows = await db.execute(
        select(MealEvent).where(
            MealEvent.user_id == user.id,
            MealEvent.ts >= seven_days_ago,
        )
    )
    recent_events = recent_rows.scalars().all()

    avg_protein_g: float | None = None
    if recent_events:
        total_protein = sum(float((e.nutrition or {}).get("protein_g") or 0.0) for e in recent_events)
        days = max(1, len({e.ts.date() for e in recent_events}))
        avg_protein_g = round(total_protein / days, 1)

    g_per_kg: float | None = None
    zone = "unknown"
    if avg_protein_g is not None and body_weight_kg:
        g_per_kg = round(avg_protein_g / body_weight_kg, 2)
        if g_per_kg < 1.2:
            zone = "low"
        elif g_per_kg < 1.6:
            zone = "maintenance"
        elif g_per_kg <= 2.2:
            zone = "optimal"
        else:
            zone = "above"

    return {
        "avg_protein_g": avg_protein_g,
        "target_protein_g": target_protein_g,
        "body_weight_kg": round(body_weight_kg, 1) if body_weight_kg is not None else None,
        "g_per_kg": g_per_kg,
        "zone": zone,
        "note": "Optimal zone (1.6–2.2 g/kg/day) supports muscle protein synthesis. Based on ISSN Position Stand 2017.",
    }
