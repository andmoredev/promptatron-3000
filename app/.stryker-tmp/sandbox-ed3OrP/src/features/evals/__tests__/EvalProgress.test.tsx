/**
 * EvalProgress reads `evalStore` directly, so these tests just script store
 * state (mirroring `evalStore.test.ts`'s scripted log) and assert the render.
 */
// @ts-nocheck


import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import EvalProgress from '../EvalProgress'
import { INITIAL_EVAL_STATE, useEvalStore } from '../../../stores'
import type { EvalStreamEvent } from '../../../api'

/** Same shape as the determinism-with-one-failure log in evalStore.test.ts. */
const scriptedLog: EvalStreamEvent[] = [
  { type: 'eval_start', evaluation_id: 'eval-1', kind: 'determinism', n: 4 },
  { type: 'run_started', index: 0 },
  {
    type: 'run_completed',
    index: 0,
    run_id: 'run-0',
    status: 'completed',
    summary: { output_chars: 120, tool_calls: 1, duration_ms: 900 }
  },
  { type: 'run_started', index: 1 },
  {
    type: 'run_completed',
    index: 1,
    run_id: 'run-1',
    status: 'completed',
    summary: { output_chars: 118, tool_calls: 2, duration_ms: 880 }
  },
  { type: 'run_started', index: 2 },
  { type: 'run_failed', index: 2, error: { code: 'upstream_error', message: 'throttled' } }
]

const cancelEvaluation = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  cancelEvaluation.mockClear()
  useEvalStore.setState({ ...INITIAL_EVAL_STATE, cancelEvaluation })
})

describe('EvalProgress', () => {
  it('renders counts and fraction derived from a scripted event log, including a failure', () => {
    for (const event of scriptedLog) useEvalStore.getState().handleEvent(event)

    render(<EvalProgress />)

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByTestId('eval-progress-completed')).toHaveTextContent('2')
    expect(screen.getByTestId('eval-progress-failed')).toHaveTextContent('1')
    expect(screen.getByTestId('eval-progress-total')).toHaveTextContent('4')
    // (2 completed + 1 failed) / 4 = 75%
    expect(screen.getByText('75%')).toBeInTheDocument()

    const feed = screen.getByTestId('eval-event-feed')
    expect(feed).toHaveTextContent('Run 1 completed (120 chars, 1 tools, 900ms)')
    expect(feed).toHaveTextContent('Run 2 completed (118 chars, 2 tools, 880ms)')
    expect(feed).toHaveTextContent('Run 3 failed (throttled)')
  })

  it('shows a grading spinner once grading starts', () => {
    for (const event of scriptedLog) useEvalStore.getState().handleEvent(event)
    useEvalStore.getState().handleEvent({ type: 'grading_started' })

    render(<EvalProgress />)

    expect(screen.getByText('Grading')).toBeInTheDocument()
    expect(screen.getByText('Grading…')).toBeInTheDocument()
  })

  it('calls cancelEvaluation when Cancel is clicked', () => {
    for (const event of scriptedLog) useEvalStore.getState().handleEvent(event)
    render(<EvalProgress />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancelEvaluation).toHaveBeenCalledTimes(1)
  })
})
