/**
 * Wire types for the Promptatron FastAPI backend (`/api/v1`).
 *
 * Every type here mirrors a server-side pydantic model or hand-written dict
 * response. Field *casing follows the wire*, which is not uniform across the
 * API:
 *
 * - runs / models / health / evaluations -> snake_case
 *   (plain `BaseModel`s and plain dicts; no alias generator).
 * - scenarios (+ prompts / datasets / tools) -> camelCase
 *   (`promptatron/schemas/scenario.py` uses `alias_generator=to_camel` and
 *   FastAPI serializes with `response_model_by_alias=True`). The one exception
 *   is `handler_registered`, which `routers/scenarios.py` grafts onto each tool
 *   list item *after* `model_dump(by_alias=True)`, so it stays snake_case.
 * - guardrails -> camelCase
 *   (`routers/guardrails.py` returns `model_dump(mode="json", by_alias=True)`).
 *   Requests accept either casing (`populate_by_name=True`); we send camelCase.
 *
 * Source of truth:
 *   server/promptatron/engine/events.py     (run stream events)
 *   server/promptatron/engine/schemas.py    (RunRequest)
 *   server/promptatron/schemas/runs.py      (Page, RunSummary, RunDetail, EvaluationDetail)
 *   server/promptatron/schemas/scenario.py  (scenario/prompt/dataset/tool)
 *   server/promptatron/guardrails/schemas.py
 *   server/promptatron/routers/*.py
 *   server/promptatron/errors.py            (error envelope)
 */
// @ts-nocheck


/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/** `{"error": {"code", "message", "detail"}}` — errors.py `_envelope`. */
export interface ApiErrorEnvelope {
  error: {
    code: string
    message: string
    detail?: unknown
  }
}

/** Error codes the server's own handlers emit (others are possible). */
export type ApiErrorCode =
  | 'not_found'
  | 'bad_request'
  | 'conflict'
  | 'upstream_error'
  | 'internal_error'
  | 'validation_error'
  | 'http_error'
  | (string & {})

/* -------------------------------------------------------------------------- */
/* Run stream events (NDJSON) — events.py                                     */
/* -------------------------------------------------------------------------- */

/** `RunStatus` in events.py / the persisted run row. */
export type RunStatus = 'completed' | 'error' | 'cancelled'

/**
 * Which lane an evaluation ran in — `local` (in-process, SQLite) or `cloud`
 * (AgentCore Runtime worker, DynamoDB). `local` is the default everywhere it
 * is omitted.
 *
 * contract: docs/cloud-evals.md "Request" / "Frontend" — server work landing
 * concurrently; typed from the doc, not from server code.
 */
export type EvaluationExecution = 'local' | 'cloud'

export interface RunStartEvent {
  type: 'run_start'
  run_id: string
  /** ISO-8601 instant, always tz-aware (the server stamps UTC on naive values). */
  ts: string
  model_id: string
}

export interface TextDeltaEvent {
  type: 'text_delta'
  text: string
}

export interface ReasoningDeltaEvent {
  type: 'reasoning_delta'
  text: string
}

export interface ToolUseStartEvent {
  type: 'tool_use_start'
  tool_use_id: string
  name: string
}

export interface ToolInputDeltaEvent {
  type: 'tool_input_delta'
  tool_use_id: string
  /**
   * Partial JSON text for the tool's input. Named `json` on the wire; the
   * server attribute is `json_text` (a field literally called `json` shadows
   * `BaseModel.json`), but the alias is what ships.
   */
  json: string
}

export interface ToolResultEvent {
  type: 'tool_result'
  tool_use_id: string
  name: string
  input: Record<string, unknown>
  output: unknown
  duration_ms: number
  error: Record<string, unknown> | null
}

export interface MessageEvent {
  type: 'message'
  role: string
  content: unknown[]
}

export interface GuardrailTraceEvent {
  type: 'guardrail_trace'
  assessment: Record<string, unknown>
}

