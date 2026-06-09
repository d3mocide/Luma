import logging
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal, cast
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import delete, select, text, update
from sqlalchemy.dialects.postgresql import insert

from luma.config import settings
from luma.db.models import Goal, Preference, User
from luma.deps import CurrentUser, DbDep
from luma.services.body_metrics import _ACTIVITY_FACTORS, _activity_factor, _mifflin_st_jeor_bmr
from luma.services.hae_metrics import tracker as hae_metrics_tracker
from luma.services.llm_metrics import tracker as llm_metrics_tracker

logger = logging.getLogger(__name__)
router = APIRouter()


class GoalIn(BaseModel):
    target_weight_kg: float | None = None
    target_ldl_mg_dl: int | None = None
    current_ldl_mg_dl: int | None = None
    current_ldl_drawn_at: date | None = None
    daily_calorie_target: int | None = None
    daily_sat_fat_g_max: float | None = None
    daily_soluble_fiber_g: float | None = None
    daily_protein_g_min: float | None = None
    dietary_pattern: str | None = None


@router.get("/goals")
async def get_goals(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    result = await db.execute(select(Goal).where(Goal.user_id == user.id))
    goal = result.scalar_one_or_none()
    if not goal:
        return {}
    def _f(v: Any) -> float | None:
        return float(v) if v is not None else None

    return {
        "target_weight_kg": _f(goal.target_weight_kg),
        "target_ldl_mg_dl": goal.target_ldl_mg_dl,
        "current_ldl_mg_dl": goal.current_ldl_mg_dl,
        "current_ldl_drawn_at": goal.current_ldl_drawn_at.isoformat() if goal.current_ldl_drawn_at else None,
        "daily_calorie_target": goal.daily_calorie_target,
        "daily_sat_fat_g_max": _f(goal.daily_sat_fat_g_max),
        "daily_soluble_fiber_g": _f(goal.daily_soluble_fiber_g),
        "daily_protein_g_min": _f(goal.daily_protein_g_min),
        "dietary_pattern": goal.dietary_pattern,
    }


@router.put("/goals")
async def put_goals(body: GoalIn, user: CurrentUser, db: DbDep) -> dict[str, Any]:
    values = body.model_dump(exclude_none=False)
    values["user_id"] = user.id

    stmt = insert(Goal).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id"],
        set_={k: v for k, v in values.items() if k != "user_id"},
    )
    await db.execute(stmt)
    await db.commit()
    return await get_goals(user, db)


