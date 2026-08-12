.PHONY: dev dev-server dev-app lint lint-app lint-server test test-app test-api test-server \
	install install-app install-api install-server deploy-api seed-api

# --------------------------------------------------------------------------- #
# dev
#
# Runs the API server (uvicorn --reload, :8000) and the web app (vite, :3000)
# concurrently in one terminal. The trap forwards Ctrl-C (and any exit) to
# both background jobs so neither is left running after you stop `make dev`.
#
# Recipe intentionally does NOT call `$(MAKE) dev-server`/`$(MAKE) dev-app`:
# GNU Make always executes recipe lines that reference $(MAKE), even under
# `make -n` (dry-run), which would defeat dry-run entirely. Run the two
# pieces directly instead; use `make dev-server` / `make dev-app` if you'd
# rather run them in two separate terminals (e.g. to keep their logs apart).
dev:
	@trap 'kill 0' EXIT INT TERM; \
	(cd server && uv run uvicorn promptatron.main:app --reload --port 8000) & \
	(cd app && npm run dev) & \
	wait

# Fake-model mode (zero AWS calls, scripted model + judge):
#   PROMPTATRON_FAKE_MODEL=1 make dev

dev-server:
	cd server && uv run uvicorn promptatron.main:app --reload --port 8000

dev-app:
	cd app && npm run dev

# --------------------------------------------------------------------------- #
# install
# --------------------------------------------------------------------------- #

install: install-app install-api install-server

install-app:
	cd app && npm ci

install-api:
	cd api && npm ci

install-server:
	cd server && uv sync --dev

# --------------------------------------------------------------------------- #
# lint
# --------------------------------------------------------------------------- #

lint: lint-app lint-server

lint-app:
	cd app && npm run lint

lint-server:
	cd server && uv run ruff check .

# --------------------------------------------------------------------------- #
# test
# --------------------------------------------------------------------------- #

test: test-app test-api test-server

test-app:
	cd app && npm test

test-api:
	cd api && npm test

test-server:
	cd server && uv run pytest

# --------------------------------------------------------------------------- #
# api deploy / seed
#
# Builds + deploys the api/ SAM stack, then seeds it from api/seed/fixtures/**
# using the TableName resolved from the stack's own outputs.
# --------------------------------------------------------------------------- #

deploy-api:
	cd api && npm ci && sam build && sam deploy && \
	TABLE_NAME=$$(aws cloudformation describe-stacks --stack-name promptatron-config --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text) && \
	if [ -z "$$TABLE_NAME" ] || [ "$$TABLE_NAME" = "None" ]; then \
		echo "deploy-api: could not resolve TableName from stack 'promptatron-config' outputs" >&2; \
		exit 1; \
	fi && \
	npm run seed -- --table "$$TABLE_NAME"

# Runs just the seeder against an already-deployed table. Requires TABLE_NAME, e.g.:
#   make seed-api TABLE_NAME=promptatron-config-ScenariosTable-XXXXXXXXXXXX
seed-api:
	@if [ -z "$(TABLE_NAME)" ]; then \
		echo "seed-api: TABLE_NAME is required, e.g. make seed-api TABLE_NAME=your-table-name" >&2; \
		exit 1; \
	fi
	cd api && TABLE_NAME=$(TABLE_NAME) npm run seed