export interface MetricsEvent {
  type: 'metrics'
  input_tokens: number
  output_tokens: number
  total_tokens: number
  latency_ms: number
  cycle_count: number
}

/** In-band failure. A streamed run stays HTTP 200 and reports errors here. */
export interface RunErrorEvent {
  type: 'error'
  code: string
  message: string
  retryable: boolean
}

export interface RunCompleteEvent {
  type: 'run_complete'
  run_id: string
  status: RunStatus
  final_text: string
}

/** The full `RunEvent` union from events.py, discriminated on `type`. */
export type RunStreamEvent =
  | RunStartEvent
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolUseStartEvent
  | ToolInputDeltaEvent
  | ToolResultEvent
  | MessageEvent
  | GuardrailTraceEvent
  | MetricsEvent
  | RunErrorEvent
  | RunCompleteEvent

/** Every `type` literal a run stream can carry. */
export type RunStreamEventType = RunStreamEvent['type']

/** Narrow a `RunStreamEvent` by its `type` tag. */
export type RunStreamEventOf<K extends RunStreamEventType> = Extract<RunStreamEvent, { type: K }>

/* -------------------------------------------------------------------------- */
/* Providers — routers/models.py                                              */
/* -------------------------------------------------------------------------- */

/**
 * Which backend a model is served from.
 *
 * contract: multi-provider model selection doc — server work landing
 * concurrently; typed from the doc, not from server code. `bedrock` is the
 * default everywhere a `provider`/`source` is omitted (older wire payloads,
 * fake-mode dev server).
 */
export type ModelSource = 'bedrock' | 'anthropic' | 'openai' | 'ollama'

/* -------------------------------------------------------------------------- */
/* Runs — engine/schemas.py + schemas/runs.py                                 */
/* -------------------------------------------------------------------------- */

/** Sampling knobs (all optional; omitted keys are not forwarded). */
export interface InferenceConfig {
  /** 0.0 – 1.0 */
  temperature?: number
  /** 0.0 – 1.0 */
  top_p?: number
  /** >= 1 */
  max_tokens?: number
}

/** Bedrock guardrail selection for a run. */
export interface RunGuardrailConfig {
  id: string
  /** Defaults to `"DRAFT"` server-side. */
  version?: string
  /** Defaults to `true` server-side. */
  trace?: boolean
}

/** Body of `POST /api/v1/runs`. Unknown keys are ignored by the server. */
export interface RunRequest {
  model_id: string
  user_prompt: string
  system_prompt?: string
  scenario_id?: string | null
  dataset_id?: string | null
  inference?: InferenceConfig
  tools_enabled?: boolean
  /** 1 – 100, defaults to 10. */
  max_tool_iterations?: number
  guardrail?: RunGuardrailConfig | null
  /**
   * Which backend `model_id` is served from. Defaults to `'bedrock'`
   * server-side when omitted. A `guardrail` with a non-`'bedrock'` provider is
   * a server-side 400 — the UI is responsible for never sending that
   * combination (see `runConfigStore.setProvider`).
   *
   * contract: multi-provider model selection doc — "RunRequest.provider?:
   * ... (default bedrock)".
   */
  provider?: ModelSource
  /** Defaults to `true` server-side. */
  stream?: boolean
}

/** Cursor-paginated page envelope: `{items, next_cursor}`. */
export interface Page<T> {
  items: T[]
  next_cursor: string | null
}

/** Lightweight run listing row (no large text blobs). */
export interface RunSummary {
  id: string
  /** ISO-8601 timestamp. */
  ts: string
  model_id: string
  scenario_id: string | null
  dataset_id: string | null
  status: string
  metrics: RunMetrics | null
}

/** The `metrics` JSON persisted on a run row (mirrors `MetricsEvent`). */
export interface RunMetrics {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  latency_ms?: number
  cycle_count?: number
  [key: string]: unknown
}

