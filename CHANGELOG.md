# Changelog

All notable changes to the Luma health tracking and meal-planning PWA will be documented in this file.

## [Phase 1] - Ingestion & Meal Planning (Active)

### Added
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
