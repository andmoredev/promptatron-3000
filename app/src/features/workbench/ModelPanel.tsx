/**
 * Model picker.
 *
 * Reads the catalog from `scenarioStore` (one idempotent `loadModels()` on
 * mount, so mounting this twice still issues a single request) and writes the
 * choice straight into `runConfigStore.model_id` / `.provider`.
 *
 * Options are grouped by `ModelInfo.source` (Bedrock / Anthropic / OpenAI /
 * Ollama (local)) rather than the free-text `provider` display string, so an
 * unconfigured or unreachable backend can be flagged consistently regardless
 * of what its models happen to be named. See `groupModelsBySource`.
 */

import { useEffect, useMemo } from 'react'
import { findModel, groupModelsBySource, useRunConfigStore, useScenarioStore } from '../../stores'
import type { ModelSource } from '../../api'

const PROVIDER_OPTIONS: Array<{ value: ModelSource; label: string }> = [
  { value: 'bedrock', label: 'Bedrock' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama' }
]

export default function ModelPanel() {
  const models = useScenarioStore((state) => state.models)
  const loading = useScenarioStore((state) => state.modelsLoading)
  const error = useScenarioStore((state) => state.modelsError)
  const cached = useScenarioStore((state) => state.modelsCached)
  const providers = useScenarioStore((state) => state.modelProviders)
  const loadModels = useScenarioStore((state) => state.loadModels)

  const modelId = useRunConfigStore((state) => state.model_id)
  const provider = useRunConfigStore((state) => state.provider)
  const setModelId = useRunConfigStore((state) => state.setModelId)
  const setProvider = useRunConfigStore((state) => state.setProvider)
  const selectModel = useRunConfigStore((state) => state.selectModel)

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const { groups, unavailable } = useMemo(
    () => groupModelsBySource(models, providers),
    [models, providers]
  )
  const selected = findModel(models, modelId)

  function handleSelect(id: string) {
    const model = id === '' ? null : findModel(models, id)
    if (model) selectModel(model.model_id, model.source ?? 'bedrock')
    else setModelId(id)
  }

  return (
    <section className="card" aria-labelledby="model-panel-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="model-panel-heading" className="text-base font-semibold text-gray-900">
          Model
        </h2>
        {cached && (
          <span className="text-xs text-gray-500" title="Served from the server's catalog cache">
            cached
          </span>
        )}
      </div>

      <label htmlFor="model-select" className="sr-only">
        Model
      </label>
      <select
        id="model-select"
        className="select-field"
        value={modelId}
        onChange={(event) => handleSelect(event.target.value)}
      >
        <option value="">
          {loading && models.length === 0 ? 'Loading models…' : 'Select a model…'}
        </option>
        {groups.map((group) => (
          <optgroup key={group.source} label={group.label} disabled={group.disabled}>
            {group.models.map((model) => (
              <option key={model.model_id} value={model.model_id} disabled={group.disabled}>
                {model.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {unavailable.length > 0 && !loading && (
        <p className="mt-1 text-xs text-gray-500">
          Not shown: {unavailable.map((entry) => `${entry.label} (not configured)`).join(', ')}
        </p>
      )}

      {selected && (
        <p className="mt-2 text-xs text-gray-600 break-all">
          <span className="font-mono">{selected.model_id}</span>
          {' · '}
          {selected.kind === 'inference-profile' ? 'inference profile' : 'foundation model'}
          {selected.supports_streaming ? ' · streaming' : ' · no streaming'}
        </p>
      )}

      {(error || (!loading && models.length === 0)) && (
        <div className="mt-2">
          {error ? (
            <p className="text-xs text-red-600" role="alert">
              Could not load models: {error.message}
            </p>
          ) : (
            <p className="text-xs text-gray-600">
              No models available from any configured provider.
            </p>
          )}
          {/* Fallback affordance: the catalog degrades to empty rather than
              erroring when a provider listing fails (expired AWS session,
              PROMPTATRON_FAKE_MODEL runs, no providers configured), so let a
              model id be typed directly rather than blocking on the dropdown.
              A provider select sits next to it since a manually-typed id
              carries no `source`. */}
          <div className="mt-2 flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="model-id-manual" className="block text-xs font-medium text-gray-700 mb-1">
                Enter model id manually
              </label>
              <input
                id="model-id-manual"
                type="text"
                className="input-field font-mono text-xs"
                placeholder="e.g. anthropic.claude-3-5-sonnet-20241022-v2:0"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="model-provider-manual" className="block text-xs font-medium text-gray-700 mb-1">
                Provider
              </label>
              <select
                id="model-provider-manual"
                className="select-field text-xs"
                value={provider}
                onChange={(event) => setProvider(event.target.value as ModelSource)}
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

    </section>
  )
}
