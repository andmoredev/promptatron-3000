/**
 * Launches a `kind: "determinism"` evaluation of the *current* workbench run
 * config (read from `runConfigStore`, never duplicated into local state) plus
 * N / grader settings that are local to this form.
 *
 * `run_config` is built with `toRunRequest` at submit time — same helper the
 * Workbench's Run button uses — so an evaluation always replays exactly the
 * request a manual run would send.
 *
 * Run location follows the server: health's `cloud_evals.configured` gates the
 * Cloud option, `local_evals.available` gates "This machine". A deployment with
 * no local lane flips the *effective* choice to cloud without touching the
 * stored `defaultEvalExecution`.
 *
 * The grader model picker is grouped the same way as the Workbench's
 * `ModelPanel` (`groupModelsBySource`); picking a grader model sets its
 * provider alongside it, same idea as `runConfigStore.selectModel`. Left
 * untouched, the grader defaults stay `bedrock` / nova (`DEFAULT_GRADER_MODEL_ID`).
 */

import { useEffect, useState } from 'react'
import {
  findModel,
  groupModelsBySource,
  selectCanRun,
  selectIsEvaluating,
  toRunRequest,
  useEvalStore,
  useRunConfigStore,
  useScenarioStore,
  useSettingsStore
} from '../../stores'
import { api } from '../../api'
import type {
  EvaluationExecution,
  EvaluationGraderConfig,
  EvaluationRequest,
  ModelSource
} from '../../api'

const N_MIN = 2
const N_MAX = 25

const CLOUD_UNAVAILABLE_TOOLTIP = 'Cloud lane not configured on the server'
const LOCAL_UNAVAILABLE_TOOLTIP = 'Local execution is unavailable on this deployment'

const EXECUTION_OPTIONS: Array<{ value: EvaluationExecution; label: string }> = [
  { value: 'local', label: 'This machine' },
  { value: 'cloud', label: 'Cloud — persisted' }
]

function clampN(value: number): number {
  if (!Number.isFinite(value)) return N_MIN
  return Math.min(N_MAX, Math.max(N_MIN, Math.round(value)))
}

