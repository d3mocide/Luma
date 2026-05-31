"""Coach agent — Claude with tool calls, streaming SSE, context injection, thread compression."""
from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import litellm

from luma.config import settings
from luma.services.llm_client import build_litellm_target, call_llm

logger = logging.getLogger(__name__)

_SYSTEM_BASE = (
    "You are Luma, a personal nutrition and health coach. "
    "You have access to the user's biometric trends, meal history, and nutrition data via tools. "
    "Use tools to ground your answers in real data before responding. "
    "Be concise, warm, and clinically grounded. Never diagnose — always frame as patterns and options. "
    "When you've gathered enough data, respond directly to the user."
)

# Compress oldest N messages in a thread when count exceeds this
_COMPRESS_THRESHOLD = 30
_COMPRESS_KEEP = 10  # keep the most recent N messages uncompressed

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "query_biometric_trend",
            "description": "Fetch daily biometric trend data for a given metric and date range.",
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "description": "Biometric metric name (e.g. 'hrv_ms', 'weight_kg', 'sleep_score')"},
                    "start_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                },
                "required": ["metric", "start_date", "end_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_nutrition_rollup",
            "description": "Get average nutrition values per day or week.",
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {"type": "string", "enum": ["daily", "weekly"]},
                    "start_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                },
                "required": ["period", "start_date", "end_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_meals",
            "description": "Get the user's most recent meal events with items and nutrition.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max number of meals to return (1-20)", "default": 10},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_meal_swap",
            "description": "Propose a food swap for a meal plan slot to better meet the user's LDL and nutrition goals.",
            "parameters": {
                "type": "object",
                "properties": {
                    "slot_id": {"type": "string", "description": "UUID of the meal plan slot to swap"},
                    "goal_notes": {"type": "string", "description": "What nutritional goal to optimize for"},
                },
                "required": ["slot_id", "goal_notes"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "modify_plan",
            "description": "Update a meal plan slot with a specific food.",
            "parameters": {
                "type": "object",
                "properties": {
                    "slot_id": {"type": "string", "description": "UUID of the meal plan slot"},
                    "food_id": {"type": "string", "description": "UUID of the food to assign"},
                    "servings": {"type": "number", "description": "Number of servings"},
                },
                "required": ["slot_id", "food_id", "servings"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_goals",
            "description": "Retrieve the user's current nutrition and health goals.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_alerts",
            "description": "Retrieve recent Luma health alerts generated for this user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Number of recent alerts to return (1-10)", "default": 5},
                },
                "required": [],
            },
        },
    },
]


