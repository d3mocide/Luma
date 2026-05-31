SHELL := /bin/bash

COMPOSE := docker compose
CORE_SERVICES := api postgres redis whisper worker

.PHONY: help setup prod dev down stop restart rebuild pull ps logs logs-api logs-frontend logs-web migrate seed seed-mock ai-smoke ai-smoke-full clean nuke

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
	@echo "  make seed-mock - seed high-fidelity mock data (weight, ldl, meals) for any user UUID"
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

seed-mock:
	$(COMPOSE) cp backend/luma/scripts/seed_mock_data.py api:/app/luma/scripts/seed_mock_data.py
	@read -p "Enter User UUID to seed: " uid; \
	$(COMPOSE) exec api python -m luma.scripts.seed_mock_data $$uid; \
	$(COMPOSE) exec postgres psql -U sh -d luma -c "CALL refresh_continuous_aggregate('biometrics_daily', NULL, NULL);"


SMOKE_ARGS ?=
ai-smoke:
	cd backend && python verify_api.py --skip-plan-generation --skip-llm-agents $(SMOKE_ARGS)

ai-smoke-full:
	cd backend && python verify_api.py $(SMOKE_ARGS)

clean:
	$(COMPOSE) rm -f

nuke:
	$(COMPOSE) down -v --remove-orphans
