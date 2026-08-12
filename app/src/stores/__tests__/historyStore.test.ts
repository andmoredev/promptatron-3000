/** historyStore: cursor paging, filter resets, invalidation, detail cache. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page, RunDetail, RunSummary } from '../../api'

const listMock = vi.fn()
const getMock = vi.fn()
const removeMock = vi.fn()

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      runs: { ...actual.api.runs, list: listMock, get: getMock, remove: removeMock }
    }
  }
})

const { ApiError, StreamAbortedError } = await import('../../api')
const {
  useHistoryStore,
  selectHasMore,
  selectNeedsRefresh,
  selectHasFilters,
  listParams,
  INITIAL_HISTORY_STATE
} = await import('../historyStore')

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

function page(items: RunSummary[], next_cursor: string | null): Page<RunSummary> {
  return { items, next_cursor }
}

beforeEach(() => {
  listMock.mockReset()
  getMock.mockReset()
  removeMock.mockReset()
  useHistoryStore.getState().clear()
})

describe('paging', () => {
  it('loadFirstPage replaces items and records the cursor', async () => {
    listMock.mockResolvedValueOnce(page([summary('r1'), summary('r2')], 'cursor-1'))

    await useHistoryStore.getState().loadFirstPage()

    expect(listMock).toHaveBeenCalledWith({ limit: 25 })
    const state = useHistoryStore.getState()
    expect(state.items.map((item) => item.id)).toEqual(['r1', 'r2'])
    expect(state.next_cursor).toBe('cursor-1')
    expect(state.loading).toBe(false)
    expect(state.loaded).toBe(true)
    expect(selectHasMore(state)).toBe(true)
  })

  it('loadMore appends the second page and clears the cursor at the end', async () => {
    listMock
      .mockResolvedValueOnce(page([summary('r1'), summary('r2')], 'cursor-1'))
      .mockResolvedValueOnce(page([summary('r3')], null))

    await useHistoryStore.getState().loadFirstPage()
    await useHistoryStore.getState().loadMore()

    expect(listMock).toHaveBeenCalledTimes(2)
    expect(listMock).toHaveBeenLastCalledWith({ limit: 25, cursor: 'cursor-1' })

    const state = useHistoryStore.getState()
    expect(state.items.map((item) => item.id)).toEqual(['r1', 'r2', 'r3'])
    expect(state.next_cursor).toBeNull()
    expect(selectHasMore(state)).toBe(false)
  })

  it('loadMore is a no-op without a cursor', async () => {
    listMock.mockResolvedValueOnce(page([summary('r1')], null))
    await useHistoryStore.getState().loadFirstPage()
    await useHistoryStore.getState().loadMore()
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('records an ApiError as {code, message} and stops loading', async () => {
    listMock.mockRejectedValueOnce(
      new ApiError('database is locked', { code: 'internal_error', status: 500 })
    )

    await useHistoryStore.getState().loadFirstPage()

    const state = useHistoryStore.getState()
    expect(state.error).toEqual({ code: 'internal_error', message: 'database is locked' })
    expect(state.loading).toBe(false)
    expect(state.items).toEqual([])
  })

  it('loadFirstPage tolerates an abort, clearing loading without recording an error', async () => {
    listMock.mockRejectedValueOnce(new StreamAbortedError())

    await useHistoryStore.getState().loadFirstPage()

    const state = useHistoryStore.getState()
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.loaded).toBe(false)
  })

  it('loadMore records a real failure and tolerates an abort without recording an error', async () => {
    listMock.mockResolvedValueOnce(page([summary('r1')], 'cursor-1'))
    await useHistoryStore.getState().loadFirstPage()

    listMock.mockRejectedValueOnce(new ApiError('boom', { code: 'internal_error' }))
    await useHistoryStore.getState().loadMore()
    expect(useHistoryStore.getState().error).toEqual({ code: 'internal_error', message: 'boom' })
    expect(useHistoryStore.getState().loading).toBe(false)

    // Still has a cursor (loadMore's failure didn't consume it), so a retry
    // can go through the abort branch instead.
    useHistoryStore.setState({ error: null })
    listMock.mockRejectedValueOnce(new StreamAbortedError())
    await useHistoryStore.getState().loadMore()
    expect(useHistoryStore.getState().error).toBeNull()
    expect(useHistoryStore.getState().loading).toBe(false)
  })
})

describe('filters', () => {
  it('setFilters resets paging and refetches with the new query', async () => {
    listMock
      .mockResolvedValueOnce(page([summary('r1'), summary('r2')], 'cursor-1'))
      .mockResolvedValueOnce(page([summary('r9', { status: 'error' })], null))

    await useHistoryStore.getState().loadFirstPage()
    expect(useHistoryStore.getState().next_cursor).toBe('cursor-1')

    await useHistoryStore.getState().setFilters({ status: 'error' })

    expect(listMock).toHaveBeenLastCalledWith({ limit: 25, status: 'error' })
    const state = useHistoryStore.getState()
    expect(state.filters).toEqual({ status: 'error' })
    expect(state.items.map((item) => item.id)).toEqual(['r9'])
    // the old cursor was dropped, not carried into the new query
    expect(state.next_cursor).toBeNull()
    expect(selectHasFilters(state)).toBe(true)
  })

  it('merges filter patches and clears a key set to null', async () => {
    listMock.mockResolvedValue(page([], null))

    await useHistoryStore.getState().setFilters({ model_id: 'm1' })
    await useHistoryStore.getState().setFilters({ scenario_id: 'shipping' })
    expect(useHistoryStore.getState().filters).toEqual({
      model_id: 'm1',
      scenario_id: 'shipping'
    })

    await useHistoryStore.getState().setFilters({ model_id: null })
    expect(useHistoryStore.getState().filters).toEqual({ scenario_id: 'shipping' })
    expect(listMock).toHaveBeenLastCalledWith({ limit: 25, scenario_id: 'shipping' })
  })

  it('listParams omits each filter field individually when falsy, and includes it when set', () => {
    expect(listParams({}, null, 25)).toEqual({ limit: 25 })
    expect(listParams({ model_id: '' }, null, 25)).toEqual({ limit: 25 })
    expect(listParams({ scenario_id: '' }, null, 25)).toEqual({ limit: 25 })
    expect(listParams({ status: '' }, null, 25)).toEqual({ limit: 25 })
    expect(listParams({ model_id: 'nova' }, null, 25)).toEqual({ limit: 25, model_id: 'nova' })
    expect(listParams({ scenario_id: 's1' }, null, 25)).toEqual({ limit: 25, scenario_id: 's1' })
    expect(listParams({ status: 'completed' }, null, 25)).toEqual({
      limit: 25,
      status: 'completed'
    })
    expect(listParams({}, 'cursor-1', 25)).toEqual({ limit: 25, cursor: 'cursor-1' })
    expect(listParams({}, null, 25)).not.toHaveProperty('cursor')
  })

  it('setFilters clears a key set to undefined or to an empty string, same as null', async () => {
    listMock.mockResolvedValue(page([], null))

    await useHistoryStore.getState().setFilters({ model_id: 'm1', scenario_id: 's1', status: 'error' })
    await useHistoryStore.getState().setFilters({ model_id: undefined })
    expect(useHistoryStore.getState().filters).toEqual({ scenario_id: 's1', status: 'error' })

    await useHistoryStore.getState().setFilters({ scenario_id: '' })
    expect(useHistoryStore.getState().filters).toEqual({ status: 'error' })
  })

  it('carries filters into loadMore', async () => {
    listMock
      .mockResolvedValueOnce(page([summary('r1')], 'cursor-1'))
      .mockResolvedValueOnce(page([summary('r2')], null))

    await useHistoryStore.getState().setFilters({ model_id: 'm1' })
    await useHistoryStore.getState().loadMore()

    expect(listMock).toHaveBeenLastCalledWith({ limit: 25, model_id: 'm1', cursor: 'cursor-1' })
  })
})

describe('invalidate', () => {
  it('marks the list stale without fetching, and the next load clears it', async () => {
    listMock.mockResolvedValue(page([summary('r1')], null))
    await useHistoryStore.getState().loadFirstPage()
    expect(selectNeedsRefresh(useHistoryStore.getState())).toBe(false)

    useHistoryStore.getState().invalidate()
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(useHistoryStore.getState().stale).toBe(true)
    expect(selectNeedsRefresh(useHistoryStore.getState())).toBe(true)

    await useHistoryStore.getState().loadFirstPage()
    expect(useHistoryStore.getState().stale).toBe(false)
  })

  it('reports a never-loaded list as needing a refresh', () => {
    expect(selectNeedsRefresh(INITIAL_HISTORY_STATE)).toBe(true)
  })

  it('selectHasFilters is false for an empty filter set and true once any key is present', () => {
    expect(selectHasFilters({ ...INITIAL_HISTORY_STATE, filters: {} })).toBe(false)
    expect(selectHasFilters({ ...INITIAL_HISTORY_STATE, filters: { model_id: 'm' } })).toBe(true)
  })
})

describe('in-flight loading state', () => {
  it('loadFirstPage sets loading:true (clearing a stale error) synchronously, before the request resolves', async () => {
    useHistoryStore.setState({ error: { code: 'stale', message: 'stale' } })
    let resolveList!: (p: ReturnType<typeof page>) => void
    listMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveList = resolve })
    )

    const pending = useHistoryStore.getState().loadFirstPage()
    expect(useHistoryStore.getState().loading).toBe(true)
    expect(useHistoryStore.getState().error).toBeNull()

    resolveList(page([], null))
    await pending
    expect(useHistoryStore.getState().loading).toBe(false)
    expect(useHistoryStore.getState().loaded).toBe(true)
  })

  it('loadMore sets loading:true synchronously, before the request resolves', async () => {
    listMock.mockResolvedValueOnce(page([summary('r1')], 'cursor-1'))
    await useHistoryStore.getState().loadFirstPage()

    let resolveList!: (p: ReturnType<typeof page>) => void
    listMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveList = resolve })
    )
    const pending = useHistoryStore.getState().loadMore()
    expect(useHistoryStore.getState().loading).toBe(true)

    resolveList(page([summary('r2')], null))
    await pending
    expect(useHistoryStore.getState().loading).toBe(false)
  })
})

describe('detail cache and removal', () => {
  const detail = { id: 'r1', status: 'completed' } as unknown as RunDetail

  it('getRunDetail fetches once and serves the cache afterwards', async () => {
    getMock.mockResolvedValue(detail)

    const first = await useHistoryStore.getState().getRunDetail('r1')
    const second = await useHistoryStore.getState().getRunDetail('r1')

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(first).toBe(detail)
    expect(second).toBe(detail)
    expect(useHistoryStore.getState().details.r1).toBe(detail)
  })

  it('shares one request between concurrent callers', async () => {
    getMock.mockResolvedValue(detail)

    const [a, b] = await Promise.all([
      useHistoryStore.getState().getRunDetail('r1'),
      useHistoryStore.getState().getRunDetail('r1')
    ])

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(detail)
    expect(b).toBe(detail)
  })

  it('force refetches', async () => {
    getMock.mockResolvedValue(detail)
    await useHistoryStore.getState().getRunDetail('r1')
    await useHistoryStore.getState().getRunDetail('r1', true)
    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('records a non-aborted getRunDetail failure and returns null, without caching', async () => {
    getMock.mockRejectedValueOnce(new ApiError('gone', { code: 'not_found', status: 404 }))

    const result = await useHistoryStore.getState().getRunDetail('missing')

    expect(result).toBeNull()
    expect(useHistoryStore.getState().error).toEqual({ code: 'not_found', message: 'gone' })
    expect(useHistoryStore.getState().details.missing).toBeUndefined()
  })

  it('retries the API on a later call after a failed fetch, rather than replaying the stale in-flight request', async () => {
    getMock.mockRejectedValueOnce(new ApiError('server exploded', { code: 'http_error' }))
    const first = await useHistoryStore.getState().getRunDetail('r9')
    expect(first).toBeNull()

    getMock.mockResolvedValueOnce(detail)
    const second = await useHistoryStore.getState().getRunDetail('r9')

    expect(getMock).toHaveBeenCalledTimes(2)
    expect(second).toBe(detail)
  })

  it('swallows an aborted getRunDetail without recording an error', async () => {
    getMock.mockRejectedValueOnce(new StreamAbortedError())

    const result = await useHistoryStore.getState().getRunDetail('r1')

    expect(result).toBeNull()
    expect(useHistoryStore.getState().error).toBeNull()
  })

  it('remove() drops the row and its cached detail', async () => {
    listMock.mockResolvedValueOnce(page([summary('r1'), summary('r2')], null))
    getMock.mockResolvedValue(detail)
    removeMock.mockResolvedValue(undefined)

    await useHistoryStore.getState().loadFirstPage()
    await useHistoryStore.getState().getRunDetail('r1')
    await useHistoryStore.getState().remove('r1')

    expect(removeMock).toHaveBeenCalledWith('r1')
    const state = useHistoryStore.getState()
    expect(state.items.map((item) => item.id)).toEqual(['r2'])
    expect(state.details.r1).toBeUndefined()
  })

  it('keeps the row when the delete fails', async () => {
    listMock.mockResolvedValueOnce(page([summary('r1')], null))
    removeMock.mockRejectedValueOnce(new ApiError('gone', { code: 'not_found', status: 404 }))

    await useHistoryStore.getState().loadFirstPage()
    await useHistoryStore.getState().remove('r1')

    const state = useHistoryStore.getState()
    expect(state.items.map((item) => item.id)).toEqual(['r1'])
    expect(state.error).toEqual({ code: 'not_found', message: 'gone' })
  })
})
