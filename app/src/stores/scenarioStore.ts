/**
 * Catalogs the workbench picks from: scenarios, one hydrated scenario at a
 * time, and the Bedrock model list.
 *
 * Every loader is idempotent: a second call while the first is in flight
 * returns the *same* promise (so mounting three components that all "ensure
 * models are loaded" issues one request), and a completed load is not repeated
 * unless `force` is passed. In-flight promises live at module scope rather than
 * in state — they are not serializable and nothing renders them.
 *
 * Note the wire casing here is camelCase (scenarios come from the config
 * store), unlike runs/models which are snake_case. See `api/types.ts`.
 */

import { create } from 'zustand'
import { api } from '../api'
import type { ModelInfo, ModelProviders, ModelSource, ScenarioDetail, ScenarioSummary } from '../api'
import { isAborted, toStoreError, type StoreError } from './errors'

export interface ScenarioStateData {
  scenarios: ScenarioSummary[]
  scenariosLoading: boolean
  scenariosLoaded: boolean
  scenariosError: StoreError | null

  /** Hydrated scenarios, keyed by id. */
  details: Record<string, ScenarioDetail>
  detailLoading: Record<string, boolean>
  detailError: Record<string, StoreError | null>

  models: ModelInfo[]
  modelsLoading: boolean
  modelsLoaded: boolean
  modelsError: StoreError | null
  /** `ModelListResponse.cached` — the server served this from its catalog cache. */
  modelsCached: boolean
  /**
   * `ModelListResponse.providers`, as last fetched. `null` until `loadModels`
   * resolves *or* when the server response omitted it (older/fake-mode
   * servers) — either way, read it through `resolveModelProviders` /
   * `groupModelsBySource` rather than indexing it directly.
   */
  modelProviders: ModelProviders | null
}

export interface ScenarioActions {
  /** `GET /scenarios`. Idempotent unless `force`. */
  loadScenarios(force?: boolean): Promise<void>
  /** `GET /scenarios/{id}` — hydrated detail. Idempotent unless `force`. */
  loadScenario(scenarioId: string, force?: boolean): Promise<ScenarioDetail | null>
  /** `GET /models`. Idempotent unless `force`. */
  loadModels(force?: boolean): Promise<void>
  /** Drop one cached detail so the next `loadScenario` refetches. */
  invalidateScenario(scenarioId: string): void
  /** Drop the scenario list so the next `loadScenarios` refetches. */
  invalidateScenarios(): void
  clear(): void
}

export type ScenarioStore = ScenarioStateData & ScenarioActions

export const INITIAL_SCENARIO_STATE: ScenarioStateData = {
  scenarios: [],
  scenariosLoading: false,
  scenariosLoaded: false,
  scenariosError: null,
  details: {},
  detailLoading: {},
  detailError: {},
  models: [],
  modelsLoading: false,
  modelsLoaded: false,
  modelsError: null,
  modelsCached: false,
  modelProviders: null
}

/** Idempotence guards — one entry per in-flight request. */
let scenariosRequest: Promise<void> | null = null
let modelsRequest: Promise<void> | null = null
const detailRequests = new Map<string, Promise<ScenarioDetail | null>>()

export const useScenarioStore = create<ScenarioStore>()((set, get) => ({
  ...INITIAL_SCENARIO_STATE,

  loadScenarios: (force = false) => {
    if (!force) {
      if (scenariosRequest) return scenariosRequest
      if (get().scenariosLoaded) return Promise.resolve()
    }

    set({ scenariosLoading: true, scenariosError: null })
    scenariosRequest = (async () => {
      try {
        // `limit` is capped at 20 by the config store; take a full page.
        const response = await api.scenarios.list({ limit: 20 })
        set({
          scenarios: response.items,
          scenariosLoading: false,
          scenariosLoaded: true
        })
      } catch (error) {
        if (isAborted(error)) {
          set({ scenariosLoading: false })
          return
        }
        set({ scenariosLoading: false, scenariosError: toStoreError(error) })
      } finally {
        scenariosRequest = null
      }
    })()
    return scenariosRequest
  },

  loadScenario: (scenarioId, force = false) => {
    if (!force) {
      const cached = get().details[scenarioId]
      if (cached) return Promise.resolve(cached)
      const inFlight = detailRequests.get(scenarioId)
      if (inFlight) return inFlight
    }

    set((state) => ({
      detailLoading: { ...state.detailLoading, [scenarioId]: true },
      detailError: { ...state.detailError, [scenarioId]: null }
    }))

    const request = (async () => {
      try {
        const detail = await api.scenarios.get(scenarioId)
        set((state) => ({
          details: { ...state.details, [scenarioId]: detail },
          detailLoading: { ...state.detailLoading, [scenarioId]: false }
        }))
        return detail
      } catch (error) {
        set((state) => ({
          detailLoading: { ...state.detailLoading, [scenarioId]: false },
          detailError: {
            ...state.detailError,
            [scenarioId]: isAborted(error) ? null : toStoreError(error)
          }
        }))
        return null
      } finally {
        detailRequests.delete(scenarioId)
      }
    })()

    detailRequests.set(scenarioId, request)
    return request
  },

  loadModels: (force = false) => {
    if (!force) {
      if (modelsRequest) return modelsRequest
      if (get().modelsLoaded) return Promise.resolve()
    }

    set({ modelsLoading: true, modelsError: null })
    modelsRequest = (async () => {
      try {
        const response = await api.models.list()
        set({
          models: response.models,
          modelsCached: response.cached,
          modelProviders: response.providers ?? null,
          modelsLoading: false,
          modelsLoaded: true
        })
      } catch (error) {
        if (isAborted(error)) {
          set({ modelsLoading: false })
          return
        }
        set({ modelsLoading: false, modelsError: toStoreError(error) })
      } finally {
        modelsRequest = null
      }
    })()
    return modelsRequest
  },

  invalidateScenario: (scenarioId) => {
    detailRequests.delete(scenarioId)
    set((state) => {
      const details = { ...state.details }
      delete details[scenarioId]
      return { details }
    })
  },

  invalidateScenarios: () => {
    scenariosRequest = null
    set({ scenariosLoaded: false })
  },

  clear: () => {
    scenariosRequest = null
    modelsRequest = null
    detailRequests.clear()
    set({ ...INITIAL_SCENARIO_STATE })
  }
}))