@router.get("/goals/recommend")
async def recommend_goals(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    tz = ZoneInfo(settings.server_timezone)
    today_dt = datetime.now(tz).date()
    start_ts = datetime.combine(today_dt - timedelta(days=7), time.min, tzinfo=tz).astimezone(UTC)
    end_ts = datetime.combine(today_dt, time.min, tzinfo=tz).astimezone(UTC)

    # 7-day daily totals — use MEDIAN (percentile_cont 0.5) instead of mean so
    # outlier days from bulk HAE historical exports don't skew the result.
    # Apple Health bulk exports often include readings from multiple simultaneous
    # sources (Watch + iPhone) which inflate daily sums on affected days; the
    # median is robust to those outlier days in a way the mean is not.
    energy_result = await db.execute(
        text("""
            SELECT metric,
                   PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY daily_total) AS median_daily,
                   COUNT(*) AS day_count
            FROM (
                SELECT metric,
                       date_trunc('day', ts AT TIME ZONE 'UTC') AS day,
                       SUM(value) AS daily_total
                FROM biometrics
                WHERE user_id = :uid
                  AND metric IN ('bmr_kcal', 'active_kcal', 'steps')
                  AND ts >= :start AND ts < :end
                GROUP BY metric, day
            ) s
            GROUP BY metric
        """),
        {"uid": str(user.id), "start": start_ts, "end": end_ts},
    )
    energy_avgs: dict[str, float] = {}
    energy_days: dict[str, int] = {}
    for row in energy_result:
        energy_avgs[row.metric] = float(row.median_daily)
        energy_days[row.metric] = int(row.day_count)

    data_days_result = await db.execute(
        text("""
            SELECT COUNT(DISTINCT date_trunc('day', ts AT TIME ZONE 'UTC'))
            FROM biometrics
            WHERE user_id = :uid AND metric = 'bmr_kcal'
              AND ts >= :start AND ts < :end
        """),
        {"uid": str(user.id), "start": start_ts, "end": end_ts},
    )
    data_days = int(data_days_result.scalar() or 0)

    weight_result = await db.execute(
        text("SELECT value FROM biometrics WHERE user_id = :uid AND metric = 'weight_kg' ORDER BY ts DESC LIMIT 1"),
        {"uid": str(user.id)},
    )
    weight_row = weight_result.first()
    current_weight_kg: float | None = float(weight_row[0]) if weight_row else None

    goal_result = await db.execute(select(Goal).where(Goal.user_id == user.id))
    goal = goal_result.scalar_one_or_none()
    target_weight_kg: float | None = float(goal.target_weight_kg) if goal and goal.target_weight_kg else None
    target_ldl: int | None = goal.target_ldl_mg_dl if goal else None
    dietary_pattern: str | None = goal.dietary_pattern if goal else None

    bmr_avg = energy_avgs.get("bmr_kcal", 0.0)
    active_avg = energy_avgs.get("active_kcal", 0.0)
    steps_avg = energy_avgs.get("steps", 0.0)

    # ── Profile-driven (Mifflin–St Jeor) basis ──────────────────────────────
    # We compute TDEE from the user's profile rather than from measured watch
    # burn: Apple Watch active-energy is a known over-reporter, so a measured
    # TDEE inflates the target (the 3,000 vs 2,000 kcal complaint). The watch
    # numbers are kept only as a cross-check. The formula needs age, sex,
    # height and a current weight — without them we can't sanity-check anything,
    # so block and tell the client exactly which fields to collect.
    age: int | None = (today_dt.year - user.birth_year) if user.birth_year else None
    sex: str | None = user.biological_sex if user.biological_sex in ("male", "female") else None
    height_cm: float | None = float(user.height_cm) if user.height_cm else None

    missing_fields: list[str] = []
    if age is None:
        missing_fields.append("birth_year")
    if sex is None:
        missing_fields.append("biological_sex")
    if height_cm is None:
        missing_fields.append("height_cm")
    if current_weight_kg is None:
        missing_fields.append("weight")
    if missing_fields:
        return {"profile_incomplete": True, "missing_fields": missing_fields}

    # mypy/readability: all four are guaranteed non-None past the guard above.
    assert age is not None and sex is not None and height_cm is not None and current_weight_kg is not None

    msj_bmr = _mifflin_st_jeor_bmr(current_weight_kg, height_cm, age, sex)
    steps_days = energy_days.get("steps", 0)
    activity_factor, activity_source = _activity_factor(user.activity_level, steps_avg, steps_days)

    # Conflict = we trusted measured steps but the user's self-reported level
    # disagrees by ≥1 tier. Surface it so they can fix a stale profile setting.
    stated_factor = _ACTIVITY_FACTORS.get(user.activity_level or "")
    activity_conflict = bool(
        activity_source == "steps"
        and stated_factor is not None
        and abs(stated_factor - activity_factor) >= 0.15
    )

    formula_tdee = msj_bmr * activity_factor

    # Physiological sanity bounds — a formula TDEE outside 1,200–4,500 kcal
    # implies a bad input (e.g. a mis-entered height). Clamp and flag.
    _TDEE_MIN, _TDEE_MAX = 1_200.0, 4_500.0
    tdee_clamped = not (_TDEE_MIN <= formula_tdee <= _TDEE_MAX)
    if tdee_clamped:
        logger.warning("Formula TDEE %s out of physiological range for user %s — clamping", round(formula_tdee), user.id)
        formula_tdee = max(_TDEE_MIN, min(_TDEE_MAX, formula_tdee))

    tdee = formula_tdee

    # Watch cross-check — surface (don't use) the measured burn, and warn when
    # it runs well above the formula so the user understands the divergence.
    measured_tdee = bmr_avg + active_avg if bmr_avg > 0 else None
    watch_overreport = bool(measured_tdee and measured_tdee > formula_tdee * 1.20)

    # Calorie target
    if target_weight_kg and target_weight_kg < current_weight_kg - 1.0:
        cal_target = float(round((tdee - 500) / 50) * 50)  # ~500 kcal/day deficit ≈ 0.45 kg (1 lb)/week
        mode = "deficit"
    else:
        cal_target = float(round(tdee / 50) * 50)
        mode = "maintenance"

    # Mayo-style minimum — never recommend below the clinically advised floor.
    cal_floor = 1_500.0 if sex == "male" else 1_200.0
    cal_target = max(cal_floor, cal_target)

    # Sat fat: ACC/AHA <6% of calories for LDL reduction, <7% general
    sat_fat_pct = 0.06 if target_ldl else 0.07
    sat_fat_max = round((cal_target * sat_fat_pct / 9) * 2) / 2  # nearest 0.5 g

    # Soluble fiber: 20g for LDL management, 12g general health
    sol_fiber = 20.0 if target_ldl else 12.0

    # Protein floor based on weight and activity
    if mode == "deficit":
        protein_g: int | None = round(current_weight_kg * 1.4)
    elif steps_avg > 7500:
        protein_g = round(current_weight_kg * 1.2)
    else:
        protein_g = round(current_weight_kg * 0.8)

    basis = {
        "tdee_kcal": round(tdee),
        "tdee_source": "mifflin_st_jeor",
        "mifflin_bmr": round(msj_bmr),
        "activity_factor": activity_factor,
        "activity_source": activity_source,
        "stated_activity_level": user.activity_level,
        "activity_conflict": activity_conflict or None,
        "measured_tdee_kcal": round(measured_tdee) if measured_tdee else None,
        "bmr_7d_avg": round(bmr_avg) if bmr_avg > 0 else None,
        "active_7d_avg": round(active_avg) if active_avg > 0 else None,
        "current_weight_kg": round(current_weight_kg, 1),
        "avg_steps_7d": round(steps_avg) if steps_avg > 0 else None,
        "age": age,
        "data_days": data_days,
        "mode": mode,
        "data_quality_warning": tdee_clamped or None,
        "watch_overreport_warning": watch_overreport or None,
    }

    # LLM rationale — non-fatal, best-effort
    rationale: str | None = None
    try:
        from luma.services.llm_client import call_llm

        parts = [
            f"Mifflin–St Jeor BMR {round(msj_bmr)} kcal (age {age}, {sex}, {height_cm:.0f} cm, {current_weight_kg:.1f} kg)",
            f"activity factor {activity_factor} ({activity_source}) → maintenance TDEE {round(tdee)} kcal",
        ]
        if target_weight_kg:
            parts.append(f"target weight {target_weight_kg:.1f} kg → {mode} mode")
        if target_ldl:
            parts.append(f"LDL goal {target_ldl} mg/dL")
        if dietary_pattern:
            parts.append(f"dietary pattern: {dietary_pattern}")
        if watch_overreport and measured_tdee:
            parts.append(
                f"(Apple Watch estimated {round(measured_tdee)} kcal/day burned, but that over-reports, "
                "so the formula estimate is used instead)"
            )
        context_str = "; ".join(parts)

        rec_str = (
            f"{int(cal_target)} kcal/day, {sat_fat_max}g sat fat max, "
            f"{sol_fiber}g soluble fiber"
            + (f", {protein_g}g protein floor" if protein_g else "")
        )

        resp = await call_llm(
            primary_model=settings.meal_planner_model,
            fallback_model=settings.meal_planner_fallback_model,
            trigger="goal_rationale",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a registered dietitian assistant. Given a user's profile and "
                        "the nutrition targets calculated from it, write exactly 2-3 sentences explaining "
                        "why these specific targets make sense for this person. Be precise — cite actual "
                        "numbers. No markdown, no bullet points, no medical disclaimers."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Context: {context_str}\nRecommended targets: {rec_str}",
                },
            ],
            temperature=0.3,
            # No max_tokens — matching the other agents (insight_narrator, coach,
            # meal_planner). A tight ceiling was what clipped reasoning models
            # mid-thought; letting the call finish naturally is both the fix and
            # the cheap option, since a 2-3 sentence answer is only ~80 tokens.
            timeout=30.0,
        )
        rationale = (resp.choices[0].message.content or "").strip() or None
        # If the model still stops mid-sentence (e.g. "…A daily target of 4,1"),
        # trim back to the last complete sentence. Only null the rationale out
        # when there's genuinely no complete sentence to keep — otherwise a
        # perfectly good paragraph that simply lacked terminal punctuation (or
        # came back from a reasoning model) would vanish, which is the bug we're
        # fixing here.
        if rationale and (
            getattr(resp.choices[0], "finish_reason", None) == "length"
            or rationale[-1] not in ".!?"
        ):
            cutoff = max(rationale.rfind(c) for c in ".!?")
            if cutoff != -1:
                rationale = rationale[: cutoff + 1].strip()
    except Exception:
        logger.warning("Goal recommendation rationale LLM call failed — omitting rationale")

    return {
        "daily_calorie_target": int(cal_target),
        "daily_sat_fat_g_max": sat_fat_max,
        "daily_soluble_fiber_g": sol_fiber,
        "daily_protein_g_min": protein_g,
        "basis": basis,
        "rationale": rationale,
    }


