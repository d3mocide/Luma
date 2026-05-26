from typing import Optional, List, Dict, Any
from uuid import UUID
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy import select
from pydantic import BaseModel

from luma.deps import DbDep, CurrentUser
from luma.db.models import Food, MealEvent
from luma.services import off_client, whisper_client
from luma.services.nutrition import aggregate_items
from luma.agents import food_extractor

router = APIRouter()


class BarcodeLookupRequest(BaseModel):
    barcode: str


class MealEventCreate(BaseModel):
    ts: Optional[datetime] = None
    slot: str  # "breakfast", "lunch", "dinner", "snack"
    source: str  # "voice", "barcode", "manual"
    items: List[Dict[str, Any]]
    nutrition: Dict[str, Any]
    plan_slot_id: Optional[UUID] = None
    raw_input: Optional[str] = None
    confidence: Optional[float] = None


class MealEventUpdate(BaseModel):
    slot: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    nutrition: Optional[Dict[str, Any]] = None
    plan_slot_id: Optional[UUID] = None
    ts: Optional[datetime] = None


@router.post("/meal/barcode")
async def log_meal_barcode(
    req: BarcodeLookupRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    barcode = req.barcode.strip()
    if not barcode:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Barcode cannot be empty",
        )
    
    # 1. Search locally for cached off food item
    source_id = f"off_{barcode}"
    stmt = select(Food).where(Food.source_id == source_id)
    res = await db.execute(stmt)
    food = res.scalar_one_or_none()
    
    if food:
        return {
            "id": str(food.id),
            "source": food.source,
            "source_id": food.source_id,
            "name": food.name,
            "brand": food.brand,
            "serving_size_g": float(food.serving_size_g or 100.0),
            "nutrients_per_100g": food.nutrients_per_100g,
            "tags": food.tags or [],
        }
        
    # 2. Fall back to Open Food Facts
    off_data = await off_client.lookup_barcode(barcode)
    if not off_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found in Open Food Facts database",
        )
        
    # 3. Cache the product in the local foods table
    food = Food(
        id=uuid.uuid4(),
        source="off",
        source_id=source_id,
        name=off_data["name"],
        brand=off_data["brand"],
        serving_size_g=off_data["serving_size_g"],
        nutrients_per_100g=off_data["nutrients_per_100g"],
        tags=off_data["tags"],
        created_by=None,
    )
    db.add(food)
    await db.commit()
    await db.refresh(food)
    
    return {
        "id": str(food.id),
        "source": food.source,
        "source_id": food.source_id,
        "name": food.name,
        "brand": food.brand,
        "serving_size_g": float(food.serving_size_g or 100.0),
        "nutrients_per_100g": food.nutrients_per_100g,
        "tags": food.tags or [],
    }


@router.post("/meal/voice")
async def log_meal_voice(
    db: DbDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
) -> dict:
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty audio file provided",
        )
        
    # 1. Transcribe audio to text
    transcription = await whisper_client.transcribe(audio_bytes, filename=file.filename)
    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to transcribe audio or no voice detected",
        )
        
    # 2. Extract foods and nutrients using the food extractor agent
    extracted_items = await food_extractor.extract_foods_from_text(transcription)

    return {
        "raw_input": transcription,
        "items": extracted_items,
        "nutrition": aggregate_items(extracted_items),
        "confidence": 0.90,
    }


@router.post("/meal")
async def log_meal(
    req: MealEventCreate,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    ts = req.ts or datetime.now(timezone.utc)
    event = MealEvent(
        id=uuid.uuid4(),
        user_id=current_user.id,
        ts=ts,
        slot=req.slot,
        source=req.source,
        items=req.items,
        nutrition=req.nutrition,
        plan_slot_id=req.plan_slot_id,
        raw_input=req.raw_input,
        confidence=req.confidence,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    
    return {
        "id": str(event.id),
        "user_id": str(event.user_id),
        "ts": event.ts.isoformat(),
        "slot": event.slot,
        "source": event.source,
        "items": event.items,
        "nutrition": event.nutrition,
        "plan_slot_id": str(event.plan_slot_id) if event.plan_slot_id else None,
        "raw_input": event.raw_input,
        "confidence": float(event.confidence) if event.confidence is not None else None,
    }


@router.patch("/meal/{meal_id}")
async def patch_meal(
    meal_id: str,
    req: MealEventUpdate,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    try:
        meal_uuid = uuid.UUID(meal_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid meal UUID format",
        )
        
    stmt = select(MealEvent).where(MealEvent.user_id == current_user.id, MealEvent.id == meal_uuid)
    res = await db.execute(stmt)
    event = res.scalar_one_or_none()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal log not found",
        )
        
    if req.slot is not None:
        event.slot = req.slot
    if req.items is not None:
        event.items = req.items
    if req.nutrition is not None:
        event.nutrition = req.nutrition
    if req.plan_slot_id is not None:
        event.plan_slot_id = req.plan_slot_id
    if req.ts is not None:
        event.ts = req.ts
        
    await db.commit()
    await db.refresh(event)
    
    return {
        "id": str(event.id),
        "user_id": str(event.user_id),
        "ts": event.ts.isoformat(),
        "slot": event.slot,
        "source": event.source,
        "items": event.items,
        "nutrition": event.nutrition,
        "plan_slot_id": str(event.plan_slot_id) if event.plan_slot_id else None,
        "raw_input": event.raw_input,
        "confidence": float(event.confidence) if event.confidence is not None else None,
    }


@router.delete("/meal/{meal_id}")
async def delete_meal(
    meal_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    try:
        meal_uuid = uuid.UUID(meal_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid meal UUID format",
        )
        
    stmt = select(MealEvent).where(MealEvent.user_id == current_user.id, MealEvent.id == meal_uuid)
    res = await db.execute(stmt)
    event = res.scalar_one_or_none()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal log not found",
        )
        
    await db.delete(event)
    await db.commit()
    return {"status": "ok", "message": "Meal log deleted successfully"}


@router.get("/meals")
async def list_meals(
    db: DbDep,
    current_user: CurrentUser,
    limit: int = 50,
) -> dict:
    stmt = select(MealEvent).where(MealEvent.user_id == current_user.id).order_by(MealEvent.ts.desc()).limit(limit)
    res = await db.execute(stmt)
    events = res.scalars().all()
    return {
        "meals": [
            {
                "id": str(e.id),
                "user_id": str(e.user_id),
                "ts": e.ts.isoformat(),
                "slot": e.slot,
                "source": e.source,
                "items": e.items,
                "nutrition": e.nutrition,
                "plan_slot_id": str(e.plan_slot_id) if e.plan_slot_id else None,
                "raw_input": e.raw_input,
                "confidence": float(e.confidence) if e.confidence is not None else None,
            }
            for e in events
        ]
    }