async def _execute_tool(name: str, args: dict, user_id: str, db) -> str:
    from sqlalchemy import text

    if name == "query_biometric_trend":
        rows = await db.execute(
            text("""
                SELECT day::text, avg_value, last_value
                FROM biometrics_daily
                WHERE user_id = :uid AND metric = :metric
                  AND day BETWEEN :start AND :end
                ORDER BY day
            """),
            {"uid": user_id, "metric": args["metric"], "start": args["start_date"], "end": args["end_date"]},
        )
        return json.dumps([{"date": r.day, "avg": r.avg_value, "last": r.last_value} for r in rows])

    if name == "query_nutrition_rollup":
        rows = await db.execute(
            text("""
                SELECT
                    DATE(ts AT TIME ZONE 'UTC') AS day,
                    SUM((nutrition->>'calories')::float) AS calories,
                    SUM((nutrition->>'saturated_fat_g')::float) AS sat_fat_g,
                    SUM((nutrition->>'soluble_fiber_g')::float) AS fiber_g,
                    SUM((nutrition->>'protein_g')::float) AS protein_g
                FROM meal_events
                WHERE user_id = :uid
                  AND ts::date BETWEEN :start AND :end
                GROUP BY DATE(ts AT TIME ZONE 'UTC')
                ORDER BY day
            """),
            {"uid": user_id, "start": args["start_date"], "end": args["end_date"]},
        )
        data = [
            {"day": str(r.day), "calories": r.calories, "sat_fat_g": r.sat_fat_g,
             "fiber_g": r.fiber_g, "protein_g": r.protein_g}
            for r in rows
        ]
        if args.get("period") == "weekly" and data:
            avg = {k: sum(d[k] or 0 for d in data) / len(data) for k in ["calories", "sat_fat_g", "fiber_g", "protein_g"]}
            return json.dumps({"weekly_avg": avg})
        return json.dumps(data)

    if name == "get_recent_meals":
        limit = min(int(args.get("limit", 10)), 20)
        rows = await db.execute(
            text("""
                SELECT id, ts, slot, source, items, nutrition
                FROM meal_events WHERE user_id = :uid
                ORDER BY ts DESC LIMIT :limit
            """),
            {"uid": user_id, "limit": limit},
        )
        return json.dumps([
            {"id": str(r.id), "ts": r.ts.isoformat(), "slot": r.slot,
             "source": r.source, "items": r.items, "nutrition": r.nutrition}
            for r in rows
        ])

    if name == "propose_meal_swap":
        row = await db.execute(
            text("""
                SELECT mps.custom_name, mps.notes, mps.slot, mps.slot_date
                FROM meal_plan_slots mps
                JOIN meal_plans mp ON mp.id = mps.plan_id
                WHERE mps.id = :sid AND mp.user_id = :uid
            """),
            {"sid": args["slot_id"], "uid": user_id},
        )
        slot = row.fetchone()
        if not slot:
            return json.dumps({"error": "slot not found"})
        return json.dumps({
            "suggestion": f"Replace '{slot.custom_name or slot.slot}' with a high-fiber, low-saturated-fat option. {args.get('goal_notes', '')}",
            "slot_date": str(slot.slot_date),
            "meal_slot": slot.slot,
        })

    if name == "modify_plan":
        row = await db.execute(
            text("""
                SELECT mps.id FROM meal_plan_slots mps
                JOIN meal_plans mp ON mp.id = mps.plan_id
                WHERE mps.id = :sid AND mp.user_id = :uid
            """),
            {"sid": args["slot_id"], "uid": user_id},
        )
        if not row.fetchone():
            return json.dumps({"error": "slot not found"})
        await db.execute(
            text("UPDATE meal_plan_slots SET food_id = :fid WHERE id = :sid"),
            {"fid": args["food_id"], "sid": args["slot_id"]},
        )
        await db.commit()
        return json.dumps({"status": "updated", "slot_id": args["slot_id"]})

    if name == "get_user_goals":
        row = await db.execute(
            text("""
                SELECT target_weight_kg, target_ldl_mg_dl, current_ldl_mg_dl,
                       daily_calorie_target, daily_sat_fat_g_max, daily_soluble_fiber_g,
                       daily_protein_g_min, dietary_pattern, updated_at
                FROM goals WHERE user_id = :uid
            """),
            {"uid": user_id},
        )
        g = row.fetchone()
        if not g:
            return json.dumps({"error": "no goals set"})
        return json.dumps({
            "target_weight_kg": float(g.target_weight_kg) if g.target_weight_kg else None,
            "target_ldl_mg_dl": g.target_ldl_mg_dl,
            "current_ldl_mg_dl": g.current_ldl_mg_dl,
            "daily_calorie_target": g.daily_calorie_target,
            "daily_sat_fat_g_max": float(g.daily_sat_fat_g_max) if g.daily_sat_fat_g_max else None,
            "daily_soluble_fiber_g": float(g.daily_soluble_fiber_g) if g.daily_soluble_fiber_g else None,
            "daily_protein_g_min": float(g.daily_protein_g_min) if g.daily_protein_g_min else None,
            "dietary_pattern": g.dietary_pattern,
        })

    if name == "get_recent_alerts":
        limit = min(int(args.get("limit", 5)), 10)
        rows = await db.execute(
            text("""
                SELECT rule_id, severity, payload, narrative, status, ts
                FROM alerts
                WHERE user_id = :uid
                ORDER BY ts DESC LIMIT :limit
            """),
            {"uid": user_id, "limit": limit},
        )
        alerts = []
        for r in rows:
            try:
                narr = json.loads(r.narrative) if isinstance(r.narrative, str) else (r.narrative or {})
            except (TypeError, json.JSONDecodeError):
                narr = {}
            alerts.append({
                "rule_id": r.rule_id,
                "severity": r.severity,
                "headline": narr.get("headline", ""),
                "body": narr.get("body", ""),
                "thread_seed": narr.get("thread_seed", ""),
                "status": r.status,
                "ts": r.ts.isoformat(),
            })
        return json.dumps(alerts)

    return json.dumps({"error": f"unknown tool: {name}"})


