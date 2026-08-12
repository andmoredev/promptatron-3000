# Promptatron 3000 -- Config Store API (AWS SAM)

Serverless config store for scenarios: metadata, system/user prompts, tools, and
datasets, backed by a single DynamoDB table and fronted by an API Gateway REST
API with API-key auth.

## Stack

- **Runtime**: Node.js 22 (arm64), TypeScript, bundled with esbuild via SAM's `BuildProperties`.
- **Observability**: [Powertools for AWS Lambda (TypeScript)](https://docs.powertools.aws.dev/lambda/typescript/latest/) -- `Logger`, `Tracer`, `Metrics`, and the `@aws-lambda-powertools/event-handler` HTTP `Router` for routing within each function.
- **Data**: one DynamoDB table, single-table design (`pk`/`sk` + `GSI1`).
- **API**: API Gateway REST API, OpenAPI-defined (`openapi.yaml`), API key + usage plan required on every route.

## Functions

Four Lambda functions, one per resource, each with its own Powertools `Router` handling every HTTP method/path under that resource:

| Function | Routes |
|---|---|
| `ScenariosFunction` | `GET,POST /scenarios` · `GET,PUT,DELETE /scenarios/{scenarioId}` |
| `PromptsFunction` | `GET,POST /scenarios/{scenarioId}/prompts` · `PUT,DELETE /scenarios/{scenarioId}/prompts/{promptId}` |
| `DatasetsFunction` | `GET,POST /scenarios/{scenarioId}/datasets` · `GET,PUT,DELETE /scenarios/{scenarioId}/datasets/{datasetId}` |
| `ToolsFunction` | `GET /scenarios/{scenarioId}/tools` · `GET,PUT /scenarios/{scenarioId}/tools/{toolName}` |

Routing itself comes entirely from `openapi.yaml` (via `AWS::Include`/`Fn::Transform`
in `template.yaml`); the `Events:` blocks on each function exist only so SAM
grants API Gateway permission to invoke it.

## Data model

Single-table item collection per scenario, one partition per scenario:

```
pk=SCENARIO#{scenarioId}
  sk=METADATA                    -> {id, name, description, createdAt, updatedAt}
                                     GSI1PK="SCENARIO", GSI1SK={name}  (listing)
  sk=PROMPT#SYSTEM#{promptId}    -> {id, name, content, kind: "SYSTEM"}
  sk=PROMPT#USER#{promptId}      -> {id, name, content, kind: "USER"}
  sk=TOOL#{toolName}             -> {name, description, inputSchema, handlerKey}
  sk=DATASET#{datasetId}         -> {id, name, description, contentType, content}
```

`GET /scenarios/{scenarioId}` hydrates the *entire* scenario (metadata + both
prompt kinds + tools + dataset metadata, content excluded) from a **single**
`Query` on the partition. `DELETE /scenarios/{scenarioId}` removes every item
in that partition.

## Quick start

```sh
npm install        # installs Powertools + dev tooling (functions/**/*.ts)
npm test           # vitest, mocks DynamoDB via aws-sdk-client-mock
npm run build      # tsc --noEmit, type-checks everything

sam build
sam deploy
```

`samconfig.toml` is checked into the repo (stack name `promptatron-config`, non-interactive
deploy) -- edit its `region` before your first deploy. From the repo root, `make deploy-api` does
`npm ci && sam build && sam deploy` and then seeds the table in one step; `sam deploy --guided`
still works if you want to override a parameter interactively.

Outputs include the API URL (`ApiUrl`/`ApiEndpoint`), the DynamoDB `TableName`, and the
`AWS::ApiGateway::ApiKey` id (`ApiKeyId`; fetch the key value with
`aws apigateway get-api-key --api-key <id> --include-value`). Every route requires the
`x-api-key` header except CORS preflight (`OPTIONS`) -- see `components.securitySchemes.ApiKeyAuth`
in `openapi.yaml`.

## Seeding

```sh
npm run seed -- --table <TableName>   # or $TABLE_NAME env var
npm run seed:dry                      # prints the converted items, makes no AWS calls
```

`seed/seed.mjs` loads every fixture under `seed/fixtures/<scenario-id>/` (currently
`fraud-detection` and `shipping-logistics`) and upserts it into the table -- idempotent, safe to
re-run. `make deploy-api` runs this automatically against the freshly deployed table; use
`make seed-api TABLE_NAME=...` (from the repo root) to re-seed an existing one, e.g. after editing
a fixture.

## Tests & contract fixtures

`tests/unit/*.test.ts` cover pagination cursor round-tripping, the GSI1 list
query shape, full-scenario hydration folding, dataset content round-tripping,
`queryStringParameters: null` handling, and 404s -- all against a mocked
`DynamoDBDocumentClient` (`aws-sdk-client-mock`), driving the exported Lambda
`handler`s directly with realistic API Gateway proxy events.

`tests/fixtures/*.json` are real response-body shapes (based on the
`fraud-detection` and `shipping-logistics` scenario fixtures under `seed/fixtures/`)
for a downstream Python client to test its own parsing against the same contract.
