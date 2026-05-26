# CLAUDE.md — Luma

Working agreements for Claude Code. Read the full design document before writing any code.

## Architecture Reference

Design document: see the Luma design doc in the initial issue/prompt that spawned this repo.
All architecture decisions are made there. Do not invent new patterns without explicit instruction.

Brand/UI reference: `refrence/BRAND-GUIDE.md` is the canonical source for visual language, voice, tokens, iconography, and asset paths for frontend work.

## Phase Gate — READ THIS FIRST

| Phase | Status | Exit Criteria |
|-------|--------|---------------|
| 0 — Foundations | **CURRENT** | Compose up, all migrations, auth + /today + /trends functional, HAE ingesting |
| 1 — Logging + Plan | LOCKED | Phase 0 complete |
| 2 — Intelligence | LOCKED | Phase 1 complete |
| 3 — Polish | LOCKED | Phase 2 complete |

**Do not skip ahead.** If asked to implement Phase 1+ features while Phase 0 is incomplete, refuse and explain.

## Stack Conventions

### Backend

- Python 3.12 + FastAPI (async everywhere)
- Pydantic v2 for all schema (use `model_config`, not `class Config`)
- SQLAlchemy 2.0 async ORM; never use sync session in async routes
- `argon2-cffi` for password hashing (Argon2id); never store plaintext or use bcrypt
- PyJWT HS256 for access tokens (15 min) + refresh tokens (7 days)
- Cookies: HTTP-only, Secure, SameSite=Strict
- CSRF: double-submit cookie (`X-CSRF-Token` header) on all state-mutating routes
- Alembic for all schema changes — never `CREATE TABLE` outside a migration
- arq for background tasks — never `asyncio.create_task` for anything that needs durability
- `httpx.AsyncClient` for all outbound HTTP — never `requests`

### Frontend

- React 18 + TypeScript (strict mode)
- TanStack Query for all server state — no raw fetch in components
- Zustand for client-only state (log sheet open/close, theme, layout)
- Tailwind CSS + shadcn/ui components (do not add other UI libraries)
- Recharts for charts — do not add Chart.js or D3 directly
- React Router v6 for routing
- vite-plugin-pwa for service worker/manifest
- Never import from `react-dom` directly — use React 18 patterns
- For visual/copy decisions, follow `refrence/BRAND-GUIDE.md` before introducing new UI treatments

### File Layout

Follow §12 of the design doc exactly. Do not create files outside the tree defined there without discussion.

### Naming

- Python: snake_case modules, PascalCase classes, snake_case functions/variables
- TypeScript: PascalCase components, camelCase functions/variables, kebab-case filenames for routes
- Database: snake_case tables and columns, plural table names
- API routes: kebab-case path segments, REST nouns

## Code Quality Rules

- All Python functions that touch DB or external services must be `async`
- All DB queries must use parameterized statements (SQLAlchemy ORM or `text()` with `:param` syntax)
- Never interpolate user input into SQL strings
- Never log passwords, tokens, or full JWT payloads
- Never expose internal error details to API responses in production (use generic messages, log details server-side)
- All Pydantic models must have explicit field types — no `Any` unless truly unavoidable
- TypeScript: no `any` — use `unknown` and narrow, or define proper types

## Migration Discipline

- Each migration file touches exactly one logical change
- Never edit an existing migration that has been applied (create a new one)
- Hypertable creation and continuous aggregates go in the initial migration (`0001_initial.py`)
- Run `alembic upgrade head` in CI before any API tests

## Testing (Phase 0 minimum)

- At minimum: `pytest` can import all modules without error
- Auth round-trip test: register → login → `/auth/me` returns correct user
- Ingest smoke test: POST to `/ingest/hae` with valid HMAC returns 200
- Do not ship Phase 1 without coverage on logging paths

## Secret Handling

- All secrets from environment variables via `config.py` (Pydantic `BaseSettings`)
- `.env` is gitignored; `.env.example` has all required keys with placeholder values
- Never hardcode secrets, even in tests — use `pytest` fixtures with fake values
- HAE shared secret: minimum 32 bytes of entropy

## Docker / Compose

- All services speak to each other via service names (`postgres`, `redis`, `litellm`, etc.)
- `api` and `worker` share the same image, different `command`
- `nginx` is the only service that exposes ports to the host
- Health checks on all stateful services (postgres, redis)
- Do not use `latest` tag for infrastructure images (postgres, redis, nginx) — pin versions

## LLM Usage

- Local Llama 3 (via LiteLLM `food-extractor` alias): food extraction, cheap repetitive classification
- Claude Sonnet (via LiteLLM `meal-planner`, `coach`, `insight-narrator` aliases): planning, coaching, narration
- Route through LiteLLM proxy — never call Anthropic API directly from application code
- All LLM calls must have timeout + retry with exponential backoff
- Log model alias + input/output token counts for cost tracking (not content)

## What Claude Code Should NOT Do

- Do not add features beyond the current phase
- Do not refactor working code as a side effect of a bug fix
- Do not add comments that explain what the code does — only add comments for non-obvious WHY
- Do not create README files or documentation files unless explicitly asked
- Do not `git push --force` or amend published commits
- Do not modify CI/CD pipelines without explicit instruction
- Do not install packages not listed in this document or the design doc without confirming first
