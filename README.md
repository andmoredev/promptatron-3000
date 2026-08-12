# Promptatron 3000

A manual evaluation harness for AWS Bedrock foundation models and prompts, built on the
[Strands Agents SDK](https://strandsagents.com/). Author scenarios (prompts, datasets, tool
definitions), run them against any Bedrock model with streaming output and live tool-use, then
grade the results — either by hand or with an LLM-as-judge determinism evaluation — and keep the
full run history for comparison and export.

## Architecture

```
 +------------------+        +---------------------------+        +------------------------+
 |  app/ (React)    |  HTTP  |  server/ (FastAPI)         |        |  AWS Bedrock           |
 |  Vite, :3000      | -----> |  uvicorn --reload, :8000   | -----> |  (via Strands Agents)  |
 |  zero AWS creds   |        |  routes under /api/v1      |        +------------------------+
 +------------------+        |                             |
                              |  scenarios/runs/models/     |        +------------------------+
                              |  guardrails/health routers  | -----> |  Bedrock Guardrails    |
                              |                             |        |  (create/version/apply)|
                              |  SQLite (server/data/)      |        +------------------------+
                              |  run + evaluation history   |
                              +--------------+--------------+
                                             |
                                             | proxied, x-api-key
                                             v
                              +---------------------------+
                              |  api/ (AWS SAM)             |
                              |  API Gateway + 4 Lambdas    |
                              |  (Node.js 22, TypeScript)   |
                              |  ------------------------   |
                              |  DynamoDB: scenarios,       |
                              |  prompts, datasets, tools   |
                              +---------------------------+
```

- **`app/`** — React + TypeScript SPA. Talks only to the FastAPI server (`VITE_API_URL`); it never
  holds AWS credentials.
- **`server/`** — FastAPI + [Strands Agents SDK](https://strandsagents.com/). Runs models against
  Bedrock, proxies scenario/prompt/dataset/tool config from the deployed config API, executes
  Python `@tool` handlers during tool-use scenarios, runs determinism evaluations
  (`strands-agents-evals`), authors guardrails, and stores run/evaluation history in a local
  SQLite database (`server/data/`). AWS credentials come from the standard credential chain.
- **`api/`** — AWS SAM stack: an API Gateway REST API in front of four Lambda functions
  (Node.js 22/TypeScript) backed by a single DynamoDB table, holding the scenario/prompt/dataset/tool
  configuration. Deployed once; the server proxies to it with an API key.

## Prerequisites

- Node.js 22+ and npm
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- AWS CLI credentials (`AWS_PROFILE`, SSO, env vars, or an instance/task role) — only needed for
  **real** model calls and for deploying `api/`
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) —
  only needed to deploy `api/`

## Quick start

```bash
make install
```

Then pick a mode:

### Fake mode — zero AWS, nothing to deploy

A scripted model and judge stand in for Bedrock, so every feature (streaming, tool-use,
determinism evaluations, guardrail authoring UI) works end-to-end with no AWS account and no
deployed `api/` stack. This is the fastest way to try the app or develop against it.

```bash
PROMPTATRON_FAKE_MODEL=1 make dev
```

### Real mode — live Bedrock calls

1. Deploy the config API once (creates the DynamoDB table, seeds it with the bundled scenarios):
   ```bash
   AWS_PROFILE=your-profile make deploy-api
   ```
