import json
import uuid
from typing import Any, Literal, cast

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import delete, select, text, update

from luma.config import settings
from luma.db.models import Preference, User
from luma.deps import CurrentUser, DbDep
from luma.services.hae_metrics import tracker as hae_metrics_tracker
from luma.services.llm_metrics import tracker as llm_metrics_tracker

router = APIRouter()


MEASUREMENT_PREF_KIND = "measurement_system"
MEASUREMENT_SYSTEMS = ("metric", "imperial")


class MeasurementSettingsOut(BaseModel):
    system: Literal["metric", "imperial"]


class MeasurementSettingsIn(BaseModel):
    system: Literal["metric", "imperial"]


@router.get("/settings/measurements", response_model=MeasurementSettingsOut)
async def get_measurement_settings(user: CurrentUser, db: DbDep) -> MeasurementSettingsOut:
    result = await db.execute(
        select(Preference.value).where(
            Preference.user_id == user.id,
            Preference.kind == MEASUREMENT_PREF_KIND,
            Preference.value.in_(MEASUREMENT_SYSTEMS),
        )
    )
    system = cast(Literal["metric", "imperial"], result.scalar_one_or_none() or "metric")
    return MeasurementSettingsOut(system=system)


@router.put("/settings/measurements", response_model=MeasurementSettingsOut)
async def put_measurement_settings(
    body: MeasurementSettingsIn,
    user: CurrentUser,
    db: DbDep,
) -> MeasurementSettingsOut:
    await db.execute(
        delete(Preference).where(
            Preference.user_id == user.id,
            Preference.kind == MEASUREMENT_PREF_KIND,
        )
    )
    db.add(Preference(user_id=user.id, kind=MEASUREMENT_PREF_KIND, value=body.system))
    await db.commit()
    return MeasurementSettingsOut(system=body.system)


LLM_PRICING_PREF_KIND = "llm_pricing_override"


