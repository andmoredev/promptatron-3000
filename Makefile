.PHONY: dev dev-server dev-app lint lint-app lint-server test test-app test-api test-server \
	install install-app install-api install-server deploy-api seed-api e2e smoke \
	package-eval-worker deploy-worker package-server deploy

# CloudFormation stack the api/ SAM template deploys into. Overriding this is
# what makes multiple environments possible (Staging and Production are two
# independent stacks), so it MUST reach `sam deploy` itself -- samconfig.toml
# carries its own stack_name and would otherwise win, silently deploying every
# environment into the same stack. See SAM_DEPLOY_ARGS below.
STACK_NAME ?= promptatron-config
# Region for deploys. Empty means "whatever samconfig.toml/AWS_REGION says";
# CI sets it explicitly so the stack can never land in a surprise region.
DEPLOY_REGION ?=
# Shared org artifacts bucket for SAM's packaging (CI passes
# secrets.ARTIFACTS_BUCKET_NAME). Empty locally -> --resolve-s3 and SAM's own
# managed bucket. The two are mutually exclusive, hence the either/or below.
DEPLOY_S3_BUCKET ?=
# Role CloudFormation itself assumes to create resources (CI passes
# secrets.CLOUDFORMATION_EXECUTION_ROLE). Empty locally -> your own creds.
DEPLOY_ROLE_ARN ?=
# Threaded into every `sam deploy`. Do not inline these flags at the call
# sites -- there are five of them and they must stay identical.
SAM_DEPLOY_ARGS ?= --stack-name $(STACK_NAME) \
	$(if $(DEPLOY_REGION),--region $(DEPLOY_REGION),) \
	$(if $(DEPLOY_S3_BUCKET),--s3-bucket $(DEPLOY_S3_BUCKET),--resolve-s3) \
	$(if $(DEPLOY_ROLE_ARN),--role-arn $(DEPLOY_ROLE_ARN),) \
	--no-fail-on-empty-changeset
# Where scripts/package-eval-worker.sh stages and zips the worker artifact.
EVAL_WORKER_BUILD_DIR ?= $(CURDIR)/.build/eval-worker
# Where scripts/package-server.sh stages and zips the FastAPI server artifact.
SERVER_BUILD_DIR ?= $(CURDIR)/.build/server
# Baked into the SPA at build time. "/" (not "") is deliberate: app/src/api/http.ts
# treats a blank VITE_API_URL as unset and falls back to http://localhost:8000,
# whereas "/" trims to "" and makes apiUrl() emit relative "/api/v1/..." paths --
# which is exactly right behind CloudFront, where the SPA and the API share an
# origin. Override to point a build at a server somewhere else.
DEPLOY_API_URL ?= /

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
# e2e / smoke
#
# `e2e` runs the Playwright suite against the fake-model full stack (server +
# app), which `playwright.config.ts` boots itself as `webServer`s -- no AWS
# credentials needed, nothing to start by hand.
#
# `smoke` runs the gated, real-AWS smoke script (scripts/live_smoke.py)
# against an already-running, non-fake-model server. It refuses to do
# anything (and makes no network calls) unless RUN_LIVE_BEDROCK=1 is set, so
# this target never fires real Bedrock calls on its own -- e.g.:
#   RUN_LIVE_BEDROCK=1 make smoke
# --------------------------------------------------------------------------- #

e2e:
	cd app && npx playwright test

smoke:
	@if [ "$$RUN_LIVE_BEDROCK" != "1" ]; then \
		echo "smoke: refusing to run -- this hits real, billed AWS Bedrock calls." >&2; \
		echo "       set RUN_LIVE_BEDROCK=1 explicitly to proceed, e.g.:" >&2; \
		echo "         RUN_LIVE_BEDROCK=1 make smoke" >&2; \
		exit 1; \
	fi
	cd server && uv run python ../scripts/live_smoke.py

# --------------------------------------------------------------------------- #
# api deploy / seed
#
# Builds + deploys the api/ SAM stack, then seeds it from api/seed/fixtures/**
# using the TableName resolved from the stack's own outputs.
# --------------------------------------------------------------------------- #

deploy-api:
	@set -e; \
	current_param() { \
		aws cloudformation describe-stacks --stack-name $(STACK_NAME) \
			--query "Stacks[0].Parameters[?ParameterKey=='$$1'].ParameterValue" \
			--output text 2>/dev/null || true; \
	}; \
	OVERRIDES=""; \
	for PARAM in EvalWorkerArtifactKey ServerArtifactKey; do \
		VALUE=$$(current_param $$PARAM); \
		if [ -n "$$VALUE" ] && [ "$$VALUE" != "None" ]; then \
			echo "deploy-api: preserving deployed $$PARAM=$$VALUE"; \
			OVERRIDES="$$OVERRIDES $$PARAM=$$VALUE"; \
		fi; \
	done; \
	if [ -n "$$OVERRIDES" ]; then OVERRIDES="--parameter-overrides$$OVERRIDES"; fi; \
	cd api && npm ci && sam build && sam deploy $(SAM_DEPLOY_ARGS) $$OVERRIDES && \
	TABLE_NAME=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text) && \
	if [ -z "$$TABLE_NAME" ] || [ "$$TABLE_NAME" = "None" ]; then \
		echo "deploy-api: could not resolve TableName from stack '$(STACK_NAME)' outputs" >&2; \
		exit 1; \
	fi && \
	npm run seed -- --table "$$TABLE_NAME"

