/**
 * The Evals tab: a determinism-evaluation launcher, a results panel for
 * whichever evaluation is selected, and the list of past evaluations.
 *
 * Only one evaluation is ever "followed" client-side (`evalStore.activeEvaluationId`);
 * selecting a running/pending row attaches to it with `followEvaluation` so its
 * live progress shows here, while selecting a finished row just renders the
 * result already carried on its list entry (`EvaluationDetail.result`) — no
 * extra fetch needed, though `refreshEvaluation` is used to pick up the final
 * status right after a cancel.
 */
// @ts-nocheck


import { useEffect, useState, type MouseEvent } from 'react'
import DeterminismLauncher from './DeterminismLauncher'
import EvalProgress from './EvalProgress'
import EvalResultView from './EvalResultView'
import { useEvalStore } from '../../stores'
import type { EvaluationDetail, EvaluationExecution, EvaluationStatus } from '../../api'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  error: 'Error',
  cancelled: 'Cancelled'
}

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-primary-100 text-primary-800',
  error: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-700'
}

/** Lane badge classes — `local` is quiet grey, `cloud` stands out blue. */
const EXECUTION_CLASSES: Record<EvaluationExecution, string> = {
  local: 'bg-gray-100 text-gray-600',
  cloud: 'bg-sky-100 text-sky-800'
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

function statusClasses(status: string): string {
  return STATUS_CLASSES[status] ?? 'bg-gray-100 text-gray-700'
}

/** `EvaluationDetail.execution` is optional on the wire; pre-existing rows are local. */
function executionOf(row: EvaluationDetail): EvaluationExecution {
  return row.execution ?? 'local'
}

function isCancellable(status: EvaluationStatus | string): boolean {
  return status === 'pending' || status === 'running'
}

function formatTs(ts: string): string {
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? ts : date.toLocaleString()
}

export default function EvalsPage() {
  const evaluations = useEvalStore((state) => state.evaluations)
  const listLoading = useEvalStore((state) => state.listLoading)
  const listError = useEvalStore((state) => state.listError)
  const nextCursor = useEvalStore((state) => state.nextCursor)
  const loadEvaluations = useEvalStore((state) => state.loadEvaluations)
  const loadMoreEvaluations = useEvalStore((state) => state.loadMoreEvaluations)
  const refreshEvaluation = useEvalStore((state) => state.refreshEvaluation)

  const activeEvaluationId = useEvalStore((state) => state.activeEvaluationId)
  const activeStatus = useEvalStore((state) => state.status)
  const activeResult = useEvalStore((state) => state.result)
  const followEvaluation = useEvalStore((state) => state.followEvaluation)
  const cancelEvaluation = useEvalStore((state) => state.cancelEvaluation)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cloudFilter, setCloudFilter] = useState(false)

  useEffect(() => {
    void loadEvaluations(cloudFilter ? { execution: 'cloud' } : {})
    // Switching the filter drops the previous selection: a cursor (and the
    // rows it paged in) is only valid for the filter set it was issued under.
    setSelectedId(null)
  }, [cloudFilter, loadEvaluations])

  function handleSelectRow(row: EvaluationDetail) {
    setSelectedId(row.id)
    if (isCancellable(row.status) && row.id !== activeEvaluationId) {
      void followEvaluation(row.id)
    }
  }

  async function handleCancelRow(row: EvaluationDetail, event: MouseEvent) {
    event.stopPropagation()
    if (row.id !== activeEvaluationId) void followEvaluation(row.id)
    await cancelEvaluation()
    await refreshEvaluation(row.id)
  }

  const selectedRow = evaluations.find((row) => row.id === selectedId) ?? null
  const isSelectedActive = selectedId !== null && selectedId === activeEvaluationId
  const showLiveProgress =
    isSelectedActive && (activeStatus === 'starting' || activeStatus === 'running' || activeStatus === 'grading')
  const resultToShow = isSelectedActive ? (activeResult ?? selectedRow?.result ?? null) : (selectedRow?.result ?? null)

  return (
    <div className="space-y-6" data-testid="evals-page">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <DeterminismLauncher onStarted={(id) => setSelectedId(id)} />

        <section className="card" aria-labelledby="eval-results-heading">
          <h2 id="eval-results-heading" className="text-base font-semibold text-gray-900 mb-3">
            Results
          </h2>

          {selectedId === null && (
            <p className="text-sm text-gray-500">
              Start a new evaluation or select one from the list below to see its results.
            </p>
          )}

          {selectedId !== null && showLiveProgress && <EvalProgress />}

          {selectedId !== null && !showLiveProgress && resultToShow && (
            <EvalResultView result={resultToShow} />
          )}

          {selectedId !== null && !showLiveProgress && !resultToShow && (
            <p className="text-sm text-gray-500" data-testid="eval-no-result">
              {isSelectedActive && activeStatus === 'error'
                ? 'The evaluation failed before it produced a result.'
                : isSelectedActive && activeStatus === 'cancelled'
                  ? 'The evaluation was cancelled before it produced a result.'
                  : 'This evaluation has no result yet.'}
            </p>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="eval-list-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 id="eval-list-heading" className="text-base font-semibold text-gray-900">
            Past evaluations
          </h2>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              data-testid="eval-cloud-filter"
              className="h-4 w-4 rounded border-gray-300 text-primary-600"
              checked={cloudFilter}
              onChange={(event) => setCloudFilter(event.target.checked)}
            />
            Cloud
          </label>
        </div>

        {listLoading && evaluations.length === 0 && (
          <p className="text-sm text-gray-500">Loading evaluations…</p>
        )}

        {listError && (
          <p className="text-sm text-red-600 mb-3" role="alert">
            Could not load evaluations: {listError.message}
          </p>
        )}

        {!listLoading && evaluations.length === 0 && !listError && (
          <p className="text-sm text-gray-500">No evaluations yet.</p>
        )}

        {evaluations.length > 0 && (
          <ul className="divide-y divide-gray-200" data-testid="eval-list">
            {evaluations.map((row) => (
              <li key={row.id}>
                {/* A `div[role=button]`, not a real `<button>`: a Cancel button lives inside
                    it, and nesting interactive controls inside a `<button>` is invalid HTML. */}
                <div
                  role="button"
                  tabIndex={0}
                  data-testid={`eval-row-${row.id}`}
                  onClick={() => handleSelectRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleSelectRow(row)
                    }
                  }}
                  className={`w-full text-left py-2 px-2 -mx-2 rounded-lg flex flex-wrap items-center justify-between gap-2 hover:bg-gray-50 cursor-pointer ${
                    selectedId === row.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-gray-700 uppercase">{row.kind}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${EXECUTION_CLASSES[executionOf(row)]}`}
                      data-testid={`eval-lane-${row.id}`}
                    >
                      {executionOf(row)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClasses(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                    <span className="text-xs text-gray-500">{formatTs(row.ts)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {row.result?.grade && (
                      <span className="text-sm font-semibold text-gray-900">{row.result.grade}</span>
                    )}
                    {row.result?.score !== null && row.result?.score !== undefined && (
                      <span className="text-xs text-gray-500">{row.result.score}/100</span>
                    )}
                    {isCancellable(row.status) && (
                      <button
                        type="button"
                        className="btn-secondary py-1 px-2 text-xs"
                        onClick={(event) => void handleCancelRow(row, event)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {nextCursor && (
          <button
            type="button"
            className="btn-secondary mt-3 text-xs"
            disabled={listLoading}
            onClick={() => void loadMoreEvaluations()}
          >
            {listLoading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </div>
  )
}
