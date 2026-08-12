/**
 * ToolTimeline against the three-event shape a real tool call arrives in:
 * `tool_use_start`, streamed `tool_input_delta` fragments, then `tool_result`.
 *
 * The merge itself lives in `runStore`; what is asserted here is that one call
 * renders as exactly one row that gains its result and duration in place rather
 * than appending a second entry.
 */
// @ts-nocheck


import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import ToolTimeline from '../ToolTimeline'
import { INITIAL_RUN_STATE, useRunStore } from '../../../stores'

beforeEach(() => {
  useRunStore.setState({ ...INITIAL_RUN_STATE })
})

describe('ToolTimeline', () => {
  it('says so when no tools ran', () => {
    render(<ToolTimeline />)
    expect(screen.getByText('No tools were called.')).toBeInTheDocument()
  })

  it('merges start, input fragments and result into a single row', () => {
    render(<ToolTimeline />)
    const { handleEvent } = useRunStore.getState()

    act(() => {
      handleEvent({ type: 'tool_use_start', tool_use_id: 'tu-1', name: 'flagTransaction' })
      handleEvent({ type: 'tool_input_delta', tool_use_id: 'tu-1', json: '{"txId":' })
    })

    expect(screen.getAllByTestId('tool-event')).toHaveLength(1)
    expect(screen.getByText('flagTransaction')).toBeInTheDocument()
    // Partial JSON cannot parse yet, so the raw fragment is shown as-is.
    expect(screen.getByText('{"txId":')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()

    act(() => {
      handleEvent({ type: 'tool_input_delta', tool_use_id: 'tu-1', json: '"tx-42"}' })
      handleEvent({
        type: 'tool_result',
        tool_use_id: 'tu-1',
        name: 'flagTransaction',
        input: { txId: 'tx-42' },
        output: { flagged: true },
        duration_ms: 128,
        error: null
      })
    })

    const rows = screen.getAllByTestId('tool-event')
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toHaveTextContent('flagTransaction')
    expect(row).toHaveTextContent('"txId": "tx-42"')
    expect(row).toHaveTextContent('"flagged": true')
    expect(row).toHaveTextContent('128 ms')
    expect(screen.queryByText('running')).not.toBeInTheDocument()
  })

  it('badges a failed tool call and shows its error payload', () => {
    render(<ToolTimeline />)

    act(() => {
      useRunStore.getState().handleEvent({
        type: 'tool_result',
        tool_use_id: 'tu-2',
        name: 'freezeAccount',
        input: { accountId: 'acc-9' },
        output: null,
        duration_ms: 12,
        error: { code: 'not_found', message: 'no such account' }
      })
    })

    const row = screen.getByTestId('tool-event')
    expect(row).toHaveTextContent('freezeAccount')
    expect(row).toHaveTextContent('error')
    expect(row).toHaveTextContent('"code": "not_found"')
  })

  it('counts the calls in its heading', () => {
    render(<ToolTimeline />)

    act(() => {
      const { handleEvent } = useRunStore.getState()
      handleEvent({ type: 'tool_use_start', tool_use_id: 'tu-1', name: 'listOrders' })
      handleEvent({ type: 'tool_use_start', tool_use_id: 'tu-2', name: 'slaInfo' })
    })

    expect(screen.getByRole('heading', { name: 'Tool calls (2)' })).toBeInTheDocument()
  })
})