@router.get("/settings/ai-pricing-overrides")
async def get_ai_pricing_overrides(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    result = await db.execute(
        select(Preference.value).where(
            Preference.user_id == user.id,
            Preference.kind == LLM_PRICING_PREF_KIND,
        )
    )
    val = result.scalar_one_or_none()
    if not val:
        return {}
    try:
        return json.loads(val)
    except Exception:
        return {}


@router.put("/settings/ai-pricing-overrides")
async def put_ai_pricing_overrides(
    body: dict[str, Any],
    user: CurrentUser,
    db: DbDep,
) -> dict[str, Any]:
    await db.execute(
        delete(Preference).where(
            Preference.user_id == user.id,
            Preference.kind == LLM_PRICING_PREF_KIND,
        )
    )
    if body:
        db.add(Preference(user_id=user.id, kind=LLM_PRICING_PREF_KIND, value=json.dumps(body)))
    await db.commit()
    return body


@router.get("/settings/hae-metrics")
async def get_hae_metrics(user: CurrentUser) -> dict[str, Any]:
    return await hae_metrics_tracker.snapshot(user_id=user.id)


@router.get("/settings/llm-metrics")
async def get_llm_metrics(user: CurrentUser) -> dict[str, Any]:
    return await llm_metrics_tracker.snapshot()


@router.get("/settings/ai-config")
async def get_ai_config(user: CurrentUser) -> dict[str, Any]:
    return {
        "models": {
            "meal_planner": {
                "primary": settings.meal_planner_model,
                "fallback": settings.meal_planner_fallback_model or None,
            },
            "coach_agent": {
                "primary": settings.coach_model,
                "fallback": settings.coach_fallback_model or None,
            },
            "food_extractor": {
                "primary": settings.food_extractor_model,
                "fallback": settings.food_extractor_fallback_model or None,
            },
            "vision_classifier": {
                "primary": settings.vision_classifier_model,
                "fallback": settings.vision_classifier_fallback_model or None,
            },
            "insight_narrator": {
                "primary": settings.insight_narrator_model,
                "fallback": settings.insight_narrator_fallback_model or None,
            },
            "recipe_importer": {
                "primary": settings.recipe_import_model,
                "fallback": settings.recipe_import_fallback_model or None,
            },
        },
        "endpoints": {
            "local_ai_api_base": settings.local_ai_api_base or None,
            "whisper_url": settings.whisper_url or None,
        }
    }


def _classify_provider(model_alias: str) -> dict[str, Any]:
    """Derive provider identity from a model alias without exposing model details."""
    alias = model_alias.lower().strip()
    if "/" in alias:
        prefix = alias.split("/", 1)[0]
        if prefix == "anthropic":
            return {"provider": "anthropic", "provider_label": "Anthropic Claude", "is_cloud": True}
        if prefix == "gemini":
            return {"provider": "gemini", "provider_label": "Google Gemini", "is_cloud": True}
        if prefix == "local":
            return {"provider": "local", "provider_label": "Local model", "is_cloud": False}
        # Any other cloud prefix (openai, cohere, etc.)
        return {"provider": prefix, "provider_label": prefix.title(), "is_cloud": True}
    # Bare alias — routes local if LOCAL_AI_API_BASE is configured
    if settings.local_ai_api_base:
        return {"provider": "local", "provider_label": "Local model", "is_cloud": False}
    return {"provider": "cloud", "provider_label": "Cloud AI", "is_cloud": True}


@router.get("/settings/ai-providers")
async def get_ai_providers(user: CurrentUser) -> dict[str, Any]:
    """Slimmed-down provider view for end users.

    Exposes which AI provider handles each feature without leaking model names,
    fallback routing, or system endpoint URLs.
    """
    features = [
        {
            "role": "coach_agent",
            "label": "Coach",
            "triggers": ["coach_tool_call"],
            **_classify_provider(settings.coach_model),
        },
        {
            "role": "food_extractor",
            "label": "Food text recognition",
            "triggers": ["food_extract"],
            **_classify_provider(settings.food_extractor_model),
        },
        {
            "role": "vision_classifier",
            "label": "Food photo scanning",
            "triggers": ["photo_log"],
            **_classify_provider(settings.vision_classifier_model),
        },
        {
            "role": "meal_planner",
            "label": "Meal planning",
            "triggers": ["meal_plan", "meal_alternatives"],
            **_classify_provider(settings.meal_planner_model),
        },
        {
            "role": "insight_narrator",
            "label": "Health insights",
            "triggers": ["insight_narrate"],
            **_classify_provider(settings.insight_narrator_model),
        },
        {
            "role": "recipe_importer",
            "label": "Recipe import",
            "triggers": ["recipe_import"],
            **_classify_provider(settings.recipe_import_model),
        },
    ]
    return {"features": features}


@router.get("/settings/ai-usage")
async def get_ai_usage(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    """Per-user AI usage statistics derived from llm_events."""
    uid = str(user.id)

    summary_row = await db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE ts >= now() - interval '7 days')  AS calls_7d,
                COUNT(*) FILTER (WHERE ts >= now() - interval '30 days') AS calls_30d
            FROM llm_events WHERE user_id = :uid AND event = 'success'
        """),
        {"uid": uid},
    )
    s = summary_row.fetchone()

    trigger_rows = await db.execute(
        text("""
            SELECT trigger, COUNT(*) AS count, MAX(ts) AS last_used
            FROM llm_events
            WHERE user_id = :uid AND event = 'success'
              AND ts >= now() - interval '30 days'
            GROUP BY trigger ORDER BY count DESC
        """),
        {"uid": uid},
    )

    provider_rows = await db.execute(
        text("""
            SELECT provider, COUNT(*) AS count
            FROM llm_events
            WHERE user_id = :uid AND event = 'success'
              AND ts >= now() - interval '30 days'
            GROUP BY provider ORDER BY count DESC
        """),
        {"uid": uid},
    )
    provider_data: list[dict[str, Any]] = [
        {"provider": r.provider, "count": r.count} for r in provider_rows
    ]
    total = sum(r["count"] for r in provider_data)
    for r in provider_data:
        r["pct"] = round(r["count"] / total * 100) if total else 0

    recent_rows = await db.execute(
        text("""
            SELECT trigger, provider, event, elapsed_ms, ts
            FROM llm_events
            WHERE user_id = :uid
            ORDER BY ts DESC LIMIT 20
        """),
        {"uid": uid},
    )

    return {
        "summary": {
            "calls_7d": (s.calls_7d or 0) if s is not None else 0,
            "calls_30d": (s.calls_30d or 0) if s is not None else 0,
        },
        "by_trigger": [
            {
                "trigger": r.trigger,
                "count": r.count,
                "last_used": r.last_used.isoformat() if r.last_used else None,
            }
            for r in trigger_rows
        ],
        "by_provider": provider_data,
        "recent_events": [
            {
                "trigger": r.trigger,
                "provider": r.provider,
                "event": r.event,
                "elapsed_ms": r.elapsed_ms,
                "ts": r.ts.isoformat(),
            }
            for r in recent_rows
        ],
    }


class HaeImportOut(BaseModel):
    token: str
    app_secret: str


@router.get("/settings/hae-import", response_model=HaeImportOut)
async def get_hae_import(user: CurrentUser) -> HaeImportOut:
    return HaeImportOut(token=str(user.hae_import_token), app_secret=settings.hae_shared_secret)


@router.post("/settings/hae-import/regenerate", response_model=HaeImportOut)
async def regenerate_hae_import_token(user: CurrentUser, db: DbDep) -> HaeImportOut:
    new_token = uuid.uuid4()
    await db.execute(update(User).where(User.id == user.id).values(hae_import_token=new_token))
    await db.commit()
    return HaeImportOut(token=str(new_token), app_secret=settings.hae_shared_secret)
