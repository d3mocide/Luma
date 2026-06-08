import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, func, select

from luma.agents.recipe_importer import extract_recipe
from luma.db.models import Food, Recipe, RecipeIngredient
from luma.deps import CurrentUser, DbDep
from luma.services.nutrition import ZERO_NUTRIENTS
from luma.services.recipe_scraper import fetch_and_clean

router = APIRouter()

NUTRITION_KEYS = list(ZERO_NUTRIENTS.keys())


class IngredientIn(BaseModel):
    food_id: str
    quantity: float
    unit: str
    notes: str | None = None


class RecipeCreateRequest(BaseModel):
    name: str
    description: str | None = None
    instructions: list[str] | None = None
    prep_minutes: int | None = None
    cook_minutes: int | None = None
    servings: float = 1.0
    tags: list[str] | None = None
    source: str | None = None
    ingredients: list[IngredientIn] = []


class RecipeImportRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class RecipeUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    instructions: list[str] | None = None
    prep_minutes: int | None = None
    cook_minutes: int | None = None
    servings: float | None = None
    tags: list[str] | None = None
    ingredients: list[IngredientIn] | None = None


def _compute_nutrition(ingredients: list[RecipeIngredient], servings: float) -> dict:
    totals = {k: 0.0 for k in NUTRITION_KEYS}
    for ing in ingredients:
        food = ing.food
        if not food:
            continue
        # Convert quantity to grams (assume unit is g for now; unit field is informational)
        factor = float(ing.quantity) / 100.0
        per100 = food.nutrients_per_100g or {}
        for k in NUTRITION_KEYS:
            totals[k] += float(per100.get(k) or 0.0) * factor
    per_serving = {k: round(v / max(servings, 1), 2) for k, v in totals.items()}
    return per_serving


def _recipe_dict(r: Recipe) -> dict:
    return {
        "id": str(r.id),
        "name": r.name,
        "description": r.description,
        "instructions": r.instructions or [],
        "prep_minutes": r.prep_minutes,
        "cook_minutes": r.cook_minutes,
        "servings": float(r.servings),
        "tags": r.tags or [],
        "source": r.source,
        "nutrition_per_serving": r.nutrition_per_serving or {},
        "ingredients": [
            {
                "food_id": str(i.food_id) if i.food_id else None,
                "food_name": i.food.name if i.food else None,
                "quantity": float(i.quantity),
                "unit": i.unit,
                "notes": i.notes,
                "sort_order": i.sort_order,
            }
            for i in (r.ingredients or [])
        ],
        "created_at": r.created_at.isoformat(),
    }


@router.get("")
async def list_recipes(db: DbDep, current_user: CurrentUser) -> dict:
    rows = (await db.execute(
        select(Recipe)
        .where(Recipe.user_id == current_user.id)
        .order_by(Recipe.created_at.desc())
    )).scalars().all()

    # Eager-load ingredients
    result = []
    for r in rows:
        await db.refresh(r, ["ingredients"])
        for ing in r.ingredients:
            if ing.food_id:
                await db.refresh(ing, ["food"])
        result.append(_recipe_dict(r))

    return {"recipes": result}


