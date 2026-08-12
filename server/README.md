# Promptatron Server

FastAPI execution/eval engine for the model-evaluation harness, built on the
[Strands Agents SDK](https://strandsagents.com/). Runs models against Bedrock, proxies
scenario/prompt/dataset/tool config from the `api/` config store, executes tool-use scenarios, runs
determinism/grading evaluations, authors Bedrock Guardrails, and stores run/evaluation history in
SQLite.

## Getting started

```bash
uv sync --dev
uv run uvicorn promptatron.main:app --reload --port 8000
```

Or, for zero AWS calls (scripted model + judge — no credentials or deployed `api/` stack needed):

```bash
PROMPTATRON_FAKE_MODEL=1 uv run uvicorn promptatron.main:app --reload --port 8000
```

AWS credentials come from the standard credential chain (`AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, an
instance/task role, etc.) — this replaces the old `local-setup.sh` flow.

| Env var                          | Default                       | Description                          |
| --------------------------------- | ------------------------------ | ------------------------------------ |
| `PROMPTATRON_AWS_REGION`          | `us-east-1`                    | AWS region for SDK calls             |
| `PROMPTATRON_CONFIG_API_URL`      | `None`                         | Base URL of the config API           |
| `PROMPTATRON_CONFIG_API_KEY`      | `None`                         | Bearer token for the config API      |
| `PROMPTATRON_DB_PATH`             | `./data/promptatron.db`        | SQLite database path                 |
| `PROMPTATRON_CORS_ORIGINS`        | `["http://localhost:3000"]`    | Allowed CORS origins (JSON list)     |
| `PROMPTATRON_FAKE_MODEL`          | `false`                        | Use a fake model instead of live LLM |

## Endpoints

All routes are mounted under `/api/v1`.

| Router | Routes |
| --- | --- |
| `health` | `GET /health` |
| `models` | `GET /models` |
| `scenarios` | `GET,POST /scenarios` · `GET,PUT,DELETE /scenarios/{id}` · `GET,POST /scenarios/{id}/prompts` · `PUT,DELETE /scenarios/{id}/prompts/{promptId}` · `GET,POST /scenarios/{id}/datasets` · `GET,PUT,DELETE /scenarios/{id}/datasets/{datasetId}` · `GET,PUT /scenarios/{id}/tools/{toolName}` · `GET /scenarios/{id}/tools` (proxied to `api/`, with `handler_registered` filled in from the local tool registry) |
| `runs` | `POST,GET /runs` (POST executes a run; `stream=true` returns NDJSON) · `GET,DELETE /runs/{id}` · `POST,GET /evaluations` · `GET /evaluations/{id}` · `GET /evaluations/{id}/events` (NDJSON) · `DELETE /evaluations/{id}` |
| `guardrails` | `GET,POST /guardrails` · `GET,PUT,DELETE /guardrails/{id}` · `GET,POST /guardrails/{id}/versions` |

## Testing & linting

```bash
uv run pytest
uv run ruff check .
```
