from __future__ import annotations

from typing import Any

from luma.config import settings


def _local_openai_route(model: str) -> dict[str, Any]:
    """Route through an OpenAI-compatible local gateway (LocalAI/Ollama/etc.)."""
    return {
        "model": model,
        "custom_llm_provider": "openai",
        "api_base": settings.local_ai_api_base or None,
        # Some OpenAI-compatible local servers require a non-empty auth header.
        "api_key": settings.local_ai_api_key or "not-needed",
    }


def build_litellm_target(model_name: str) -> dict[str, Any]:
    """Build provider/base/key kwargs for LiteLLM based on a model alias string.

    Supported patterns:
    - local/<model-id>: force local OpenAI-compatible endpoint route.
      Example: local/gemma-4-e4b-it
        - gemini/<model-id>: force Gemini cloud provider route.
            Example: gemini/gemini-2.5-flash
    - <provider>/<model-id>: provider-native cloud route (anthropic/, openai/, etc.)
      Example: anthropic/claude-sonnet-4-5
    - <bare-model-id>: backward-compatible local model id route when LOCAL_AI_API_BASE is set.
    """
    model_name = model_name.strip()

    if model_name.startswith("local/"):
        local_model = model_name.split("/", 1)[1]
        return _local_openai_route(local_model)

    if model_name.startswith("gemini/"):
        # Explicit Gemini routing allows mixed cloud/local model selection from one code path.
        return {
            "model": model_name,
            "api_key": settings.gemini_api_key or None,
        }

    if "/" in model_name:
        # Provider is explicit, let LiteLLM route natively (cloud or direct provider endpoint).
        return {"model": model_name}

    # Backward compatibility: treat bare model ids as local when a local base is configured.
    if settings.local_ai_api_base:
        return _local_openai_route(model_name)

    # Last resort: pass through as-is.
    return {"model": model_name}
