import uuid
from decimal import Decimal

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
    food_id: str | None = None
    food_name: str | None = None
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


def _unit_to_grams(quantity: float, unit: str, food_name: str, serving_size_g: float | None) -> float:
    unit = unit.strip().lower()
    if not unit:
        return quantity
        
    # Handle pluralization
    if unit.endswith('s') and unit not in ('lbs', 'class'):
        unit = unit[:-1]
    
    # Weight units
    if unit in ('g', 'gram'):
        return quantity
    if unit in ('kg', 'kilogram'):
        return quantity * 1000.0
    if unit in ('oz', 'ounce'):
        return quantity * 28.35
    if unit in ('lb', 'lbs', 'pound'):
        return quantity * 453.59
    
    # Volume units (assuming water density of 1.0 for simplicity)
    if unit in ('ml', 'milliliter'):
        return quantity
    if unit in ('tsp', 'teaspoon'):
        return quantity * 4.93
    if unit in ('tbsp', 'tablespoon'):
        return quantity * 14.79
    if unit in ('cup', 'c'):
        return quantity * 240.0
    
    # Serving / item units
    if unit in ('serving', 'piece', 'clove', 'unit', 'head', 'slice', 'can'):
        if serving_size_g is not None and serving_size_g > 0:
            return quantity * serving_size_g
        fn = food_name.lower()
        if 'clove' in unit or 'clove' in fn:
            return quantity * 5.0
        if 'slice' in unit or 'slice' in fn:
            return quantity * 30.0
        if 'head' in unit or 'head' in fn:
            return quantity * 500.0
        return quantity * 100.0
    
    if serving_size_g is not None and serving_size_g > 0:
        return quantity * serving_size_g
    return quantity


def _compute_nutrition(ingredients: list[RecipeIngredient], servings: float) -> dict:
    totals = {k: 0.0 for k in NUTRITION_KEYS}
    for ing in ingredients:
        food = ing.food
        if not food:
            continue
        qty_g = _unit_to_grams(
            float(ing.quantity),
            ing.unit,
            food.name,
            float(food.serving_size_g) if food.serving_size_g is not None else None
        )
        factor = qty_g / 100.0
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
                "food_name": i.food.name if i.food else i.custom_name,
                "quantity": float(i.quantity),
                "unit": i.unit,
                "notes": i.notes,
                "sort_order": i.sort_order,
            }
            for i in (r.ingredients or [])
        ],
        "created_at": r.created_at.isoformat(),
    }


async def _get_recipe_loaded(db, recipe_id: uuid.UUID, user_id: uuid.UUID) -> Recipe | None:
    from sqlalchemy.orm import selectinload
    stmt = (
        select(Recipe)
        .where(Recipe.id == recipe_id, Recipe.user_id == user_id)
        .options(
            selectinload(Recipe.ingredients).selectinload(RecipeIngredient.food)
        )
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


@router.get("")
async def list_recipes(db: DbDep, current_user: CurrentUser) -> dict:
    from sqlalchemy.orm import selectinload
    stmt = (
        select(Recipe)
        .where(Recipe.user_id == current_user.id)
        .options(
            selectinload(Recipe.ingredients).selectinload(RecipeIngredient.food)
        )
        .order_by(Recipe.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return {"recipes": [_recipe_dict(r) for r in rows]}


@router.get("/{recipe_id}")
async def get_recipe(recipe_id: str, db: DbDep, current_user: CurrentUser) -> dict:
    try:
        rid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid recipe ID")

    r = await _get_recipe_loaded(db, rid, current_user.id)
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

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
        servings=Decimal(str(req.servings)),
        tags=req.tags,
        source=req.source,
        nutrition_per_serving={},
    )
    db.add(r)
    await db.flush()

    for i, ing_in in enumerate(req.ingredients):
        fid = None
        if ing_in.food_id:
            try:
                fid = uuid.UUID(ing_in.food_id)
            except ValueError:
                pass
        
        if fid:
            food_res = await db.execute(select(Food).where(Food.id == fid))
            food = food_res.scalar_one_or_none()
            if not food:
                fid = None

        db.add(RecipeIngredient(
            recipe_id=r.id,
            food_id=fid,
            custom_name=ing_in.food_name if not fid else None,
            quantity=Decimal(str(ing_in.quantity)),
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
    r_loaded = await _get_recipe_loaded(db, r.id, current_user.id)
    if not r_loaded:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found after creation")
    return _recipe_dict(r_loaded)


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
        r.servings = Decimal(str(req.servings))
    if req.tags is not None:
        r.tags = req.tags

    if req.ingredients is not None:
        await db.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == rid))
        for i, ing_in in enumerate(req.ingredients):
            fid = None
            if ing_in.food_id:
                try:
                    fid = uuid.UUID(ing_in.food_id)
                except ValueError:
                    pass
            
            if fid:
                food_res = await db.execute(select(Food).where(Food.id == fid))
                food = food_res.scalar_one_or_none()
                if not food:
                    fid = None

            db.add(RecipeIngredient(
                recipe_id=r.id,
                food_id=fid,
                custom_name=ing_in.food_name if not fid else None,
                quantity=Decimal(str(ing_in.quantity)),
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
    r_loaded = await _get_recipe_loaded(db, r.id, current_user.id)
    if not r_loaded:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found after update")
    return _recipe_dict(r_loaded)


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
