/**
 * HistoryPage against a directly-stubbed `historyStore`/`scenarioStore` —
 * paging, filter merging and the detail cache are the stores' job (see
 * `stores/__tests__/historyStore.test.ts`); what's asserted here is the wiring:
 * the list renders store state, controls call the right actions, and the
 * detail/compare panels track row selection correctly.
 *
 * `api.runs.exportAll` is mocked directly (the NDJSON export button bypasses
 * the store and calls the API client itself).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { RunDetail, RunSummary } from '../../../api'

const exportAllMock = vi.fn()

vi.mock('../../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api')>()
  return {
    ...actual,
    api: { ...actual.api, runs: { ...actual.api.runs, exportAll: exportAllMock } }
  }
})

const HistoryPage = (await import('../HistoryPage')).default
const {
  INITIAL_HISTORY_STATE,
  INITIAL_SCENARIO_STATE,
  useHistoryStore,
  useScenarioStore
} = await import('../../../stores')

function summary(id: string, overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id,
    ts: '2026-08-11T18:00:00Z',
    model_id: 'anthropic.claude-3-sonnet',
    scenario_id: 'shipping',
    dataset_id: null,
    status: 'completed',
    metrics: { total_tokens: 100 },
    ...overrides
  }
}

function detail(id: string, overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id,
    ts: '2026-08-11T18:00:00Z',
    model_id: 'anthropic.claude-3-sonnet',
    scenario_id: 'shipping',
    system_prompt: '',
    user_prompt: 'hi',
    dataset_id: null,
    dataset_hash: null,
    config: { inference: {}, tools_enabled: false, max_tool_iterations: 10, guardrail: null, stream: false },
    output: 'the output',
    tool_transcript: [],
    metrics: { total_tokens: 100, input_tokens: 40, output_tokens: 60, latency_ms: 200, cycle_count: 1 },
    guardrail_trace: null,
    status: 'completed',
    error: null,
    ...overrides
  }
}

const setFilters = vi.fn().mockResolvedValue(undefined)
const loadFirstPage = vi.fn().mockResolvedValue(undefined)
const loadMore = vi.fn().mockResolvedValue(undefined)
const remove = vi.fn().mockResolvedValue(undefined)
const getRunDetail = vi.fn().mockResolvedValue(null)

beforeEach(() => {
  exportAllMock.mockReset()
  setFilters.mockClear()
  loadFirstPage.mockClear()
  loadMore.mockClear()
  remove.mockClear()
  getRunDetail.mockClear()

  useHistoryStore.setState({
    ...INITIAL_HISTORY_STATE,
    items: [
      summary('r1'),
      summary('r2', { status: 'error', model_id: 'amazon.nova-pro-v1:0', metrics: { total_tokens: 250 } })
    ],
    details: { r1: detail('r1'), r2: detail('r2', { status: 'error', model_id: 'amazon.nova-pro-v1:0' }) },
    loaded: true,
    setFilters,
    loadFirstPage,
    loadMore,
    remove,
    getRunDetail
  })

  useScenarioStore.setState({
    ...INITIAL_SCENARIO_STATE,
    models: [],
    modelsLoaded: false,
    scenarios: [
      { id: 'shipping', name: 'Shipping', description: null, createdAt: '', updatedAt: '' }
    ],
    scenariosLoaded: true,
    loadModels: vi.fn().mockResolvedValue(undefined),
    loadScenarios: vi.fn().mockResolvedValue(undefined)
  })
})

describe('HistoryPage: list rendering', () => {
  it('renders one row per item from the store', () => {
    render(<HistoryPage />)

    const rows = screen.getAllByTestId('history-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('anthropic.claude-3-sonnet')
    expect(rows[0]).toHaveTextContent('completed')
    expect(rows[0]).toHaveTextContent('100')
    expect(rows[1]).toHaveTextContent('amazon.nova-pro-v1:0')
    expect(rows[1]).toHaveTextContent('error')
    expect(rows[1]).toHaveTextContent('250')
  })

  it('shows the empty state when loaded with no matches', () => {
    useHistoryStore.setState({ items: [] })
    render(<HistoryPage />)
    expect(screen.getByTestId('history-empty')).toBeInTheDocument()
  })

  it('loads the first page on mount when the store needs a refresh', () => {
    useHistoryStore.setState({ loaded: false, items: [] })
    render(<HistoryPage />)
    expect(loadFirstPage).toHaveBeenCalled()
  })

  it('does not auto-load again once already loaded', () => {
    render(<HistoryPage />)
    expect(loadFirstPage).not.toHaveBeenCalled()
  })

  it('the refresh button calls loadFirstPage', () => {
    render(<HistoryPage />)
    fireEvent.click(screen.getByTestId('history-refresh-btn'))
    expect(loadFirstPage).toHaveBeenCalledTimes(1)
  })
})

describe('HistoryPage: filters', () => {
  it('a free-text model filter calls setFilters when models are not loaded', () => {
    render(<HistoryPage />)

    const modelFilter = screen.getByTestId('history-filter-model')
    expect(modelFilter.tagName).toBe('INPUT')
    fireEvent.change(modelFilter, { target: { value: 'nova' } })
    expect(setFilters).toHaveBeenCalledWith({ model_id: 'nova' })
  })

  it('renders a model select once the catalog is loaded, wired to setFilters', () => {
    useScenarioStore.setState({
      modelsLoaded: true,
      models: [
        { model_id: 'm1', name: 'Model One', provider: 'Amazon', supports_streaming: true, kind: 'foundation-model' }
      ]
    })
    render(<HistoryPage />)

    const modelFilter = screen.getByTestId('history-filter-model')
    expect(modelFilter.tagName).toBe('SELECT')
    fireEvent.change(modelFilter, { target: { value: 'm1' } })
    expect(setFilters).toHaveBeenCalledWith({ model_id: 'm1' })
  })

  it('the scenario filter calls setFilters', () => {
    render(<HistoryPage />)
    fireEvent.change(screen.getByTestId('history-filter-scenario'), { target: { value: 'shipping' } })
    expect(setFilters).toHaveBeenCalledWith({ scenario_id: 'shipping' })
  })

  it('the status filter calls setFilters, and clearing it sends null', () => {
    render(<HistoryPage />)
    fireEvent.change(screen.getByTestId('history-filter-status'), { target: { value: 'error' } })
    expect(setFilters).toHaveBeenLastCalledWith({ status: 'error' })

    fireEvent.change(screen.getByTestId('history-filter-status'), { target: { value: '' } })
    expect(setFilters).toHaveBeenLastCalledWith({ status: null })
  })
})

describe('HistoryPage: paging', () => {
  it('hides Load more without a next_cursor', () => {
    render(<HistoryPage />)
    expect(screen.queryByTestId('history-load-more-btn')).not.toBeInTheDocument()
  })

  it('shows Load more with a next_cursor and calls loadMore', () => {
    useHistoryStore.setState({ next_cursor: 'cursor-1' })
    render(<HistoryPage />)

    const button = screen.getByTestId('history-load-more-btn')
    fireEvent.click(button)
    expect(loadMore).toHaveBeenCalledTimes(1)
  })
})

describe('HistoryPage: delete', () => {
  it('asks for confirmation, then calls remove on confirm', () => {
    render(<HistoryPage />)
    const row = screen.getAllByTestId('history-row')[0]

    fireEvent.click(within(row).getByTestId('history-delete-btn'))
    expect(within(row).getByTestId('history-delete-confirm')).toBeInTheDocument()

    fireEvent.click(within(row).getByTestId('history-delete-confirm'))
    expect(remove).toHaveBeenCalledWith('r1')
  })

  it('cancel backs out without calling remove', () => {
    render(<HistoryPage />)
    const row = screen.getAllByTestId('history-row')[0]

    fireEvent.click(within(row).getByTestId('history-delete-btn'))
    fireEvent.click(within(row).getByTestId('history-delete-cancel'))

    expect(screen.queryByTestId('history-delete-confirm')).not.toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('HistoryPage: row click detail panel', () => {
  it('opens the detail view for the clicked run, and closes it on a second click', () => {
    render(<HistoryPage />)
    const rows = screen.getAllByTestId('history-row')

    expect(screen.queryByTestId('run-detail-view')).not.toBeInTheDocument()

    fireEvent.click(rows[0])
    expect(screen.getByTestId('run-detail-view')).toHaveAttribute('data-run-id', 'r1')

    fireEvent.click(rows[0])
    expect(screen.queryByTestId('run-detail-view')).not.toBeInTheDocument()
  })
})

describe('HistoryPage: compare', () => {
  it('enables compare only once exactly two rows are checked, and renders both details', () => {
    render(<HistoryPage />)

    expect(screen.queryByTestId('compare-view')).not.toBeInTheDocument()

    const checkboxes = screen.getAllByTestId('history-compare-checkbox')
    fireEvent.click(checkboxes[0])
    expect(screen.queryByTestId('compare-view')).not.toBeInTheDocument()

    fireEvent.click(checkboxes[1])

    const compareView = screen.getByTestId('compare-view')
    const runDetails = within(compareView).getAllByTestId('run-detail-view')
    expect(runDetails.map((el) => el.getAttribute('data-run-id'))).toEqual(['r1', 'r2'])

    // model_id and status differ between r1 and r2, so both sides ring them.
    const modelIds = within(compareView).getAllByTestId('run-detail-model-id')
    expect(modelIds[0]).toHaveAttribute('data-highlighted', 'true')
    expect(modelIds[1]).toHaveAttribute('data-highlighted', 'true')
    const statuses = within(compareView).getAllByTestId('run-detail-status-badge')
    expect(statuses[0]).toHaveAttribute('data-highlighted', 'true')
    expect(statuses[1]).toHaveAttribute('data-highlighted', 'true')
  })

  it('closing compare returns to no panel', () => {
    render(<HistoryPage />)
    const checkboxes = screen.getAllByTestId('history-compare-checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])

    fireEvent.click(screen.getByTestId('compare-close-btn'))
    expect(screen.queryByTestId('compare-view')).not.toBeInTheDocument()
  })
})

describe('HistoryPage: NDJSON export', () => {
  it('accumulates the exported stream into a Blob and triggers a download', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    window.URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    window.URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    exportAllMock.mockImplementation(async (_filters: unknown, options: { onEvent: (run: RunDetail) => void }) => {
      options.onEvent(detail('r1'))
      options.onEvent(detail('r2'))
    })

    render(<HistoryPage />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('history-export-btn'))
    })

    expect(exportAllMock).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/x-ndjson')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    clickSpy.mockRestore()
  })

  it('surfaces an export failure instead of throwing', async () => {
    exportAllMock.mockRejectedValueOnce(new Error('network down'))

    render(<HistoryPage />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('history-export-btn'))
    })

    expect(screen.getByText('network down')).toBeInTheDocument()
  })
})