# --------------------------------------------------------------------------- #
# cloud eval worker
#
# `package-eval-worker` builds the AgentCore CodeZip artifact and nothing else
# -- no AWS calls, safe to run anywhere. `deploy-worker` builds it, uploads it,
# and deploys the whole api/ stack with the worker enabled.
#
# deploy-worker is a SUPERSET of deploy-api: it deploys the same stack plus the
# AgentCore runtime. Once the worker exists, keep using it -- a bare
# `make deploy-api` passes no EvalWorkerArtifactKey, so the parameter falls back
# to its empty default and CloudFormation deletes the runtime. (See the
# parameter's own comment in api/template.yaml.)
#
# Optional: pass the config store API key so the worker can resolve stored
# scenarios/prompts/datasets (CloudFormation cannot read it out of the ApiKey
# resource, so it has to come in from outside):
#   EVAL_WORKER_CONFIG_API_KEY=$(aws apigateway get-api-key \
#       --api-key <ApiKeyId> --include-value --query value --output text) \
#     make deploy-worker
# --------------------------------------------------------------------------- #

package-eval-worker:
	EVAL_WORKER_BUILD_DIR=$(EVAL_WORKER_BUILD_DIR) ./scripts/package-eval-worker.sh

deploy-worker:
	@set -e; \
	resolve_output() { \
		aws cloudformation describe-stacks --stack-name $(STACK_NAME) \
			--query "Stacks[0].Outputs[?OutputKey=='$$1'].OutputValue" \
			--output text 2>/dev/null || true; \
	}; \
	BUCKET=$$(resolve_output EvalWorkerArtifactBucket); \
	if [ -z "$$BUCKET" ] || [ "$$BUCKET" = "None" ]; then \
		echo "deploy-worker: stack '$(STACK_NAME)' has no artifact bucket yet -- bootstrapping"; \
		( cd api && npm ci && sam build && sam deploy $(SAM_DEPLOY_ARGS) ); \
		BUCKET=$$(resolve_output EvalWorkerArtifactBucket); \
	fi; \
	if [ -z "$$BUCKET" ] || [ "$$BUCKET" = "None" ]; then \
		echo "deploy-worker: could not resolve EvalWorkerArtifactBucket from stack '$(STACK_NAME)'" >&2; \
		exit 1; \
	fi; \
	EVAL_WORKER_BUILD_DIR=$(EVAL_WORKER_BUILD_DIR) ./scripts/package-eval-worker.sh; \
	. $(EVAL_WORKER_BUILD_DIR)/artifact.env; \
	echo "deploy-worker: uploading $$ARTIFACT_KEY to s3://$$BUCKET"; \
	aws s3 cp "$$ARTIFACT_ZIP" "s3://$$BUCKET/$$ARTIFACT_KEY"; \
	CURRENT_SERVER_KEY=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) \
		--query "Stacks[0].Parameters[?ParameterKey=='ServerArtifactKey'].ParameterValue" \
		--output text 2>/dev/null || true); \
	if [ "$$CURRENT_SERVER_KEY" = "None" ]; then CURRENT_SERVER_KEY=""; fi; \
	if [ -n "$$CURRENT_SERVER_KEY" ]; then \
		echo "deploy-worker: preserving deployed server artifact $$CURRENT_SERVER_KEY"; \
	fi; \
	( cd api && npm ci && sam build && sam deploy $(SAM_DEPLOY_ARGS) --parameter-overrides \
		"EvalWorkerArtifactKey=$$ARTIFACT_KEY" \
		$${CURRENT_SERVER_KEY:+"ServerArtifactKey=$$CURRENT_SERVER_KEY"} \
		$${EVAL_WORKER_CONFIG_API_KEY:+"EvalWorkerConfigApiKey=$$EVAL_WORKER_CONFIG_API_KEY"} ); \
	ARN=$$(resolve_output EvalWorkerRuntimeArn); \
	TABLE=$$(resolve_output TableName); \
	echo; \
	echo "Cloud eval lane deployed. Point the server at it:"; \
	echo "  PROMPTATRON_EVAL_RUNTIME_ARN=$$ARN"; \
	echo "  PROMPTATRON_EVAL_TABLE=$$TABLE"

