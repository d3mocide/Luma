import json
import logging
import re

from pydantic import BaseModel, Field

from luma.config import settings
from luma.services.llm_client import call_llm

logger = logging.getLogger("recipe_importer")

_SYSTEM_PROMPT = (
    "You are a recipe extraction assistant. Given the text content of a recipe web page, "
    "extract the recipe information and return it as a single JSON object. "
    "Parse each ingredient into separate name, quantity, and unit fields. "
    "If a field is not present in the source, use null. "
    "Return only valid JSON — no markdown fences, no explanation."
)


class RawIngredient(BaseModel):
    name: str = Field(description="Ingredient name, as specific as possible (e.g. 'all-purpose flour' not 'flour')")
    quantity: float = Field(description="Numeric quantity")
    unit: str = Field(description="Unit of measurement (e.g. g, cup, tbsp, oz, piece, clove)")
    notes: str | None = Field(default=None, description="Preparation notes (e.g. chopped, melted, room temperature)")


class RecipeImportResult(BaseModel):
    name: str
    description: str | None = None
    instructions: list[str] = Field(default_factory=list)
    prep_minutes: int | None = None
    cook_minutes: int | None = None
    servings: float = 1.0
    tags: list[str] = Field(default_factory=list)
    ingredients: list[RawIngredient] = Field(default_factory=list)


async def extract_recipe(url: str, page_text: str) -> RecipeImportResult | None:
    """Extract structured recipe data from page text using LLM."""
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": f"Source URL: {url}\n\nPage content:\n{page_text}"},
    ]

    def _parse(raw: str) -> RecipeImportResult | None:
        try:
            return RecipeImportResult.model_validate(json.loads(raw))
        except Exception:
            return None

    def _strip_fences(s: str) -> str:
        if s.startswith("```"):
            s = re.sub(r"^```(?:json)?\n", "", s)
            s = re.sub(r"\n```$", "", s)
        return s.strip()

    try:
        resp = await call_llm(
            primary_model=settings.recipe_import_model,
            fallback_model=settings.recipe_import_fallback_model,
            trigger="recipe_import",
            messages=messages,
            temperature=0.1,
            timeout=60.0,
            response_format=RecipeImportResult,
        )
        content = _strip_fences(resp["choices"][0]["message"]["content"].strip())
        result = _parse(content)
        if result is not None:
            return result

        # One correction retry
        logger.warning("Recipe importer returned invalid JSON; attempting correction retry")
        retry_resp = await call_llm(
            primary_model=settings.recipe_import_model,
            fallback_model=settings.recipe_import_fallback_model,
            trigger="recipe_import",
            messages=messages + [
                {"role": "assistant", "content": content},
                {"role": "user", "content": "That was not valid JSON. Return only the JSON object, no other text."},
            ],
            temperature=0.1,
            timeout=60.0,
            response_format=RecipeImportResult,
        )
        retry_content = _strip_fences(retry_resp["choices"][0]["message"]["content"].strip())
        return _parse(retry_content)

    except Exception:
        logger.exception("Recipe importer LLM call failed")
        return None
