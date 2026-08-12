/**
 * RunDetailView against a directly-stubbed `historyStore` — the detail cache
 * and `getRunDetail` are the store's job (covered in
 * `stores/__tests__/historyStore.test.ts`); what's asserted here is that a
 * cached `RunDetail` renders every section, and that `highlight` rings the
 * fields `CompareView` flags as differing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RunDetailView from '../RunDetailView'
import { INITIAL_HISTORY_STATE, useHistoryStore } from '../../../stores'
import type { RunDetail } from '../../../api'

const getRunDetail = vi.fn().mockResolvedValue(null)

function detail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: 'r1',
    ts: '2026-08-11T18:00:00Z',
    model_id: 'anthropic.claude-3-sonnet',
    scenario_id: 'shipping',
    system_prompt: 'You are helpful.',
    user_prompt: 'Summarize this.',
    dataset_id: null,
    dataset_hash: null,
    config: {
      inference: {},
      tools_enabled: true,
      max_tool_iterations: 10,
      guardrail: null,
      stream: false
    },
    output: 'Here is the summary.',
    tool_transcript: [
      {
        tool_use_id: 'tu-1',
        name: 'lookupOrder',
        input: { orderId: '42' },
        output: { status: 'shipped' },
        duration_ms: 120,
        error: null
      }
    ],
    metrics: { input_tokens: 10, output_tokens: 20, total_tokens: 30, latency_ms: 500, cycle_count: 2 },
    guardrail_trace: { action: 'NONE' },
    status: 'completed',
    error: null,
    ...overrides
  }
}

beforeEach(() => {
  getRunDetail.mockClear()
  useHistoryStore.setState({ ...INITIAL_HISTORY_STATE, getRunDetail })
})

describe('RunDetailView', () => {
  it('shows a loading state and fetches the detail when it is not cached', () => {
    render(<RunDetailView runId="r1" />)

    expect(screen.getByText('Loading run…')).toBeInTheDocument()
    expect(getRunDetail).toHaveBeenCalledWith('r1')
  })

  it('renders prompts, output, tool transcript and metrics once cached', () => {
    useHistoryStore.setState({ details: { r1: detail() } })
    render(<RunDetailView runId="r1" />)

    expect(screen.getByTestId('run-detail-status-badge')).toHaveTextContent('completed')
    expect(screen.getByTestId('run-detail-model-id')).toHaveTextContent('anthropic.claude-3-sonnet')
    expect(screen.getByText('You are helpful.')).toBeInTheDocument()
    expect(screen.getByText('Summarize this.')).toBeInTheDocument()
    expect(screen.getByTestId('run-detail-output')).toHaveTextContent('Here is the summary.')

    expect(screen.getByText('lookupOrder')).toBeInTheDocument()
    expect(screen.getByTestId('run-detail-tool-row')).toHaveTextContent('120 ms')

    const totalTokensCard = screen.getByText('Total tokens').closest('[data-testid="run-detail-metric"]')
    expect(totalTokensCard).toHaveTextContent('30')
  })

  it('shows an error payload when the run failed', () => {
    useHistoryStore.setState({
      details: { r1: detail({ status: 'error', error: { code: 'timeout', message: 'took too long' } }) }
    })
    render(<RunDetailView runId="r1" />)

    expect(screen.getByTestId('run-detail-error')).toHaveTextContent('timeout')
    expect(screen.getByTestId('run-detail-status-badge')).toHaveTextContent('error')
  })

  it('renders the guardrail trace collapsibly when present, and omits it otherwise', () => {
    useHistoryStore.setState({ details: { r1: detail() } })
    const { rerender } = render(<RunDetailView runId="r1" />)

    expect(screen.getByText('Guardrail trace')).toBeInTheDocument()
    expect(screen.getByTestId('run-detail-guardrail-trace')).toHaveTextContent('NONE')

    useHistoryStore.setState({ details: { r1: detail({ guardrail_trace: null }) } })
    rerender(<RunDetailView runId="r1" />)
    expect(screen.queryByText('Guardrail trace')).not.toBeInTheDocument()
  })

  it('says so when no tools were called', () => {
    useHistoryStore.setState({ details: { r1: detail({ tool_transcript: [] }) } })
    render(<RunDetailView runId="r1" />)

    expect(screen.getByText('No tools were called.')).toBeInTheDocument()
  })

  it('rings the fields a diff highlight flags', () => {
    useHistoryStore.setState({ details: { r1: detail() } })
    render(
      <RunDetailView
        runId="r1"
        highlight={{ model_id: true, status: true, metrics: { total_tokens: true } }}
      />
    )

    expect(screen.getByTestId('run-detail-model-id')).toHaveAttribute('data-highlighted', 'true')
    expect(screen.getByTestId('run-detail-status-badge')).toHaveAttribute('data-highlighted', 'true')
    const totalTokensCard = screen.getByText('Total tokens').closest('[data-testid="run-detail-metric"]')
    expect(totalTokensCard).toHaveAttribute('data-highlighted', 'true')
  })
})