# --------------------------------------------------------------------------- #
# deployed server + SPA (docs/serverless-deploy-infra.md)
#
# `package-server` builds the server's Lambda zip and nothing else -- no AWS
# calls, safe to run anywhere. `deploy` is the whole thing:
#
#   package -> upload -> sam deploy -> seed -> build SPA -> s3 sync -> invalidate
#
# `deploy` is a SUPERSET of deploy-api and orthogonal to deploy-worker: it
# passes ServerArtifactKey, and reads the stack's CURRENT EvalWorkerArtifactKey
# and passes that back unchanged (exactly as deploy-api does), so deploying the
# server never deletes a deployed eval worker. The converse is NOT true --
# `deploy-worker` does not preserve ServerArtifactKey, so once the server
# exists, `make deploy` is the target to use.
#
# Optional overrides:
#   SERVER_MEMORY=2048 make deploy       # bigger Lambda (faster cold start)
#   DEPLOY_API_URL=https://... make deploy   # SPA pointed elsewhere
# --------------------------------------------------------------------------- #

package-server:
	SERVER_BUILD_DIR=$(SERVER_BUILD_DIR) ./scripts/package-server.sh

deploy:
	@set -e; \
	resolve_output() { \
		aws cloudformation describe-stacks --stack-name $(STACK_NAME) \
			--query "Stacks[0].Outputs[?OutputKey=='$$1'].OutputValue" \
			--output text 2>/dev/null || true; \
	}; \
	BUCKET=$$(resolve_output ArtifactBucket); \
	if [ -z "$$BUCKET" ] || [ "$$BUCKET" = "None" ]; then \
		echo "deploy: stack '$(STACK_NAME)' has no artifact bucket yet -- bootstrapping"; \
		( cd api && npm ci && sam build && sam deploy $(SAM_DEPLOY_ARGS) ); \
		BUCKET=$$(resolve_output ArtifactBucket); \
	fi; \
	if [ -z "$$BUCKET" ] || [ "$$BUCKET" = "None" ]; then \
		echo "deploy: could not resolve ArtifactBucket from stack '$(STACK_NAME)'" >&2; \
		exit 1; \
	fi; \
	SERVER_BUILD_DIR=$(SERVER_BUILD_DIR) ./scripts/package-server.sh; \
	. $(SERVER_BUILD_DIR)/artifact.env; \
	echo "deploy: uploading $$ARTIFACT_KEY to s3://$$BUCKET"; \
	aws s3 cp "$$ARTIFACT_ZIP" "s3://$$BUCKET/$$ARTIFACT_KEY"; \
	WORKER_KEY=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) \
		--query "Stacks[0].Parameters[?ParameterKey=='EvalWorkerArtifactKey'].ParameterValue" \
		--output text 2>/dev/null || true); \
	if [ -n "$$WORKER_KEY" ] && [ "$$WORKER_KEY" != "None" ]; then \
		echo "deploy: preserving deployed eval worker artifact $$WORKER_KEY"; \
	else \
		WORKER_KEY=""; \
	fi; \
	( cd api && npm ci && sam build && sam deploy $(SAM_DEPLOY_ARGS) --parameter-overrides \
		"ServerArtifactKey=$$ARTIFACT_KEY" \
		$${WORKER_KEY:+"EvalWorkerArtifactKey=$$WORKER_KEY"} \
		$${SERVER_MEMORY:+"ServerMemorySize=$$SERVER_MEMORY"} ); \
	TABLE=$$(resolve_output TableName); \
	if [ -z "$$TABLE" ] || [ "$$TABLE" = "None" ]; then \
		echo "deploy: could not resolve TableName from stack '$(STACK_NAME)'" >&2; \
		exit 1; \
	fi; \
	( cd api && npm run seed -- --table "$$TABLE" ); \
	APP_BUCKET=$$(resolve_output AppBucket); \
	DIST_ID=$$(resolve_output AppDistributionId); \
	APP_URL=$$(resolve_output AppUrl); \
	if [ -z "$$APP_BUCKET" ] || [ "$$APP_BUCKET" = "None" ]; then \
		echo "deploy: could not resolve AppBucket from stack '$(STACK_NAME)'" >&2; \
		exit 1; \
	fi; \
	echo "deploy: building the SPA with VITE_API_URL=$(DEPLOY_API_URL)"; \
	( cd app && npm ci && VITE_API_URL="$(DEPLOY_API_URL)" npm run build ); \
	aws s3 sync app/dist "s3://$$APP_BUCKET" --delete; \
	echo "deploy: invalidating $$DIST_ID"; \
	aws cloudfront create-invalidation --distribution-id "$$DIST_ID" --paths '/*' >/dev/null; \
	echo; \
	echo "Deployed: $$APP_URL"

# Runs just the seeder against an already-deployed table. Requires TABLE_NAME, e.g.:
#   make seed-api TABLE_NAME=promptatron-config-ScenariosTable-XXXXXXXXXXXX
seed-api:
	@if [ -z "$(TABLE_NAME)" ]; then \
		echo "seed-api: TABLE_NAME is required, e.g. make seed-api TABLE_NAME=your-table-name" >&2; \
		exit 1; \
	fi
	cd api && TABLE_NAME=$(TABLE_NAME) npm run seed