/** Selector factory: the hydrated scenario for an id, if cached. */
export const selectScenarioDetail =
  (scenarioId: string | null) =>
  (state: ScenarioStateData): ScenarioDetail | null =>
    scenarioId ? (state.details[scenarioId] ?? null) : null

/** Selector factory: whether a scenario detail fetch is in flight. */
export const selectScenarioLoading =
  (scenarioId: string | null) =>
  (state: ScenarioStateData): boolean =>
    scenarioId ? state.detailLoading[scenarioId] === true : false

/** Pure helper: find a model row by id. */
export function findModel(models: ModelInfo[], modelId: string): ModelInfo | null {
  return models.find((model) => model.model_id === modelId) ?? null
}

/* -------------------------------------------------------------------------- */
/* Model source grouping — shared by ModelPanel and DeterminismLauncher       */
/* -------------------------------------------------------------------------- */

/**
 * Fallback `providers` used whenever `GET /models` omitted the field (older
 * or fake-mode servers): only bedrock is treated as usable, matching the
 * server's pre-multi-provider behavior.
 */
export const DEFAULT_MODEL_PROVIDERS: ModelProviders = {
  bedrock: { configured: true },
  anthropic: { configured: false },
  openai: { configured: false },
  ollama: { configured: false, reachable: null }
}

/** Never crash on a missing `providers` object — fall back defensively. */
export function resolveModelProviders(
  providers: ModelProviders | null | undefined
): ModelProviders {
  return providers ?? DEFAULT_MODEL_PROVIDERS
}

const SOURCE_ORDER: ModelSource[] = ['bedrock', 'anthropic', 'openai', 'ollama']

const SOURCE_LABELS: Record<ModelSource, string> = {
  bedrock: 'Bedrock',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  ollama: 'Ollama (local)'
}

/** Whether a source's models are currently selectable. */
function sourceUsable(source: ModelSource, providers: ModelProviders): boolean {
  const status = providers[source]
  if (!status.configured) return false
  if (source === 'ollama' && providers.ollama.reachable === false) return false
  return true
}

/** Suffix appended to a source's group label when it isn't usable. */
function sourceSuffix(source: ModelSource, providers: ModelProviders): string {
  const status = providers[source]
  if (!status.configured) return ' (not configured)'
  if (source === 'ollama' && providers.ollama.reachable === false) return ' (unreachable)'
  return ''
}

export interface ModelSourceGroup {
  source: ModelSource
  /** Display label, with a "(not configured)"/"(unreachable)" suffix when relevant. */
  label: string
  /** True when the provider is unconfigured (or ollama is unreachable). */
  disabled: boolean
  models: ModelInfo[]
}

export interface GroupedModels {
  /** One entry per source that has at least one catalog row, in a fixed order. */
  groups: ModelSourceGroup[]
  /**
   * Sources with *no* catalog rows at all that are also unusable — nothing to
   * group, so callers render these as a footnote instead of an empty optgroup.
   */
  unavailable: Array<{ source: ModelSource; label: string }>
}

/**
 * Group a flat model catalog into per-source buckets (Bedrock / Anthropic /
 * OpenAI / Ollama (local)), in that fixed order, folding in `providers` to
 * mark unconfigured/unreachable sources. A model with no `source` (older/
 * fake-mode payloads) is treated as `'bedrock'`.
 *
 * Pure and framework-free so `ModelPanel` and `DeterminismLauncher` share one
 * implementation instead of two ad hoc `<select>` groupings.
 */
export function groupModelsBySource(
  models: ModelInfo[],
  providers?: ModelProviders | null
): GroupedModels {
  const resolved = resolveModelProviders(providers)

  const bySource = new Map<ModelSource, ModelInfo[]>()
  for (const model of models) {
    const source = model.source ?? 'bedrock'
    const existing = bySource.get(source)
    if (existing) existing.push(model)
    else bySource.set(source, [model])
  }

  const groups: ModelSourceGroup[] = []
  const unavailable: Array<{ source: ModelSource; label: string }> = []

  for (const source of SOURCE_ORDER) {
    const sourceModels = bySource.get(source)
    if (sourceModels && sourceModels.length > 0) {
      groups.push({
        source,
        label: `${SOURCE_LABELS[source]}${sourceSuffix(source, resolved)}`,
        disabled: !sourceUsable(source, resolved),
        models: sourceModels
      })
    } else if (!sourceUsable(source, resolved)) {
      unavailable.push({ source, label: SOURCE_LABELS[source] })
    }
  }

  return { groups, unavailable }
}
