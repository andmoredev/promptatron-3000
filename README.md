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
   Note the `ApiUrl`/`ApiEndpoint` and `ApiKeyId` stack outputs; fetch the key value with:
   ```bash
   aws apigateway get-api-key --api-key <ApiKeyId> --include-value
   ```
2. Point the server at it and start both apps:
   ```bash
   export AWS_PROFILE=your-profile
   export PROMPTATRON_CONFIG_API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com/api
   export PROMPTATRON_CONFIG_API_KEY=your-api-key
   make dev
   ```

Either way, the app opens at `http://localhost:3000` and talks to the server at
`http://localhost:8000`.

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

`make dev` runs both processes as background jobs of one recipe with a `trap ... EXIT INT TERM`
so `Ctrl-C` (or any exit) tears down both — no orphaned `uvicorn`/`vite` process left behind. If
that ever proves flaky in your shell, use the two `dev-server` / `dev-app` targets in separate
terminals instead; they run the exact same commands.

## Configuration

### Server (`server/`, env vars prefixed `PROMPTATRON_`)

| Env var | Default | Description |
| --- | --- | --- |
| `PROMPTATRON_AWS_REGION` | `us-east-1` | AWS region for Bedrock/Guardrails calls |
| `PROMPTATRON_CONFIG_API_URL` | *(unset)* | Base URL of the deployed `api/` config store |
| `PROMPTATRON_CONFIG_API_KEY` | *(unset)* | `x-api-key` bearer token for the config store |
| `PROMPTATRON_DB_PATH` | `./data/promptatron.db` | SQLite path for run/evaluation history |
| `PROMPTATRON_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins (JSON list) |
| `PROMPTATRON_FAKE_MODEL` | `false` | Use the scripted fake model + judge instead of live Bedrock |
| `PROMPTATRON_ANTHROPIC_API_KEY` | *(unset)* | Anthropic API key — enables the `anthropic` provider (falls back to `ANTHROPIC_API_KEY`) |
| `PROMPTATRON_OPENAI_API_KEY` | *(unset)* | OpenAI API key — enables the `openai` provider (falls back to `OPENAI_API_KEY`) |
| `PROMPTATRON_OLLAMA_BASE_URL` | *(unset)* | Ollama server base URL, e.g. `http://localhost:11434` — enables the `ollama` provider (falls back to `OLLAMA_HOST`) |

AWS credentials themselves are **not** a setting — they come from the standard boto3 credential
chain (`AWS_PROFILE`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, SSO, or an instance/task role).

Bedrock is the default provider and the only one that needs no extra configuration. Setting any of
the three keys above adds that provider's models to `GET /models` and lets runs, evaluations and
graders select it with `"provider": "anthropic" | "openai" | "ollama"`. Guardrails remain
Bedrock-only.

### App (`app/`)

| Env var | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000` | Base URL of the FastAPI server |

Copy `app/.env.example` to `app/.env.local` to override it.

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
CodeZip artifact, uploads it, and deploys the runtime alongside the config store), then set
`PROMPTATRON_EVAL_RUNTIME_ARN` and `PROMPTATRON_EVAL_TABLE` from the stack outputs. The UI
disables the cloud option until the server reports the lane configured. After the worker exists,
prefer `make deploy-worker` for stack updates (`make deploy-api` preserves the deployed worker
artifact automatically). Full design and item shapes: `docs/cloud-evals.md`; infrastructure
notes and first-deploy verification list: `docs/cloud-evals-infra.md`.

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
