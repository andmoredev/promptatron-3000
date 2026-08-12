import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import EvalResultView from '../EvalResultView'
import type { EvaluationResult } from '../../../api'

const baseResult: EvaluationResult = {
  grade: 'B',
  score: 82,
  reasoning: 'Outputs were mostly consistent across runs.',
  judge: { model_id: 'amazon.nova-pro-v1:0', system_prompt_used: true, rubric_used: true },
  metrics: {
    runs_analyzed: 4,
    exact_match_count: 2,
    unique_outputs: 3,
    tool_sequence_consistency: 0.75,
    judge_overall_score: 82,
    judge_scores: [80, 85, 79, 84]
  },
  run_ids: ['run-0', 'run-1', 'run-2'],
  failed_runs: [{ index: 3, error: { code: 'upstream_error', message: 'throttled' } }]
}

describe('EvalResultView', () => {
  it('renders the grade, score, reasoning, judge badges, metrics grid and failed runs', () => {
    render(<EvalResultView result={baseResult} />)

    expect(screen.getByTestId('eval-grade')).toHaveTextContent('B')
    expect(screen.getByTestId('eval-score')).toHaveTextContent('82 / 100')
    expect(screen.getByTestId('eval-reasoning')).toHaveTextContent(
      'Outputs were mostly consistent across runs.'
    )
    expect(screen.getByText(/Judge: amazon\.nova-pro-v1:0/)).toBeInTheDocument()
    expect(screen.getByText('Custom prompt')).toBeInTheDocument()
    expect(screen.getByText('Custom rubric')).toBeInTheDocument()

    const grid = screen.getByTestId('eval-metrics-grid')
    expect(grid).toHaveTextContent('Runs analyzed')
    expect(grid).toHaveTextContent('4')
    expect(grid).toHaveTextContent('Exact matches')
    expect(grid).toHaveTextContent('2')
    expect(grid).toHaveTextContent('Unique outputs')
    expect(grid).toHaveTextContent('3')
    expect(grid).toHaveTextContent('Tool sequence consistency')
    expect(grid).toHaveTextContent('0.75')

    const failedRuns = screen.getByTestId('eval-failed-runs')
    expect(failedRuns).toHaveTextContent('Failed runs (1)')
    expect(failedRuns).toHaveTextContent('Run 4: throttled')

    expect(screen.getByText(/3 runs recorded/)).toBeInTheDocument()
  })

  it('colors the grade green for A and red for F, and handles a null grade/score', () => {
    const { rerender } = render(<EvalResultView result={{ ...baseResult, grade: 'A', score: 97 }} />)
    expect(screen.getByTestId('eval-grade')).toHaveClass('text-green-600')

    rerender(<EvalResultView result={{ ...baseResult, grade: 'F', score: 12 }} />)
    expect(screen.getByTestId('eval-grade')).toHaveClass('text-red-600')

    rerender(
      <EvalResultView
        result={{ ...baseResult, grade: null, score: null, failed_runs: [], run_ids: [] }}
      />
    )
    expect(screen.getByTestId('eval-grade')).toHaveTextContent('—')
    expect(screen.getByTestId('eval-score')).toHaveTextContent('—')
    expect(screen.queryByTestId('eval-failed-runs')).not.toBeInTheDocument()
  })

  it('surfaces a judge_error banner when the judge itself failed', () => {
    render(
      <EvalResultView
        result={{ ...baseResult, judge_error: 'Judge model timed out', grade: null, score: null }}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Judge model timed out')
  })
})
