/**
 * The workbench form: everything that goes into `POST /runs`.
 *
 * This store is *only* form state — it never calls the API. `runStore.startRun`
 * takes the request built from here (see `toRunRequest`), which keeps the form
 * editable while a run is in flight and makes "re-run this exact config"
 * trivial.
 *
 * Persisted to localStorage under `promptatron.run-config.v1`. Everything in
 * the state is plain configuration (no credentials, no outputs), so
 * `partialize` keeps all of it and drops only the action functions.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  InferenceConfig,
  ModelSource,
  RunGuardrailConfig,
  RunRequest,
  ScenarioDetail
} from '../api'

/** localStorage key. Bump the suffix when the shape changes incompatibly. */
export const RUN_CONFIG_STORAGE_KEY = 'promptatron.run-config.v1'

/** The serializable half of the store (this is exactly what is persisted). */
export interface RunConfigData {
  model_id: string
  /**
   * Which backend `model_id` is served from. Guardrails only work with
   * `'bedrock'` — see `setProvider`, which clears `guardrail` whenever this
   * is set to anything else, keeping that invariant enforced in one place.
   */
  provider: ModelSource
  system_prompt: string
  user_prompt: string
  scenario_id: string | null
  dataset_id: string | null
  /**
   * Which scenario prompt each text area was filled from. Purely a UI
   * bookkeeping aid (prompt pickers highlight the active entry); the run
   * request only ever carries the prompt *text*.
   */
  system_prompt_id: string | null
  user_prompt_id: string | null
  inference: InferenceConfig
  tools_enabled: boolean
  /** 1 – 100. */
  max_tool_iterations: number
  guardrail: RunGuardrailConfig | null
  stream: boolean
}

export interface RunConfigActions {
  setModelId(modelId: string): void
  /**
   * Sets `provider` alone (e.g. from the manual-model-id fallback's provider
   * select). Switching away from `'bedrock'` clears `guardrail`, since a
   * guardrail with a non-bedrock provider is a server-side 400.
   */
  setProvider(provider: ModelSource): void
  /**
   * Sets `model_id` and `provider` together, as the catalog picker does
   * (`ModelInfo.source` -> `provider`). Applies the same guardrail-clearing
   * invariant as `setProvider`.
   */
  selectModel(modelId: string, source: ModelSource): void
  setSystemPrompt(text: string): void
  setUserPrompt(text: string): void
  setScenarioId(scenarioId: string | null): void
  setDatasetId(datasetId: string | null): void
  /** Sets the prompt text *and* records which scenario prompt it came from. */
  selectSystemPrompt(promptId: string | null, content?: string): void
  selectUserPrompt(promptId: string | null, content?: string): void
  /** Shallow-merges into `inference`; `undefined` values delete the key. */
  setInference(patch: Partial<InferenceConfig>): void
  setToolsEnabled(enabled: boolean): void
  setMaxToolIterations(iterations: number): void
  setGuardrail(guardrail: RunGuardrailConfig | null): void
  setStream(stream: boolean): void
  /**
   * Prefill from a scenario: always sets `scenario_id`, and fills the system /
   * user prompt from the scenario's *first* prompt of each kind — but only
   * when that field is currently empty, so it never clobbers typed text.
   * A single dataset is auto-selected the same way.
   */
  applyScenarioDefaults(scenario: ScenarioDetail): void
  /** Back to `DEFAULT_RUN_CONFIG` (also rewrites the persisted copy). */
  reset(): void
}

export type RunConfigStore = RunConfigData & RunConfigActions

export const DEFAULT_RUN_CONFIG: RunConfigData = {
  model_id: '',
  provider: 'bedrock',
  system_prompt: '',
  user_prompt: '',
  scenario_id: null,
  dataset_id: null,
  system_prompt_id: null,
  user_prompt_id: null,
  inference: {},
  tools_enabled: false,
  max_tool_iterations: 10,
  guardrail: null,
  stream: true
}

/**
 * Build the `POST /runs` body from form state.
 *
 * Pure and standalone so evaluations (`kind: "determinism"` needs a
 * `run_config`) can reuse it without going through `runStore`. Empty optional
 * fields are omitted rather than sent as `""`/`null` noise.
 */
export function toRunRequest(config: RunConfigData): RunRequest {
  const request: RunRequest = {
    model_id: config.model_id,
    user_prompt: config.user_prompt,
    tools_enabled: config.tools_enabled,
    max_tool_iterations: config.max_tool_iterations,
    // Always included (not just when non-default): a simpler, contract-legal
    // request shape beats the marginal byte savings of omitting 'bedrock'.
    provider: config.provider,
    stream: config.stream
  }
  if (config.system_prompt.trim() !== '') request.system_prompt = config.system_prompt
  if (config.scenario_id) request.scenario_id = config.scenario_id
  if (config.dataset_id) request.dataset_id = config.dataset_id
  if (Object.keys(config.inference).length > 0) request.inference = { ...config.inference }
  if (config.guardrail) request.guardrail = { ...config.guardrail }
  return request
}

