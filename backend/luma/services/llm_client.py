from __future__ import annotations

import logging
from typing import Any

import litellm

from luma.config import settings

logger = logging.getLogger(__name__)


def _local_openai_route(model: str) -> dict[str, Any]:
    """Route through an OpenAI-compatible local gateway (LocalAI/Ollama/etc.)."""
    return {
        "model": model,
        "custom_llm_provider": "openai",
        "api_base": settings.local_ai_api_base or None,
        "api_key": settings.local_ai_api_key or "not-needed",
    }


def build_litellm_target(model_name: str) -> dict[str, Any]:
    """Return LiteLLM kwargs for a model alias string.

    Supported prefixes:
      local/<id>     — OpenAI-compatible request to LOCAL_AI_API_BASE (Ollama etc.)
      gemini/<id>    — Google Gemini via GEMINI_API_KEY
      <provider>/<id> — provider-native cloud route (anthropic/, openai/, etc.)
      <bare-id>      — treated as local when LOCAL_AI_API_BASE is set
    """
    model_name = model_name.strip()

    if model_name.startswith("local/"):
        return _local_openai_route(model_name.split("/", 1)[1])

    if model_name.startswith("gemini/"):
        return {"model": model_name, "api_key": settings.gemini_api_key or None}

    if "/" in model_name:
        # Explicit provider prefix — let LiteLLM route natively.
        return {"model": model_name}

    # Bare model id: treat as local when a base URL is configured.
    if settings.local_ai_api_base:
        return _local_openai_route(model_name)

    return {"model": model_name}


async def call_llm(
    primary_model: str,
    fallback_model: str,
    **kwargs: Any,
) -> Any:
    """Call LiteLLM with automatic fallback.

    If primary_model fails for any reason and fallback_model is non-empty,
    LiteLLM retries transparently with the fallback target. This lets you pair
    a cheap/local primary with a reliable cloud fallback:

        await call_llm(
            primary_model=settings.food_extractor_model,       # local/gemma-4-e4b-it
            fallback_model=settings.food_extractor_fallback_model,  # gemini/gemini-2.5-flash
            messages=[...],
            temperature=0.1,
        )
    """
    primary = build_litellm_target(primary_model)

    if fallback_model:
        fallback = build_litellm_target(fallback_model)
        logger.debug(
            "LLM call: primary=%s fallback=%s",
            primary_model,
            fallback_model,
        )
        return await litellm.acompletion(**primary, fallbacks=[fallback], **kwargs)

    logger.debug("LLM call: primary=%s (no fallback)", primary_model)
    return await litellm.acompletion(**primary, **kwargs)
