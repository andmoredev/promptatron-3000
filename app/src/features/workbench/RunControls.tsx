/**
 * Everything between "the prompt is written" and "the run is in flight":
 * inference knobs, the tools toggle, guardrail selection, and Run / Cancel.
 *
 * The submit handler deliberately reads `useRunConfigStore.getState()` rather
 * than subscribing to the whole config — `toRunRequest` builds a fresh object,
 * which cannot be a zustand v5 selector, and the button only needs the boolean
 * from `selectCanRun`.
 */

import { useEffect, useState } from 'react'
import {
  readyGuardrails,
  selectCanRun,
  selectIsRunning,
  toRunRequest,
  useGuardrailStore,
  useRunConfigStore,
  useRunStore
} from '../../stores'

/** `""` -> `undefined` (drops the key), otherwise a finite number. */
function toOptionalNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

export default function RunControls() {
  const [showInference, setShowInference] = useState(false)

  const inference = useRunConfigStore((state) => state.inference)
  const toolsEnabled = useRunConfigStore((state) => state.tools_enabled)
  const maxToolIterations = useRunConfigStore((state) => state.max_tool_iterations)
  const guardrail = useRunConfigStore((state) => state.guardrail)
  const setInference = useRunConfigStore((state) => state.setInference)
  const setToolsEnabled = useRunConfigStore((state) => state.setToolsEnabled)
  const setMaxToolIterations = useRunConfigStore((state) => state.setMaxToolIterations)
  const setGuardrail = useRunConfigStore((state) => state.setGuardrail)
  const canRun = useRunConfigStore(selectCanRun)

  const guardrails = useGuardrailStore((state) => state.guardrails)
  const loadGuardrails = useGuardrailStore((state) => state.loadGuardrails)

  const isRunning = useRunStore(selectIsRunning)
  const startRun = useRunStore((state) => state.startRun)
  const cancelRun = useRunStore((state) => state.cancelRun)

  useEffect(() => {
    void loadGuardrails()
  }, [loadGuardrails])

  const attachable = readyGuardrails(guardrails)

  function handleRun() {
    void startRun(toRunRequest(useRunConfigStore.getState()))
  }

  return (
    <section className="card" aria-labelledby="run-controls-heading">
      <h2 id="run-controls-heading" className="text-base font-semibold text-gray-900 mb-3">
        Run
      </h2>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600"
            checked={toolsEnabled}
            onChange={(event) => setToolsEnabled(event.target.checked)}
          />
          Enable tools
        </label>

        <div className={toolsEnabled ? '' : 'opacity-50'}>
          <label
            htmlFor="max-tool-iterations"
            className="block text-xs font-medium text-gray-700 mb-1"
          >
            Max tool iterations
          </label>
          <input
            id="max-tool-iterations"
            type="number"
            min={1}
            max={100}
            className="input-field"
            disabled={!toolsEnabled}
            value={maxToolIterations}
            onChange={(event) => setMaxToolIterations(Number(event.target.value) || 1)}
          />
        </div>

        <div>
          <label htmlFor="guardrail-select" className="block text-xs font-medium text-gray-700 mb-1">
            Guardrail
          </label>
          <select
            id="guardrail-select"
            className="select-field"
            value={guardrail?.id ?? ''}
            onChange={(event) =>
              setGuardrail(
                event.target.value === '' ? null : { id: event.target.value, trace: true }
              )
            }
          >
            <option value="">None</option>
            {attachable.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button
            type="button"
            className="text-xs font-medium text-primary-700 hover:text-primary-800"
            aria-expanded={showInference}
            aria-controls="inference-fields"
            onClick={() => setShowInference((open) => !open)}
          >
            {showInference ? '▾' : '▸'} Inference parameters
          </button>

          {showInference && (
            <div
              id="inference-fields"
              className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50"
            >
              <div>
                <label htmlFor="temperature" className="block text-xs text-gray-700 mb-1">
                  Temperature
                </label>
                <input
                  id="temperature"
                  type="number"
                  step="0.1"
                  min={0}
                  max={1}
                  className="input-field"
                  value={inference.temperature ?? ''}
                  onChange={(event) =>
                    setInference({ temperature: toOptionalNumber(event.target.value) })
                  }
                />
              </div>
              <div>
                <label htmlFor="top-p" className="block text-xs text-gray-700 mb-1">
                  Top P
                </label>
                <input
                  id="top-p"
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  className="input-field"
                  value={inference.top_p ?? ''}
                  onChange={(event) => setInference({ top_p: toOptionalNumber(event.target.value) })}
                />
              </div>
              <div>
                <label htmlFor="max-tokens" className="block text-xs text-gray-700 mb-1">
                  Max tokens
                </label>
                <input
                  id="max-tokens"
                  type="number"
                  min={1}
                  className="input-field"
                  value={inference.max_tokens ?? ''}
                  onChange={(event) =>
                    setInference({ max_tokens: toOptionalNumber(event.target.value) })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canRun || isRunning}
            onClick={handleRun}
          >
            {isRunning ? 'Running…' : 'Run'}
          </button>
          <button
            type="button"
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!isRunning}
            onClick={() => cancelRun()}
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  )
}
