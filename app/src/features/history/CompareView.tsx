/**
 * Side-by-side comparison of exactly two runs.
 *
 * No diff library — the two `RunDetailView`s render in aligned columns and
 * this component just decides, from the cached detail rows, which top-level
 * fields differ so `RunDetailView` can ring-highlight them.
 */

import { useHistoryStore } from '../../stores'
import type { RunDetail, RunMetrics } from '../../api'
import RunDetailView, { type RunDetailHighlight } from './RunDetailView'

export interface CompareViewProps {
  runIds: [string, string]
  onClose?: () => void
}

const METRIC_KEYS: Array<keyof RunMetrics> = [
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'latency_ms',
  'cycle_count'
]

function diffHighlight(a: RunDetail | undefined, b: RunDetail | undefined): RunDetailHighlight {
  if (!a || !b) return {}
  const metrics: Partial<Record<keyof RunMetrics, boolean>> = {}
  for (const key of METRIC_KEYS) {
    if ((a.metrics?.[key] ?? null) !== (b.metrics?.[key] ?? null)) metrics[key] = true
  }
  return {
    model_id: a.model_id !== b.model_id,
    status: a.status !== b.status,
    metrics
  }
}

export default function CompareView({ runIds, onClose }: CompareViewProps) {
  const [leftId, rightId] = runIds
  const details = useHistoryStore((state) => state.details)
  const left = details[leftId]
  const right = details[rightId]

  const highlight = diffHighlight(left, right)

  return (
    <section className="card" aria-labelledby="compare-view-heading" data-testid="compare-view">
      <div className="flex items-center justify-between mb-4">
        <h2 id="compare-view-heading" className="text-base font-semibold text-gray-900">
          Compare runs
        </h2>
        {onClose && (
          <button
            type="button"
            className="text-xs font-medium text-primary-700 hover:text-primary-800"
            onClick={onClose}
            data-testid="compare-close-btn"
          >
            Close compare
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RunDetailView runId={leftId} highlight={highlight} />
        <RunDetailView runId={rightId} highlight={highlight} />
      </div>
    </section>
  )
}