/** Trim to a single-line preview; empty text renders as an em dash. */
function truncate(text: string, max = 140): string {
  const trimmed = text.trim()
  if (trimmed === '') return '—'
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`
}

interface DeterminismLauncherProps {
  /** Called with the new evaluation's id once `POST /evaluations` succeeds. */
  onStarted?: (evaluationId: string) => void
}

export default function DeterminismLauncher({ onStarted }: DeterminismLauncherProps) {
  const modelId = useRunConfigStore((state) => state.model_id)
  const scenarioId = useRunConfigStore((state) => state.scenario_id)
  const systemPrompt = useRunConfigStore((state) => state.system_prompt)
  const userPrompt = useRunConfigStore((state) => state.user_prompt)
  const canRun = useRunConfigStore(selectCanRun)

  const models = useScenarioStore((state) => state.models)
  const modelProviders = useScenarioStore((state) => state.modelProviders)
  const scenarios = useScenarioStore((state) => state.scenarios)
  const loadModels = useScenarioStore((state) => state.loadModels)
  const loadScenarios = useScenarioStore((state) => state.loadScenarios)

  const defaultGraderModelId = useSettingsStore((state) => state.defaultGraderModelId)
  const defaultN = useSettingsStore((state) => state.defaultN)
  const defaultEvalExecution = useSettingsStore((state) => state.defaultEvalExecution)
  const setDefaultEvalExecution = useSettingsStore((state) => state.setDefaultEvalExecution)

  const startEvaluation = useEvalStore((state) => state.startEvaluation)
  const isEvaluating = useEvalStore(selectIsEvaluating)
  const startErrorState = useEvalStore((state) => state.error)

  const [n, setN] = useState(() => clampN(defaultN))
  const [graderModelId, setGraderModelId] = useState(defaultGraderModelId)
  // Grader defaults stay bedrock/nova (`DEFAULT_GRADER_MODEL_ID`); switching
  // the grader model picker updates this alongside the id, same as the
  // Workbench's `selectModel`.
  const [graderProvider, setGraderProvider] = useState<ModelSource>('bedrock')
  const [rubric, setRubric] = useState('')
  const [graderSystemPrompt, setGraderSystemPrompt] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [startFailed, setStartFailed] = useState(false)
  const [execution, setExecution] = useState<EvaluationExecution>(defaultEvalExecution)
  // Unknown/failed health is treated as "not configured" (see module docs on
  // `api.health`): the cloud option starts — and stays — disabled unless a
  // health check comes back and says otherwise.
  const [cloudConfigured, setCloudConfigured] = useState(false)
  // The local lane goes the other way: a local-first tool assumes it can run
  // locally, and only a health response that explicitly says
  // `local_evals.available === false` (a deployed server) takes that away.
  const [localAvailable, setLocalAvailable] = useState(true)

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  useEffect(() => {
    void loadScenarios()
  }, [loadScenarios])

  useEffect(() => {
    let cancelled = false
    api
      .health()
      .then((health) => {
        if (cancelled) return
        setCloudConfigured(Boolean(health.cloud_evals?.configured))
        setLocalAvailable(health.local_evals?.available !== false)
      })
      .catch(() => {
        if (!cancelled) setCloudConfigured(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // What this launch will actually use. When the deployment has no local lane,
  // a stored `defaultEvalExecution: 'local'` is overridden for *this* form
  // rather than rewritten in settings — the preference is still the right one
  // the next time the user points the UI at their own machine.
  const effectiveExecution: EvaluationExecution =
    !localAvailable && execution === 'local' ? 'cloud' : execution

  function handleExecutionChange(next: EvaluationExecution) {
    setExecution(next)
    setDefaultEvalExecution(next)
  }

  const model = findModel(models, modelId)
  const scenario = scenarios.find((entry) => entry.id === scenarioId) ?? null
  const graderReady = graderModelId.trim() !== ''
  const graderGroups = groupModelsBySource(models, modelProviders).groups

  function handleGraderModelChange(id: string) {
    setGraderModelId(id)
    const graderModel = findModel(models, id)
    setGraderProvider(graderModel?.source ?? 'bedrock')
  }

  async function handleStart() {
    setStartFailed(false)
    const grader: EvaluationGraderConfig = { model_id: graderModelId, provider: graderProvider }
    if (graderSystemPrompt.trim() !== '') grader.system_prompt = graderSystemPrompt

    const request: EvaluationRequest = {
      kind: 'determinism',
      run_config: toRunRequest(useRunConfigStore.getState()),
      n,
      grader,
      execution: effectiveExecution
    }
    if (rubric.trim() !== '') request.rubric = rubric

    const id = await startEvaluation(request)
    if (id) onStarted?.(id)
    else setStartFailed(true)
  }

  return (
    <section className="card" aria-labelledby="determinism-launcher-heading">
      <h2 id="determinism-launcher-heading" className="text-base font-semibold text-gray-900 mb-3">
        New determinism evaluation
      </h2>

      {!canRun ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Set a model and a user prompt in the Workbench tab before starting a determinism
          evaluation.
        </p>
      ) : (
        <dl className="text-sm text-gray-700 space-y-1 mb-4" data-testid="workbench-config-summary">
          <div>
            <dt className="inline font-medium text-gray-900">Model: </dt>
            <dd className="inline font-mono text-xs">{model?.name ?? modelId}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-gray-900">Scenario: </dt>
            <dd className="inline">{scenario?.name ?? 'None'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">System prompt</dt>
            <dd className="text-xs text-gray-600 font-mono">{truncate(systemPrompt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">User prompt</dt>
            <dd className="text-xs text-gray-600 font-mono">{truncate(userPrompt)}</dd>
          </div>
        </dl>
      )}

      <div className="space-y-3">
        <div>
          <span className="block text-xs font-medium text-gray-700 mb-1">Run location</span>
          <div
            className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm"
            role="radiogroup"
            aria-label="Run location"
          >
            {EXECUTION_OPTIONS.map((option) => {
              const disabled =
                option.value === 'cloud' ? !cloudConfigured : !localAvailable
              const hint =
                option.value === 'cloud' ? CLOUD_UNAVAILABLE_TOOLTIP : LOCAL_UNAVAILABLE_TOOLTIP
              return (
                <label
                  key={option.value}
                  title={disabled ? hint : undefined}
                  className={`px-3 py-1.5 cursor-pointer first:border-r first:border-gray-300 ${
                    effectiveExecution === option.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-50'}`}
                >
                  <input
                    type="radio"
                    name="eval-execution"
                    value={option.value}
                    checked={effectiveExecution === option.value}
                    disabled={disabled}
                    onChange={() => handleExecutionChange(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              )
            })}
          </div>
          {effectiveExecution === 'cloud' && (
            <p className="mt-1 text-xs text-gray-500" data-testid="cloud-execution-note">
              Runs, prompts, and dataset content are persisted to your AWS account (DynamoDB) for
              later review.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="eval-n" className="block text-xs font-medium text-gray-700 mb-1">
            Number of runs ({N_MIN}–{N_MAX})
          </label>
          <input
            id="eval-n"
            type="number"
            min={N_MIN}
            max={N_MAX}
            className="input-field"
            value={n}
            onChange={(event) => {
              const raw = Number(event.target.value)
              if (!Number.isFinite(raw)) return
              setN(clampN(raw))
            }}
          />
        </div>

        <div>
          <label htmlFor="grader-model-select" className="block text-xs font-medium text-gray-700 mb-1">
            Grader model
          </label>
          <select
            id="grader-model-select"
            className="select-field"
            value={graderModelId}
            onChange={(event) => handleGraderModelChange(event.target.value)}
          >
            <option value="">Select a model…</option>
            {graderGroups.map((group) => (
              <optgroup key={group.source} label={group.label} disabled={group.disabled}>
                {group.models.map((m) => (
                  <option key={m.model_id} value={m.model_id} disabled={group.disabled}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="eval-rubric" className="block text-xs font-medium text-gray-700 mb-1">
            Custom rubric <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="eval-rubric"
            className="input-field font-mono text-sm"
            rows={3}
            placeholder="How the judge should score consistency…"
            value={rubric}
            onChange={(event) => setRubric(event.target.value)}
          />
        </div>

        <div>
          <button
            type="button"
            className="text-xs font-medium text-primary-700 hover:text-primary-800"
            aria-expanded={showAdvanced}
            aria-controls="advanced-grading-fields"
            onClick={() => setShowAdvanced((open) => !open)}
          >
            {showAdvanced ? '▾' : '▸'} Advanced grading
          </button>

          {showAdvanced && (
            <div
              id="advanced-grading-fields"
              className="mt-2 p-3 rounded-lg border border-gray-200 bg-gray-50"
            >
              <label
                htmlFor="grader-system-prompt"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Custom grader system prompt
              </label>
              <textarea
                id="grader-system-prompt"
                className="input-field font-mono text-sm"
                rows={4}
                placeholder="Override the judge's default system prompt…"
                value={graderSystemPrompt}
                onChange={(event) => setGraderSystemPrompt(event.target.value)}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canRun || !graderReady || isEvaluating}
          onClick={() => void handleStart()}
        >
          {isEvaluating ? 'Running…' : 'Start evaluation'}
        </button>

        {startFailed && startErrorState && (
          <p className="text-xs text-red-600" role="alert">
            Could not start evaluation: {startErrorState.message}
          </p>
        )}
      </div>
    </section>
  )
}