/** One entry of the persisted `tool_transcript` (a `tool_result` payload). */
export interface ToolTranscriptEntry {
  tool_use_id: string
  name: string
  input: Record<string, unknown>
  output: unknown
  duration_ms: number
  error: Record<string, unknown> | null
}

/** The `config` JSON persisted on a run row (`RunRequest.stored_config`). */
export interface RunStoredConfig {
  inference: InferenceConfig
  tools_enabled: boolean
  max_tool_iterations: number
  guardrail: Required<RunGuardrailConfig> | null
  stream: boolean
  [key: string]: unknown
}

/** The full run record. */
export interface RunDetail {
  id: string
  /** ISO-8601 timestamp. */
  ts: string
  model_id: string
  scenario_id: string | null
  system_prompt: string
  user_prompt: string
  dataset_id: string | null
  dataset_hash: string | null
  config: RunStoredConfig
  output: string | null
  tool_transcript: ToolTranscriptEntry[] | null
  metrics: RunMetrics | null
  guardrail_trace: unknown | null
  status: string
  error: unknown | null
}

/** Query filters for `GET /api/v1/runs`. */
export interface RunListFilters {
  model_id?: string
  scenario_id?: string
  status?: string
  /** ISO-8601 timestamp. */
  since?: string
}

export interface RunListParams extends RunListFilters {
  cursor?: string
  /** 1 – 100, defaults to 25. */
  limit?: number
  /**
   * `cloud` reads the DynamoDB `RUN` GSI1 partition instead of SQLite.
   * Omitted (the default) is the existing local/SQLite listing.
   *
   * contract: docs/cloud-evals.md "Reader rules" — `GET /runs?execution=cloud`.
   */
  execution?: 'cloud'
}

/* -------------------------------------------------------------------------- */
/* Evaluations                                                                */
/* -------------------------------------------------------------------------- */

/** `determinism` executes `n` runs then grades them; `grade` judges stored runs. */
export type EvaluationKind = 'determinism' | 'grade'

/** Lifecycle of an evaluation row. */
export type EvaluationStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled'

/**
 * The full evaluation record (used for both list rows and detail fetches).
 * `schemas/runs.py::EvaluationDetail`.
 */
export interface EvaluationDetail {
  id: string
  /** ISO-8601 timestamp. */
  ts: string
  kind: EvaluationKind | string
  status: EvaluationStatus | string
  config: EvaluationStoredConfig
  run_ids: string[]
  result: EvaluationResult | null
  progress: unknown | null
  error: unknown | null
  /**
   * Which lane this evaluation ran in. Optional on the wire type because
   * pre-existing rows predate the field; treat a missing value as `'local'`.
   *
   * contract: docs/cloud-evals.md "Request" — "EvaluationDetail gains
   * execution: local|cloud (default local for pre-existing rows)".
   */
  execution?: EvaluationExecution
}

/** The `config` JSON persisted on an evaluation row (`stored_config`). */
export interface EvaluationStoredConfig {
  kind: EvaluationKind | string
  /** Planned run count: `n` for determinism, `run_ids.length` for grade. */
  n: number
  run_config: RunRequest | null
  rubric: string | null
  grader: { model_id: string; system_prompt: string | null; provider?: ModelSource }
  [key: string]: unknown
}

/** Local determinism metrics merged with the judge's metrics (`evals/metrics.py`). */
export interface EvaluationMetrics {
  runs_analyzed?: number
  exact_match_count?: number
  unique_outputs?: number
  output_length_variance?: number
  tool_sequence_consistency?: number
  modal_tool_sequence?: string[]
  judge_overall_score?: number
  judge_scores?: number[]
  judge_pass_rate?: number
  tool_consistency_judge_score?: number
  [key: string]: unknown
}

