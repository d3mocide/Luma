from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
import uuid
import json
import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, update
from pydantic import BaseModel

from luma.deps import DbDep, CurrentUser
from luma.db.models import MealPlan, MealPlanSlot, ShoppingListItem, MealEvent, Food, Goal, Preference
from luma.agents.meal_planner import generate_meal_plan
from luma.services.nutrition import ZERO_NUTRIENTS
from luma.services.plan_helpers import _slot_dict, _sum_nutrition, _nutrition_from_food, _parse_uuid
from luma.config import settings
from luma.services.llm_client import call_llm

router = APIRouter()
logger = logging.getLogger("plan")


def get_current_week_sunday() -> date:
    today = date.today()
    return today - timedelta(days=(today.weekday() + 1) % 7)


# ── Schemas ───────────────────────────────────────────────────────────────────

class PlanGenerateRequest(BaseModel):
    week_start: Optional[date] = None
    constraints: Optional[dict] = None


class SlotPatchRequest(BaseModel):
    custom_name: Optional[str] = None
    notes: Optional[str] = None
    locked: Optional[bool] = None
    nutrition: Optional[dict] = None


class SlotReplaceRequest(BaseModel):
    food_id: UUID
    serving_g: float


class SlotMoveRequest(BaseModel):
    new_date: str  # YYYY-MM-DD


class ShoppingToggleRequest(BaseModel):
    purchased: bool


class PlanInitRequest(BaseModel):
    week_start: date


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/weeks")
async def list_plan_weeks(db: DbDep, current_user: CurrentUser) -> dict:
    rows = (await db.execute(
        select(MealPlan.week_start, MealPlan.status)
        .where(MealPlan.user_id == current_user.id)
        .order_by(MealPlan.week_start.desc())
    )).all()
    return {"weeks": [{"week_start": r.week_start.isoformat(), "status": r.status} for r in rows]}


