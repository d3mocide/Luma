import json
import logging
import re
from typing import List, Dict, Any
from luma.config import settings
from luma.services.llm_client import call_llm

logger = logging.getLogger("food_extractor")


async def extract_foods_from_text(text: str) -> List[Dict[str, Any]]:
    """Parse text and extract a structured JSON list of food items and their nutrition metrics."""
    if not text.strip():
        return []
        
    system_prompt = (
        "You are Luma's high-fidelity clinical nutrition parser. "
        "Your task is to parse a natural language description of food consumed and extract "
        "a minified, valid JSON list of items, calculating their nutrition based on standard USDA databases. "
        "Ensure all fields are fully estimated for the specified portion size.\n\n"
        "Output MUST be a strict, minified JSON array without any introductory text, pleasantries, "
        "or markdown wrapping, unless using standard ```json ... ``` blocks. Follow this JSON format precisely:\n"
        "[\n"
        "  {\n"
        "    \"name\": \"steel cut oats\",\n"
        "    \"quantity\": 1.0,\n"
        "    \"unit\": \"cup\",\n"
        "    \"estimated_weight_g\": 234.0,\n"
        "    \"nutrients\": {\n"
        "      \"calories\": 150.0,\n"
        "      \"saturated_fat_g\": 0.5,\n"
        "      \"soluble_fiber_g\": 2.0,\n"
        "      \"protein_g\": 5.0,\n"
        "      \"carbohydrates_g\": 27.0,\n"
        "      \"fat_g\": 2.5,\n"
        "      \"fiber_g\": 4.0,\n"
        "      \"sodium_mg\": 0.0\n"
        "    }\n"
        "  }\n"
        "]"
    )
    
    user_prompt = f"Extract and parse this consumed meal log:\n\"{text}\""
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    try:
        resp = await call_llm(
            primary_model=settings.food_extractor_model,
            fallback_model=settings.food_extractor_fallback_model,
            messages=messages,
            temperature=0.1,
            timeout=180.0,
        )
        
        content = resp["choices"][0]["message"]["content"].strip()
        
        # Clean potential markdown JSON wrappers
        if content.startswith("```"):
            # strip out opening and closing blocks
            content = re.sub(r"^```(?:json)?\n", "", content)
            content = re.sub(r"\n```$", "", content)
            content = content.strip()
            
        try:
            parsed = json.loads(content)
            if isinstance(parsed, list):
                return parsed
            elif isinstance(parsed, dict) and "items" in parsed:
                return parsed["items"]
            else:
                logger.error(f"Unexpected JSON format returned by extractor: {content}")
                return []
        except json.JSONDecodeError:
            logger.error(f"Failed to parse LLM response as JSON: {content}")
            return []
                
    except Exception as e:
        logger.exception(f"Error calling local AI food-extractor: {e}")
        return []