/** The assembled evaluation result (`evals/engine.py::_build_result`). */
export interface EvaluationResult {
  grade: string | null
  /** 0 – 100. */
  score: number | null
  reasoning: string | null
  judge: {
    model_id: string
    system_prompt_used: boolean
    rubric_used: boolean
  }
  metrics: EvaluationMetrics
  /** Ids of the runs that completed successfully. */
  run_ids: string[]
  failed_runs: Array<{ index: number; error: Record<string, unknown> | null }>
  /** Present only when the judge itself failed (local metrics still stand). */
  judge_error?: string
}

export interface EvaluationListParams {
  kind?: string
  status?: string
  cursor?: string
  /** 1 – 100, defaults to 25. */
  limit?: number
  /**
   * `cloud` reads the DynamoDB `EVAL` GSI1 partition instead of SQLite.
   * Omitted (the default) is the existing local/SQLite listing.
   *
   * contract: docs/cloud-evals.md "Reader rules" — cloud evals appear in
   * `GET /evaluations` only when queried with `?execution=cloud`.
   */
  execution?: 'cloud'
}

/**
 * Which model judges an evaluation, and with what system prompt.
 * `evals/schemas.py::GraderConfig` — both fields are optional (the server
 * defaults `model_id` to its own judge model).
 */
export interface EvaluationGraderConfig {
  model_id?: string
  system_prompt?: string | null
  /**
   * Which backend the grader `model_id` is served from. Defaults to
   * `'bedrock'` server-side when omitted (the built-in judge stays
   * `bedrock`/nova unless overridden).
   *
   * contract: multi-provider model selection doc — "Grader config gains the
   * same [provider field]".
   */
  provider?: ModelSource
}

/**
 * Body of `POST /api/v1/evaluations` -> 202 `EvaluationDetail`.
 * `evals/schemas.py::EvaluationRequest`.
 *
 * - `kind: "determinism"` requires `run_config`; it is executed `n` times
 *   (clamped server-side into `[2, 25]`, default 10) with `stream` forced off.
 * - `kind: "grade"` requires `run_ids`; already-stored runs are judged as-is.
 *
 * Unknown fields are ignored, and a missing requirement is a 400 envelope.
 */
export interface EvaluationRequest {
  kind: EvaluationKind
  /** Required for `determinism`; the run replayed `n` times. */
  run_config?: RunRequest | null
  /** Defaults to 10, clamped into `[2, 25]`. */
  n?: number
  /** Required for `grade`. */
  run_ids?: string[]
  rubric?: string | null
  grader?: EvaluationGraderConfig
  /**
   * Which lane to run in. Defaults to `'local'` server-side when omitted. A
   * `'cloud'` request 400s with `cloud_lane_unavailable` if the server has no
   * AgentCore runtime configured.
   *
   * contract: docs/cloud-evals.md "Request".
   */
  execution?: EvaluationExecution
}

/* -------------------------------------------------------------------------- */
/* Evaluation stream events (NDJSON) — evals/events.py                        */
/* -------------------------------------------------------------------------- */

/**
 * `GET /api/v1/evaluations/{id}/events`.
 *
 * Unlike the run stream these events are retained in the job's event log: a
 * subscriber that connects mid-run (or after the job finished) replays the
 * exact same lines a live subscriber saw. The stream is always terminated by
 * `eval_complete`.
 */
export interface EvalStartEvent {
  type: 'eval_start'
  evaluation_id: string
  kind: string
  /** Number of runs this evaluation will report on. */
  n: number
}

export interface EvalRunStartedEvent {
  type: 'run_started'
  /** 0-based position in the batch; stable across retries. */
  index: number
}

/** Per-run rollup carried by `run_completed`. */
export interface EvalRunSummary {
  output_chars: number
  tool_calls: number
  duration_ms: number
}

export interface EvalRunCompletedEvent {
  type: 'run_completed'
  index: number
  run_id: string
  status: string
  summary: EvalRunSummary
}

export interface EvalRunFailedEvent {
  type: 'run_failed'
  index: number
  error: Record<string, unknown> | null
}