class PrefIn(BaseModel):
    kind: str
    value: str


@router.get("/preferences")
async def get_preferences(user: CurrentUser, db: DbDep) -> list[dict]:
    result = await db.execute(select(Preference).where(Preference.user_id == user.id))
    return [{"kind": p.kind, "value": p.value} for p in result.scalars()]


@router.post("/preferences")
async def add_preference(body: PrefIn, user: CurrentUser, db: DbDep) -> dict:
    pref = Preference(user_id=user.id, kind=body.kind, value=body.value)
    db.add(pref)
    await db.commit()
    return {"kind": pref.kind, "value": pref.value}


@router.delete("/preferences/{kind}/{value}")
async def delete_preference(kind: str, value: str, user: CurrentUser, db: DbDep) -> dict:
    await db.execute(
        delete(Preference).where(
            Preference.user_id == user.id,
            Preference.kind == kind,
            Preference.value == value,
        )
    )
    await db.commit()
    return {"detail": "deleted"}


MEASUREMENT_PREF_KIND = "measurement_system"
MEASUREMENT_SYSTEMS = ("metric", "imperial")


class MeasurementSettingsOut(BaseModel):
    system: Literal["metric", "imperial"]


class MeasurementSettingsIn(BaseModel):
    system: Literal["metric", "imperial"]


