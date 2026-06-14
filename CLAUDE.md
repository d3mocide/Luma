# CLAUDE.md — Luma

Working agreements for Claude Code. Read the full design document before writing any code.

## Architecture Reference

Design document: see the Luma design doc in the initial issue/prompt that spawned this repo.
All architecture decisions are made there. Do not invent new patterns without explicit instruction.

Brand/UI reference: `refrence/BRAND-GUIDE.md` is the canonical source for visual language, voice, tokens, iconography, and asset paths for frontend work.

## Phase Gate — READ THIS FIRST

| Phase | Status | Exit Criteria |
|-------|--------|---------------|
| 0 — Foundations | **COMPLETE** | Compose up, all migrations, auth + /today + /trends functional, HAE ingesting |
| 1 — Logging + Plan | **COMPLETE** | Meal CRUD + voice/barcode/search logging, plan generation + log-as-eaten, pytest coverage on logging paths |
| 2 — Intelligence | **COMPLETE** | All backend agents, alert engine, coach SSE, photo logging, insights wired |
| 3 — Polish | **COMPLETE** | ML anomaly detection, stall nudges, weekly recap, full polish pass done |

**Do not skip ahead.** If asked to implement Phase 2+ features while Phase 1 is incomplete, refuse and explain.

## Stack Conventions

### Backend

- Python 3.12 + FastAPI (async everywhere)
- Pydantic v2 for all schema (use `model_config`, not `class Config`)
- SQLAlchemy 2.0 async ORM; never use sync session in async routes
- `argon2-cffi` for password hashing (Argon2id); never store plaintext or use bcrypt
- PyJWT HS256 for access tokens (15 min) + refresh tokens (7 days)
- Cookies: HTTP-only, Secure, SameSite=Lax (NOT Strict — iOS standalone PWAs drop Strict cookies on the Home Screen cold-launch navigation, logging the user out on every relaunch; the double-submit CSRF token below is the primary CSRF defense)
- CSRF: double-submit cookie (`X-CSRF-Token` header) on all state-mutating routes
- Alembic for all schema changes — never `CREATE TABLE` outside a migration
- arq for background tasks — never `asyncio.create_task` for anything that needs durability
- `httpx.AsyncClient` for all outbound HTTP — never `requests`

### Frontend

- React 18 + TypeScript (strict mode)
- TanStack Query for all server state — no raw fetch in components
- Zustand for client-only state (log sheet open/close, theme, layout)
- Tailwind CSS v4 + a custom "glass" design system: inline `CSSProperties` plus CSS custom-property tokens defined in `src/index.css` via `@theme`, with `lucide-react` for icons. The visual language is shadcn-inspired but does NOT use shadcn/ui — do not add shadcn/ui or any other UI component library. There is no `tailwind.config.js`
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
- **`AsyncSession` is not concurrency-safe** — never pass a single `AsyncSession` to `asyncio.gather`. Each coroutine in a gather must use its own session, or the calls must be sequential. Violating this raises `InvalidRequestError: This session is provisioning a new connection; concurrent operations are not permitted` and corrupts the session for all subsequent callers (see PR #193).

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
- Backend type checking: `mypy luma --ignore-missing-imports` must pass clean
- Frontend unit tests: `pnpm test` (vitest) must pass; test files live in `src/test/`

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

## Pre-Commit Checks (REQUIRED)

Before every `git commit` that touches frontend files, run:

```bash
cd frontend && pnpm type-check && pnpm lint && pnpm test
```

Fix all errors before committing. Do not use `--no-verify` to bypass hooks. Do not commit code that fails type-check, lint, or tests.

## Food Search Ranking — Invariants

`backend/luma/api/foods.py` — do not regress these:

- **`get_search_terms(q)`** must tokenize multi-word queries into individual words in addition to the full phrase. "Steak top" → `["steak top", "steak", "top"]`. Without this, reference foods drop out of the WHERE filter because their names don't contain the exact phrase, and USDA API results fill the top instead.
- **Score formula**: `similarity + match_boost + ref_boost + user_boost + usda_boost`. User foods (`source == "user"`) carry a **+2.0 boost** — the highest of any source — so foods the user added (manually or via photo) always surface above reference and USDA results at equal similarity. Reference foods (`brand == "USDA Reference"`) carry +1.5. Any word-boundary match adds +2.0. USDA API hits carry +0.1.
- **`_LOCAL_THRESHOLD = 5`**: the USDA live fallback only fires when fewer than 5 local results match. After caching, the same ranked query re-runs so reference foods still sort above raw USDA API hits.
- If ranking feels broken, check `get_search_terms` first — phrase-only terms are the most common regression.

## What Claude Code Should NOT Do

- Do not add features beyond the current phase
- Do not refactor working code as a side effect of a bug fix
- Do not add comments that explain what the code does — only add comments for non-obvious WHY
- Do not create README files or documentation files unless explicitly asked
- Do not `git push --force` or amend published commits
- Do not modify CI/CD pipelines without explicit instruction
- Do not install packages not listed in this document or the design doc without confirming first
