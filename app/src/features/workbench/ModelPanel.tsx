/**
 * Model picker.
 *
 * Reads the catalog from `scenarioStore` (one idempotent `loadModels()` on
 * mount, so mounting this twice still issues a single request) and writes the
 * choice straight into `runConfigStore.model_id`.
 */

import { useEffect, useMemo } from 'react'
import { findModel, useRunConfigStore, useScenarioStore } from '../../stores'
import type { ModelInfo } from '../../api'

/** Group the flat catalog into `[provider, models]` pairs, providers A-Z. */
function groupByProvider(models: ModelInfo[]): [string, ModelInfo[]][] {
  const groups = new Map<string, ModelInfo[]>()
  for (const model of models) {
    const existing = groups.get(model.provider)
    if (existing) existing.push(model)
    else groups.set(model.provider, [model])
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export default function ModelPanel() {
  const models = useScenarioStore((state) => state.models)
  const loading = useScenarioStore((state) => state.modelsLoading)
  const error = useScenarioStore((state) => state.modelsError)
  const cached = useScenarioStore((state) => state.modelsCached)
  const loadModels = useScenarioStore((state) => state.loadModels)

  const modelId = useRunConfigStore((state) => state.model_id)
  const setModelId = useRunConfigStore((state) => state.setModelId)

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const groups = useMemo(() => groupByProvider(models), [models])
  const selected = findModel(models, modelId)

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
        onChange={(event) => setModelId(event.target.value)}
      >
        <option value="">
          {loading && models.length === 0 ? 'Loading models…' : 'Select a model…'}
        </option>
        {groups.map(([provider, providerModels]) => (
          <optgroup key={provider} label={provider}>
            {providerModels.map((model) => (
              <option key={model.model_id} value={model.model_id}>
                {model.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {selected && (
        <p className="mt-2 text-xs text-gray-600 break-all">
          <span className="font-mono">{selected.model_id}</span>
          {' · '}
          {selected.kind === 'inference-profile' ? 'inference profile' : 'foundation model'}
          {selected.supports_streaming ? ' · streaming' : ' · no streaming'}
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          Could not load models: {error.message}
        </p>
      )}

      {!loading && !error && models.length === 0 && (
        <p className="mt-2 text-xs text-gray-500">No models available.</p>
      )}
    </section>
  )
}
