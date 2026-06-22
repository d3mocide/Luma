# AGENTS.md — Luma

Working agreements for Jules, Antigravity, and other autonomous agents. Read CLAUDE.md first — this file supplements it.

## What You Are Building

Luma is a self-hosted, data-sovereign health tracking and meal-planning PWA. Single-operator use case. The operator's primary health goal is lowering LDL cholesterol via tracked nutrition and weight management.

Full design: see the Luma design document in the issue/prompt that spawned this repo.

Frontend brand reference: `refrence/BRAND-GUIDE.md` is the canonical visual and voice guide for UI work.

## Phase Gate

All four phases (0–3) are complete. The project is in maintenance and enhancement mode. No phase restrictions apply — fix bugs, improve UX, respond to user requests.

## Repository Layout

```
/backend/luma/   Python FastAPI app
/backend/alembic/            Migrations
/frontend/src/               React TypeScript PWA
/nginx/                      Nginx config
/whisper/                    Whisper STT wrapper
compose.yml                  Orchestration
```

## Agent-Specific Rules

### Planning Before Coding

Before writing code for any non-trivial task:
1. State which section(s) of the design doc you are implementing
2. List the files you will create or modify
3. Identify any ambiguities and resolve them against the design doc before writing code

For frontend/UI changes, explicitly cite the relevant sections from `refrence/BRAND-GUIDE.md` in your plan.

### Commit & Changelog Discipline

- One logical change per commit
- Commit messages: imperative mood, present tense, ≤72 chars subject
- Never commit `.env` or any file containing real secrets
- Run `alembic check` (if migrations exist) before committing backend changes
- Maintain a `/CHANGELOG.md` file at the root of the project, logging all feature completions, enhancements, bug fixes, and infrastructure stabilizations before signing off on any phase or significant task.

### Parallelism Guidance

These tasks can be parallelized within a phase:
- Backend API routes (they share models but not each other)
- Frontend route components (they share AppShell but not each other)
- Service clients (HAE normalizer, OFF client, USDA client) — independent

These must be sequential:
- Schema migration must precede any API that uses the new tables
- `seed_admin` script must run after migration
- Frontend API client must be updated when backend routes change

### Error Handling

- FastAPI routes: use `HTTPException` with appropriate status codes
- Never return 500 with stack traces in production responses
- Log full exceptions server-side with `logging.exception()`
- Database errors: catch `asyncpg.PostgresError`, log, raise `HTTPException(503)`
- Auth errors: always return 401 (never leak whether email exists vs wrong password)

### AsyncSession — no concurrent use in agents

`AsyncSession` is **not safe to share across concurrent coroutines**.
Never pass a single session to `asyncio.gather`:

```python
# BROKEN — raises InvalidRequestError and corrupts the session
ctx, case_file, unit = await asyncio.gather(
    get_coach_context(user_id, db),
    get_case_file(user_id, db),
    get_measurement_system(user_id, db),
)
```

Use sequential awaits instead:

```python
ctx       = await get_coach_context(user_id, db)
case_file = await get_case_file(user_id, db)
unit      = await get_measurement_system(user_id, db)
```

If you need true parallelism, open a separate `AsyncSessionLocal()` per coroutine.
Violating this corrupts the session for all subsequent DB operations — including tool
calls later in the same agent loop — and surfaces as "Something went wrong" in the UI
(regression fixed in PR #193).

### Tool call bodies must never raise

Tool execution in agent loops must always `return json.dumps({"error": ...})` on
failure — never raise. If a tool raises, it escapes the agent loop and the user sees
an unrecoverable error instead of a graceful tool-error message. Wrap every tool
body in try/except.

### Security Checklist (before any PR)

- [ ] No hardcoded secrets
- [ ] All user inputs validated via Pydantic
- [ ] SQL via ORM or parameterized `text()` only
- [ ] HAE HMAC verification is constant-time (`hmac.compare_digest`)
- [ ] JWT expiry enforced
- [ ] HTTP-only cookies set with `Secure=True` in production
- [ ] CORS origin whitelist matches deployment hostname only

## Data Model Quick Reference

| Table | Type | Notes |
|-------|------|-------|
| `users` | regular | UUID PK, Argon2id password_hash |
| `goals` | regular | 1:1 with users |
| `preferences` | regular | composite PK |
| `foods` | regular | source = off/usda/user/llm |
| `recipes` | regular | with recipe_ingredients |
| `meal_plans` | regular | unique active plan per user/week |
| `meal_plan_slots` | regular | FK to plans |
| `shopping_list_items` | regular | FK to plans |
| `coach_threads` | regular | conversation grouping |
| `coach_messages` | regular | full history |
| `biometrics` | hypertable | chunk 7d, user+metric+ts index |
| `meal_events` | hypertable | chunk 30d |
| `alerts` | hypertable | chunk 30d |
| `biometrics_daily` | continuous agg | hourly refresh, 14d lag |

## Environment Variables (all required)

```
DATABASE_URL          postgresql+asyncpg://sh:<PG_PASSWORD>@postgres:5432/luma
REDIS_URL             redis://redis:6379/0
JWT_SECRET            <min 32 bytes random>
JWT_ALGORITHM         HS256
ACCESS_TOKEN_EXPIRE_MINUTES  15
REFRESH_TOKEN_EXPIRE_DAYS    7
HAE_SHARED_SECRET     <min 32 bytes random>
WHISPER_URL           http://whisper:9000
ANTHROPIC_API_KEY     <from Anthropic console>
ENVIRONMENT           development | production
CORS_ORIGINS          https://health.yourdomain.com
```
