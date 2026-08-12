/**
 * OutputPane driven by a scripted `runStore` — the same sequence a live NDJSON
 * stream produces, applied through the real reducer via `handleEvent`.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import OutputPane from '../OutputPane'
import { INITIAL_RUN_STATE, useRunStore } from '../../../stores'

beforeEach(() => {
  useRunStore.setState({ ...INITIAL_RUN_STATE })
})

describe('OutputPane', () => {
  it('shows the idle placeholder before a run', () => {
    render(<OutputPane />)

    expect(screen.getByTestId('run-status-badge')).toHaveTextContent('Idle')
    expect(screen.getByTestId('output-text')).toHaveTextContent(
      'Run a prompt to see output here.'
    )
  })

  it('accumulates text deltas and walks the status badge to Completed', () => {
    render(<OutputPane />)
    const badge = screen.getByTestId('run-status-badge')
    const output = screen.getByTestId('output-text')

    act(() => {
      useRunStore.getState().handleEvent({
        type: 'run_start',
        run_id: 'run-1',
        ts: '2026-08-12T00:00:00Z',
        model_id: 'amazon.nova-pro-v1:0'
      })
    })
    expect(badge).toHaveTextContent('Starting')
    expect(output).toHaveTextContent('Waiting for the first token…')

    act(() => {
      useRunStore.getState().handleEvent({ type: 'text_delta', text: 'Hello' })
    })
    expect(badge).toHaveTextContent('Streaming')
    expect(output).toHaveTextContent('Hello')

    act(() => {
      useRunStore.getState().handleEvent({ type: 'text_delta', text: ', world.' })
    })
    expect(output).toHaveTextContent('Hello, world.')

    act(() => {
      useRunStore.getState().handleEvent({
        type: 'run_complete',
        run_id: 'run-1',
        status: 'completed',
        final_text: 'Hello, world.'
      })
    })
    expect(badge).toHaveTextContent('Completed')
    expect(output).toHaveTextContent('Hello, world.')
  })

  it('renders reasoning in a collapsible pane only once some arrives', () => {
    render(<OutputPane />)

    expect(screen.queryByText(/^Reasoning/)).not.toBeInTheDocument()

    act(() => {
      useRunStore.getState().handleEvent({ type: 'reasoning_delta', text: 'weighing options' })
    })

    expect(screen.getByText(/^Reasoning/)).toBeInTheDocument()
    expect(screen.getByText('weighing options')).toBeInTheDocument()
  })

  it('surfaces an in-band error with its code', () => {
    render(<OutputPane />)

    act(() => {
      useRunStore
        .getState()
        .handleEvent({
          type: 'error',
          code: 'throttled',
          message: 'Slow down.',
          retryable: true
        })
    })

    expect(screen.getByTestId('run-status-badge')).toHaveTextContent('Error')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('throttled')
    expect(alert).toHaveTextContent('Slow down.')
  })

  it('reports a cancelled run', () => {
    render(<OutputPane />)

    act(() => {
      useRunStore.getState().handleEvent({
        type: 'run_complete',
        run_id: 'run-2',
        status: 'cancelled',
        final_text: ''
      })
    })

    expect(screen.getByTestId('run-status-badge')).toHaveTextContent('Cancelled')
  })
})
