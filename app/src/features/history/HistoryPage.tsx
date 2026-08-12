/**
 * The History tab: a filterable, paged list of past runs with a detail panel,
 * a two-run compare mode, an NDJSON export, and a one-time banner for
 * pre-revamp local history.
 *
 * Row selection state (detail vs. compare) lives here rather than in the
 * store — it is purely a view concern, and keeping it local means switching
 * tabs away and back does not need to remember what was open.
 */

import { useEffect, useState } from 'react'
import LoadingSpinner from '../../components/LoadingSpinner'
import { api } from '../../api'
import type { RunDetail, RunSummary } from '../../api'
import {
  selectHasMore,
  selectNeedsRefresh,
  useHistoryStore,
  useScenarioStore,
  type HistoryFilters
} from '../../stores'
import CompareView from './CompareView'
import LegacyExportBanner from './LegacyExportBanner'
import RunDetailView from './RunDetailView'

const STATUS_OPTIONS = ['completed', 'error', 'cancelled']

const STATUS_CLASSES: Record<string, string> = {
  completed: 'bg-primary-100 text-primary-800',
  error: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-700'
}

function statusBadgeClass(status: string): string {
  return STATUS_CLASSES[status] ?? 'bg-gray-100 text-gray-700'
}

function formatTs(ts: string): string {
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? ts : date.toLocaleString()
}

function formatTokens(run: RunSummary): string {
  const total = run.metrics?.total_tokens
  return total === undefined || total === null ? '—' : total.toLocaleString()
}

/* -------------------------------------------------------------------------- */
/* Filter bar                                                                 */
/* -------------------------------------------------------------------------- */

