.PHONY: dev lint test install deploy-api seed-api

dev:
	cd app && npm run dev
	# server target added later

lint:
	cd app && npm run lint

test:
	cd app && npm test
	cd api && npm test

install:
	cd app && npm install
	cd api && npm install

# Builds + deploys the api/ SAM stack, then seeds it from api/seed/fixtures/**
# using the TableName resolved from the stack's own outputs.
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
