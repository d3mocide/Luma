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


def _format_food_response(food: Food) -> dict:
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


def _format_event_response(event: MealEvent) -> dict:
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


class BarcodeLookupRequest(BaseModel):
    barcode: str


class TextLogRequest(BaseModel):
    text: str


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
        return _format_food_response(food)

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
    return _format_food_response(food)


@router.post("/meal/text")
async def log_meal_text(
    req: TextLogRequest,
    current_user: CurrentUser,
) -> dict:
    if not req.text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Text cannot be empty")
    extracted_items = await food_extractor.extract_foods_from_text(req.text)
    return {
        "raw_input": req.text,
        "items": extracted_items,
        "nutrition": aggregate_items(extracted_items),
        "confidence": 0.90,
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
    return _format_event_response(event)


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
    return _format_event_response(event)


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


@router.post("/meal/photo")
async def log_meal_photo(
    current_user: CurrentUser,
    file: UploadFile = File(...),
) -> dict:
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty image file")

    import base64
    from luma.config import settings
    from luma.services.llm_client import call_llm

    b64 = base64.b64encode(image_bytes).decode()
    content_type = file.content_type or "image/jpeg"

    messages = [
        {
            "role": "system",
            "content": (
                "You are Luma's food vision classifier. "
                "Identify food items in the image and return structured nutrition data. "
                "Always respond with a valid JSON array only — no markdown, no commentary."
            ),
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{content_type};base64,{b64}"},
                },
                {
                    "type": "text",
                    "text": (
                        "Identify all food items visible in this image. "
                        "Return a JSON array of food items with this schema: "
                        '[{"name":"...","quantity":1.0,"unit":"serving","estimated_weight_g":200.0,'
                        '"nutrients":{"calories":300,"saturated_fat_g":2.0,"soluble_fiber_g":1.0,'
                        '"protein_g":10.0,"carbohydrates_g":40.0,"fat_g":8.0,"fiber_g":3.0,"sodium_mg":400}}]. '
                        "Fill in all nutrient values — do not leave them as 0. No markdown, no preamble."
                    ),
                },
            ],
        },
    ]

    import re
    import json as _json
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    def _parse_vision_json(raw: str) -> list | None:
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()
        try:
            parsed = _json.loads(raw)
            return parsed if isinstance(parsed, list) else None
        except _json.JSONDecodeError:
            return None

    try:
        resp = await call_llm(
            primary_model=settings.vision_classifier_model,
            fallback_model=settings.vision_classifier_fallback_model,
            trigger="photo_log",
            messages=messages,
            temperature=0.1,
            timeout=60.0,
        )
        content = resp["choices"][0]["message"]["content"].strip()
        extracted_items = _parse_vision_json(content)

        if extracted_items is None:
            _logger.warning("Vision classifier returned invalid JSON; attempting correction retry")
            correction_messages = messages + [
                {"role": "assistant", "content": content},
                {"role": "user", "content": "That response was not valid JSON. Return only the JSON array, no other text."},
            ]
            retry_resp = await call_llm(
                primary_model=settings.vision_classifier_model,
                fallback_model=settings.vision_classifier_fallback_model,
                trigger="photo_log",
                messages=correction_messages,
                temperature=0.1,
                timeout=30.0,
            )
            retry_content = retry_resp["choices"][0]["message"]["content"].strip()
            extracted_items = _parse_vision_json(retry_content)
            if extracted_items is None:
                _logger.error("Vision classifier could not produce valid JSON after retry: %s", content[:200])
                extracted_items = []

    except Exception:
        _logger.exception("Vision food extraction failed")
        extracted_items = []

    from luma.services.nutrition import aggregate_items
    return {
        "raw_input": f"[photo: {file.filename}]",
        "items": extracted_items,
        "nutrition": aggregate_items(extracted_items),
        "confidence": 0.75,
    }


@router.get("/meals")
async def list_meals(
    db: DbDep,
    current_user: CurrentUser,
    limit: int = 50,
) -> dict:
    stmt = select(MealEvent).where(MealEvent.user_id == current_user.id).order_by(MealEvent.ts.desc()).limit(limit)
    res = await db.execute(stmt)
    events = res.scalars().all()
    return {"meals": [_format_event_response(e) for e in events]}