@router.get("/settings/measurements", response_model=MeasurementSettingsOut)
async def get_measurement_settings(user: CurrentUser, db: DbDep) -> MeasurementSettingsOut:
    result = await db.execute(
        select(Preference.value).where(
            Preference.user_id == user.id,
            Preference.kind == MEASUREMENT_PREF_KIND,
            Preference.value.in_(MEASUREMENT_SYSTEMS),
        )
    )
    system = cast(Literal["metric", "imperial"], result.scalar_one_or_none() or "metric")
    return MeasurementSettingsOut(system=system)


@router.put("/settings/measurements", response_model=MeasurementSettingsOut)
async def put_measurement_settings(
    body: MeasurementSettingsIn,
    user: CurrentUser,
    db: DbDep,
) -> MeasurementSettingsOut:
    await db.execute(
        delete(Preference).where(
            Preference.user_id == user.id,
            Preference.kind == MEASUREMENT_PREF_KIND,
        )
    )
    db.add(Preference(user_id=user.id, kind=MEASUREMENT_PREF_KIND, value=body.system))
    await db.commit()
    return MeasurementSettingsOut(system=body.system)


LLM_PRICING_PREF_KIND = "llm_pricing_override"


@router.get("/settings/ai-pricing-overrides")
async def get_ai_pricing_overrides(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    result = await db.execute(
        select(Preference.value).where(
            Preference.user_id == user.id,
            Preference.kind == LLM_PRICING_PREF_KIND,
        )
    )
    val = result.scalar_one_or_none()
    if not val:
        return {}
    try:
        import json
        return json.loads(val)
    except Exception:
        return {}


@router.put("/settings/ai-pricing-overrides")
async def put_ai_pricing_overrides(
    body: dict[str, Any],
    user: CurrentUser,
    db: DbDep,
) -> dict[str, Any]:
    import json
    await db.execute(
        delete(Preference).where(
            Preference.user_id == user.id,
            Preference.kind == LLM_PRICING_PREF_KIND,
        )
    )
    if body:
        db.add(Preference(user_id=user.id, kind=LLM_PRICING_PREF_KIND, value=json.dumps(body)))
    await db.commit()
    return body


@router.get("/settings/hae-metrics")
async def get_hae_metrics(user: CurrentUser) -> dict[str, Any]:
    return await hae_metrics_tracker.snapshot()


@router.get("/settings/llm-metrics")
async def get_llm_metrics(user: CurrentUser) -> dict[str, Any]:
    return await llm_metrics_tracker.snapshot()


@router.get("/settings/ai-config")
async def get_ai_config(user: CurrentUser) -> dict[str, Any]:
    return {
        "models": {
            "meal_planner": {
                "primary": settings.meal_planner_model,
                "fallback": settings.meal_planner_fallback_model or None,
            },
            "coach_agent": {
                "primary": settings.coach_model,
                "fallback": settings.coach_fallback_model or None,
            },
            "food_extractor": {
                "primary": settings.food_extractor_model,
                "fallback": settings.food_extractor_fallback_model or None,
            },
            "vision_classifier": {
                "primary": settings.vision_classifier_model,
                "fallback": settings.vision_classifier_fallback_model or None,
            },
            "insight_narrator": {
                "primary": settings.insight_narrator_model,
                "fallback": settings.insight_narrator_fallback_model or None,
            },
            "recipe_importer": {
                "primary": settings.recipe_import_model,
                "fallback": settings.recipe_import_fallback_model or None,
            },
        },
        "endpoints": {
            "local_ai_api_base": settings.local_ai_api_base or None,
            "whisper_url": settings.whisper_url or None,
        }
    }



class HaeImportOut(BaseModel):
    token: str
    app_secret: str


@router.get("/settings/hae-import", response_model=HaeImportOut)
async def get_hae_import(user: CurrentUser) -> HaeImportOut:
    return HaeImportOut(token=str(user.hae_import_token), app_secret=settings.hae_shared_secret)


@router.post("/settings/hae-import/regenerate", response_model=HaeImportOut)
async def regenerate_hae_import_token(user: CurrentUser, db: DbDep) -> HaeImportOut:
    new_token = uuid.uuid4()
    await db.execute(update(User).where(User.id == user.id).values(hae_import_token=new_token))
    await db.commit()
    return HaeImportOut(token=str(new_token), app_secret=settings.hae_shared_secret)
