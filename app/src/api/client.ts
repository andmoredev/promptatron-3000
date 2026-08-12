/**
 * The typed API client: one thin function per backend endpoint.
 *
 * Nothing here holds state, caches, or retries — it maps arguments onto URLs
 * and response bodies onto the types in `./types`. Paths are relative to
 * `/api/v1` (see `http.apiUrl`).
 */

import { http, type QueryParams } from './http'
import { getNdjson, streamNdjson, type StreamOptions } from './stream'
import type {
  ConfigStorePageParams,
  Dataset,
  DatasetCreateRequest,
  DatasetListResponse,
  DatasetUpdateRequest,
  EvalStreamEvent,
  EvaluationDetail,
  EvaluationListParams,
  EvaluationRequest,
  GuardrailConfig,
  GuardrailDetail,
  GuardrailListResponse,
  GuardrailVersionCreateRequest,
  GuardrailVersionListResponse,
  GuardrailVersionSummary,
  HealthResponse,
  IdResponse,
  ModelListResponse,
  Page,
  PromptCreateRequest,
  PromptListResponse,
  PromptUpdateRequest,
  RunDetail,
  RunListFilters,
  RunListParams,
  RunRequest,
  RunStreamEvent,
  RunSummary,
  ScenarioCreateRequest,
  ScenarioDetail,
  ScenarioListResponse,
  ScenarioUpdateRequest,
  ToolDefinition,
  ToolListResponse,
  ToolUpsertRequest
} from './types'

/** Options accepted by every plain (non-streaming) call. */
export interface CallOptions {
  signal?: AbortSignal
}

const encode = encodeURIComponent

function pageParams(params?: ConfigStorePageParams): QueryParams | undefined {
  if (!params) return undefined
  return { limit: params.limit, nextToken: params.nextToken }
}

/* -------------------------------------------------------------------------- */
/* Models                                                                     */
/* -------------------------------------------------------------------------- */

const models = {
  /** `GET /models` -> `{models, cached}`. */
  list: (options: CallOptions = {}): Promise<ModelListResponse> =>
    http.get<ModelListResponse>('/models', { signal: options.signal })
}

/* -------------------------------------------------------------------------- */
/* Scenarios (+ prompts / datasets / tools)                                   */
/* -------------------------------------------------------------------------- */

const prompts = {
  /** `GET /scenarios/{id}/prompts`. */
  list: (
    scenarioId: string,
    params?: ConfigStorePageParams,
    options: CallOptions = {}
  ): Promise<PromptListResponse> =>
    http.get<PromptListResponse>(`/scenarios/${encode(scenarioId)}/prompts`, {
      query: pageParams(params),
      signal: options.signal
    }),

  /** `POST /scenarios/{id}/prompts` -> 201 `{id}`. */
  create: (
    scenarioId: string,
    body: PromptCreateRequest,
    options: CallOptions = {}
  ): Promise<IdResponse> =>
    http.post<IdResponse>(`/scenarios/${encode(scenarioId)}/prompts`, body, {
      signal: options.signal
    }),

  /** `PUT /scenarios/{id}/prompts/{promptId}` -> 204. */
  update: (
    scenarioId: string,
    promptId: string,
    body: PromptUpdateRequest,
    options: CallOptions = {}
  ): Promise<void> =>
    http.put<void>(`/scenarios/${encode(scenarioId)}/prompts/${encode(promptId)}`, body, {
      signal: options.signal
    }),

  /** `DELETE /scenarios/{id}/prompts/{promptId}` -> 204. */
  remove: (scenarioId: string, promptId: string, options: CallOptions = {}): Promise<void> =>
    http.delete<void>(`/scenarios/${encode(scenarioId)}/prompts/${encode(promptId)}`, {
      signal: options.signal
    })
}

