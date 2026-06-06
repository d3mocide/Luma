import json
import logging
import re
from typing import List, Dict, Any
from pydantic import BaseModel, Field

from luma.config import settings
from luma.services.llm_client import call_llm
from luma.agents.prompt_loader import load_prompt

logger = logging.getLogger("food_extractor")


class NutrientsSchema(BaseModel):
    # Core macros — LLM estimates these
    calories: float = Field(description="Calories in kcal")
    protein_g: float = Field(description="Protein in grams")
    fat_g: float = Field(description="Total fat in grams")
    saturated_fat_g: float = Field(description="Saturated fat in grams")
    carbohydrates_g: float = Field(description="Carbohydrates in grams")
    sugars_g: float = Field(description="Sugars in grams")
    fiber_g: float = Field(description="Total fiber in grams")
    soluble_fiber_g: float = Field(description="Soluble fiber in grams")
    sodium_mg: float = Field(description="Sodium in milligrams")
    potassium_mg: float = Field(description="Potassium in milligrams")
    # Extended nutrients — default 0; populated from USDA/OFF for DB-sourced foods
    monounsaturated_fat_g: float = 0.0
    polyunsaturated_fat_g: float = 0.0
    trans_fat_g: float = 0.0
    cholesterol_mg: float = 0.0
    calcium_mg: float = 0.0
    iron_mg: float = 0.0
    magnesium_mg: float = 0.0
    phosphorus_mg: float = 0.0
    zinc_mg: float = 0.0
    selenium_mcg: float = 0.0
    vitamin_a_mcg: float = 0.0
    vitamin_c_mg: float = 0.0
    vitamin_d_mcg: float = 0.0
    vitamin_e_mg: float = 0.0
    vitamin_k_mcg: float = 0.0
    thiamin_mg: float = 0.0
    riboflavin_mg: float = 0.0
    niacin_mg: float = 0.0
    vitamin_b6_mg: float = 0.0
    folate_mcg: float = 0.0
    vitamin_b12_mcg: float = 0.0


class FoodItemSchema(BaseModel):
    name: str = Field(description="Name of the food item")
    quantity: float = Field(description="Quantity of the food item")
    unit: str = Field(description="Unit of measurement (e.g. cup, slice, serving)")
    estimated_weight_g: float = Field(description="Estimated weight in grams")
    nutrients: NutrientsSchema


class FoodExtractorResponse(BaseModel):
    items: List[FoodItemSchema] = Field(description="List of extracted food items")


async def extract_foods_from_text(text: str) -> List[Dict[str, Any]]:
    """Parse text and extract a structured JSON list of food items and their nutrition metrics."""
    if not text.strip():
        return []

    system_prompt = load_prompt("food_extractor_system")
    user_prompt = f"Extract and parse this consumed meal log:\n\"{text}\""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    try:
        resp = await call_llm(
            primary_model=settings.food_extractor_model,
            fallback_model=settings.food_extractor_fallback_model,
            trigger="food_extract",
            messages=messages,
            temperature=0.1,
            timeout=30.0,
            response_format=FoodExtractorResponse,
        )

        content = resp["choices"][0]["message"]["content"].strip()

        # Clean potential markdown JSON wrappers
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\n", "", content)
            content = re.sub(r"\n```$", "", content)
            content = content.strip()

        def _parse_items(raw: str) -> list | None:
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                return None
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict) and "items" in parsed:
                return parsed["items"]
            return None

        items = _parse_items(content)
        if items is not None:
            return items

        # One correction retry — send the bad response back and ask the model to fix it
        logger.warning("Food extractor returned invalid JSON; attempting correction retry")
        correction_messages = messages + [
            {"role": "assistant", "content": content},
            {"role": "user", "content": "That response was not valid JSON. Return only the JSON array, no other text."},
        ]
        try:
            retry_resp = await call_llm(
                primary_model=settings.food_extractor_model,
                fallback_model=settings.food_extractor_fallback_model,
                trigger="food_extract",
                messages=correction_messages,
                temperature=0.1,
                timeout=60.0,
                response_format=FoodExtractorResponse,
            )
            retry_content = retry_resp["choices"][0]["message"]["content"].strip()
            if retry_content.startswith("```"):
                retry_content = re.sub(r"^```(?:json)?\n", "", retry_content)
                retry_content = re.sub(r"\n```$", "", retry_content).strip()
            items = _parse_items(retry_content)
            if items is not None:
                return items
        except Exception:
            logger.exception("Food extractor correction retry failed")

        logger.error("Food extractor could not produce valid JSON after retry: %s", content[:200])
        return []

    except Exception as e:
        logger.exception(f"Error calling local AI food-extractor: {e}")
        return []
