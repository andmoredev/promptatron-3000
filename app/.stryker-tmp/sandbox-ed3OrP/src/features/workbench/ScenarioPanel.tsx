/**
 * Scenario + dataset pickers.
 *
 * Selecting a scenario hydrates it (`loadScenario`) and then hands the detail
 * to `runConfigStore.applyScenarioDefaults`, which fills empty prompt fields
 * and auto-picks a lone dataset without ever clobbering typed text.
 */
// @ts-nocheck


import { useEffect } from 'react'
import {
  selectScenarioDetail,
  selectScenarioLoading,
  useRunConfigStore,
  useScenarioStore
} from '../../stores'

export default function ScenarioPanel() {
  const scenarios = useScenarioStore((state) => state.scenarios)
  const scenariosLoading = useScenarioStore((state) => state.scenariosLoading)
  const scenariosError = useScenarioStore((state) => state.scenariosError)
  const loadScenarios = useScenarioStore((state) => state.loadScenarios)
  const loadScenario = useScenarioStore((state) => state.loadScenario)

  const scenarioId = useRunConfigStore((state) => state.scenario_id)
  const datasetId = useRunConfigStore((state) => state.dataset_id)
  const setScenarioId = useRunConfigStore((state) => state.setScenarioId)
  const setDatasetId = useRunConfigStore((state) => state.setDatasetId)
  const applyScenarioDefaults = useRunConfigStore((state) => state.applyScenarioDefaults)

  const detail = useScenarioStore(selectScenarioDetail(scenarioId))
  const detailLoading = useScenarioStore(selectScenarioLoading(scenarioId))

  useEffect(() => {
    void loadScenarios()
  }, [loadScenarios])

  // Re-hydrate a scenario restored from persisted config so the dataset and
  // prompt pickers have something to list on a cold load.
  useEffect(() => {
    if (scenarioId) void loadScenario(scenarioId)
  }, [scenarioId, loadScenario])

  async function handleSelect(nextId: string) {
    if (nextId === '') {
      setScenarioId(null)
      setDatasetId(null)
      return
    }
    setScenarioId(nextId)
    const hydrated = await loadScenario(nextId)
    if (hydrated) applyScenarioDefaults(hydrated)
  }

  const datasets = detail?.datasets ?? []

  return (
    <section className="card" aria-labelledby="scenario-panel-heading">
      <h2 id="scenario-panel-heading" className="text-base font-semibold text-gray-900 mb-3">
        Scenario
      </h2>

      <label htmlFor="scenario-select" className="block text-xs font-medium text-gray-700 mb-1">
        Scenario
      </label>
      <select
        id="scenario-select"
        className="select-field"
        value={scenarioId ?? ''}
        onChange={(event) => void handleSelect(event.target.value)}
      >
        <option value="">
          {scenariosLoading && scenarios.length === 0 ? 'Loading scenarios…' : 'None'}
        </option>
        {scenarios.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.name}
          </option>
        ))}
      </select>

      {scenariosError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          Could not load scenarios: {scenariosError.message}
        </p>
      )}

      <div className="mt-4">
        <label htmlFor="dataset-select" className="block text-xs font-medium text-gray-700 mb-1">
          Dataset
        </label>
        <select
          id="dataset-select"
          className="select-field"
          value={datasetId ?? ''}
          disabled={!scenarioId || detailLoading}
          onChange={(event) => setDatasetId(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">{detailLoading ? 'Loading…' : 'None'}</option>
          {datasets.map((dataset) => (
            <option key={dataset.id} value={dataset.id}>
              {dataset.name}
            </option>
          ))}
        </select>
        {scenarioId && !detailLoading && datasets.length === 0 && (
          <p className="mt-1 text-xs text-gray-500">This scenario has no datasets.</p>
        )}
      </div>

      {detail && detail.tools.length > 0 && (
        <p className="mt-3 text-xs text-gray-600">
          {detail.tools.length} tool{detail.tools.length === 1 ? '' : 's'} available:{' '}
          <span className="font-mono">{detail.tools.map((tool) => tool.name).join(', ')}</span>
        </p>
      )}
    </section>
  )
}