const datasets = {
  /** `GET /scenarios/{id}/datasets`. */
  list: (
    scenarioId: string,
    params?: ConfigStorePageParams,
    options: CallOptions = {}
  ): Promise<DatasetListResponse> =>
    http.get<DatasetListResponse>(`/scenarios/${encode(scenarioId)}/datasets`, {
      query: pageParams(params),
      signal: options.signal
    }),

  /** `GET /scenarios/{id}/datasets/{datasetId}` (metadata + content). */
  get: (scenarioId: string, datasetId: string, options: CallOptions = {}): Promise<Dataset> =>
    http.get<Dataset>(`/scenarios/${encode(scenarioId)}/datasets/${encode(datasetId)}`, {
      signal: options.signal
    }),

  /** `POST /scenarios/{id}/datasets` -> 201 `{id}`. */
  create: (
    scenarioId: string,
    body: DatasetCreateRequest,
    options: CallOptions = {}
  ): Promise<IdResponse> =>
    http.post<IdResponse>(`/scenarios/${encode(scenarioId)}/datasets`, body, {
      signal: options.signal
    }),

  /** `PUT /scenarios/{id}/datasets/{datasetId}` -> 204. */
  update: (
    scenarioId: string,
    datasetId: string,
    body: DatasetUpdateRequest,
    options: CallOptions = {}
  ): Promise<void> =>
    http.put<void>(`/scenarios/${encode(scenarioId)}/datasets/${encode(datasetId)}`, body, {
      signal: options.signal
    }),

  /** `DELETE /scenarios/{id}/datasets/{datasetId}` -> 204. */
  remove: (scenarioId: string, datasetId: string, options: CallOptions = {}): Promise<void> =>
    http.delete<void>(`/scenarios/${encode(scenarioId)}/datasets/${encode(datasetId)}`, {
      signal: options.signal
    })
}

const tools = {
  /** `GET /scenarios/{id}/tools` — rows carry `handler_registered`. */
  list: (scenarioId: string, options: CallOptions = {}): Promise<ToolListResponse> =>
    http.get<ToolListResponse>(`/scenarios/${encode(scenarioId)}/tools`, {
      signal: options.signal
    }),

  /** `GET /scenarios/{id}/tools/{name}`. */
  get: (scenarioId: string, toolName: string, options: CallOptions = {}): Promise<ToolDefinition> =>
    http.get<ToolDefinition>(`/scenarios/${encode(scenarioId)}/tools/${encode(toolName)}`, {
      signal: options.signal
    }),

  /** `PUT /scenarios/{id}/tools/{name}` (create or replace). */
  upsert: (
    scenarioId: string,
    toolName: string,
    body: ToolUpsertRequest,
    options: CallOptions = {}
  ): Promise<ToolDefinition> =>
    http.put<ToolDefinition>(
      `/scenarios/${encode(scenarioId)}/tools/${encode(toolName)}`,
      body,
      { signal: options.signal }
    )
}

const scenarios = {
  /** `GET /scenarios` (`nextToken` pagination, `limit` 1-20). */
  list: (params?: ConfigStorePageParams, options: CallOptions = {}): Promise<ScenarioListResponse> =>
    http.get<ScenarioListResponse>('/scenarios', {
      query: pageParams(params),
      signal: options.signal
    }),

  /** `GET /scenarios/{id}` — hydrated detail (prompts, tools, datasets). */
  get: (scenarioId: string, options: CallOptions = {}): Promise<ScenarioDetail> =>
    http.get<ScenarioDetail>(`/scenarios/${encode(scenarioId)}`, { signal: options.signal }),

  /** `POST /scenarios` -> 201 `ScenarioDetail`. */
  create: (body: ScenarioCreateRequest, options: CallOptions = {}): Promise<ScenarioDetail> =>
    http.post<ScenarioDetail>('/scenarios', body, { signal: options.signal }),

  /** `PUT /scenarios/{id}` -> 204. */
  update: (
    scenarioId: string,
    body: ScenarioUpdateRequest,
    options: CallOptions = {}
  ): Promise<void> =>
    http.put<void>(`/scenarios/${encode(scenarioId)}`, body, { signal: options.signal }),

  /** `DELETE /scenarios/{id}` -> 204. */
  remove: (scenarioId: string, options: CallOptions = {}): Promise<void> =>
    http.delete<void>(`/scenarios/${encode(scenarioId)}`, { signal: options.signal }),

  prompts,
  datasets,
  tools
}

