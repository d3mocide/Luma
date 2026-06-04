SHELL := /bin/bash

COMPOSE := docker compose
CORE_SERVICES := api postgres redis whisper worker

.PHONY: help setup prod dev down stop restart rebuild pull ps logs logs-api logs-frontend logs-web migrate seed seed-reference seed-mock seed-build seed-merge clear-hae-data ai-smoke ai-smoke-full clean nuke

help:
	@echo "Luma quick commands"
	@echo ""
	@echo "  make setup    - initialize .env and local certs"
	@echo "  make prod     - start production-style stack (nginx frontend + api)"
	@echo "  make dev      - start dev stack with Vite hot reload"
	@echo "  make stop     - stop running containers"
	@echo "  make down     - stop and remove containers/networks"
	@echo "  make restart  - restart running containers"
	@echo "  make rebuild  - rebuild images and start stack"
	@echo "  make ps       - show service status"
	@echo "  make logs     - tail logs for all services"
	@echo "  make logs-api - tail logs for api service"
	@echo "  make logs-frontend - tail logs for frontend-dev service"
	@echo "  make logs-web - alias for logs-frontend"
	@echo "  make migrate  - run alembic migrations"
	@echo "  make seed     - optional operator bootstrap / recovery"
	@echo "  make seed-reference - manually force seed clinical core USDA Reference foods"
	@echo "  make seed-build  - generate staged batch from downloaded FDC dataset"
	@echo "                       BATCH=<proteins|grains|dairy|produce|legumes> SOURCE=<fdc.json>"
	@echo "  make seed-merge  - merge reviewed staged batch into seed JSON then re-seed DB"
	@echo "                       FILE=<staged/batch.json>"
	@echo "  make seed-mock - seed high-fidelity mock data (weight, ldl, meals) for any user UUID"
	@echo "  make clear-hae-data - delete all HAE biometric rows for a given user UUID"
	@echo "  make ai-smoke    - run API E2E smoke tests (skips LLM + plan generation)"
	@echo "  make ai-smoke-full - run API E2E smoke tests including LLM agents"
	@echo "  make clean    - remove stopped containers"
	@echo "  make nuke     - remove containers, volumes, and orphans"

setup:
	./setup_dev.sh

prod:
	$(COMPOSE) up -d --build frontend $(CORE_SERVICES)

dev:
	$(COMPOSE) --profile dev up -d --build frontend-dev $(CORE_SERVICES)

stop:
	$(COMPOSE) stop

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

rebuild:
	$(COMPOSE) up -d --build

pull:
	$(COMPOSE) pull

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=200

logs-api:
	$(COMPOSE) logs -f --tail=200 api

logs-frontend:
	$(COMPOSE) --profile dev logs -f --tail=200 frontend-dev

logs-web: logs-frontend

migrate:
	$(COMPOSE) exec api alembic upgrade head

seed:
	$(COMPOSE) exec api python -m luma.scripts.seed_admin

seed-reference:
	$(COMPOSE) exec api python -m luma.scripts.ingest_usda

# Generate a staged batch JSON from a downloaded USDA FDC dataset file.
# Download SR Legacy or Foundation Foods ZIP from https://fdc.nal.usda.gov/download-datasets
# then unzip and pass the JSON as SOURCE.
# Example: make seed-build BATCH=grains SOURCE=~/Downloads/FoodData_Central_sr_legacy_food_json_2021-10-28.json
BATCH ?= proteins
SOURCE ?=
seed-build:
	@if [ -z "$(SOURCE)" ]; then \
		echo "ERROR: SOURCE is required. Usage: make seed-build BATCH=$(BATCH) SOURCE=/path/to/fdc.json"; \
		exit 1; \
	fi
	python3 -m luma.scripts.build_seed build \
		--source "$(SOURCE)" \
		--batch "$(BATCH)" \
		--output "backend/luma/scripts/staged/batch_$(BATCH).json"
	@echo ""
	@echo "Review backend/luma/scripts/staged/batch_$(BATCH).json then run:"
	@echo "  make seed-merge FILE=backend/luma/scripts/staged/batch_$(BATCH).json"

# Merge a reviewed staged batch into usda_seed_foods.json and re-seed the running DB.
# Example: make seed-merge FILE=backend/luma/scripts/staged/batch_grains.json
FILE ?=
seed-merge:
	@if [ -z "$(FILE)" ]; then \
		echo "ERROR: FILE is required. Usage: make seed-merge FILE=backend/luma/scripts/staged/batch.json"; \
		exit 1; \
	fi
	python3 -m luma.scripts.build_seed merge "$(FILE)"
	$(COMPOSE) exec api python -m luma.scripts.ingest_usda

seed-mock:
	$(COMPOSE) cp backend/luma/scripts/seed_mock_data.py api:/app/luma/scripts/seed_mock_data.py
	@read -p "Enter User UUID to seed: " uid; \
	$(COMPOSE) exec api python -m luma.scripts.seed_mock_data $$uid; \
	$(COMPOSE) exec postgres psql -U sh -d luma -c "CALL refresh_continuous_aggregate('biometrics_daily', NULL, NULL);"


clear-hae-data:
	@read -p "Enter User UUID to clear HAE data: " uid; \
	$(COMPOSE) exec api python -m luma.scripts.clear_hae_data $$uid

SMOKE_ARGS ?=
ai-smoke:
	cd backend && python verify_api.py --skip-plan-generation --skip-llm-agents $(SMOKE_ARGS)

ai-smoke-full:
	cd backend && python verify_api.py $(SMOKE_ARGS)

clean:
	$(COMPOSE) rm -f

nuke:
	$(COMPOSE) down -v --remove-orphans
