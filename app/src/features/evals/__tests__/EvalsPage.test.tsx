/**
 * EvalsPage: past-evaluations list rendering and the row Cancel action.
 * `DeterminismLauncher` renders inside the page too, so its dependent stores
 * are given enough state to mount without crashing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import EvalsPage from '../EvalsPage'
import {
  DEFAULT_RUN_CONFIG,
  DEFAULT_SETTINGS,
  INITIAL_EVAL_STATE,
  useEvalStore,
  useRunConfigStore,
  useScenarioStore,
  useSettingsStore
} from '../../../stores'
import type { EvaluationDetail } from '../../../api'

const loadEvaluations = vi.fn().mockResolvedValue(undefined)
const loadMoreEvaluations = vi.fn().mockResolvedValue(undefined)
const refreshEvaluation = vi.fn().mockResolvedValue(undefined)
const followEvaluation = vi.fn().mockResolvedValue(undefined)
const cancelEvaluation = vi.fn().mockResolvedValue(undefined)

const rows: EvaluationDetail[] = [
  {
    id: 'eval-completed',
    ts: '2026-08-10T12:00:00Z',
    kind: 'determinism',
    status: 'completed',
    config: {
      kind: 'determinism',
      n: 4,
      run_config: { model_id: 'm', user_prompt: 'p' },
      rubric: null,
      grader: { model_id: 'amazon.nova-pro-v1:0', system_prompt: null }
    },
    run_ids: ['run-0', 'run-1'],
    result: {
      grade: 'A',
      score: 95,
      reasoning: 'Very consistent.',
      judge: { model_id: 'amazon.nova-pro-v1:0', system_prompt_used: false, rubric_used: false },
      metrics: { runs_analyzed: 4 },
      run_ids: ['run-0', 'run-1'],
      failed_runs: []
    },
    progress: null,
    error: null
  },
  {
    id: 'eval-running',
    ts: '2026-08-12T09:00:00Z',
    kind: 'determinism',
    status: 'running',
    config: {
      kind: 'determinism',
      n: 6,
      run_config: { model_id: 'm', user_prompt: 'p' },
      rubric: null,
      grader: { model_id: 'amazon.nova-pro-v1:0', system_prompt: null }
    },
    run_ids: [],
    result: null,
    progress: null,
    error: null
  }
]

beforeEach(() => {
  loadEvaluations.mockClear()
  loadMoreEvaluations.mockClear()
  refreshEvaluation.mockClear()
  followEvaluation.mockClear()
  cancelEvaluation.mockClear()

  useEvalStore.setState({
    ...INITIAL_EVAL_STATE,
    evaluations: rows,
    nextCursor: null,
    listLoaded: true,
    loadEvaluations,
    loadMoreEvaluations,
    refreshEvaluation,
    followEvaluation,
    cancelEvaluation
  })
  useRunConfigStore.setState({ ...DEFAULT_RUN_CONFIG })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS })
  useScenarioStore.setState({
    models: [],
    modelsLoaded: true,
    scenarios: [],
    scenariosLoaded: true,
    loadModels: vi.fn().mockResolvedValue(undefined),
    loadScenarios: vi.fn().mockResolvedValue(undefined)
  })
})

describe('EvalsPage', () => {
  it('loads evaluations on mount', () => {
    render(<EvalsPage />)
    expect(loadEvaluations).toHaveBeenCalledTimes(1)
  })

  it('renders each past evaluation with kind, status badge, timestamp and grade/score', () => {
    render(<EvalsPage />)

    const completedRow = screen.getByTestId('eval-row-eval-completed')
    expect(within(completedRow).getByText('determinism')).toBeInTheDocument()
    expect(within(completedRow).getByText('Completed')).toBeInTheDocument()
    expect(within(completedRow).getByText('A')).toBeInTheDocument()
    expect(within(completedRow).getByText('95/100')).toBeInTheDocument()

    const runningRow = screen.getByTestId('eval-row-eval-running')
    expect(within(runningRow).getByText('Running')).toBeInTheDocument()
    // No result yet, so no grade/score badge for the running row.
    expect(within(runningRow).queryByText(/\/100/)).not.toBeInTheDocument()
  })

  it('shows a Cancel button only on cancellable (pending/running) rows', () => {
    render(<EvalsPage />)

    const completedRow = screen.getByTestId('eval-row-eval-completed')
    const runningRow = screen.getByTestId('eval-row-eval-running')

    expect(within(completedRow).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(within(runningRow).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('cancelling a running row that is not already followed attaches then cancels', async () => {
    render(<EvalsPage />)

    const runningRow = screen.getByTestId('eval-row-eval-running')
    fireEvent.click(within(runningRow).getByRole('button', { name: 'Cancel' }))

    expect(followEvaluation).toHaveBeenCalledWith('eval-running')
    expect(cancelEvaluation).toHaveBeenCalledTimes(1)
  })

  it('cancelling the already-followed evaluation does not re-attach', () => {
    useEvalStore.setState({ activeEvaluationId: 'eval-running', status: 'running' })
    render(<EvalsPage />)

    const runningRow = screen.getByTestId('eval-row-eval-running')
    fireEvent.click(within(runningRow).getByRole('button', { name: 'Cancel' }))

    expect(followEvaluation).not.toHaveBeenCalled()
    expect(cancelEvaluation).toHaveBeenCalledTimes(1)
  })

  it('selecting a finished row shows its stored result without following', () => {
    render(<EvalsPage />)

    fireEvent.click(screen.getByTestId('eval-row-eval-completed'))

    expect(followEvaluation).not.toHaveBeenCalled()
    expect(screen.getByTestId('eval-result')).toBeInTheDocument()
    expect(screen.getByTestId('eval-grade')).toHaveTextContent('A')
  })

  it('selecting a running row follows it and shows live progress', () => {
    render(<EvalsPage />)

    fireEvent.click(screen.getByTestId('eval-row-eval-running'))

    expect(followEvaluation).toHaveBeenCalledWith('eval-running')
  })
})
