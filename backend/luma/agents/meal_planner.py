import json
import logging
import re
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from luma.config import settings
from luma.db.models import Food, Goal, Preference
from luma.services.llm_client import call_llm
from fastapi import HTTPException

logger = logging.getLogger("meal_planner")


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
    
    system_prompt = (
        "You are Luma's clinical nutrition orchestrator. "
        "Your task is to generate a highly detailed 7-day heart-healthy meal plan and shopping list "
        "tailored specifically to the user's cardiovascular, LDL cholesterol-lowering, and fiber targets.\n\n"
        "Core Objectives:\n"
        f"- Prioritize soluble fiber (aim for > {soluble_fiber_target}g daily) to bind and eliminate LDL cholesterol.\n"
        f"- Strictly cap saturated fat (limit to < {sat_fat_max}g daily).\n"
        f"- Meet calorie goal of approximately {calorie_target} kcal daily.\n"
        f"- Adhere to a {dietary_pattern} dietary pattern.\n\n"
        "Input Constraints:\n"
        f"- Exclude these dislikes: {', '.join(dislikes) if dislikes else 'None'}\n"
        f"- Exclude these allergies: {', '.join(allergies) if allergies else 'None'}\n"
        f"- Custom requests: {json.dumps(constraints) if constraints else 'None'}\n\n"
        "Reference Local Foods list to match ingredients for the shopping list:\n"
        f"{available_foods_text}\n\n"
        "Output: You must return a strict, minified JSON object containing 'plan' and 'shopping_list'. "
        "Do not wrap in markdown or include any introductory text. Format precisely:\n"
        "{\n"
        "  \"plan\": [\n"
        "    {\n"
        "      \"date\": \"2026-05-26\",\n"
        "      \"slots\": [\n"
        "        {\n"
        "          \"slot\": \"breakfast\",\n"
        "          \"custom_name\": \"Steel Cut Oatmeal with Ground Flax & Blueberries\",\n"
        "          \"notes\": \"Soluble fiber powerhouse designed to lower serum LDL.\",\n"
        "          \"nutrients\": {\n"
        "            \"calories\": 320.0,\n"
        "            \"saturated_fat_g\": 0.8,\n"
        "            \"soluble_fiber_g\": 6.0,\n"
        "            \"protein_g\": 12.0,\n"
        "            \"carbohydrates_g\": 48.0,\n"
        "            \"fat_g\": 6.0,\n"
        "            \"fiber_g\": 11.0,\n"
        "            \"sodium_mg\": 5.0\n"
        "          }\n"
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ],\n"
        "  \"shopping_list\": [\n"
        "    {\n"
        "      \"food_id\": \"uuid-matching-reference-food-or-null\",\n"
        "      \"name\": \"Steel Cut Oats\",\n"
        "      \"quantity\": 280.0,\n"
        "      \"unit\": \"g\",\n"
        "      \"aisle\": \"Grains\"\n"
        "    }\n"
        "  ]\n"
        "}"
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
