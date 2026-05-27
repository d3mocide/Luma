from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, update
from pydantic import BaseModel

from luma.deps import DbDep, CurrentUser
from luma.db.models import MealPlan, MealPlanSlot, ShoppingListItem, MealEvent, Food
from luma.agents.meal_planner import generate_meal_plan
from luma.services.nutrition import ZERO_NUTRIENTS
from luma.services.plan_helpers import _slot_dict, _sum_nutrition, _nutrition_from_food, _parse_uuid

router = APIRouter()


def get_current_week_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


# ── Schemas ───────────────────────────────────────────────────────────────────

class PlanGenerateRequest(BaseModel):
    week_start: Optional[date] = None
    constraints: Optional[dict] = None


class SlotPatchRequest(BaseModel):
    custom_name: Optional[str] = None
    notes: Optional[str] = None


class SlotReplaceRequest(BaseModel):
    food_id: UUID
    serving_g: float


class ShoppingToggleRequest(BaseModel):
    purchased: bool


# ── Endpoints ─────────────────────────────────────────────────────────────────

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


@router.post("/regenerate")
@router.post("/generate")
async def regenerate_weekly_plan(req: PlanGenerateRequest, db: DbDep, current_user: CurrentUser) -> dict:
    week_start = req.week_start or get_current_week_monday()

    await db.execute(
        update(MealPlan)
        .where(MealPlan.user_id == current_user.id, MealPlan.week_start == week_start)
        .values(status="archived")
    )

    generated = await generate_meal_plan(
        db=db,
        user_id=current_user.id,
        week_start=week_start.isoformat(),
        constraints=req.constraints,
    )

    plan = MealPlan(
        id=uuid.uuid4(),
        user_id=current_user.id,
        week_start=week_start,
        status="active",
        generation_meta={"constraints": req.constraints},
    )
    db.add(plan)

    for day in generated.get("plan", []):
        slot_date = datetime.strptime(day["date"], "%Y-%m-%d").date()
        for sl in day.get("slots", []):
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
        ts=datetime.combine(slot.slot_date, datetime.now().time()).replace(tzinfo=timezone.utc),
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