/* -------------------------------------------------------------------------- */
/* Runs                                                                       */
/* -------------------------------------------------------------------------- */

const runs = {
  /**
   * `POST /runs` with `stream: false` — executes the run and resolves with the
   * persisted `RunDetail`. In-band failures surface as an `ApiError` (the
   * server converts them to a 500/502 envelope carrying `run_id`).
   */
  create: (body: RunRequest, options: CallOptions = {}): Promise<RunDetail> =>
    http.post<RunDetail>('/runs', { ...body, stream: false }, { signal: options.signal }),

  /**
   * `POST /runs` with `stream: true` — NDJSON. `onEvent` fires per event in
   * order; the promise resolves when `run_complete` has been delivered and the
   * server closes the stream. Aborting rejects with `StreamAbortedError` and
   * disconnects, which persists the run as `cancelled`.
   */
  stream: (body: RunRequest, options: StreamOptions<RunStreamEvent>): Promise<void> =>
    streamNdjson<RunStreamEvent>('/runs', { ...body, stream: true }, options),

  /** `GET /runs` -> `Page<RunSummary>` (newest first). */
  list: (params: RunListParams = {}, options: CallOptions = {}): Promise<Page<RunSummary>> =>
    http.get<Page<RunSummary>>('/runs', {
      query: {
        model_id: params.model_id,
        scenario_id: params.scenario_id,
        status: params.status,
        since: params.since,
        cursor: params.cursor,
        limit: params.limit
      },
      signal: options.signal
    }),

  /** `GET /runs/{id}`. */
  get: (runId: string, options: CallOptions = {}): Promise<RunDetail> =>
    http.get<RunDetail>(`/runs/${encode(runId)}`, { signal: options.signal }),

  /** `DELETE /runs/{id}` -> 204. */
  remove: (runId: string, options: CallOptions = {}): Promise<void> =>
    http.delete<void>(`/runs/${encode(runId)}`, { signal: options.signal }),

  /**
   * `GET /runs` with `Accept: application/x-ndjson` — streams every matching
   * run as a full `RunDetail` per line, ignoring cursor/limit.
   */
  exportAll: (
    filters: RunListFilters,
    options: StreamOptions<RunDetail>
  ): Promise<void> =>
    getNdjson<RunDetail>('/runs', {
      ...options,
      query: {
        model_id: filters.model_id,
        scenario_id: filters.scenario_id,
        status: filters.status,
        since: filters.since
      }
    })
}

/* -------------------------------------------------------------------------- */
/* Evaluations                                                                */
/* -------------------------------------------------------------------------- */

const evaluations = {
  /**
   * `POST /evaluations` -> 202 with the `pending` row. The work then runs in
   * the background; follow it with `events(id)` and re-read it with `get(id)`.
   * A `determinism` body needs `run_config`, a `grade` body needs `run_ids` —
   * either missing is a 400 envelope, and an unknown `run_id` is a 404.
   */
  create: (body: EvaluationRequest, options: CallOptions = {}): Promise<EvaluationDetail> =>
    http.post<EvaluationDetail>('/evaluations', body, { signal: options.signal }),

  /** `GET /evaluations` -> `Page<EvaluationDetail>`. */
  list: (
    params: EvaluationListParams = {},
    options: CallOptions = {}
  ): Promise<Page<EvaluationDetail>> =>
    http.get<Page<EvaluationDetail>>('/evaluations', {
      query: {
        kind: params.kind,
        status: params.status,
        cursor: params.cursor,
        limit: params.limit
      },
      signal: options.signal
    }),

  /** `GET /evaluations/{id}`. */
  get: (evaluationId: string, options: CallOptions = {}): Promise<EvaluationDetail> =>
    http.get<EvaluationDetail>(`/evaluations/${encode(evaluationId)}`, { signal: options.signal }),

  /**
   * `GET /evaluations/{id}/events` — NDJSON progress stream. Events are
   * retained, so a late subscriber replays the log from the beginning; the
   * stream always ends with `eval_complete`.
   */
  events: (evaluationId: string, options: StreamOptions<EvalStreamEvent>): Promise<void> =>
    getNdjson<EvalStreamEvent>(`/evaluations/${encode(evaluationId)}/events`, options),

  /**
   * `DELETE /evaluations/{id}` — cancel a running evaluation (204). Resolves
   * only once `cancelled` is persisted. An already-finished evaluation is a
   * 409 `conflict` (`ApiError.detail.status` carries its final status).
   */
  cancel: (evaluationId: string, options: CallOptions = {}): Promise<void> =>
    http.delete<void>(`/evaluations/${encode(evaluationId)}`, { signal: options.signal })
}

