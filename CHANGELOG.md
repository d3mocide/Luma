# Changelog

All notable changes to the Luma health tracking and meal-planning PWA will be documented in this file.

## [Phase 1] - Ingestion & Meal Planning (Active)

### Added
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

### Removed
- **LiteLLM Docker Container & Configs**: Deprecated and deleted the `litellm` container service from `compose.yml` and the local `./litellm/` directory with its configuration files, reducing the running container footprint.
- **Obsolete Parameters**: Removed `LITELLM_BASE_URL` and `LITELLM_MASTER_KEY` variables in favor of direct `LOCAL_AI_API_BASE` integration.

## [Phase 0] - Foundations

### Added
- **Docker Compose Orchestration**: Scaled the entire self-hosted stack containing PostgreSQL/TimescaleDB, Redis, LiteLLM, Whisper, Nginx, and FastAPI.
- **Alembic Database Schema**: Fully synchronized all 13 relational tables and 3 hypertables for high-density biometric logs, plan slots, and alerts.
- **Operator Authentication**: Custom Argon2id password-hashing with secure HttpOnly cookies, JWT management, and multi-user registration/creation prompts.
- **HMAC Signatures for Ingest**: Integrated secure SHA256 signatures for fast external data pipelines (HAE).
