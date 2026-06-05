import json
import logging
import re
from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from fastapi import HTTPException

from luma.config import settings
from luma.db.models import Food, Goal, Preference
from luma.services.llm_client import call_llm
from luma.agents.prompt_loader import load_prompt

logger = logging.getLogger("meal_planner")


class SlotNutrientsSchema(BaseModel):
    calories: float = Field(description="Calories in kcal")
    saturated_fat_g: float = Field(description="Saturated fat in grams")
    soluble_fiber_g: float = Field(description="Soluble fiber in grams")
    protein_g: float = Field(description="Protein in grams")
    carbohydrates_g: float = Field(description="Carbohydrates in grams")
    fat_g: float = Field(description="Total fat in grams")
    fiber_g: float = Field(description="Total fiber in grams")
    sodium_mg: float = Field(description="Sodium in milligrams")


class MealSlotSchema(BaseModel):
    slot: str = Field(description="Meal slot (e.g. breakfast, lunch, dinner, snack)")
    custom_name: str = Field(description="Specific description of the meal")
    notes: str = Field(description="Nutritional or clinical notes")
    nutrients: SlotNutrientsSchema


class DailyPlanSchema(BaseModel):
    date: str = Field(description="ISO Date string YYYY-MM-DD")
    slots: List[MealSlotSchema] = Field(description="Meal slots for this day")


class ShoppingItemSchema(BaseModel):
    food_id: Optional[str] = Field(description="UUID of matching local food item, or null if none")
    name: str = Field(description="Name of the food item")
    quantity: float = Field(description="Quantity required")
    unit: str = Field(description="Unit of measurement (e.g., g, items)")
    aisle: str = Field(description="Grocery aisle name")


class MealPlanResponse(BaseModel):
    plan: List[DailyPlanSchema] = Field(description="7-day meal plan")
    shopping_list: List[ShoppingItemSchema] = Field(description="Aggregate shopping list")


async def generate_meal_plan(
    db: AsyncSession,
    user_id: Any,
    week_start: str,
    constraints: Optional[dict] = None,
) -> dict:
    """Generate a high-fidelity 7-day meal plan and shopping list tailored to LDL-lowering goals."""
    # 1. Fetch user's goals
    stmt_goal = select(Goal).where(Goal.user_id == user_id)
    res_goal = await db.execute(stmt_goal)
    goal = res_goal.scalar_one_or_none()
    
    # 2. Fetch user's preferences
    stmt_pref = select(Preference).where(Preference.user_id == user_id)
    res_pref = await db.execute(stmt_pref)
    prefs = res_pref.scalars().all()
    dislikes = [p.value for p in prefs if p.kind == "dislike"]
    allergies = [p.value for p in prefs if p.kind == "allergy"]

    # 3. Fetch local foods, then filter against allergens/dislikes before injecting
    stmt_foods = select(Food).limit(300)
    res_foods = await db.execute(stmt_foods)
    all_foods = res_foods.scalars().all()

    exclusion_terms = {t.lower() for t in dislikes + allergies}

    def _is_excluded(food: Food) -> bool:
        name = food.name.lower()
        tags = [t.lower() for t in (food.tags or [])]
        return any(term in name or term in tags for term in exclusion_terms)

    foods = [f for f in all_foods if not _is_excluded(f)][:100]

    # Format goals into prompt variables
    ldl_target = goal.target_ldl_mg_dl if goal else 100
    calorie_target = goal.daily_calorie_target if goal else 2000
    sat_fat_max = float(goal.daily_sat_fat_g_max) if goal and goal.daily_sat_fat_g_max else 13.0
    soluble_fiber_target = float(goal.daily_soluble_fiber_g) if goal and goal.daily_soluble_fiber_g else 10.0
    dietary_pattern = (goal.dietary_pattern if goal else None) or "heart-healthy"
    
    available_foods_text = "\n".join([
        f"- ID: {f.id} | Name: {f.name} | Brand: {f.brand or 'Generic'} | Serving: {f.serving_size_g}g | Nutrients/100g: {json.dumps(f.nutrients_per_100g)}"
        for f in foods
    ])
    
    system_prompt_template = load_prompt("meal_planner_system")
    
    system_prompt = (
        system_prompt_template
        .replace("{soluble_fiber_target}", str(soluble_fiber_target))
        .replace("{sat_fat_max}", str(sat_fat_max))
        .replace("{calorie_target}", str(calorie_target))
        .replace("{dietary_pattern}", str(dietary_pattern))
        .replace("{dislikes}", ', '.join(dislikes) if dislikes else 'None')
        .replace("{allergies}", ', '.join(allergies) if allergies else 'None')
        .replace("{constraints}", json.dumps(constraints) if constraints else 'None')
        .replace("{available_foods_text}", available_foods_text)
    )
    
    user_prompt = f"Generate 7-day meal plan starting from week: {week_start}"
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    try:
        resp = await call_llm(
            primary_model=settings.meal_planner_model,
            fallback_model=settings.meal_planner_fallback_model,
            trigger="meal_plan",
            messages=messages,
            temperature=0.2,
            timeout=600.0,
            response_format=MealPlanResponse,
        )
        
        content = resp["choices"][0]["message"]["content"].strip()
        
        # Clean potential markdown wrappers
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\n", "", content)
            content = re.sub(r"\n```$", "", content)
            content = content.strip()
            
        return json.loads(content)
            
    except Exception as e:
        logger.exception(f"Error calling local Claude Sonnet meal-planner: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate heart-healthy meal plan"
        )