/** Pure form of `applyScenarioDefaults`, exported for tests and previews. */
export function scenarioDefaults(
  current: RunConfigData,
  scenario: ScenarioDetail
): Partial<RunConfigData> {
  const next: Partial<RunConfigData> = { scenario_id: scenario.id }

  const firstSystem = scenario.systemPrompts?.[0]
  if (firstSystem && current.system_prompt.trim() === '') {
    next.system_prompt = firstSystem.content
    next.system_prompt_id = firstSystem.id
  }

  const firstUser = scenario.userPrompts?.[0]
  if (firstUser && current.user_prompt.trim() === '') {
    next.user_prompt = firstUser.content
    next.user_prompt_id = firstUser.id
  }

  // Only auto-pick a dataset when there is exactly one and nothing is chosen.
  if (!current.dataset_id && scenario.datasets?.length === 1) {
    next.dataset_id = scenario.datasets[0].id
  }

  // A scenario with tools implies the workbench should offer them.
  if (scenario.tools?.length) next.tools_enabled = true

  return next
}

/**
 * Guardrails only run against Bedrock (a non-bedrock provider + guardrail is
 * a server-side 400). Central place that enforces it: any state change that
 * sets `provider` should route through this so `guardrail` never gets left
 * pointing at a now-incompatible provider.
 */
function providerPatch(
  current: Pick<RunConfigData, 'guardrail'>,
  provider: ModelSource
): Pick<RunConfigData, 'provider' | 'guardrail'> {
  return {
    provider,
    guardrail: provider === 'bedrock' ? current.guardrail : null
  }
}

export const useRunConfigStore = create<RunConfigStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_RUN_CONFIG,

      setModelId: (modelId) => set({ model_id: modelId }),
      setProvider: (provider) => set((state) => providerPatch(state, provider)),
      selectModel: (modelId, source) =>
        set((state) => ({ model_id: modelId, ...providerPatch(state, source) })),
      setSystemPrompt: (text) => set({ system_prompt: text }),
      setUserPrompt: (text) => set({ user_prompt: text }),
      setScenarioId: (scenarioId) => set({ scenario_id: scenarioId }),
      setDatasetId: (datasetId) => set({ dataset_id: datasetId }),

      selectSystemPrompt: (promptId, content) =>
        set(content === undefined
          ? { system_prompt_id: promptId }
          : { system_prompt_id: promptId, system_prompt: content }),

      selectUserPrompt: (promptId, content) =>
        set(content === undefined
          ? { user_prompt_id: promptId }
          : { user_prompt_id: promptId, user_prompt: content }),

      setInference: (patch) => {
        const inference: InferenceConfig = { ...get().inference }
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) delete inference[key as keyof InferenceConfig]
          else inference[key as keyof InferenceConfig] = value
        }
        set({ inference })
      },

      setToolsEnabled: (enabled) => set({ tools_enabled: enabled }),
      setMaxToolIterations: (iterations) => set({ max_tool_iterations: iterations }),
      setGuardrail: (guardrail) => set({ guardrail }),
      setStream: (stream) => set({ stream }),

      applyScenarioDefaults: (scenario) => set(scenarioDefaults(get(), scenario)),

      reset: () => set({ ...DEFAULT_RUN_CONFIG })
    }),
    {
      name: RUN_CONFIG_STORAGE_KEY,
      // `provider` was added without a version bump: zustand's default
      // `merge` is `{ ...currentState, ...persistedState }`, so a payload
      // that predates it (and therefore doesn't mention it) falls through to
      // the freshly-created store's `'bedrock'` default rather than being
      // clobbered with `undefined`. Same pattern as `settingsStore`.
      version: 1,
      partialize: (state): RunConfigData => ({
        model_id: state.model_id,
        provider: state.provider,
        system_prompt: state.system_prompt,
        user_prompt: state.user_prompt,
        scenario_id: state.scenario_id,
        dataset_id: state.dataset_id,
        system_prompt_id: state.system_prompt_id,
        user_prompt_id: state.user_prompt_id,
        inference: state.inference,
        tools_enabled: state.tools_enabled,
        max_tool_iterations: state.max_tool_iterations,
        guardrail: state.guardrail,
        stream: state.stream
      })
    }
  )
)

/**
 * Selector: whether the form has the minimum needed to submit a run.
 *
 * (There is deliberately no `selectRunRequest` selector: `toRunRequest` builds
 * a fresh object, and a zustand v5 selector that does that fails
 * `useSyncExternalStore`'s snapshot identity check. Call `toRunRequest` in the
 * submit handler with `useRunConfigStore.getState()`.)
 */
export const selectCanRun = (state: RunConfigStore): boolean =>
  state.model_id.trim() !== '' && state.user_prompt.trim() !== ''
