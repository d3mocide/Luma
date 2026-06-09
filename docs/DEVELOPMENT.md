# Development Guide

Day-to-day workflow for working on Luma locally.

---

## Starting the Dev Stack

The `dev` Compose profile mounts the frontend source directory into a Node container and runs Vite with hot module replacement. The backend services (API, Postgres, Redis, Whisper, Worker) run as built containers alongside it.

```bash
make dev
```

| URL | Service |
|---|---|
| `http://localhost:5173` | Vite dev server (React app, hot reload) |
| `https://localhost` | Nginx production proxy (use this for HAE tests) |

The Vite dev server proxies all `/api` requests to `api:8000` inside the Docker network — you don't need to change any frontend constants when switching between dev and prod.

### Mock mode

Set `VITE_USE_MOCK_DATA=1` in `.env` (it is enabled by default) to run the frontend against fixture data without a live backend:

```bash
# In .env
VITE_USE_MOCK_DATA=1
make dev
```

All major routes — Today, Trends, Plan, Settings — are fully populated from `frontend/src/lib/mock-data.ts`. Switch to `VITE_USE_MOCK_DATA=0` to point at the real API.

---

## Database Migrations

All schema changes go through Alembic. Never run raw `CREATE TABLE` or `ALTER TABLE` outside a migration.

### Create a new migration

```bash
# Shell into the running api container
docker compose exec api bash

# Auto-generate a migration from model changes
alembic revision --autogenerate -m "add_user_preferences_table"

# Review the generated file in backend/alembic/versions/ before applying
alembic upgrade head
```

Or from the host using the Make shortcut:

```bash
make migrate
```

### Migration discipline

- One migration file per logical change
- Never edit a migration that has already been applied — create a new one
- Hypertable creation and continuous aggregates belong in `0001_initial.py`
- CI should run `alembic upgrade head` before any API tests

---

## Running Tests

### Backend

```bash
docker compose exec api pytest
```

**Phase 0 minimum test suite:**

| Test | Description |
|---|---|
| Import smoke test | `pytest` can import all modules without error |
| Auth round-trip | `POST /auth/login` → `GET /auth/me` returns correct user |
| HAE ingest smoke | `POST /ingest/hae` with valid HMAC returns 200 |

Run a specific test file:

```bash
docker compose exec api pytest backend/tests/test_auth.py -v
```

Run mypy type checking:

```bash
docker compose exec api mypy luma --ignore-missing-imports
```

### Frontend

```bash
cd frontend && pnpm test          # run vitest unit tests once
cd frontend && pnpm test --watch  # re-run on file changes
```

Test files live in `frontend/src/test/`. The setup uses vitest with jsdom and `@testing-library/react`.

---

## Logs

```bash
make logs           # all services
make logs-api       # api only
make logs-web       # Vite dev server
docker compose logs -f worker   # background task worker
```

---

## Local LLM Setup (Ollama)

To run AI features without cloud API keys, install [Ollama](https://ollama.com) on your host machine and pull the models you want to use:

```bash
# On the host (not inside Docker)
ollama pull gemma-4-e4b-it          # food extraction (lightweight)
ollama pull llama3.1:8b-instruct    # meal planning, coaching
```

Then update `.env`:

```bash
LOCAL_AI_API_BASE=http://host.docker.internal:11434
FOOD_EXTRACTOR_MODEL=local/gemma-4-e4b-it
MEAL_PLANNER_MODEL=local/llama3.1:8b-instruct
COACH_MODEL=local/llama3.1:8b-instruct
INSIGHT_NARRATOR_MODEL=local/llama3.1:8b-instruct
```

`host.docker.internal` resolves to the Docker host IP on both macOS and Linux (Linux requires Docker 20.10+ or manual host-gateway configuration).

Restart the api and worker after changing `.env`:

```bash
docker compose restart api worker
```

---

## Seeding Food Data

The local food database starts empty. Populate it from USDA FoodData Central:

```bash
# Downloads and imports Foundation Foods + SR Legacy (~50k items)
docker compose exec api python -m luma.scripts.ingest_usda
```

Open Food Facts data is populated incrementally: the worker runs a monthly JSONL dump ingest on a schedule, and individual barcodes are fetched on demand when the barcode scanner looks them up.

---

## Code Conventions

### Python (backend)

- All functions that touch the database or call external services must be `async`
- Use SQLAlchemy ORM or `text()` with `:param` named bindings — never string-interpolate user input into SQL
- Pydantic v2 for all request/response schemas; use `model_config`, not `class Config`; no bare `Any` types
- `argon2-cffi` for passwords (Argon2id); `PyJWT` for tokens — do not use bcrypt or `python-jose`
- Background work that needs durability goes through arq — never `asyncio.create_task`
- Outbound HTTP uses `httpx.AsyncClient` — never `requests`
- Never log passwords, tokens, or full JWT payloads

### TypeScript (frontend)

- Strict mode is on — no `any`; use `unknown` with narrowing or define explicit types
- All server state lives in TanStack Query hooks in `lib/api.ts` — no raw `fetch` in components
- Client-only UI state (sheet open/close, theme) lives in the Zustand store at `stores/index.ts`
- Do not add UI libraries beyond shadcn/ui and Tailwind — Recharts for all charts
- File naming: `kebab-case` for route files, `PascalCase` for component files
- Tailwind v4: all theme config lives in `src/index.css` under `@theme { ... }` — there is no `tailwind.config.js`; postcss uses `@tailwindcss/postcss`

### Naming

| Context | Convention |
|---|---|
| Python modules | `snake_case` |
| Python classes | `PascalCase` |
| Python functions / variables | `snake_case` |
| TypeScript components | `PascalCase` |
| TypeScript functions / variables | `camelCase` |
| Route files | `kebab-case` |
| Database tables / columns | `snake_case`, plural table names |
| API route segments | `kebab-case`, REST nouns |

### Comments

Write comments only for non-obvious **why**, not for what the code does. One short line maximum — no multi-paragraph docstrings.

---

## Rebuilding After Changes

**Backend Python changes** — the API container mounts source via volume in dev and auto-reloads via Uvicorn's `--reload` flag. No rebuild needed for most changes.

**Frontend changes** — hot-reloaded automatically by Vite.

**New Python dependencies** — add to `backend/pyproject.toml`, then:

```bash
make rebuild   # rebuilds the api/worker image with the new dependency
```

**New npm dependencies** — add to `frontend/package.json`, then:

```bash
docker compose --profile dev restart frontend-dev
```

---

## Resetting State

**Wipe all data and start fresh** (irreversible):

```bash
make nuke      # removes all containers, volumes, and networks
make prod
make migrate
```

Then open Luma in the browser and create the initial operator account through the first-run setup flow.

**Wipe just the database:**

```bash
docker compose stop api worker
docker compose rm -f postgres
docker volume rm luma_pgdata
docker compose up -d postgres
make migrate
make seed
```