/* -------------------------------------------------------------------------- */
/* Guardrails                                                                 */
/* -------------------------------------------------------------------------- */

const versions = {
  /** `GET /guardrails/{id}/versions` -> `{versions}` (includes DRAFT). */
  list: (guardrailId: string, options: CallOptions = {}): Promise<GuardrailVersionListResponse> =>
    http.get<GuardrailVersionListResponse>(`/guardrails/${encode(guardrailId)}/versions`, {
      signal: options.signal
    }),

  /** `POST /guardrails/{id}/versions` -> 201; publishes the current DRAFT. */
  create: (
    guardrailId: string,
    body: GuardrailVersionCreateRequest = {},
    options: CallOptions = {}
  ): Promise<GuardrailVersionSummary> =>
    http.post<GuardrailVersionSummary>(`/guardrails/${encode(guardrailId)}/versions`, body, {
      signal: options.signal
    })
}

const guardrails = {
  /** `GET /guardrails` -> `{guardrails}`. */
  list: (
    params: { max_results?: number } = {},
    options: CallOptions = {}
  ): Promise<GuardrailListResponse> =>
    http.get<GuardrailListResponse>('/guardrails', {
      query: { max_results: params.max_results },
      signal: options.signal
    }),

  /** `GET /guardrails/{id}` (defaults to the DRAFT working copy). */
  get: (
    guardrailId: string,
    params: { version?: string } = {},
    options: CallOptions = {}
  ): Promise<GuardrailDetail> =>
    http.get<GuardrailDetail>(`/guardrails/${encode(guardrailId)}`, {
      query: { version: params.version },
      signal: options.signal
    }),

  /** `POST /guardrails` -> 201 `GuardrailDetail`. */
  create: (body: GuardrailConfig, options: CallOptions = {}): Promise<GuardrailDetail> =>
    http.post<GuardrailDetail>('/guardrails', body, { signal: options.signal }),

  /** `PUT /guardrails/{id}` — updates the DRAFT working copy. */
  update: (
    guardrailId: string,
    body: GuardrailConfig,
    options: CallOptions = {}
  ): Promise<GuardrailDetail> =>
    http.put<GuardrailDetail>(`/guardrails/${encode(guardrailId)}`, body, {
      signal: options.signal
    }),

  /** `DELETE /guardrails/{id}` -> 204 (a numbered `version` deletes just it). */
  remove: (
    guardrailId: string,
    params: { version?: string } = {},
    options: CallOptions = {}
  ): Promise<void> =>
    http.delete<void>(`/guardrails/${encode(guardrailId)}`, {
      query: { version: params.version },
      signal: options.signal
    }),

  versions
}

/* -------------------------------------------------------------------------- */

/** `GET /health` — never raises server-side. */
const health = (options: CallOptions = {}): Promise<HealthResponse> =>
  http.get<HealthResponse>('/health', { signal: options.signal })

export const api = {
  health,
  models,
  scenarios,
  runs,
  evaluations,
  guardrails
}

export type Api = typeof api