@router.get("/{recipe_id}")
async def get_recipe(recipe_id: str, db: DbDep, current_user: CurrentUser) -> dict:
    try:
        rid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid recipe ID")

    r = (await db.execute(
        select(Recipe).where(Recipe.id == rid, Recipe.user_id == current_user.id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    await db.refresh(r, ["ingredients"])
    for ing in r.ingredients:
        if ing.food_id:
            await db.refresh(ing, ["food"])

    return _recipe_dict(r)


async def _match_ingredient(db, name: str) -> tuple[str | None, str | None]:
    """Return (food_id, food_name) for the best trgm match above threshold, else (None, None)."""
    q = name.strip().lower()
    sim = func.similarity(Food.name, q)
    row = (await db.execute(
        select(Food).where(sim > 0.3).order_by(sim.desc()).limit(1)
    )).scalar_one_or_none()
    return (str(row.id), row.name) if row else (None, None)


@router.post("/import")
async def import_recipe(req: RecipeImportRequest, db: DbDep, current_user: CurrentUser) -> dict:
    try:
        page_text = await fetch_and_clean(req.url)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    if not page_text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No readable content found at that URL",
        )

    extracted = await extract_recipe(req.url, page_text)
    if extracted is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not extract a recipe from that page",
        )

    draft_ingredients = []
    for ing in extracted.ingredients:
        food_id, food_name = await _match_ingredient(db, ing.name)
        parts = [f"{ing.quantity} {ing.unit} {ing.name}"]
        if ing.notes:
            parts.append(ing.notes)
        draft_ingredients.append({
            "raw_text": ", ".join(parts),
            "name": ing.name,
            "quantity": ing.quantity,
            "unit": ing.unit,
            "notes": ing.notes,
            "food_id": food_id,
            "food_name": food_name,
        })

    return {
        "name": extracted.name,
        "description": extracted.description,
        "instructions": extracted.instructions,
        "prep_minutes": extracted.prep_minutes,
        "cook_minutes": extracted.cook_minutes,
        "servings": extracted.servings,
        "tags": extracted.tags,
        "source_url": req.url,
        "ingredients": draft_ingredients,
    }


@router.post("")
async def create_recipe(req: RecipeCreateRequest, db: DbDep, current_user: CurrentUser) -> dict:
    r = Recipe(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=req.name,
        description=req.description,
        instructions=req.instructions,
        prep_minutes=req.prep_minutes,
        cook_minutes=req.cook_minutes,
        servings=req.servings,
        tags=req.tags,
        source=req.source,
        nutrition_per_serving={},
    )
    db.add(r)
    await db.flush()

    for i, ing_in in enumerate(req.ingredients):
        try:
            fid = uuid.UUID(ing_in.food_id)
        except ValueError:
            continue
        food_res = await db.execute(select(Food).where(Food.id == fid))
        food = food_res.scalar_one_or_none()
        if not food:
            continue
        db.add(RecipeIngredient(
            recipe_id=r.id,
            food_id=fid,
            quantity=ing_in.quantity,
            unit=ing_in.unit,
            notes=ing_in.notes,
            sort_order=i,
        ))

    await db.flush()
    await db.refresh(r, ["ingredients"])
    for ing in r.ingredients:
        if ing.food_id:
            await db.refresh(ing, ["food"])

    r.nutrition_per_serving = _compute_nutrition(r.ingredients, float(r.servings))
    await db.commit()
    await db.refresh(r, ["ingredients"])
    return _recipe_dict(r)


@router.put("/{recipe_id}")
async def update_recipe(recipe_id: str, req: RecipeUpdateRequest, db: DbDep, current_user: CurrentUser) -> dict:
    try:
        rid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid recipe ID")

    r = (await db.execute(
        select(Recipe).where(Recipe.id == rid, Recipe.user_id == current_user.id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    if req.name is not None:
        r.name = req.name
    if req.description is not None:
        r.description = req.description
    if req.instructions is not None:
        r.instructions = req.instructions
    if req.prep_minutes is not None:
        r.prep_minutes = req.prep_minutes
    if req.cook_minutes is not None:
        r.cook_minutes = req.cook_minutes
    if req.servings is not None:
        r.servings = req.servings
    if req.tags is not None:
        r.tags = req.tags

    if req.ingredients is not None:
        await db.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == rid))
        for i, ing_in in enumerate(req.ingredients):
            try:
                fid = uuid.UUID(ing_in.food_id)
            except ValueError:
                continue
            food_res = await db.execute(select(Food).where(Food.id == fid))
            if not food_res.scalar_one_or_none():
                continue
            db.add(RecipeIngredient(
                recipe_id=r.id,
                food_id=fid,
                quantity=ing_in.quantity,
                unit=ing_in.unit,
                notes=ing_in.notes,
                sort_order=i,
            ))

    await db.flush()
    await db.refresh(r, ["ingredients"])
    for ing in r.ingredients:
        if ing.food_id:
            await db.refresh(ing, ["food"])
    r.nutrition_per_serving = _compute_nutrition(r.ingredients, float(r.servings))
    await db.commit()
    await db.refresh(r, ["ingredients"])
    return _recipe_dict(r)


@router.delete("/{recipe_id}")
async def delete_recipe(recipe_id: str, db: DbDep, current_user: CurrentUser) -> dict:
    try:
        rid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid recipe ID")

    r = (await db.execute(
        select(Recipe).where(Recipe.id == rid, Recipe.user_id == current_user.id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    await db.delete(r)
    await db.commit()
    return {"status": "ok"}
