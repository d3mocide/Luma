from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID
import uuid

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sqlfunc

from luma.deps import DbDep, CurrentUser
from luma.db.models import MealJournalEntry, MealEvent

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class JournalCreateRequest(BaseModel):
    meal_event_id: Optional[UUID] = None
    meal_name: str
    logged_at: datetime
    energy: int = Field(ge=1, le=5)
    digestion: int = Field(ge=1, le=5)
    mood: int = Field(ge=1, le=5)
    satiety: int = Field(ge=1, le=5)
    symptoms: list[str] = []
    notes: Optional[str] = None


def _entry_dict(e: MealJournalEntry) -> dict:
    return {
        "id": str(e.id),
        "meal_event_id": str(e.meal_event_id) if e.meal_event_id else None,
        "meal_name": e.meal_name,
        "logged_at": e.logged_at.isoformat(),
        "energy": e.energy,
        "digestion": e.digestion,
        "mood": e.mood,
        "satiety": e.satiety,
        "symptoms": e.symptoms or [],
        "notes": e.notes,
        "created_at": e.created_at.isoformat(),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_entries(db: DbDep, current_user: CurrentUser, limit: int = 50) -> dict:
    rows = list((await db.execute(
        select(MealJournalEntry)
        .where(MealJournalEntry.user_id == current_user.id)
        .order_by(MealJournalEntry.created_at.desc())
        .limit(min(limit, 200))
    )).scalars().all())
    return {"entries": [_entry_dict(e) for e in rows]}


@router.post("")
async def create_entry(req: JournalCreateRequest, db: DbDep, current_user: CurrentUser) -> dict:
    entry = MealJournalEntry(
        id=uuid.uuid4(),
        user_id=current_user.id,
        meal_event_id=req.meal_event_id,
        meal_name=req.meal_name,
        logged_at=req.logged_at,
        energy=req.energy,
        digestion=req.digestion,
        mood=req.mood,
        satiety=req.satiety,
        symptoms=req.symptoms,
        notes=req.notes,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _entry_dict(entry)


@router.get("/pending")
async def get_pending(db: DbDep, current_user: CurrentUser) -> dict:
    """Meals logged 30–90 min ago that have no journal entry."""
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=90)
    window_end = now - timedelta(minutes=30)

    meal_events = list((await db.execute(
        select(MealEvent)
        .where(
            MealEvent.user_id == current_user.id,
            MealEvent.ts >= window_start,
            MealEvent.ts <= window_end,
        )
        .order_by(MealEvent.ts.desc())
    )).scalars().all())

    if not meal_events:
        return {"pending": []}

    event_ids = [e.id for e in meal_events]

    journalled_ids = set(
        row[0] for row in (await db.execute(
            select(MealJournalEntry.meal_event_id)
            .where(
                MealJournalEntry.user_id == current_user.id,
                MealJournalEntry.meal_event_id.in_(event_ids),
            )
        )).all()
    )

    pending = []
    for e in meal_events:
        if e.id in journalled_ids:
            continue
        items = e.items or []
        headline = items[0].get("name", "your meal") if items else "your meal"
        pending.append({
            "meal_event_id": str(e.id),
            "meal_name": headline,
            "logged_at": e.ts.isoformat(),
            "slot": e.slot,
        })

    return {"pending": pending}


@router.get("/correlations")
async def get_correlations(db: DbDep, current_user: CurrentUser) -> dict:
    """Average scores grouped by meal name (top 15 most-logged meals)."""
    rows = (await db.execute(
        select(
            MealJournalEntry.meal_name,
            sqlfunc.count(MealJournalEntry.id).label("count"),
            sqlfunc.avg(MealJournalEntry.energy).label("avg_energy"),
            sqlfunc.avg(MealJournalEntry.digestion).label("avg_digestion"),
            sqlfunc.avg(MealJournalEntry.mood).label("avg_mood"),
            sqlfunc.avg(MealJournalEntry.satiety).label("avg_satiety"),
        )
        .where(MealJournalEntry.user_id == current_user.id)
        .group_by(MealJournalEntry.meal_name)
        .order_by(sqlfunc.count(MealJournalEntry.id).desc())
        .limit(15)
    )).all()

    return {
        "correlations": [
            {
                "meal_name": r.meal_name,
                "count": r.count,
                "avg_energy": round(float(r.avg_energy), 1),
                "avg_digestion": round(float(r.avg_digestion), 1),
                "avg_mood": round(float(r.avg_mood), 1),
                "avg_satiety": round(float(r.avg_satiety), 1),
            }
            for r in rows
        ]
    }
