# AGENTS.md — Lumo

Working agreements for Jules, Antigravity, and other autonomous agents. Read CLAUDE.md first — this file supplements it.

## What You Are Building

Lumo is a self-hosted, data-sovereign health tracking and meal-planning PWA. Single-operator use case. The operator's primary health goal is lowering LDL cholesterol via tracked nutrition and weight management.

Full design: see the Lumo design document in the issue/prompt that spawned this repo.

## Phase Gate

Same as CLAUDE.md. Phase 0 must be complete before any agent touches Phase 1+ code.

**Phase 0 exit criteria (all must pass):**
1. `docker compose up -d` succeeds for all services
2. `alembic upgrade head` applies all migrations cleanly
3. `POST /api/v1/auth/login` returns a JWT cookie for seeded admin user
4. `GET /api/v1/auth/me` returns user info with valid cookie
5. `GET /api/v1/today` returns valid JSON (mocked OK)
6. `GET /api/v1/trends/weight_kg?range=7d` returns valid JSON (real or empty series)
7. `POST /api/v1/ingest/hae` with valid HMAC-SHA256 header returns 200
8. Frontend builds with `pnpm build` without errors
9. All five routes render without runtime errors

## Repository Layout

```
/backend/lumo/   Python FastAPI app
/backend/alembic/            Migrations
/web/src/                    React TypeScript PWA
/nginx/                      Nginx config
/whisper/                    Whisper STT wrapper
/litellm/                    LiteLLM config
compose.yml                  Orchestration
```

## Agent-Specific Rules

### Planning Before Coding

Before writing code for any non-trivial task:
1. State which section(s) of the design doc you are implementing
2. List the files you will create or modify
3. Identify any ambiguities and resolve them against the design doc before writing code

### Commit Discipline

- One logical change per commit
- Commit messages: imperative mood, present tense, ≤72 chars subject
- Always include the phase in the commit subject: `[phase-0] add HAE ingest endpoint`
- Never commit `.env` or any file containing real secrets
- Run `alembic check` (if migrations exist) before committing backend changes

### Parallelism Guidance

These tasks can be parallelized within a phase:
- Backend API routes (they share models but not each other)
- Frontend route components (they share AppShell but not each other)
- Service clients (HAE normalizer, OFF client, USDA client) — independent

These must be sequential:
- Schema migration must precede any API that uses the new tables
- `seed_admin` script must run after migration
- Frontend API client must be updated when backend routes change

### Stub vs Implement

For Phase 0, these files must be **stubbed** (return `{"detail": "not implemented"}` or similar):
- All of `/api/v1/log/*`
- All of `/api/v1/plan/*`
- All of `/api/v1/coach/*`
- `/api/v1/foods/*`
- `/api/v1/recipes/*`
- All agent files in `agents/`
- All alert engine files in `alerts/`

These files must be **fully implemented** for Phase 0:
- Auth routes (`/api/v1/auth/*`)
- HAE ingest (`/api/v1/ingest/hae`)
- Today (mocked response, not DB-backed)
- Trends (`/api/v1/trends/{metric}` — real DB query)
- All DB models and the initial migration
- Frontend shell with five wired routes and mock card data
- `scripts/seed_admin.py`

### Error Handling

- FastAPI routes: use `HTTPException` with appropriate status codes
- Never return 500 with stack traces in production responses
- Log full exceptions server-side with `logging.exception()`
- Database errors: catch `asyncpg.PostgresError`, log, raise `HTTPException(503)`
- Auth errors: always return 401 (never leak whether email exists vs wrong password)

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
DATABASE_URL          postgresql+asyncpg://sh:<PG_PASSWORD>@postgres:5432/lumo
REDIS_URL             redis://redis:6379/0
JWT_SECRET            <min 32 bytes random>
JWT_ALGORITHM         HS256
ACCESS_TOKEN_EXPIRE_MINUTES  15
REFRESH_TOKEN_EXPIRE_DAYS    7
HAE_SHARED_SECRET     <min 32 bytes random>
LITELLM_BASE_URL      http://litellm:4000
WHISPER_URL           http://whisper:9000
ANTHROPIC_API_KEY     <from Anthropic console>
ENVIRONMENT           development | production
CORS_ORIGINS          https://health.yourdomain.com
```