function FilterBar({ filters }: { filters: HistoryFilters }) {
  const setFilters = useHistoryStore((state) => state.setFilters)
  const models = useScenarioStore((state) => state.models)
  const modelsLoaded = useScenarioStore((state) => state.modelsLoaded)
  const scenarios = useScenarioStore((state) => state.scenarios)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label htmlFor="history-filter-model" className="block text-xs font-medium text-gray-700 mb-1">
          Model
        </label>
        {modelsLoaded && models.length > 0 ? (
          <select
            id="history-filter-model"
            data-testid="history-filter-model"
            className="select-field"
            value={filters.model_id ?? ''}
            onChange={(event) =>
              void setFilters({ model_id: event.target.value === '' ? null : event.target.value })
            }
          >
            <option value="">All models</option>
            {models.map((model) => (
              <option key={model.model_id} value={model.model_id}>
                {model.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="history-filter-model"
            data-testid="history-filter-model"
            type="text"
            className="input-field"
            placeholder="model id…"
            value={filters.model_id ?? ''}
            onChange={(event) =>
              void setFilters({ model_id: event.target.value === '' ? null : event.target.value })
            }
          />
        )}
      </div>

      <div>
        <label htmlFor="history-filter-scenario" className="block text-xs font-medium text-gray-700 mb-1">
          Scenario
        </label>
        <select
          id="history-filter-scenario"
          data-testid="history-filter-scenario"
          className="select-field"
          value={filters.scenario_id ?? ''}
          onChange={(event) =>
            void setFilters({ scenario_id: event.target.value === '' ? null : event.target.value })
          }
        >
          <option value="">All scenarios</option>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="history-filter-status" className="block text-xs font-medium text-gray-700 mb-1">
          Status
        </label>
        <select
          id="history-filter-status"
          data-testid="history-filter-status"
          className="select-field"
          value={filters.status ?? ''}
          onChange={(event) =>
            void setFilters({ status: event.target.value === '' ? null : event.target.value })
          }
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Row                                                                        */
/* -------------------------------------------------------------------------- */

interface RunRowProps {
  run: RunSummary
  selected: boolean
  compareChecked: boolean
  compareDisabled: boolean
  onSelect: () => void
  onToggleCompare: (checked: boolean) => void
}

function RunRow({ run, selected, compareChecked, compareDisabled, onSelect, onToggleCompare }: RunRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const remove = useHistoryStore((state) => state.remove)
  const loading = useHistoryStore((state) => state.loading)

  async function handleDelete() {
    await remove(run.id)
    setConfirmingDelete(false)
  }

  return (
    <tr
      className={`border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 ${
        selected ? 'bg-primary-50' : ''
      }`}
      data-testid="history-row"
      data-run-id={run.id}
      onClick={onSelect}
    >
      <td className="py-2 pr-3" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Compare run ${run.id}`}
          data-testid="history-compare-checkbox"
          className="h-4 w-4 rounded border-gray-300 text-primary-600"
          checked={compareChecked}
          disabled={compareDisabled}
          onChange={(event) => onToggleCompare(event.target.checked)}
        />
      </td>
      <td className="py-2 pr-4 text-sm text-gray-700 whitespace-nowrap">{formatTs(run.ts)}</td>
      <td className="py-2 pr-4 text-sm font-mono text-gray-900 break-all">{run.model_id}</td>
      <td className="py-2 pr-4 text-sm text-gray-700">{run.scenario_id ?? '—'}</td>
      <td className="py-2 pr-4">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(run.status)}`}>
          {run.status}
        </span>
      </td>
      <td className="py-2 pr-4 text-sm text-gray-700 tabular-nums">{formatTokens(run)}</td>
      <td className="py-2 pl-2 text-right" onClick={(event) => event.stopPropagation()}>
        {confirmingDelete ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-gray-600">Delete?</span>
            <button
              type="button"
              className="text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
              data-testid="history-delete-confirm"
              disabled={loading}
              onClick={() => void handleDelete()}
            >
              Confirm
            </button>
            <button
              type="button"
              className="text-xs font-medium text-gray-600 hover:text-gray-800"
              data-testid="history-delete-cancel"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-xs font-medium text-red-700 hover:text-red-800"
            data-testid="history-delete-btn"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  )
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

function ExportButton({ filters }: { filters: HistoryFilters }) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    const rows: RunDetail[] = []
    try {
      await api.runs.exportAll(filters, { onEvent: (run) => rows.push(run) })
      const ndjson = rows.map((run) => JSON.stringify(run)).join('\n') + (rows.length > 0 ? '\n' : '')
      const blob = new Blob([ndjson], { type: 'application/x-ndjson' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'promptatron-runs.ndjson'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="history-export-btn"
        disabled={exporting}
        onClick={() => void handleExport()}
      >
        {exporting ? 'Exporting…' : 'Export NDJSON'}
      </button>
      {exportError && (
        <p className="text-xs text-red-600" role="alert">
          {exportError}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function HistoryPage() {
  const items = useHistoryStore((state) => state.items)
  const loading = useHistoryStore((state) => state.loading)
  const loaded = useHistoryStore((state) => state.loaded)
  const error = useHistoryStore((state) => state.error)
  const filters = useHistoryStore((state) => state.filters)
  const needsRefresh = useHistoryStore(selectNeedsRefresh)
  const hasMore = useHistoryStore(selectHasMore)
  const loadFirstPage = useHistoryStore((state) => state.loadFirstPage)
  const loadMore = useHistoryStore((state) => state.loadMore)

  const loadModels = useScenarioStore((state) => state.loadModels)
  const loadScenarios = useScenarioStore((state) => state.loadScenarios)

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])

  useEffect(() => {
    if (needsRefresh) void loadFirstPage()
  }, [needsRefresh, loadFirstPage])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  useEffect(() => {
    void loadScenarios()
  }, [loadScenarios])

  function toggleCompare(runId: string, checked: boolean) {
    setCompareIds((current) => {
      if (checked) return current.includes(runId) ? current : [...current, runId].slice(-2)
      return current.filter((id) => id !== runId)
    })
  }

  const comparing = compareIds.length === 2

  return (
    <div className="space-y-4" data-testid="history-page">
      <LegacyExportBanner />

      <section className="card" aria-labelledby="history-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 id="history-heading" className="text-lg font-semibold text-gray-900">
            Run history
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="history-refresh-btn"
              disabled={loading}
              onClick={() => void loadFirstPage()}
            >
              Refresh
            </button>
            <ExportButton filters={filters} />
          </div>
        </div>

        <div className="mb-4">
          <FilterBar filters={filters} />
        </div>

        {error && (
          <p className="mb-3 text-xs text-red-600" role="alert">
            {error.message}
          </p>
        )}

        {loading && items.length === 0 && (
          <LoadingSpinner text="Loading runs…" />
        )}

        {loaded && !loading && items.length === 0 && !error && (
          <p className="text-sm text-gray-600" data-testid="history-empty">
            No runs match these filters.
          </p>
        )}

        {items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left" data-testid="history-table">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="py-2 pr-3">Compare</th>
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Scenario</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Tokens</th>
                    <th className="py-2 pl-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      selected={selectedRunId === run.id}
                      compareChecked={compareIds.includes(run.id)}
                      compareDisabled={comparing && !compareIds.includes(run.id)}
                      onSelect={() => setSelectedRunId((current) => (current === run.id ? null : run.id))}
                      onToggleCompare={(checked) => toggleCompare(run.id, checked)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  className="btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="history-load-more-btn"
                  disabled={loading}
                  onClick={() => void loadMore()}
                >
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {comparing ? (
        <CompareView
          runIds={[compareIds[0], compareIds[1]]}
          onClose={() => setCompareIds([])}
        />
      ) : (
        selectedRunId && <RunDetailView key={selectedRunId} runId={selectedRunId} />
      )}
    </div>
  )
}
