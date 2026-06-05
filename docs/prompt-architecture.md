# Luma — Prompt Architecture Master Document
**Last updated:** 2026-06-04  
**Status:** Optimization enhancements and prompt registry applied

---

## Architecture Overview

Luma has **7 distinct LLM call sites** across 5 files. All agent prompts are stored as external text templates in `backend/luma/agents/prompts/` and loaded dynamically via `prompt_loader.py`. 

No external proxy is used — LiteLLM is used as a Python library with direct provider routing encoded in model ID strings (`gemini/...`, `anthropic/...`, `local/...`). All calls go through `services/llm_client.py:call_llm()`, including the thread compressor. 

The coach agent calls `call_llm()` for initial tool-call assessment and streams final text tokens from memory (after tool executions) to avoid redundant second LLM calls.

---

## 1. Food Extractor

**File:** `backend/luma/agents/food_extractor.py`  
**Triggered by:** `POST /log/meal/text` and `POST /log/meal/voice` (after Whisper transcription)

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.1` — near-deterministic extraction |
| Timeout | `30.0s` (failover to fallback enabled) |
| Streaming | No |
| Response Format | Pydantic Schema (`FoodExtractorResponse`) |

### System Prompt Source
Loaded dynamically from `backend/luma/agents/prompts/food_extractor_system.txt`.

### User Prompt Template
```
Extract and parse this consumed meal log:
"{text}"
```

### System Memory
Stateless — no conversation history, no user context. Each call is independent.

### JSON Validation & Failure Recovery
Enforced natively using LiteLLM Pydantic validation. On any error, makes one correction retry:
- Appends bad response as `assistant` turn
- Sends `"That response was not valid JSON. Return only the JSON array, no other text."` as `user` turn
- Retry uses `timeout=60.0s` and keeps Pydantic validation active
- If retry also fails: logs error, returns `[]`

### Token Budget
| Part | Estimated Tokens |
|------|-----------------|
| System prompt (incl. schema) | ~450 |
| User prompt (avg meal description) | ~50–150 |
| Output (1–5 items) | ~200–800 |
| **Total per call (normal)** | **~700–1,400** |

---

## 2. Vision Classifier (Photo Logging)

**File:** `backend/luma/api/log.py` — `log_meal_photo()`  
**Triggered by:** `POST /log/meal/photo`

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.1` |
| Timeout | `25.0s` (failover to fallback enabled) |
| Streaming | No |
| Modality | Multimodal (image + text) |

### System Prompt (verbatim)
```
You are Luma's food vision classifier. Identify food items in the image and
return structured nutrition data. Always respond with a valid JSON array only
— no markdown, no commentary.
```

### User Prompt Template (verbatim)
```
Identify all food items visible in this image.
Return a JSON array of food items with this schema:
[{"name":"...","quantity":1.0,"unit":"serving","estimated_weight_g":200.0,
"nutrients":{"calories":300,"saturated_fat_g":2.0,"soluble_fiber_g":1.0,
"protein_g":10.0,"carbohydrates_g":40.0,"fat_g":8.0,"fiber_g":3.0,"sodium_mg":400}}].
Fill in all nutrient values — do not leave them as 0. No markdown, no preamble.
```
Plus a base64-encoded image in `image_url` format.

### System Memory
Stateless — no conversation history or user context.

### JSON Failure Recovery
On `json.JSONDecodeError`, makes one correction retry:
- Appends bad response + correction user message to the existing messages list (image remains in context)
- Retry uses `timeout=30.0s`
- If retry also fails: logs error, returns `[]`

---

## 3. Meal Planner

