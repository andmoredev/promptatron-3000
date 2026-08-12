# Cloud evaluation lane — shared contract

Evaluations run in one of two lanes, chosen per launch in the UI:

- **local** (default): executed in-process by the FastAPI server, history in SQLite.
  Nothing leaves the machine except the Bedrock calls themselves.
- **cloud**: executed by a worker hosted on Amazon Bedrock AgentCore Runtime,
  with job state, progress events, and run records persisted to the existing
  DynamoDB config-store table. Durable across laptop/server restarts and
  reviewable from any machine pointed at the same stack.

This document is the contract between the three implementations (infra/worker,
FastAPI server, frontend). Field names here are normative.

## Request

`POST /api/v1/evaluations` gains one field:

```json
{ "execution": "local" | "cloud" }   // default "local"
```

Everything else in `EvaluationRequest` is unchanged. When `execution: "cloud"`
and the server is not configured for the cloud lane, respond 400
`{"error": {"code": "cloud_lane_unavailable", ...}}`.

`EvaluationDetail` gains `"execution": "local" | "cloud"` (default local for
pre-existing rows).

## DynamoDB item shapes (existing table: pk/sk + GSI1)

All items carry `expiresAt` (epoch seconds, now + 90 days) for TTL.

| Item | pk | sk | attributes |
|---|---|---|---|
| Eval meta | `EVAL#{evaluation_id}` | `META` | `id, ts (ISO), kind, status (pending\|running\|completed\|error\|cancelled), config (JSON string: stored_config incl. grader/rubric/n), run_ids (JSON list), result (JSON string \| null), error (JSON string \| null), seq_count (number), GSI1PK="EVAL", GSI1SK={ts}` |
| Progress event | `EVAL#{evaluation_id}` | `EVENT#{seq:08d}` | `seq (number), ts, event (JSON string — exactly the existing EvalStreamEvent wire shapes)` |
| Cancel flag | `EVAL#{evaluation_id}` | `CANCEL` | `ts` — presence means cancel requested; worker checks between runs and before grading |
| Run record | `RUN#{run_id}` | `META` | same fields as the SQLite `runs` table (id, ts, model_id, scenario_id, system_prompt, user_prompt, dataset_id, dataset_hash, config, output, tool_transcript, metrics, guardrail_trace, status, error — JSON columns as JSON strings), plus `evaluation_id`, `GSI1PK="RUN", GSI1SK={ts}` |

Writer rules (worker):
- Events are appended with a strictly increasing `seq` starting at 0; `META.seq_count`
  is updated after each append (eventually consistent is fine — readers use it as
  a hint, not truth).
- `META.status` transitions: pending → running → (completed | error | cancelled).
  Terminal status is written only after `result`/`error` and all run items are written.
- Run items are written as each run finishes, before that run's `run_completed` event.

Reader rules (FastAPI):
- `GET /evaluations/{id}/events` for a cloud eval: Query `pk=EVAL#{id}, sk begins_with EVENT#`
  (ascending), stream each `event` as an NDJSON line, then poll (~1.5s) for `seq > last`
  until `META.status` is terminal; finish by synthesizing nothing — the worker's own
  `eval_complete` event is the last line, exactly as in the local lane.
- `GET /evaluations/{id}` / list: read META. Cloud evals appear in `GET /evaluations`
  only when queried with `?execution=cloud` (GSI1 `EVAL` partition, by ts desc,
  cursor = base64url of GSI1SK+pk); default listing remains SQLite/local.
- `GET /runs/{id}`: SQLite first, then DDB `RUN#{id}/META` fallback.
  `GET /runs?execution=cloud`: GSI1 `RUN` partition listing.
- `DELETE /evaluations/{id}` on a running cloud eval: put the CANCEL item, return 204
  immediately (cancellation is best-effort/async; UI already tolerates this).

## Invocation

FastAPI → AgentCore Runtime via `bedrock-agentcore` `InvokeAgentRuntime` with a
JSON payload `{ "evaluation_id": ..., "request": <EvaluationRequest minus execution> }`,
`runtimeSessionId = evaluation_id` (padded to minimum length if required).
The worker acknowledges fast (writes META pending→running) and processes as an
async task within the runtime; FastAPI does not hold the connection open beyond
acknowledgment. Exact async mechanics are the infra work item's to pin down and
report (this is the one unproven-by-reference area — bedrock-agentcore Python SDK
`@app.async_task` pattern or equivalent).

The worker reuses `promptatron`'s existing engine/evals/tools code; the ONLY
behavioral difference is the emitter (DDB writes instead of asyncio queue) and
the store (DDB items instead of SQLite). The eval engine gets an emitter/store
seam to make that swap injectable.

## Configuration

Server (pydantic-settings, `PROMPTATRON_` prefix):
- `eval_runtime_arn: str | None` — AgentCore runtime ARN; None = cloud lane unavailable.
- `eval_table: str | None` — DynamoDB table name (same table as the config store).

Worker (env): `TABLE_NAME`, `AWS_REGION`. Model/judge config arrives in the payload.

Health: `GET /health` gains `"cloud_evals": {"configured": bool}`.

## Frontend

- Eval launcher: a "Run location" toggle — **This machine** (default) vs
  **Cloud — persisted** — with copy noting cloud sends prompts, dataset content,
  and outputs to your AWS account's DynamoDB table. Disabled with a tooltip when
  health says the lane is unconfigured. Choice remembered in settings
  (`defaultEvalExecution`).
- Eval list: lane badge per row (`local` | `cloud`); a filter to view cloud
  evaluations (drives `?execution=cloud`).
- Progress/result views are lane-agnostic — same events, same result shape.
