/**
 * Full detail for a single run: prompts, output, tool transcript, metrics and
 * guardrail trace.
 *
 * Fetches through `historyStore.getRunDetail`, which caches by run id — so two
 * `RunDetailView`s showing the same run (e.g. a re-open after Compare) share
 * one request. `highlight` is set by `CompareView` to flag fields that differ
 * between the two runs being compared; standalone use leaves it empty.
 */

import { useEffect } from 'react'
import { useHistoryStore } from '../../stores'
import type { RunDetail, RunMetrics, ToolTranscriptEntry } from '../../api'
import LoadingSpinner from '../../components/LoadingSpinner'

export interface RunDetailHighlight {
  model_id?: boolean
  status?: boolean
  metrics?: Partial<Record<keyof RunMetrics, boolean>>
}

export interface RunDetailViewProps {
  runId: string
  highlight?: RunDetailHighlight
  className?: string
}

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

function formatCount(value: number | undefined): string {
  return value === undefined ? '—' : value.toLocaleString()
}

function formatMs(value: number | undefined): string {
  if (value === undefined) return '—'
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

interface MetricStatProps {
  label: string
  value: string
  highlighted?: boolean
}

function MetricStat({ label, value, highlighted }: MetricStatProps) {
  return (
    <div
      className={`min-w-0 rounded-lg p-2 ${highlighted ? 'ring-2 ring-amber-400 bg-amber-50' : ''}`}
      data-testid="run-detail-metric"
      data-highlighted={highlighted ? 'true' : 'false'}
    >
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 tabular-nums truncate">{value}</dd>
    </div>
  )
}

function ToolTranscriptRow({ entry }: { entry: ToolTranscriptEntry }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3" data-testid="run-detail-tool-row">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-sm font-medium text-gray-900">{entry.name}</span>
        <span className="flex items-center gap-2">
          {entry.error && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-medium">
              error
            </span>
          )}
          <span className="text-xs text-gray-500">{entry.duration_ms} ms</span>
        </span>
      </div>
      <div className="text-xs">
        <p className="font-medium text-gray-600 mb-1">Input</p>
        <pre className="overflow-x-auto rounded bg-gray-50 p-2 font-mono text-gray-800">
          {prettyJson(entry.input)}
        </pre>
      </div>
      <div className="text-xs mt-2">
        <p className="font-medium text-gray-600 mb-1">Output</p>
        <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 font-mono text-gray-800">
          {prettyJson(entry.output)}
        </pre>
      </div>
      {entry.error && (
        <div className="text-xs mt-2">
          <p className="font-medium text-red-600 mb-1">Error</p>
          <pre className="overflow-x-auto rounded bg-red-50 p-2 font-mono text-red-800">
            {prettyJson(entry.error)}
          </pre>
        </div>
      )}
    </li>
  )
}

export default function RunDetailView({ runId, highlight, className = '' }: RunDetailViewProps) {
  const detail = useHistoryStore((state) => state.details[runId])
  const getRunDetail = useHistoryStore((state) => state.getRunDetail)
  const error = useHistoryStore((state) => state.error)

  useEffect(() => {
    void getRunDetail(runId)
  }, [runId, getRunDetail])

  if (!detail) {
    return (
      <div className={`card ${className}`} data-testid="run-detail-view">
        <LoadingSpinner size="md" color="primary" text="Loading run…" inline={false} />
        {error && (
          <p className="mt-3 text-xs text-red-600" role="alert">
            {error.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <RunDetailBody detail={detail} highlight={highlight} className={className} />
  )
}

function RunDetailBody({
  detail,
  highlight,
  className
}: {
  detail: RunDetail
  highlight?: RunDetailHighlight
  className: string
}) {
  const transcript = detail.tool_transcript ?? []

  return (
    <div className={`card space-y-4 ${className}`} data-testid="run-detail-view" data-run-id={detail.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500">{formatTs(detail.ts)}</p>
          <p
            className={`font-mono text-sm text-gray-900 break-all rounded ${
              highlight?.model_id ? 'ring-2 ring-amber-400 bg-amber-50 px-1' : ''
            }`}
            data-testid="run-detail-model-id"
            data-highlighted={highlight?.model_id ? 'true' : 'false'}
          >
            {detail.model_id}
          </p>
          {detail.scenario_id && <p className="text-xs text-gray-600">Scenario: {detail.scenario_id}</p>}
        </div>
        <span
          data-testid="run-detail-status-badge"
          data-highlighted={highlight?.status ? 'true' : 'false'}
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(detail.status)} ${
            highlight?.status ? 'ring-2 ring-amber-400' : ''
          }`}
        >
          {detail.status}
        </span>
      </div>

      {detail.error != null && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200" role="alert" data-testid="run-detail-error">
          <pre className="text-xs font-mono text-red-800 whitespace-pre-wrap break-words">
            {prettyJson(detail.error)}
          </pre>
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-xs font-medium text-gray-700">System prompt</summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800 whitespace-pre-wrap break-words">
          {detail.system_prompt || '—'}
        </pre>
      </details>

      <details open>
        <summary className="cursor-pointer text-xs font-medium text-gray-700">User prompt</summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800 whitespace-pre-wrap break-words">
          {detail.user_prompt || '—'}
        </pre>
      </details>

      <div>
        <p className="text-xs font-medium text-gray-700 mb-1">Output</p>
        <div
          data-testid="run-detail-output"
          className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm text-gray-800"
        >
          {detail.output || <span className="text-gray-400">No output.</span>}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">
          Tool calls{transcript.length > 0 && ` (${transcript.length})`}
        </p>
        {transcript.length === 0 ? (
          <p className="text-xs text-gray-500">No tools were called.</p>
        ) : (
          <ul className="space-y-2">
            {transcript.map((entry) => (
              <ToolTranscriptRow key={entry.tool_use_id} entry={entry} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">Metrics</p>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MetricStat
            label="Input tokens"
            value={formatCount(detail.metrics?.input_tokens)}
            highlighted={highlight?.metrics?.input_tokens}
          />
          <MetricStat
            label="Output tokens"
            value={formatCount(detail.metrics?.output_tokens)}
            highlighted={highlight?.metrics?.output_tokens}
          />
          <MetricStat
            label="Total tokens"
            value={formatCount(detail.metrics?.total_tokens)}
            highlighted={highlight?.metrics?.total_tokens}
          />
          <MetricStat
            label="Latency"
            value={formatMs(detail.metrics?.latency_ms)}
            highlighted={highlight?.metrics?.latency_ms}
          />
          <MetricStat
            label="Cycles"
            value={formatCount(detail.metrics?.cycle_count)}
            highlighted={highlight?.metrics?.cycle_count}
          />
        </dl>
      </div>

      {detail.guardrail_trace != null && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-gray-700">Guardrail trace</summary>
          <pre
            data-testid="run-detail-guardrail-trace"
            className="mt-2 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800"
          >
            {prettyJson(detail.guardrail_trace)}
          </pre>
        </details>
      )}
    </div>
  )
}
