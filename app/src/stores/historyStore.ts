/**
 * The History tab: a cursor-paginated list of past runs plus a small detail
 * cache.
 *
 * Paging follows the server's `Page<T>` envelope — `next_cursor` is opaque and
 * `null` means "no more". `loadMore` appends; anything that changes the query
 * (filters) resets the list first, because a cursor is only valid for the
 * filter set it was issued under.
 *
 * `invalidate()` is the write-side hook other stores use (see `runStore`): it
 * only marks the list stale so the History tab can refetch when it is next
 * shown, instead of firing a request behind a tab nobody is looking at.
 */

import { create } from 'zustand'
import { api } from '../api'
import type { Page, RunDetail, RunListFilters, RunSummary } from '../api'
import { isAborted, toStoreError, type StoreError } from './errors'

/** The filters the History tab exposes (a subset of `RunListFilters`). */
export interface HistoryFilters {
  model_id?: string
  scenario_id?: string
  status?: string
}

export interface HistoryStateData {
  items: RunSummary[]
  next_cursor: string | null
  filters: HistoryFilters
  loading: boolean
  error: StoreError | null
  /** True once a page has been fetched under the current filters. */
  loaded: boolean
  /** Set by `invalidate()`; consumers re-fetch and it clears on the next load. */
  stale: boolean
  /** `limit` sent with every page request. */
  pageSize: number
  /** `getRunDetail` cache, keyed by run id. */
  details: Record<string, RunDetail>
}

export interface HistoryActions {
  /** Fetch page 1 under the current filters, replacing `items`. */
  loadFirstPage(): Promise<void>
  /** Fetch the next page and append. No-op without a `next_cursor`. */
  loadMore(): Promise<void>
  /**
   * Merge `patch` into the filters, reset paging, and fetch page 1.
   * Pass `null` for a key to clear it.
   */
  setFilters(patch: Partial<Record<keyof HistoryFilters, string | null>>): Promise<void>
  /** `DELETE /runs/{id}` then drop it from `items` and the detail cache. */
  remove(runId: string): Promise<void>
  /** Mark the list stale. Cheap, synchronous, safe to call from anywhere. */
  invalidate(): void
  /** Cached `GET /runs/{id}`. `force` bypasses the cache. */
  getRunDetail(runId: string, force?: boolean): Promise<RunDetail | null>
  /** Drop everything (filters included). */
  clear(): void
}

export type HistoryStore = HistoryStateData & HistoryActions

export const HISTORY_PAGE_SIZE = 25

export const INITIAL_HISTORY_STATE: HistoryStateData = {
  items: [],
  next_cursor: null,
  filters: {},
  loading: false,
  error: null,
  loaded: false,
  stale: false,
  pageSize: HISTORY_PAGE_SIZE,
  details: {}
}

/** In-flight detail fetches, so two consumers of one run share a request. */
const detailRequests = new Map<string, Promise<RunDetail | null>>()

/** Filters + paging -> `GET /runs` query params. */
function listParams(
  filters: HistoryFilters,
  cursor: string | null,
  limit: number
): RunListFilters & { cursor?: string; limit: number } {
  const params: RunListFilters & { cursor?: string; limit: number } = { limit }
  if (filters.model_id) params.model_id = filters.model_id
  if (filters.scenario_id) params.scenario_id = filters.scenario_id
  if (filters.status) params.status = filters.status
  if (cursor) params.cursor = cursor
  return params
}

export const useHistoryStore = create<HistoryStore>()((set, get) => ({
  ...INITIAL_HISTORY_STATE,

  loadFirstPage: async () => {
    set({ loading: true, error: null })
    try {
      const page: Page<RunSummary> = await api.runs.list(
        listParams(get().filters, null, get().pageSize)
      )
      set({
        items: page.items,
        next_cursor: page.next_cursor,
        loading: false,
        loaded: true,
        stale: false
      })
    } catch (error) {
      if (isAborted(error)) {
        set({ loading: false })
        return
      }
      set({ loading: false, error: toStoreError(error) })
    }
  },

  loadMore: async () => {
    const { next_cursor, loading, filters, pageSize } = get()
    if (!next_cursor || loading) return
    set({ loading: true, error: null })
    try {
      const page: Page<RunSummary> = await api.runs.list(
        listParams(filters, next_cursor, pageSize)
      )
      set((state) => ({
        items: [...state.items, ...page.items],
        next_cursor: page.next_cursor,
        loading: false,
        loaded: true
      }))
    } catch (error) {
      if (isAborted(error)) {
        set({ loading: false })
        return
      }
      set({ loading: false, error: toStoreError(error) })
    }
  },

  setFilters: async (patch) => {
    const filters: HistoryFilters = { ...get().filters }
    for (const [key, value] of Object.entries(patch)) {
      const field = key as keyof HistoryFilters
      if (value === null || value === undefined || value === '') delete filters[field]
      else filters[field] = value
    }
    // A cursor is only valid for the filter set that issued it.
    set({ filters, items: [], next_cursor: null, loaded: false, error: null })
    await get().loadFirstPage()
  },

  remove: async (runId) => {
    try {
      await api.runs.remove(runId)
    } catch (error) {
      if (!isAborted(error)) set({ error: toStoreError(error) })
      return
    }
    set((state) => {
      const details = { ...state.details }
      delete details[runId]
      return { items: state.items.filter((item) => item.id !== runId), details }
    })
  },

  invalidate: () => set({ stale: true }),

  getRunDetail: async (runId, force = false) => {
    if (!force) {
      const cached = get().details[runId]
      if (cached) return cached
      const inFlight = detailRequests.get(runId)
      if (inFlight) return inFlight
    }

    const request = (async () => {
      try {
        const detail = await api.runs.get(runId)
        set((state) => ({ details: { ...state.details, [runId]: detail } }))
        return detail
      } catch (error) {
        if (!isAborted(error)) set({ error: toStoreError(error) })
        return null
      } finally {
        detailRequests.delete(runId)
      }
    })()

    detailRequests.set(runId, request)
    return request
  },

  clear: () => {
    detailRequests.clear()
    set({ ...INITIAL_HISTORY_STATE })
  }
}))

/** Selector: another page is available. */
export const selectHasMore = (state: HistoryStateData): boolean => state.next_cursor !== null

/** Selector: the list should be refetched (never loaded, or invalidated). */
export const selectNeedsRefresh = (state: HistoryStateData): boolean =>
  !state.loading && (!state.loaded || state.stale)

/** Selector: any filter is active. */
export const selectHasFilters = (state: HistoryStateData): boolean =>
  Object.keys(state.filters).length > 0