**File:** `backend/luma/agents/meal_planner.py`  
**Triggered by:** `POST /plan/generate`

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `anthropic/claude-sonnet-4-5` | `gemini/gemini-2.5-flash` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.2` |
| Timeout | `600.0s` (10 min) |
| Streaming | No |
| Response Format | Pydantic Schema (`MealPlanResponse`) |

### System Prompt Source
Loaded dynamically from `backend/luma/agents/prompts/meal_planner_system.txt`, dynamically substituting targets:
- `{soluble_fiber_target}`
- `{sat_fat_max}`
- `{calorie_target}`
- `{dietary_pattern}`
- `{dislikes}`
- `{allergies}`
- `{constraints}`
- `{available_foods_text}`

### User Prompt
```
Generate 7-day meal plan starting from week: {week_start}
```

### System Memory
Stateless but data-rich — user goals, dislikes, allergies, and a filtered local foods catalog are injected into the system prompt at generation time.

---

## 4. Coach Agent

**File:** `backend/luma/agents/coach.py`  
**Triggered by:** `POST /coach/threads/{id}/messages` (SSE stream response)

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `1.0` |
| Timeout | `60.0s` |
| Streaming | Yes (Direct SSE token streaming from memory, avoiding double calls) |
| Tool use | Yes — 7 tools, `tool_choice: "auto"` (executed in parallel via `asyncio.gather`) |
| Max iterations | 6 (tool loop guard) |

### System Prompt Source
Loaded dynamically from `backend/luma/agents/prompts/coach_system.txt` with `"cache_control": {"type": "ephemeral"}` header enabled to reduce prompt token costs.

### Dynamic Context Ingestion
Appends a relevance-filtered context block rendered by `format_context_for_prompt()`. Based on keywords in the user's latest query, context subsets are filtered out:
* **Nutrition 7d avg:** Injected for diet/meal/fiber/fat/calorie-related queries.
* **Biometrics snapshots (weight/HRV/sleep):** Injected for weight/HRV/sleep/heart-related queries.
* **Alert history:** Injected for alert/insight/narrative-related queries.
* **Goals & Rolling Case File:** Always included for baseline context.

### Tools (7)
Executed concurrently using `asyncio.gather` on tool triggers:
* `query_biometric_trend`
* `query_nutrition_rollup`
* `get_recent_meals`
* `propose_meal_swap`
* `modify_plan`
* `get_user_goals`
* `get_recent_alerts`

### System Memory
* **Structured context snapshot** — relevance-filtered dynamically.
* **Rolling case file** — free-text clinical notes (max 350 words).
* **Thread history** — full message array from DB. Compressed when it exceeds 30 messages (keeps last 10 uncompressed + a summary message prepended).
* **Tool Message Pruning** — tool calling payloads and DB dumps are not persisted to the database, ensuring clean text-only message history on subsequent turns.

---

## 5. Insight Narrator

**File:** `backend/luma/agents/insight_narrator.py`  
**Triggered by:** Alert rule engine in worker when an alert fires

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.4` |
| Timeout | `30.0s` |
| Streaming | No |
| Response Format | Pydantic Schema (`InsightResponse`) |

### System Prompt Source
Loaded dynamically from `backend/luma/agents/prompts/insight_narrator_system.txt`.

### User Prompt Template
```
Alert context: {context}.
Severity: {severity}.
Data: {json.dumps(payload)}.
Generate the insight JSON.
```

### System Memory
Stateless — no user history or prior alerts injected.

---

## 6. Case File Updater

**File:** `backend/luma/services/coach_context.py` — `update_case_file()`  
**Triggered by:** Worker every 2 hours + on new thread creation

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` (inherits `coach_model`) | `anthropic/claude-haiku-4-5` (inherits `coach_fallback_model`) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.2` |
| Timeout | `45.0s` |
| Streaming | No |

### System Prompt (verbatim)
```
You are a health coach's clinical note-taker.
You will receive the coach's existing case notes and a transcript of recent
conversations. Produce updated case notes that incorporate new information.
Rules: max 350 words; use short bullet points grouped under these headings only:
Goals, Patterns Identified, Conclusions & Plans, Open Questions.
Drop outdated or superseded points. Never include dates — just facts and decisions.
Output plain text only, no markdown headers.
```

