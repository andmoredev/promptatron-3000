# Serverless API (AWS SAM)

This folder contains an AWS SAM application that provides basic CRUD for scenarios using API Gateway, Lambda, and DynamoDB.

- One Lambda function per endpoint
- API defined via OpenAPI (inline in `template.yaml` for deploy). A standalone `openapi.yaml` is also provided for reference.
- Data stored in a DynamoDB table (`ScenarioId` as the partition key)

## Quick Start

- Validate/build: `sam build`
- Deploy guided: `sam deploy --guided`

Outputs include the API URL. CORS is enabled for all origins by default; adjust in `template.yaml` as needed.

## Notes

- Handlers are ES modules (`.mjs`) using AWS SDK v3 (`@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`). A single `package.json` lives in `api/functions/scenarios` for dependency installation during `sam build`.
- The deployable OpenAPI definition is embedded inline in `template.yaml` so it can reference Lambda ARNs via CloudFormation intrinsics.
- `api/openapi.yaml` mirrors the paths and schemas for documentation and tooling.