async def _compress_thread_if_needed(thread_id: str, messages: list[dict], db) -> list[dict]:
    """
    If the thread has too many messages, summarize the oldest ones into a
    single summary message stored in the DB, then return the compressed history.

    Returns the (possibly compressed) message list to use for LLM context.
    """
    if len(messages) < _COMPRESS_THRESHOLD:
        return messages

    # Separate messages to compress vs keep
    to_compress = messages[:-_COMPRESS_KEEP]
    to_keep = messages[-_COMPRESS_KEEP:]

    # Ask the model to produce a concise summary of the compressed messages
    compression_prompt = [
        {
            "role": "system",
            "content": (
                "Summarize the following conversation excerpt in 3-5 bullet points. "
                "Focus on what the user asked, what data was retrieved, and what conclusions were reached. "
                "Be terse — this summary will be injected as context for the coach."
            ),
        },
        {
            "role": "user",
            "content": "\n\n".join(
                f"[{m['role'].upper()}]: {m['content']}"
                for m in to_compress
                if m.get("role") in ("user", "assistant") and m.get("content")
            ),
        },
    ]

    try:
        resp = await call_llm(
            primary_model=settings.coach_model,
            fallback_model=settings.coach_fallback_model,
            messages=compression_prompt,
            temperature=0.2,
            timeout=30.0,
        )
        summary_text = resp.choices[0].message.content or ""
    except Exception:
        logger.exception("Thread compression failed, falling back to truncation")
        return to_keep

    # Persist the summary as a special CoachMessage so future loads use it
    from sqlalchemy import text
    summary_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO coach_messages (id, thread_id, role, content, is_summary, created_at)
            SELECT :id, :tid, 'system', :content, TRUE,
                   COALESCE(MIN(created_at), now()) - INTERVAL '1 microsecond'
            FROM coach_messages
            WHERE thread_id = :tid AND is_summary = FALSE
              AND id NOT IN (
                  SELECT id FROM coach_messages
                  WHERE thread_id = :tid AND is_summary = FALSE
                  ORDER BY created_at DESC LIMIT :keep
              )
        """),
        {"id": summary_id, "tid": thread_id, "content": f"[Summary of earlier conversation]\n{summary_text}", "keep": _COMPRESS_KEEP},
    )
    await db.commit()
    logger.info("Compressed thread %s: %d messages → summary", thread_id, len(to_compress))

    return [{"role": "system", "content": f"[Summary of earlier conversation]\n{summary_text}"}] + to_keep


async def coach_stream(
    user_id: str,
    thread_id: str,
    messages: list[dict],
    db,
) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted data lines from the coach agent."""
    # Compress thread history if needed
    messages = await _compress_thread_if_needed(thread_id, messages, db)

    # Inject user context snapshot + rolling case file into system prompt
    system_content = _SYSTEM_BASE
    try:
        from luma.services.coach_context import get_coach_context, get_case_file, format_context_for_prompt
        ctx = await get_coach_context(user_id, db)
        case_file = await get_case_file(user_id, db)
        context_block = format_context_for_prompt(ctx, case_file)
        if context_block:
            system_content = _SYSTEM_BASE + "\n\n" + context_block
    except Exception:
        logger.exception("Failed to load coach context for user %s", user_id)

    full_messages = [{"role": "system", "content": system_content}, *messages]
    target = build_litellm_target(settings.coach_model)

    for _ in range(6):
        try:
            response = await litellm.acompletion(
                **target,
                messages=full_messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.5,
                timeout=60.0,
            )
        except Exception:
            logger.exception("Coach LLM call failed")
            yield "data: " + json.dumps({"type": "error", "text": "Coach temporarily unavailable."}) + "\n\n"
            return

        msg = response.choices[0].message

        if msg.tool_calls:
            full_messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in msg.tool_calls
                ],
            })
            for tc in msg.tool_calls:
                fn_name = tc.function.name
                try:
                    fn_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    fn_args = {}
                yield "data: " + json.dumps({"type": "tool_call", "name": fn_name}) + "\n\n"
                try:
                    result = await _execute_tool(fn_name, fn_args, user_id, db)
                except Exception:
                    logger.exception("Tool %s failed", fn_name)
                    result = json.dumps({"error": "tool execution failed"})
                yield "data: " + json.dumps({"type": "tool_result", "name": fn_name}) + "\n\n"
                full_messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            continue

        final_text = msg.content or ""
        try:
            stream = await litellm.acompletion(
                **target,
                messages=full_messages,
                stream=True,
                temperature=0.5,
                timeout=60.0,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield "data: " + json.dumps({"type": "token", "text": delta}) + "\n\n"
        except Exception:
            for token in final_text.split(" "):
                if token:
                    yield "data: " + json.dumps({"type": "token", "text": token + " "}) + "\n\n"

        yield "data: " + json.dumps({"type": "done"}) + "\n\n"
        return

    yield "data: " + json.dumps({"type": "error", "text": "Max iterations reached."}) + "\n\n"
