/**
 * Public surface of the store layer.
 *
 * Seven independent slices, each a plain zustand store:
 *
 *   runConfigStore   workbench form state (persisted)
 *   runStore         the active run: stream, tools, metrics, mascot mood
 *   scenarioStore    scenario / model catalogs
 *   historyStore     paged past runs + detail cache
 *   evalStore        evaluations list + the followed evaluation
 *   guardrailStore   guardrail list, details, versions, CRUD
 *   settingsStore    UI preferences (persisted)
 *
 * Stores never import React and never import each other's hooks for reading —
 * the only cross-store traffic is an action calling another store's
 * `getState()`:
 *
 *   runStore  -> historyStore.invalidate()   on run_complete / cancel / error
 *   evalStore -> historyStore.invalidate()   on eval_complete
 *
 * Both are one-way (historyStore imports nothing), so there is no cycle.
 */

export { type StoreError, isAborted, toStoreError } from './errors'

export {
  useRunConfigStore,
  toRunRequest,
  scenarioDefaults,
  selectCanRun,
  DEFAULT_RUN_CONFIG,
  RUN_CONFIG_STORAGE_KEY,
  type RunConfigData,
  type RunConfigActions,
  type RunConfigStore
} from './runConfigStore'

export {
  useRunStore,
  reduceRunEvent,
  robotMoodFor,
  phaseForWireStatus,
  isTerminalPhase,
  elapsedMs,
  activeRunController,
  selectRobotMood,
  selectIsRunning,
  selectElapsedMs,
  selectHasOutput,
  INITIAL_RUN_STATE,
  type RunPhase,
  type RobotMood,
  type ToolEventEntry,
  type RunMessage,
  type RunStateData,
  type RunActions,
  type RunStore
} from './runStore'

export {
  useScenarioStore,
  findModel,
  groupModelsBySource,
  resolveModelProviders,
  selectScenarioDetail,
  selectScenarioLoading,
  DEFAULT_MODEL_PROVIDERS,
  INITIAL_SCENARIO_STATE,
  type ScenarioStateData,
  type ScenarioActions,
  type ScenarioStore,
  type ModelSourceGroup,
  type GroupedModels
} from './scenarioStore'

export {
  useHistoryStore,
  selectHasMore,
  selectNeedsRefresh,
  selectHasFilters,
  HISTORY_PAGE_SIZE,
  INITIAL_HISTORY_STATE,
  type HistoryFilters,
  type HistoryStateData,
  type HistoryActions,
  type HistoryStore
} from './historyStore'

export {
  useEvalStore,
  reduceEvalEvent,
  computeProgress,
  phaseForEvalStatus,
  progressFraction,
  activeEvalController,
  selectIsEvaluating,
  selectProgressFraction,
  EMPTY_PROGRESS,
  INITIAL_EVAL_STATE,
  type EvalPhase,
  type EvalProgress,
  type EvalStateData,
  type EvalActions,
  type EvalStore
} from './evalStore'

export {
  useGuardrailStore,
  guardrailCacheKey,
  toSummary,
  readyGuardrails,
  selectGuardrailDetail,
  INITIAL_GUARDRAIL_STATE,
  type GuardrailStateData,
  type GuardrailActions,
  type GuardrailStore
} from './guardrailStore'

export {
  useSettingsStore,
  resolveTheme,
  DEFAULT_SETTINGS,
  DEFAULT_GRADER_MODEL_ID,
  DEFAULT_EVAL_N,
  SETTINGS_STORAGE_KEY,
  type ThemePreference,
  type EvalExecutionPreference,
  type SettingsData,
  type SettingsActions,
  type SettingsStore
} from './settingsStore'
