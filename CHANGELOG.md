# Changelog

All notable changes to the Luma health tracking and meal-planning PWA will be documented in this file.

## [Phase 1] - Ingestion & Meal Planning (Active)

### Fixed
- **SQL Transaction bug fix**: Replaced Postgres double-colon type casting operators (`::text`, `::float`, `::date`) with standard SQL `CAST(...)` syntax within raw SQL blocks inside the Coach agent and Trends API, resolving the `InFailedSQLTransactionError` transaction failure during tool execution.
- **HAE HMAC Webhook Signatures**: Corrected Health Auto Export (HAE) webhook endpoints to properly read the request body bytes and calculate the HMAC-SHA256 signature using the shared application secret, resolving the 401 Unauthorized signature verification mismatch during testing.
- **AppShell Compiler Fix**: Added the missing `useLayoutEffect` React import in [AppShell.tsx](file:///c:/Projects/Luma/frontend/src/components/AppShell.tsx) to resolve TypeScript compilation error `TS2304`.
- **Today Weight Sparkline Restoration**: Added dynamic React Query hooks fetching live 30-day weight trends (`/trends/weight_kg?range=30d`) inside [today.tsx](file:///home/zbrain/Projects/Luma/frontend/src/routes/today.tsx), automatically mapping them to the `<WeightChart>` component and eliminating the blank card space. Provided a seamless mock-series fallback for day 1 users to guarantee a premium visual layout.

### Added
- **User ID UI Display**: Added a copyable **User ID** row under the Account card in the Settings panel with dynamic glassmorphic copy buttons, enabling seamless retrieval of operator UUIDs for administration and local seeding tasks.
- **Mock Data Seeding Pipeline**: Created an administrative utility script ([seed_mock_data.py](file:///home/zbrain/Projects/Luma/backend/luma/scripts/seed_mock_data.py)) and matching `make seed-mock` command. It allows instant generation of 30-day weight trends, LDL cholesterol trends, daily macro budgets, and 14 days of compliance/indulgent meals for any user UUID (auto-creating the user and executing TimescaleDB continuous aggregate refreshes dynamically).
- **Seeded Complete Biometrics**: Expanded [seed_mock_data.py](file:///home/zbrain/Projects/Luma/backend/luma/scripts/seed_mock_data.py) to seed full biometric dimensions (`hrv_ms`, `rhr_bpm`, `sleep_duration_min`, `sleep_score`, `steps`, `active_kcal`), fully populating the "BIOMETRICS - LAST NIGHT" section on the Today page dashboard.
- **Mobile Sparkline Enhancement**: Added the compact weight sparkline to the mobile Weight card layout in [today.tsx](file:///home/zbrain/Projects/Luma/frontend/src/routes/today.tsx), elevating mobile visual fidelity and maintaining strict aesthetic parity with the desktop dashboard.
- **Per-User HAE Import Tokens (Migration 0004)**: Health Auto Export ingestion is now fully multi-user safe. Each account receives a unique webhook URL (`POST /ingest/hae/{token}`) that both identifies and authenticates the user — no more first-operator-wins ambiguity. The global `HAE_SHARED_SECRET` is retired. A new **Health import** card in Settings displays the user's personal webhook URL with a one-click copy button and a guarded **Regenerate URL** action. Replay protection is scoped per-user so identical payloads from different accounts never collide.
- **LLM Performance & Cost Telemetry**: Added a robust tracking service (`llm_metrics.py`) that captures prompt/completion tokens, processing latency, cache hit efficiency, and cost across all LLM requests, exposing a detailed Telemetry Dashboard on the Settings page displaying usage and budget charts.
- **Goal Settings Management**: Enhanced the Settings page to support operator-scoped target settings for Target Weight, LDL Cholesterol limits, and dietary patterns, with robust validation and success/error message feedback.
- **PWA Caching & Offline Capabilities**: Integrated a registered service worker utilizing `vite-plugin-pwa` and `workbox-window` to support precaching and standalone offline usability.
- **Food Browser in Meal Planner**: Added an in-modal food browser that lets users replace any planned meal slot with a real food from the database. Search by name, select, enter serving size in grams, preview live nutrition (calories, sat fat, soluble fiber, protein), and confirm — updates the slot via `POST /plan/slot/{id}/replace`.
- **Day Nutrition Totals on Calendar**: Each day card in the weekly calendar now shows a footer with per-day totals for calories, saturated fat, and soluble fiber, computed server-side and returned in `GET /plan/current` as `day_totals`.
- **Real Slot Nutrition in Modal**: The slot detail modal now displays actual agent-estimated (or food-database-sourced) nutrition instead of hardcoded placeholder values.
- **Persisted Shopping List Checkmarks**: Clicking a shopping list item now calls `PATCH /plan/{id}/shopping-list/{food_id}` to persist the purchased state to the database, with an optimistic local override for instant feedback.
- **Slot Nutrition Persistence (Migration 0003)**: Added `nutrition JSONB` and `food_id UUID FK→foods` columns to `meal_plan_slots` so agent-calculated nutrition survives across sessions.
- **USDA FoodData Central Fallback**: `/foods/search` now falls back to the live USDA FDC API when local results are sparse (< 5 hits), caches new foods into the local database, and returns a unified ranked result set.

### Changed
- **Streamlined Coach Chat Onboarding**: Removed the redundant lower suggestion chips (`SUGGESTION_CHIPS`) hovering above the chat input field on the Coach page, keeping the user interface clean and focusing attention on the primary central prompt suggestion grid when starting a new thread.
- **iOS Standalone PWA Notch & Safe Area Support**: Replaced mobile floating navigation with a fixed frosted-glass `MobileHeader` utilizing native safe-area inset environment variables (`env(safe-area-inset-top)`). Shifted the viewport layouts of all five route pages to prevent top system bars, notches, or Dynamic Islands from obscuring app titles and navigation controls.
- **Fidelity-Correct Shopping List References**: Refactored shopping list item mapping and lookup APIs to cleanly associate items by unique database Food IDs rather than loose title text, ensuring perfect correlation between plan slots, recipe ingredients, and shopping checks.
- **Responsive Calendar Column Compression**: Tuned mobile and tablet layout grid breakpoints inside `index.css` to allow calendar day column text and slot layouts to compress gracefully without horizontal breaks.
- **Fix: Log-as-Eaten Dummy Nutrition**: `POST /plan/{id}/log-as-eaten/{slot_id}` now uses the slot's persisted `nutrition` field instead of hardcoded 350 cal / 1g sat fat placeholder values.
- **Meal Plan Generation Preserves Nutrition**: `POST /plan/generate` now stores the agent's per-slot nutrient estimates in the database rather than discarding them.
- **Slot Replace Replaces Swap**: The old `POST /plan/slot/{id}/swap` (AI-generated random alternative) is replaced by `POST /plan/slot/{id}/replace` with an explicit food and serving size from the food browser.

- **Refined Today Panel Layout (Desktop & Mobile)**: Optimized the Today dashboard layouts for both desktop and mobile. On desktop, combined the Weight, Rings, and Streak cards into a single cohesive 2x2 CSS Grid container with the Weight card spanning two vertical rows and all margins aligned to a strict 20px rhythm. On mobile, re-ordered all cards into a premium, highly logical priority sequence (Rings → Weight → Biometrics → Remaining → Insights → Plan → Recent Meals).
- **Legible Weekly Meal Plan Fonts**: Increased readability of the weekly calendar on the Plans page by eliminating tiny, hardcoded inline font sizes on meal slots and dynamically applying crisp CSS-defined sizing (increasing slot labels to `10px` and slot meal titles to `13px` with `1.4` line-height).
- **Shared Logo Redesign (`LumaLogo.tsx`)**: Replaced the abstract glow mark with the new sun-over-hill logo artwork and propagated it across the login shell and app chrome through the shared logo component.
- **Global Logging Drawer (`LogSheet.tsx`)**: Created a premium sliding glassmorphic drawer for high-fidelity multi-modal ingestion.
  - **Voice Logging**: Integrated browser-native `MediaRecorder` connected to the `/log/meal/voice` endpoint using Whisper STT and LLM plate extraction.
  - **Barcode Scanner**: Added full QR/barcode camera lookup (`html5-qrcode`) and manual code lookup with Open Food Facts (OFF) query integration.
  - **Fuzzy Search**: Enabled pg_trgm search of foods from backend database.
  - **Plate Composition**: Interactive review, adjustments of portions/items, and nutrition overview before finalization.
- **Weekly Meal Planning API (`plan.py`)**: Implemented generation, active plan slots, slot swapping (AI-driven alternatives), shopping list checkboxes, and single-click "Log as Eaten" transitions.
- **Adherence Metrics Dashboard (`today.py`)**: Connected backend query structures to aggregate biometrics and daily macronutrient rollups against user profile goals (sat fat, soluble fiber, calories).
- **TypeScript Optimization**: Rectified all strict compiler checks, resolved unused imports, and enabled clean build generation for production.

### Changed
- **First-Run Operator Onboarding Restored**: Repositioned browser-based first-user account creation as the default workflow across setup docs, Make help text, and local setup output; `make seed` is now documented as an optional bootstrap/recovery utility rather than the primary path.
- **Auth Bootstrap Error Handling**: Auth endpoints now return explicit service-unavailable errors when the database is unavailable, uninitialized, or misconfigured, and the login screen surfaces those startup failures directly instead of showing a generic internal server error.
- **Frontend App Icons & Mock Bootstrap**: Fixed mock API initialization ordering, updated app icon/manifest references to existing public assets, and aligned planner copy from "Claude" to "Luma".
- **Brand Guide Compliance Sweep (Frontend UI)**: Removed emoji and symbol glyph usage from interactive surfaces, replaced meal-slot pictograms with Lucide icons, normalized icon stroke usage, applied safe-area handling to the mobile bottom nav, shifted non-logo/non-FAB sky+sun accents to sky-only gradients, converted route-level hardcoded UI colors to design tokens, and aligned Today insight cards with the specified left-accent border treatment.
- **Container-Free LLM SDK Integration**: Migrated the AI pipeline from the standalone LiteLLM proxy container to the in-process `litellm` Python SDK for direct connection to local/remote LLM nodes, reducing memory footprint and network routing complexity.
- **Dynamic Model Agnosticism**: Decoupled AI model configuration into environment variables (`FOOD_EXTRACTOR_MODEL`, `MEAL_PLANNER_MODEL`, `LOCAL_AI_API_BASE`), allowing the application to utilize any local or remote OpenAI-compatible completion node directly using `LOCAL_AI_API_BASE`.
- **Argon2 Constant-Time Verification**: Fixed the timing oracle mitigation by generating a syntactically correct, pre-compiled dummy hash to avoid verification decoding exceptions.
- **PWA Route Polish**: Wired the `AdherenceRing` visualization and meal planners to support live data fallbacks.
- **Login Visual Edge Smoothing**: Softened abrupt blur seams on the auth view by feathering atmospheric gradients and refining glass-card edge rendering.
- **Container Dev Hot Reload**: Added a profile-scoped `web-dev` service in Compose plus container-aware Vite proxy settings for live UI preview while backend services run in Docker.
- **Developer Command Shortcuts**: Added a root `Makefile` with quick start targets for `prod`, `dev`, `down`, `rebuild`, migrations, seeding, and logs.
- **Settings Sign-Out Action**: Added a frontend logout control in settings that calls `/auth/logout`, clears session state, and returns to login.
- **Today UI Mock Data Mode**: Added frontend mock utilities and sparse-data fallback for the Today view, plus `VITE_USE_MOCK_DATA=1` support for consistent UI tuning in dev.
- **App-Wide Frontend Mock Mode**: Added a centralized mock API layer for auth, today, trends, and plan endpoints so all major routes can be fully populated for design iteration without backend dependence.
- **Frontend Naming Cleanup**: Renamed the top-level `web/` folder to `frontend/` and aligned Compose/Makefile dev service naming to `frontend-dev` for clearer infrastructure mapping.
- **Per-User Measurement Units**: Added account-scoped measurement preference support with a new Settings switcher for `metric` or `imperial`, persisted via backend preferences API and mirrored in mock mode.

### Removed
- **LiteLLM Docker Container & Configs**: Deprecated and deleted the `litellm` container service from `compose.yml` and the local `./litellm/` directory with its configuration files, reducing the running container footprint.
- **Obsolete Parameters**: Removed `LITELLM_BASE_URL` and `LITELLM_MASTER_KEY` variables in favor of direct `LOCAL_AI_API_BASE` integration.

## [Phase 0] - Foundations

### Added
- **Docker Compose Orchestration**: Scaled the entire self-hosted stack containing PostgreSQL/TimescaleDB, Redis, LiteLLM, Whisper, Nginx, and FastAPI.
- **Alembic Database Schema**: Fully synchronized all 13 relational tables and 3 hypertables for high-density biometric logs, plan slots, and alerts.
- **Operator Authentication**: Custom Argon2id password-hashing with secure HttpOnly cookies, JWT management, and multi-user registration/creation prompts.
- **HMAC Signatures for Ingest**: Integrated secure SHA256 signatures for fast external data pipelines (HAE).