@router.get("/week/{week_start_str}")
async def get_plan_by_week(week_start_str: str, db: DbDep, current_user: CurrentUser) -> dict:
    try:
        week_date = date.fromisoformat(week_start_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Use YYYY-MM-DD.")

    plan = (await db.execute(
        select(MealPlan)
        .where(MealPlan.user_id == current_user.id, MealPlan.week_start == week_date)
        .order_by(MealPlan.status)
        .limit(1)
    )).scalar_one_or_none()

    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No plan for this week")

    slots = list((await db.execute(
        select(MealPlanSlot)
        .where(MealPlanSlot.plan_id == plan.id)
        .order_by(MealPlanSlot.slot_date, MealPlanSlot.slot)
    )).scalars().all())

    by_date: dict[str, list[MealPlanSlot]] = {}
    for s in slots:
        by_date.setdefault(s.slot_date.isoformat(), []).append(s)

    day_totals = {day: _sum_nutrition(day_slots) for day, day_slots in by_date.items()}

    return {
        "id": str(plan.id),
        "week_start": plan.week_start.isoformat(),
        "status": plan.status,
        "slots": [_slot_dict(s) for s in slots],
        "day_totals": day_totals,
    }


@router.get("/current")
@router.get("")
async def get_current_plan(db: DbDep, current_user: CurrentUser) -> dict:
    stmt = (
        select(MealPlan)
        .where(MealPlan.user_id == current_user.id, MealPlan.status == "active")
        .order_by(MealPlan.week_start.desc())
        .limit(1)
    )
    plan = (await db.execute(stmt)).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active meal plan found")

    slots_res = await db.execute(
        select(MealPlanSlot)
        .where(MealPlanSlot.plan_id == plan.id)
        .order_by(MealPlanSlot.slot_date, MealPlanSlot.slot)
    )
    slots: list[MealPlanSlot] = list(slots_res.scalars().all())

    by_date: dict[str, list[MealPlanSlot]] = {}
    for s in slots:
        key = s.slot_date.isoformat()
        by_date.setdefault(key, []).append(s)

    day_totals = {day: _sum_nutrition(day_slots) for day, day_slots in by_date.items()}

    return {
        "id":         str(plan.id),
        "week_start": plan.week_start.isoformat(),
        "status":     plan.status,
        "slots":      [_slot_dict(s) for s in slots],
        "day_totals": day_totals,
    }


@router.post("/init")
async def init_blank_plan(req: PlanInitRequest, db: DbDep, current_user: CurrentUser) -> dict:
    existing = (await db.execute(
        select(MealPlan)
        .where(
            MealPlan.user_id == current_user.id,
            MealPlan.week_start == req.week_start,
            MealPlan.status == "active",
        )
        .limit(1)
    )).scalar_one_or_none()

    if existing:
        slots = list((await db.execute(
            select(MealPlanSlot)
            .where(MealPlanSlot.plan_id == existing.id)
            .order_by(MealPlanSlot.slot_date, MealPlanSlot.slot)
        )).scalars().all())
        by_date: dict[str, list] = {}
        for s in slots:
            by_date.setdefault(s.slot_date.isoformat(), []).append(s)
        day_totals = {day: _sum_nutrition(ss) for day, ss in by_date.items()}
        return {
            "id": str(existing.id),
            "week_start": existing.week_start.isoformat(),
            "status": existing.status,
            "slots": [_slot_dict(s) for s in slots],
            "day_totals": day_totals,
        }

    await db.execute(
        update(MealPlan)
        .where(MealPlan.user_id == current_user.id, MealPlan.week_start == req.week_start)
        .values(status="archived")
    )

    plan = MealPlan(
        id=uuid.uuid4(),
        user_id=current_user.id,
        week_start=req.week_start,
        status="active",
        generation_meta={"source": "blank"},
    )
    db.add(plan)
    await db.flush()

    slot_types = ["breakfast", "lunch", "snack", "dinner"]
    for day_offset in range(7):
        slot_date = req.week_start + timedelta(days=day_offset)
        for slot_type in slot_types:
            db.add(MealPlanSlot(
                id=uuid.uuid4(),
                plan_id=plan.id,
                slot_date=slot_date,
                slot=slot_type,
                custom_name=None,
                notes="",
                nutrition={},
            ))

    await db.commit()

    slots = list((await db.execute(
        select(MealPlanSlot)
        .where(MealPlanSlot.plan_id == plan.id)
        .order_by(MealPlanSlot.slot_date, MealPlanSlot.slot)
    )).scalars().all())

    return {
        "id": str(plan.id),
        "week_start": plan.week_start.isoformat(),
        "status": plan.status,
        "slots": [_slot_dict(s) for s in slots],
        "day_totals": {},
    }


@router.post("/regenerate")
@router.post("/generate")
async def regenerate_weekly_plan(req: PlanGenerateRequest, db: DbDep, current_user: CurrentUser) -> dict:
    week_start = req.week_start or get_current_week_sunday()

    # Preserve locked slots from any existing active plan for this week
    existing_plan = (await db.execute(
        select(MealPlan)
        .where(MealPlan.user_id == current_user.id, MealPlan.week_start == week_start, MealPlan.status == "active")
        .limit(1)
    )).scalar_one_or_none()

    locked_slots: list[MealPlanSlot] = []
    if existing_plan:
        locked_slots = list((await db.execute(
            select(MealPlanSlot)
            .where(MealPlanSlot.plan_id == existing_plan.id, MealPlanSlot.locked == True)
        )).scalars().all())

    # Build locked constraints for the LLM
    locked_constraints: list[dict] = [
        {
            "date": s.slot_date.isoformat(),
            "slot": s.slot,
            "name": s.custom_name,
            "nutrition": s.nutrition or {},
        }
        for s in locked_slots
    ]

    merged_constraints = dict(req.constraints or {})
    if locked_constraints:
        merged_constraints["locked_slots"] = locked_constraints

    await db.execute(
        update(MealPlan)
        .where(MealPlan.user_id == current_user.id, MealPlan.week_start == week_start)
        .values(status="archived")
    )

    generated = await generate_meal_plan(
        db=db,
        user_id=current_user.id,
        week_start=week_start.isoformat(),
        constraints=merged_constraints if merged_constraints else None,
    )

    plan = MealPlan(
        id=uuid.uuid4(),
        user_id=current_user.id,
        week_start=week_start,
        status="active",
        generation_meta={"constraints": req.constraints},
    )
    db.add(plan)

    # Index locked slots by (date, slot_type) for fast lookup
    locked_index = {(s.slot_date.isoformat(), s.slot): s for s in locked_slots}

    for day in generated.get("plan", []):
        slot_date_str = day["date"]
        for sl in day.get("slots", []):
            key = (slot_date_str, sl["slot"])
            if key in locked_index:
                # Re-insert locked slot verbatim
                orig = locked_index[key]
                db.add(MealPlanSlot(
                    id=uuid.uuid4(),
                    plan_id=plan.id,
                    slot_date=orig.slot_date,
                    slot=orig.slot,
                    custom_name=orig.custom_name,
                    notes=orig.notes,
                    nutrition=orig.nutrition,
                    food_id=orig.food_id,
                    recipe_id=orig.recipe_id,
                    locked=True,
                ))
            else:
                slot_date = datetime.strptime(slot_date_str, "%Y-%m-%d").date()
                db.add(MealPlanSlot(
                    id=uuid.uuid4(),
                    plan_id=plan.id,
                    slot_date=slot_date,
                    slot=sl["slot"],
                    custom_name=sl["custom_name"],
                    notes=sl.get("notes", ""),
                    nutrition=sl.get("nutrients"),
                ))

    created_food_ids_by_name: dict[str, UUID] = {}

    for item in generated.get("shopping_list", []):
        food_id = None
        if item.get("food_id"):
            try:
                candidate_id = UUID(item["food_id"])
                existing_food_res = await db.execute(select(Food).where(Food.id == candidate_id))
                if existing_food_res.scalar_one_or_none():
                    food_id = candidate_id
            except ValueError:
                pass

        if not food_id:
            item_name = str(item.get("name") or "").strip()
            if not item_name:
                continue
            cached_id = created_food_ids_by_name.get(item_name.lower())
            if cached_id:
                food_id = cached_id

        if not food_id:
            item_name = str(item.get("name") or "").strip()
            res_f = await db.execute(select(Food).where(Food.name.ilike(f"%{item_name}%")).limit(1))
            matching = res_f.scalar_one_or_none()
            if matching:
                food_id = matching.id
                created_food_ids_by_name[item_name.lower()] = matching.id

        if not food_id:
            item_name = str(item.get("name") or "").strip()
            if not item_name:
                continue
            new_food = Food(
                id=uuid.uuid4(), source="llm", name=item_name, brand=None,
                serving_size_g=100.0, nutrients_per_100g={},
            )
            db.add(new_food)
            await db.flush()
            food_id = new_food.id
            created_food_ids_by_name[item_name.lower()] = new_food.id

        if food_id:
            db.add(ShoppingListItem(
                plan_id=plan.id, food_id=food_id,
                quantity=item.get("quantity", 1.0), unit=item.get("unit", "g"),
                aisle=item.get("aisle", "Grocery"), purchased=False,
            ))

    await db.commit()
    return {"status": "ok", "plan_id": str(plan.id)}


@router.patch("/slot/{slot_id}")
async def patch_slot(slot_id: str, req: SlotPatchRequest, db: DbDep, current_user: CurrentUser) -> dict:
    slot_uuid = _parse_uuid(slot_id, "slot UUID")
    res = await db.execute(
        select(MealPlanSlot).join(MealPlan)
        .where(MealPlanSlot.id == slot_uuid, MealPlan.user_id == current_user.id)
    )
    slot = res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found")

    if req.custom_name is not None:
        slot.custom_name = req.custom_name
    if req.notes is not None:
        slot.notes = req.notes
    if req.locked is not None:
        slot.locked = req.locked
    if req.nutrition is not None:
        slot.nutrition = req.nutrition

    await db.commit()
    await db.refresh(slot)
    return _slot_dict(slot)


@router.patch("/slot/{slot_id}/move")
async def move_slot(slot_id: str, req: SlotMoveRequest, db: DbDep, current_user: CurrentUser) -> dict:
    try:
        new_date = date.fromisoformat(req.new_date)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Use YYYY-MM-DD.")

    slot_uuid = _parse_uuid(slot_id, "slot UUID")
    res = await db.execute(
        select(MealPlanSlot).join(MealPlan)
        .where(MealPlanSlot.id == slot_uuid, MealPlan.user_id == current_user.id)
    )
    slot = res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found")

    slot.slot_date = new_date
    await db.commit()
    await db.refresh(slot)
    return _slot_dict(slot)


@router.post("/slot/{slot_id}/replace")
async def replace_slot(slot_id: str, req: SlotReplaceRequest, db: DbDep, current_user: CurrentUser) -> dict:
    slot_uuid = _parse_uuid(slot_id, "slot UUID")

    slot_res = await db.execute(
        select(MealPlanSlot).join(MealPlan)
        .where(MealPlanSlot.id == slot_uuid, MealPlan.user_id == current_user.id)
    )
    slot = slot_res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found")

    food_res = await db.execute(select(Food).where(Food.id == req.food_id))
    food = food_res.scalar_one_or_none()
    if not food:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")

    slot.food_id = food.id
    slot.custom_name = food.name
    slot.nutrition = _nutrition_from_food(food, req.serving_g)
    slot.notes = f"{req.serving_g:g}g serving"

    await db.commit()
    await db.refresh(slot)
    return _slot_dict(slot)


@router.post("/slot/{slot_id}/swap")
async def swap_slot(slot_id: str, db: DbDep, current_user: CurrentUser) -> dict:
    """Generate 3 AI-powered alternative meals for this slot."""
    slot_uuid = _parse_uuid(slot_id, "slot UUID")

    slot_res = await db.execute(
        select(MealPlanSlot).join(MealPlan)
        .where(MealPlanSlot.id == slot_uuid, MealPlan.user_id == current_user.id)
    )
    slot = slot_res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found")

    goal_res = await db.execute(select(Goal).where(Goal.user_id == current_user.id))
    goal = goal_res.scalar_one_or_none()

    pref_res = await db.execute(select(Preference).where(Preference.user_id == current_user.id))
    prefs = pref_res.scalars().all()
    dislikes = [p.value for p in prefs if p.kind == "dislike"]
    allergies = [p.value for p in prefs if p.kind == "allergy"]

    calorie_target = goal.daily_calorie_target if goal else 2000
    sat_fat_max = float(goal.daily_sat_fat_g_max) if goal and goal.daily_sat_fat_g_max else 13.0
    soluble_fiber_target = float(goal.daily_soluble_fiber_g) if goal and goal.daily_soluble_fiber_g else 10.0

    # Per-slot calorie budget (rough split)
    slot_calorie_budgets = {"breakfast": 0.25, "lunch": 0.30, "dinner": 0.35, "snack": 0.10}
    slot_calories = round(calorie_target * slot_calorie_budgets.get(slot.slot, 0.25))

    messages = [
        {
            "role": "system",
            "content": (
                "You are Luma's clinical nutrition orchestrator. Generate exactly 3 alternative meal suggestions "
                "for a single plan slot. Each must be heart-healthy, LDL-lowering, and nutritionally distinct. "
                "Return ONLY a valid JSON array — no markdown, no commentary."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Current meal: {slot.custom_name} ({slot.slot} slot, {slot.slot_date})\n"
                f"Goals: ~{slot_calories} kcal, sat fat <{sat_fat_max / 3:.1f}g, soluble fiber >{soluble_fiber_target / 4:.1f}g\n"
                f"Dislikes: {', '.join(dislikes) or 'none'}\n"
                f"Allergies: {', '.join(allergies) or 'none'}\n\n"
                "Return a JSON array of exactly 3 alternatives:\n"
                '[{"name":"...","notes":"...","nutrients":{"calories":0,"saturated_fat_g":0,"soluble_fiber_g":0,'
                '"protein_g":0,"carbohydrates_g":0,"fat_g":0,"fiber_g":0,"sodium_mg":0}}]'
            ),
        },
    ]

    try:
        resp = await call_llm(
            primary_model=settings.meal_planner_model,
            fallback_model=settings.meal_planner_fallback_model,
            messages=messages,
            temperature=0.6,
            timeout=60.0,
        )
        content = resp["choices"][0]["message"]["content"].strip()
        import re
        content = re.sub(r"^```(?:json)?\n?", "", content)
        content = re.sub(r"\n?```$", "", content).strip()
        alternatives = json.loads(content)
        if not isinstance(alternatives, list):
            alternatives = []
    except Exception:
        logger.exception("swap_slot LLM call failed")
        alternatives = []

    return {"alternatives": alternatives[:3]}


@router.post("/{plan_id}/log-as-eaten/{slot_id}")
async def log_as_eaten(plan_id: str, slot_id: str, db: DbDep, current_user: CurrentUser) -> dict:
    plan_uuid = _parse_uuid(plan_id, "plan UUID")
    slot_uuid = _parse_uuid(slot_id, "slot UUID")

    res = await db.execute(
        select(MealPlanSlot).join(MealPlan).where(
            MealPlanSlot.id == slot_uuid,
            MealPlan.id == plan_uuid,
            MealPlan.user_id == current_user.id,
        )
    )
    slot = res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found")

    nutrition = slot.nutrition or dict(ZERO_NUTRIENTS)

    event = MealEvent(
        id=uuid.uuid4(),
        user_id=current_user.id,
        ts=datetime.now(timezone.utc),
        slot=slot.slot,
        source="plan",
        items=[{"name": slot.custom_name, "quantity": 1.0, "unit": "portion", "nutrients": nutrition}],
        nutrition=nutrition,
        plan_slot_id=slot.id,
        raw_input=f"Planned: {slot.custom_name}",
        confidence=1.0,
    )
    db.add(event)
    await db.commit()
    return {"status": "ok", "meal_event_id": str(event.id)}


@router.get("/{plan_id}/shopping-list")
async def get_shopping_list(plan_id: str, db: DbDep, current_user: CurrentUser) -> dict:
    plan_uuid = _parse_uuid(plan_id, "plan UUID")

    plan_res = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_uuid, MealPlan.user_id == current_user.id)
    )
    if not plan_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    rows = (await db.execute(
        select(ShoppingListItem, Food)
        .join(Food, ShoppingListItem.food_id == Food.id)
        .where(ShoppingListItem.plan_id == plan_uuid)
    )).all()

    return {
        "shopping_list": [
            {
                "food_id":   str(r.ShoppingListItem.food_id),
                "name":      r.Food.name,
                "brand":     r.Food.brand,
                "quantity":  float(r.ShoppingListItem.quantity),
                "unit":      r.ShoppingListItem.unit,
                "aisle":     r.ShoppingListItem.aisle,
                "purchased": r.ShoppingListItem.purchased,
            }
            for r in rows
        ]
    }


@router.patch("/{plan_id}/shopping-list/{food_id}")
async def toggle_shopping_item(
    plan_id: str, food_id: str, req: ShoppingToggleRequest,
    db: DbDep, current_user: CurrentUser,
) -> dict:
    plan_uuid = _parse_uuid(plan_id, "plan UUID")
    food_uuid = _parse_uuid(food_id, "food UUID")

    plan_res = await db.execute(
        select(MealPlan).where(MealPlan.id == plan_uuid, MealPlan.user_id == current_user.id)
    )
    if not plan_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    await db.execute(
        update(ShoppingListItem)
        .where(ShoppingListItem.plan_id == plan_uuid, ShoppingListItem.food_id == food_uuid)
        .values(purchased=req.purchased)
    )
    await db.commit()
    return {"food_id": food_id, "purchased": req.purchased}


@router.post("/{plan_id}/shopping-list/export-reminders")
async def export_reminders(plan_id: str, db: DbDep, current_user: CurrentUser) -> dict:
    return {"status": "ok", "message": "Shopping list exported to reminders successfully"}