export interface EvalGradingStartedEvent {
  type: 'grading_started'
}

export interface EvalGradingCompletedEvent {
  type: 'grading_completed'
  result: EvaluationResult
}

export interface EvalCompleteEvent {
  type: 'eval_complete'
  status: 'completed' | 'error' | 'cancelled'
  result: EvaluationResult | null
}

/** The full `EvalEvent` union from evals/events.py, discriminated on `type`. */
export type EvalStreamEvent =
  | EvalStartEvent
  | EvalRunStartedEvent
  | EvalRunCompletedEvent
  | EvalRunFailedEvent
  | EvalGradingStartedEvent
  | EvalGradingCompletedEvent
  | EvalCompleteEvent

export type EvalStreamEventType = EvalStreamEvent['type']

export type EvalStreamEventOf<K extends EvalStreamEventType> = Extract<
  EvalStreamEvent,
  { type: K }
>

/* -------------------------------------------------------------------------- */
/* Models — routers/models.py + awscat/catalog.py                             */
/* -------------------------------------------------------------------------- */

export type ModelKind = 'foundation-model' | 'inference-profile'

export interface ModelInfo {
  model_id: string
  name: string
  /** Human-readable provider label for display (e.g. "Amazon", "Anthropic"). */
  provider: string
  supports_streaming: boolean
  kind: ModelKind
  /**
   * Which backend serves this model — the machine-readable counterpart to
   * `provider`. Optional on the wire type because pre-existing/fake-mode
   * payloads predate the field; treat a missing value as `'bedrock'` (see
   * `scenarioStore.groupModelsBySource`).
   *
   * contract: multi-provider model selection doc — `GET /models` row shape.
   */
  source?: ModelSource
}

/** `GET /api/v1/models` -> `providers[source]`. */
export interface ProviderStatus {
  configured: boolean
}

/** `providers.ollama` additionally reports whether the local daemon answered. */
export interface OllamaProviderStatus extends ProviderStatus {
  /** `null` when configured but not yet (or unable to be) probed. */
  reachable: boolean | null
}

/** `GET /api/v1/models` -> `providers`. */
export interface ModelProviders {
  bedrock: ProviderStatus
  anthropic: ProviderStatus
  openai: ProviderStatus
  ollama: OllamaProviderStatus
}

/**
 * `GET /api/v1/models`.
 *
 * `providers` is optional on the wire type: a server that has not yet shipped
 * multi-provider support (e.g. the `PROMPTATRON_FAKE_MODEL` dev server) omits
 * it entirely. Treat a missing `providers` as "only bedrock is configured"
 * rather than crashing — see `scenarioStore.resolveModelProviders`.
 *
 * contract: multi-provider model selection doc — `GET /models` response
 * shape.
 */
export interface ModelListResponse {
  models: ModelInfo[]
  providers?: ModelProviders
  cached: boolean
}

/* -------------------------------------------------------------------------- */
/* Health — routers/health.py                                                 */
/* -------------------------------------------------------------------------- */

export type CredentialStatus = 'ok' | 'missing' | 'error'

export interface HealthResponse {
  status: string
  aws: {
    region: string
    credentials: CredentialStatus
  }
  config_store: {
    configured: boolean
    /** `null` when the config store is not configured. */
    reachable: boolean | null
  }
  /**
   * Whether the server has an AgentCore runtime configured for the cloud eval
   * lane (`PROMPTATRON_EVAL_RUNTIME_ARN`). `false` (never unset) once the
   * server ships this field; callers should still treat a missing/failed
   * health response as unconfigured.
   *
   * contract: docs/cloud-evals.md "Configuration" — "Health: GET /health
   * gains "cloud_evals": {"configured": bool}".
   */
  cloud_evals: {
    configured: boolean
  }
}

/* -------------------------------------------------------------------------- */
/* Scenarios (camelCase wire) — schemas/scenario.py                           */
/* -------------------------------------------------------------------------- */