### User Prompt Template
```
## Existing case notes
{existing_notes}
 
## New conversation transcript
{transcript}   ← up to 200 messages, each truncated to 600 chars
 
Update the case notes.
```

---

## 7. Thread Compressor (Coach)

**File:** `backend/luma/agents/coach.py` — `_compress_thread_if_needed()`  
**Triggered by:** Inline, at start of every `coach_stream()` call when `len(messages) >= 30`

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` (inherits `coach_model`) | `anthropic/claude-haiku-4-5` (inherits `coach_fallback_model`) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.2` |
| Timeout | `30.0s` |
| Streaming | No |
| Called via | `call_llm()` — fully metrics-tracked |

### System Prompt (verbatim)
```
Summarize the following conversation excerpt in 3-5 bullet points.
Focus on what the user asked, what data was retrieved, and what conclusions
were reached. Be terse — this summary will be injected as context for the coach.
```

---

## Summary Table

| Agent | File | Model (default) | Temp | Timeout | Streaming | Tools | ~Tokens/call |
|-------|------|----------------|------|---------|-----------|-------|-------------|
| Food Extractor | `agents/food_extractor.py` | `gemini/gemini-2.5-flash` | 0.1 | 30s | No | — | 700–1,400 |
| Vision Classifier | `api/log.py` | `gemini/gemini-2.5-flash` | 0.1 | 25s | No | — | 970–3,370 |
| Meal Planner | `agents/meal_planner.py` | `anthropic/claude-sonnet-4-5` | 0.2 | 600s | No | — | 4,700–13,700 |
| Coach | `agents/coach.py` | `gemini/gemini-2.5-flash` | 1.0 | 60s | Yes (SSE) | 7 | 2,500–6,500 |
| Insight Narrator | `agents/insight_narrator.py` | `gemini/gemini-2.5-flash` | 0.4 | 30s | No | — | 260–480 |
| Case File Updater | `services/coach_context.py` | `gemini/gemini-2.5-flash` | 0.2 | 45s | No | — | 2,600–21,000 |
| Thread Compressor | `agents/coach.py` | `gemini/gemini-2.5-flash` | 0.2 | 30s | No | — | 3,100–6,200 |

---

## Enhancements Applied (2026-06-04)

| # | Issue | Fix | Files |
|---|-------|-----|-------|
| 1 | Prompts hardcoded in inline strings | Extracted all system prompts to dynamic external templates in `/backend/luma/agents/prompts/` | `prompt_loader.py` + `prompts/*.txt` |
| 2 | Redundant second LLM call in `coach_stream` | Extracted answer from initial step, chunked in memory to stream SSE tokens directly | `coach.py` |
| 3 | Sequential tool executions | Tool database calls now run concurrently using `asyncio.gather` | `coach.py` |
| 4 | Manual regex/markdown cleaning of JSON responses | Utilized Pydantic validation schemas directly in LiteLLM's `response_format` | `food_extractor.py`, `insight_narrator.py`, `meal_planner.py` |
| 5 | High primary timeouts causing client timeouts | Reduced primary timeouts on local targets to 25-30s to trigger fast failovers | `food_extractor.py`, `api/log.py` |
| 6 | Heavy prompt token cost on Coach thread history | Enabled ephemeral prompt caching control headers on system prompts | `coach.py` |
| 7 | Irrelevant context block sizes | Implemented keyword relevance filtering in `format_context_for_prompt` | `coach_context.py` |

## Open Items (deferred)

- **`propose_meal_swap` tool stub** — Returns a templated string rather than querying the foods table. Needs a real implementation in Phase 2.
- **Meal planner timeout** — `600s` blocking timeout is long for a UI request. A background job approach would be more resilient; deferred pending Phase 2 UX decisions.
- **Case file transcript token bounding** — Bounded by message count (200 msgs), not token count. Low priority until usage data available.
