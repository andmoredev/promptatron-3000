# Promptatron Server

FastAPI execution/eval engine for the model-evaluation harness.

## Getting started

```bash
uv sync --dev
uv run uvicorn promptatron.main:app --reload --port 8000
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