export type DatasetContentType = 'text/csv' | 'application/json'
export type PromptKind = 'SYSTEM' | 'USER'

export interface ScenarioSummary {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface ScenarioCreateRequest {
  id?: string
  name: string
  description?: string
}

export interface ScenarioUpdateRequest {
  name?: string
  description?: string
}

/** Config-store style pagination: `nextToken`, not `next_cursor`. */
export interface ScenarioListResponse {
  items: ScenarioSummary[]
  count: number
  nextToken: string | null
}

export interface PromptSummary {
  id: string
  name: string
  content: string
}

export interface Prompt extends PromptSummary {
  kind: PromptKind
}

export interface PromptCreateRequest {
  kind: PromptKind
  name: string
  content: string
}

export interface PromptUpdateRequest {
  name?: string
  content?: string
}

export interface PromptListResponse {
  items: Prompt[]
  count: number
  nextToken: string | null
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handlerKey: string
}

/**
 * A tool list row. `handler_registered` is snake_case on purpose: the router
 * adds it to the already-camelCased dump (routers/scenarios.py `list_tools`).
 */
export interface ToolListItem extends ToolDefinition {
  handler_registered: boolean
}

export interface ToolListResponse {
  items: ToolListItem[]
  count: number
}

export interface ToolUpsertRequest {
  description: string
  inputSchema: Record<string, unknown>
  handlerKey: string
}

export interface DatasetMeta {
  id: string
  name: string
  description: string | null
  contentType: DatasetContentType
}

export interface Dataset extends DatasetMeta {
  content: string
}

export interface DatasetCreateRequest {
  id?: string
  name: string
  description?: string
  contentType: DatasetContentType
  content: string
}

export interface DatasetUpdateRequest {
  name?: string
  description?: string
  contentType?: DatasetContentType
  content?: string
}

export interface DatasetListResponse {
  items: DatasetMeta[]
  count: number
  nextToken: string | null
}

/** Hydrated scenario: metadata + prompts + tools + dataset metadata. */
export interface ScenarioDetail extends ScenarioSummary {
  systemPrompts: PromptSummary[]
  userPrompts: PromptSummary[]
  tools: ToolDefinition[]
  datasets: DatasetMeta[]
}

/** `{"id": "..."}` — returned by prompt/dataset creates. */
export interface IdResponse {
  id: string
}

/** Config-store pagination params (`limit`, `nextToken`). */
export interface ConfigStorePageParams {
  /** 1 – 20. */
  limit?: number
  nextToken?: string
}

/* -------------------------------------------------------------------------- */
/* Guardrails (camelCase wire) — guardrails/schemas.py                        */
/* -------------------------------------------------------------------------- */

export type ContentFilterType =
  | 'SEXUAL'
  | 'VIOLENCE'
  | 'HATE'
  | 'INSULTS'
  | 'MISCONDUCT'
  | 'PROMPT_ATTACK'

export type GuardrailStrength = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'

export type BlockAction = 'BLOCK' | 'NONE'

export type SensitiveInfoAction = 'BLOCK' | 'ANONYMIZE' | 'NONE'

export type ManagedWordListType = 'PROFANITY'

export type PiiEntityType =
  | 'ADDRESS'
  | 'AGE'
  | 'AWS_ACCESS_KEY'
  | 'AWS_SECRET_KEY'
  | 'CA_HEALTH_NUMBER'
  | 'CA_SOCIAL_INSURANCE_NUMBER'
  | 'CREDIT_DEBIT_CARD_CVV'
  | 'CREDIT_DEBIT_CARD_EXPIRY'
  | 'CREDIT_DEBIT_CARD_NUMBER'
  | 'DRIVER_ID'
  | 'EMAIL'
  | 'INTERNATIONAL_BANK_ACCOUNT_NUMBER'
  | 'IP_ADDRESS'
  | 'LICENSE_PLATE'
  | 'MAC_ADDRESS'
  | 'NAME'
  | 'PASSWORD'
  | 'PHONE'
  | 'PIN'
  | 'SWIFT_CODE'
  | 'UK_NATIONAL_HEALTH_SERVICE_NUMBER'
  | 'UK_NATIONAL_INSURANCE_NUMBER'
  | 'UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER'
  | 'URL'
  | 'USERNAME'
  | 'US_BANK_ACCOUNT_NUMBER'
  | 'US_BANK_ROUTING_NUMBER'
  | 'US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER'
  | 'US_PASSPORT_NUMBER'
  | 'US_SOCIAL_SECURITY_NUMBER'
  | 'VEHICLE_IDENTIFICATION_NUMBER'

export type GuardrailLifecycleStatus =
  | 'CREATING'
  | 'UPDATING'
  | 'VERSIONING'
  | 'READY'
  | 'FAILED'
  | 'DELETING'

export interface ContentFilter {
  type: ContentFilterType
  inputStrength?: GuardrailStrength
  outputStrength?: GuardrailStrength
  inputAction?: BlockAction
  outputAction?: BlockAction
}

export interface ContentPolicy {
  filters: ContentFilter[]
}

export interface DeniedTopic {
  /** 1 – 100 chars, `^[0-9a-zA-Z-_ !?.]+$`. */
  name: string
  /** 1 – 200 chars. */
  definition: string
  /** Max 5 entries. */
  examples?: string[]
  inputAction?: BlockAction
  outputAction?: BlockAction
}

export interface WordPolicy {
  words?: string[]
  managedWordLists?: ManagedWordListType[]
  inputAction?: BlockAction
  outputAction?: BlockAction
}

export interface PiiEntity {
  type: PiiEntityType
  action?: SensitiveInfoAction
}

export interface PiiPolicy {
  entities: PiiEntity[]
}

export interface ContextualGrounding {
  /** 0 – 1. */
  groundingThreshold?: number | null
  /** 0 – 1. */
  relevanceThreshold?: number | null
}

/** The simplified guardrail configuration accepted by create/update. */
export interface GuardrailConfig {
  /** 1 – 50 chars, `^[0-9a-zA-Z-_]+$`. */
  name: string
  /** 1 – 200 chars. */
  description?: string | null
  contentPolicy?: ContentPolicy | null
  deniedTopics?: DeniedTopic[]
  wordPolicy?: WordPolicy | null
  piiPolicy?: PiiPolicy | null
  contextualGrounding?: ContextualGrounding | null
  /** 1 – 500 chars; server-defaulted when omitted. */
  blockedInputMessage?: string
  /** 1 – 500 chars; server-defaulted when omitted. */
  blockedOutputMessage?: string
}

export interface GuardrailSummary {
  id: string
  arn: string
  name: string
  description: string | null
  version: string
  status: GuardrailLifecycleStatus
  /** ISO-8601 timestamp. */
  createdAt: string
  /** ISO-8601 timestamp. */
  updatedAt: string | null
}

export interface GuardrailDetail extends GuardrailSummary {
  contentPolicy: ContentPolicy | null
  deniedTopics: DeniedTopic[]
  wordPolicy: WordPolicy | null
  piiPolicy: PiiPolicy | null
  contextualGrounding: ContextualGrounding | null
  blockedInputMessage: string | null
  blockedOutputMessage: string | null
}

/** `GET /api/v1/guardrails`. */
export interface GuardrailListResponse {
  guardrails: GuardrailSummary[]
}

export interface GuardrailVersionSummary {
  id: string
  version: string
  description: string | null
}

/** `GET /api/v1/guardrails/{id}/versions`. */
export interface GuardrailVersionListResponse {
  versions: GuardrailVersionSummary[]
}

/** Body of `POST /api/v1/guardrails/{id}/versions`. */
export interface GuardrailVersionCreateRequest {
  /** 1 – 200 chars. */
  description?: string | null
}
