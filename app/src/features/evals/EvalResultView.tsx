/**
 * The assembled `EvaluationResult`: grade, score, reasoning, judge info, the
 * local + judge metrics grid, and any failed runs.
 *
 * Takes the result as a prop rather than reading `evalStore` itself, so the
 * same component renders both the just-finished active evaluation
 * (`evalStore.result`) and a selected past evaluation (`EvaluationDetail.result`
 * from the list/`refreshEvaluation`).
 */

import type { EvaluationResult } from '../../api'

/** A -> green ... F -> red. Anything else (a stray "Pass"/"Fail" grade) is neutral. */
const GRADE_COLORS: Record<string, string> = {
  A: 'text-green-600',
  B: 'text-lime-600',
  C: 'text-yellow-600',
  D: 'text-orange-600',
  F: 'text-red-600'
}

function gradeColorClass(grade: string | null): string {
  if (!grade) return 'text-gray-400'
  return GRADE_COLORS[grade.trim().charAt(0).toUpperCase()] ?? 'text-gray-500'
}

const METRIC_LABELS: Record<string, string> = {
  runs_analyzed: 'Runs analyzed',
  exact_match_count: 'Exact matches',
  unique_outputs: 'Unique outputs',
  output_length_variance: 'Output length variance',
  tool_sequence_consistency: 'Tool sequence consistency',
  modal_tool_sequence: 'Modal tool sequence',
  judge_overall_score: 'Judge overall score',
  judge_scores: 'Judge scores',
  judge_pass_rate: 'Judge pass rate',
  tool_consistency_judge_score: 'Tool consistency (judge)'
}

/** Order the known metrics consistently; anything unrecognized is skipped. */
const METRIC_ORDER = Object.keys(METRIC_LABELS)

function formatMetric(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ')
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function describeFailure(error: Record<string, unknown> | null): string {
  if (!error) return 'unknown error'
  if (typeof error.message === 'string' && error.message !== '') return error.message
  if (typeof error.code === 'string' && error.code !== '') return error.code
  return 'unknown error'
}

interface EvalResultViewProps {
  result: EvaluationResult
}

export default function EvalResultView({ result }: EvalResultViewProps) {
  const metricEntries = METRIC_ORDER
    .filter((key) => key in result.metrics)
    .map((key) => [key, result.metrics[key]] as const)

  return (
    <section className="card" aria-labelledby="eval-result-heading" data-testid="eval-result">
      <h3 id="eval-result-heading" className="sr-only">
        Evaluation result
      </h3>

      <div className="flex items-center gap-4 mb-4">
        <div
          className={`text-5xl font-bold leading-none ${gradeColorClass(result.grade)}`}
          data-testid="eval-grade"
        >
          {result.grade ?? '—'}
        </div>
        <div>
          <p className="text-xs text-gray-500">Score</p>
          <p className="text-xl font-semibold text-gray-900" data-testid="eval-score">
            {result.score === null ? '—' : `${result.score} / 100`}
          </p>
        </div>
      </div>

      {result.reasoning && (
        <p className="text-sm text-gray-700 whitespace-pre-wrap mb-4" data-testid="eval-reasoning">
          {result.reasoning}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-mono">
          Judge: {result.judge.model_id}
        </span>
        {result.judge.system_prompt_used && (
          <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-800">
            Custom prompt
          </span>
        )}
        {result.judge.rubric_used && (
          <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-800">
            Custom rubric
          </span>
        )}
      </div>

      {result.judge_error && (
        <p
          className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-4"
          role="alert"
        >
          Judge error: {result.judge_error}
        </p>
      )}

      {metricEntries.length > 0 && (
        <dl
          className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50"
          data-testid="eval-metrics-grid"
        >
          {metricEntries.map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs text-gray-500">{METRIC_LABELS[key]}</dt>
              <dd className="text-sm font-medium text-gray-900 truncate" title={formatMetric(value)}>
                {formatMetric(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {result.failed_runs.length > 0 && (
        <div className="mb-4" data-testid="eval-failed-runs">
          <h4 className="text-xs font-medium text-gray-700 mb-1">
            Failed runs ({result.failed_runs.length})
          </h4>
          <ul className="text-xs text-red-700 space-y-0.5">
            {result.failed_runs.map((failure) => (
              <li key={failure.index}>
                Run {failure.index + 1}: {describeFailure(failure.error)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.run_ids.length > 0 && (
        <p className="text-xs text-gray-500">
          {result.run_ids.length} run{result.run_ids.length === 1 ? '' : 's'} recorded — view in
          History for full transcripts.
        </p>
      )}
    </section>
  )
}