2. Start both apps with the same AWS profile:
   ```bash
   AWS_PROFILE=your-profile make dev
   ```
   The server auto-discovers `config_api_url`/`config_api_key` (and, once deployed,
   `eval_runtime_arn`/`eval_table`) from the deployed stack's CloudFormation outputs on first
   use — no more copying `ApiEndpoint`/`ApiKeyId` by hand. If you deployed the stack under a
   name other than the Makefile default (`promptatron-config`), set
   `PROMPTATRON_STACK_NAME` to match. See [Configuration](#configuration) for the env vars that
   still work as manual overrides, and `GET /health`'s `config_store.source`/`cloud_evals.source`
   to see where the server actually got each value from (`"env"` or `"stack"`).

Either way, the app opens at `http://localhost:3000` and talks to the server at
`http://localhost:8000`.

## Deploy to AWS (serverless)

Everything runs local-first and always will — this is optional. When you do want the harness on
the internet, it is serverless end to end: **no containers anywhere**, one Lambda for the FastAPI
server (unchanged, behind the [AWS Lambda Web Adapter](https://github.com/aws/aws-lambda-web-adapter)),
S3 + CloudFront for the SPA, DynamoDB for history, and the existing AgentCore Runtime for
evaluations.

```bash
AWS_PROFILE=your-profile make deploy
```

One command, idempotent, prints the URL at the end. It packages the server's arm64 Lambda zip,
uploads it under a content-hashed key, deploys the SAM stack (server function + Function URL +
S3 bucket + CloudFront distribution), seeds the table, builds the SPA with `VITE_API_URL=/`,
syncs it to S3, and invalidates the CDN.

The result is a single origin: the SPA at `/`, the API at `/api/v1` on the same domain — so
there is no CORS in production and no API URL to configure in the app.

```
https://d1234abcd.cloudfront.net/            → the app
https://d1234abcd.cloudfront.net/api/v1/...  → the server
```

> **Read this before you deploy.** v1 has **no authentication**. The Lambda Function URL is
> `AuthType: NONE`, and CloudFront in front of it is a second unauthenticated front door, not a
> gate. Anyone who learns either URL can run models on your Bedrock account, read and delete run
> history, and create and delete guardrails. The only protection is that the URL is unguessable
> and unpublished. This is a personal-deployment posture — see
> [`docs/serverless-deploy-infra.md`](docs/serverless-deploy-infra.md) for why `AWS_IAM` +
> CloudFront OAC is not a drop-in replacement (browsers cannot send the required request-body
> hash) and what the realistic hardening paths are.

### Continuous deployment (GitHub Actions + OIDC)

`.github/workflows/deploy.yml` deploys **Staging on every pull request** and **Production on merge
to `main`**, using short-lived OIDC credentials — there are no long-lived AWS keys in GitHub.
Each environment is its own CloudFormation stack, so a PR can never touch production.

One-time setup:

1. **Create the deployment roles** — once per environment. An AWS account may hold only one GitHub
   OIDC provider, so the second run passes `CreateOidcProvider=false`:
   ```bash
   aws cloudformation deploy --template-file infra/github-oidc-role.yaml \
     --stack-name promptatron-ci-staging --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides EnvironmentName=Staging TargetStackName=promptatron-staging

   aws cloudformation deploy --template-file infra/github-oidc-role.yaml \
     --stack-name promptatron-ci-production --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides EnvironmentName=Production TargetStackName=promptatron-config \
       CreateOidcProvider=false
   ```
2. **Create the GitHub Environments** `Staging` and `Production` (spelled exactly that way — the
   role's trust policy pins the OIDC subject claim to
   `repo:OWNER/REPO:environment:<name>`, so a typo means the role simply cannot be assumed).
3. **Add the secret** `AWS_DEPLOYMENT_ROLE_ARN` to each environment, set to that environment's
   `DeploymentRoleArn` output.
4. Optional per-environment variables: `AWS_REGION` (default `us-east-1`) and `STACK_NAME` if you
   want names other than `promptatron-staging` / `promptatron-config`.

Recommended protections, since the deployed app is unauthenticated: restrict the `Production`
environment's deployment branches to `main`, and enable branch protection on `main` requiring the
CI checks — the deploy workflow does not re-run them, it relies on that gate. Add required
reviewers on `Production` if you want a human in the loop before each release.

One sharp edge: `ServerArtifactKey` is a CloudFormation parameter with an empty default, and an
empty value deletes the server. `make deploy-api` and `make deploy-worker` do not pass it, so
**once the server is deployed, use `make deploy`** — it is a superset of both `deploy-api` and
(for preservation purposes) `deploy-worker`.

Details — the adapter layer, packaging and artifact size, the CloudFront origin/behaviour setup,
exact IAM, and the list of things only a real deploy can prove — are in
[`docs/serverless-deploy.md`](docs/serverless-deploy.md) (the contract) and
[`docs/serverless-deploy-infra.md`](docs/serverless-deploy-infra.md) (the build).

## Make targets

| Target | What it does |
| --- | --- |
| `make install` | `app` (`npm ci`) + `api` (`npm ci`) + `server` (`uv sync --dev`) |
| `make dev` | Runs the server (`uvicorn --reload`, `:8000`) and app (`vite`, `:3000`) concurrently in one terminal; Ctrl-C stops both |
| `make dev-server` | Runs just the FastAPI server, for when you want its logs in their own terminal |
| `make dev-app` | Runs just the Vite dev server |
| `make lint` | `app` (`eslint`) + `server` (`ruff check`) |
| `make test` | `app` (`vitest`) + `api` (`vitest`) + `server` (`pytest`) |
| `make deploy-api` | `sam build && sam deploy` for the `api/` stack, then seeds it from `api/seed/fixtures/**` |
| `make seed-api TABLE_NAME=...` | Re-runs just the seeder against an already-deployed table |
| `make package-server` | Builds the FastAPI server's arm64 Lambda zip. No AWS calls |
| `make deploy` | [Full serverless deploy](#deploy-to-aws-serverless): package + upload + `sam deploy` + seed + build SPA + S3 sync + CloudFront invalidation |

`make dev` runs both processes as background jobs of one recipe with a `trap ... EXIT INT TERM`
so `Ctrl-C` (or any exit) tears down both — no orphaned `uvicorn`/`vite` process left behind. If
that ever proves flaky in your shell, use the two `dev-server` / `dev-app` targets in separate
terminals instead; they run the exact same commands.

## Configuration

### Server (`server/`, env vars prefixed `PROMPTATRON_`)

| Env var | Default | Description |
| --- | --- | --- |
| `PROMPTATRON_AWS_REGION` | `us-east-1` | AWS region for Bedrock/Guardrails calls |
| `PROMPTATRON_CONFIG_API_URL` | *(unset)* | Base URL of the deployed `api/` config store — auto-discovered from the stack's `ApiEndpoint` output; set to override |
| `PROMPTATRON_CONFIG_API_KEY` | *(unset)* | `x-api-key` bearer token for the config store — auto-discovered from the stack's `ApiKeyId` output; set to override |
| `PROMPTATRON_DB_PATH` | `./data/promptatron.db` | SQLite path for run/evaluation history |
| `PROMPTATRON_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins (JSON list) |
| `PROMPTATRON_FAKE_MODEL` | `false` | Use the scripted fake model + judge instead of live Bedrock |
| `PROMPTATRON_ANTHROPIC_API_KEY` | *(unset)* | Anthropic API key — enables the `anthropic` provider (falls back to `ANTHROPIC_API_KEY`) |
| `PROMPTATRON_OPENAI_API_KEY` | *(unset)* | OpenAI API key — enables the `openai` provider (falls back to `OPENAI_API_KEY`) |
| `PROMPTATRON_OLLAMA_BASE_URL` | *(unset)* | Ollama server base URL, e.g. `http://localhost:11434` — enables the `ollama` provider (falls back to `OLLAMA_HOST`) |
| `PROMPTATRON_STACK_NAME` | `promptatron-config` | Name of the deployed `api/` stack to auto-discover settings from |
| `PROMPTATRON_STACK_DISCOVERY` | `true` | Set `false` to disable CloudFormation-stack auto-discovery entirely |

AWS credentials themselves are **not** a setting — they come from the standard boto3 credential
chain (`AWS_PROFILE`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, SSO, or an instance/task role).
The same credentials are used to auto-discover `PROMPTATRON_CONFIG_API_URL`,
`PROMPTATRON_CONFIG_API_KEY`, `PROMPTATRON_EVAL_TABLE`, and `PROMPTATRON_EVAL_RUNTIME_ARN` from
the deployed stack (`cloudformation:DescribeStacks` plus, when an API key is present,
`apigateway:GET` on `/apikeys/{id}`); a missing stack or missing credentials just leaves those
settings unconfigured, exactly as before this existed.

Bedrock is the default provider and the only one that needs no extra configuration. Setting any of
the three keys above adds that provider's models to `GET /models` and lets runs, evaluations and
graders select it with `"provider": "anthropic" | "openai" | "ollama"`. Guardrails remain
Bedrock-only.

### App (`app/`)

| Env var | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000` | Base URL of the FastAPI server |

Copy `app/.env.example` to `app/.env.local` to override it.

Set it to `/` for a same-origin build (what `make deploy` does behind CloudFront) — the API calls
then go to relative `/api/v1/...` paths. Note that `/`, not `""`, is the value: a blank
`VITE_API_URL` counts as unset and falls back to `http://localhost:8000`.

## Add a scenario

A scenario bundles system/user prompts, datasets, and (optionally) tool definitions the model can
call during a run.

1. **Create the scenario.** Either use the Scenarios tab in the app, or call the API directly:
   ```bash
   curl -X POST "$VITE_API_URL/api/v1/scenarios" \
     -H 'content-type: application/json' \
     -d '{"name": "Customer Support", "description": "Support ticket triage"}'
   ```
2. **Add prompts and datasets** under it, via the Scenarios tab or
   `POST /api/v1/scenarios/{id}/prompts` and `POST /api/v1/scenarios/{id}/datasets`.
3. **Add tool definitions**, if the scenario needs tool-use. The tool's *schema* (name,
   description, input JSON schema) lives in the scenario config
   (`PUT /api/v1/scenarios/{id}/tools/{toolName}`), but the *handler* — the Python function that
   actually runs when the model calls the tool — is a `@tool` registered in
   `server/promptatron/tools/registry.py`:

   ```python
   # server/promptatron/tools/my_scenario.py
   from strands import tool

   @tool(name="escalate_ticket")
   def escalate_ticket(ticket_id: str, priority: str, reason: str) -> dict:
       """Escalate a support ticket to management.

       Args:
           ticket_id: The ticket to escalate.
           priority: Urgency of the escalation.
           reason: Why this ticket needs escalation.
       """
       return {"success": True, "ticket_id": ticket_id, "priority": priority}
   ```

   ```python
   # server/promptatron/tools/registry.py
   from promptatron.tools import my_scenario

   _REGISTRY["customer-support"] = [my_scenario.escalate_ticket]
   ```

   `GET /api/v1/scenarios/{id}/tools` reports `handler_registered: true/false` per tool by
   checking this registry, so you can see at a glance whether a defined tool actually has code
   behind it.
4. **Re-seed instead**, if you'd rather define the whole scenario as a fixture up front: drop a
   `scenario.json` (plus any dataset files) under `api/seed/fixtures/<scenario-id>/`, following the
   shape of the existing `fraud-detection` / `shipping-logistics` fixtures, then run:
   ```bash
   make deploy-api            # first deploy, or
   make seed-api TABLE_NAME=... # re-seed an existing table
   ```
   The seeder is idempotent — safe to re-run against the same table.

## Evaluations

`POST /api/v1/evaluations` runs one of two kinds of evaluation, both graded by an LLM-as-judge
(`strands-agents-evals`):

- **`determinism`** — runs the same `run_config` `n` times (2–25, default 10) and grades the batch
  for response consistency.
- **`grade`** — grades a set of already-executed runs (`run_ids`) against a rubric.

The grader model, rubric, and system prompt are all configurable per request
(`grader.model_id`, defaults to `amazon.nova-pro-v1:0`; `grader.system_prompt`; `rubric`). Progress
streams as NDJSON from `GET /api/v1/evaluations/{id}/events`; results and history live alongside
runs in the server's SQLite database (`server/data/promptatron.db`).

### Execution lanes: local vs cloud

Evaluations run in one of two lanes, chosen per launch with the **Run location** toggle in the
Evals tab (`execution: "local" | "cloud"` on the API):

- **This machine** (default) — executed in-process by the FastAPI server; history stays in local
  SQLite. Nothing leaves your machine except the Bedrock calls themselves.
- **Cloud — persisted** — executed by a worker hosted on Amazon Bedrock AgentCore Runtime; job
  state, progress events, and every run record are persisted to the config-store DynamoDB table,
  so evaluations survive laptop/server restarts and are reviewable from any machine pointed at
  the same stack. Cloud evaluations appear under the **Cloud** filters in the Evals and History
  tabs.

To enable the cloud lane: `make deploy-worker` (packages the Python worker as an AgentCore
CodeZip artifact, uploads it, and deploys the runtime alongside the config store). The server
auto-discovers `PROMPTATRON_EVAL_RUNTIME_ARN` and `PROMPTATRON_EVAL_TABLE` from the stack's
`EvalWorkerRuntimeArn`/`TableName` outputs on next use — nothing to copy by hand. The UI disables
the cloud option until the server reports the lane configured (`GET /health`'s
`cloud_evals.configured`); `cloud_evals.source` shows whether that came from the stack or from an
env override. After the worker exists, prefer `make deploy-worker` for stack updates
(`make deploy-api` preserves the deployed worker artifact automatically). Full design and item
shapes: `docs/cloud-evals.md`; infrastructure notes and first-deploy verification list:
`docs/cloud-evals-infra.md`.

## Guardrails

`server/promptatron/routers/guardrails.py` authors AWS Bedrock Guardrails directly: create/update
operate on a mutable `DRAFT` working copy, `POST /guardrails/{id}/versions` publishes the current
draft as a new immutable numbered version, and any version (including `DRAFT`) can be applied to a
run. `GET /guardrails/{id}/versions` lists the full version history for a guardrail.

## Repo layout

```
promptatron-3000/
├── app/                      # React + TypeScript SPA (Vite, :3000)
│   ├── src/
│   └── .env.example
├── server/                   # FastAPI + Strands Agents SDK (uvicorn, :8000)
│   ├── promptatron/
│   │   ├── routers/          # health, models, scenarios (proxy), runs, guardrails
│   │   ├── engine/           # run execution, streaming, fake model
│   │   ├── evals/            # determinism + grading engine, LLM-as-judge
│   │   ├── guardrails/       # guardrail schemas/service/translator
│   │   ├── tools/            # @tool handlers + registry.py
│   │   ├── configstore/      # HTTP client for api/
│   │   └── store/            # SQLite run/evaluation history
│   └── tests/
├── api/                      # AWS SAM: config store (scenarios/prompts/datasets/tools)
│   ├── functions/            # one Lambda per resource
│   ├── seed/fixtures/        # bundled scenario fixtures (fraud-detection, shipping-logistics)
│   └── template.yaml
├── .kiro/                    # historical spec/steering archaeology from earlier iterations
└── Makefile
```

## Testing

```bash
make test          # everything: app + api + server
cd app && npm test          # app only (vitest)
cd api && npm test          # api only (vitest, mocked DynamoDB)
cd server && uv run pytest  # server only (pytest, fake model — no AWS calls)
```

`.kiro/` holds steering docs and specs from earlier iterations of this project; it's kept for
historical reference and isn't part of the current architecture described above.

## License

No license file is currently included in this repository.
