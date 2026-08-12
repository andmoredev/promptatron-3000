/**
 * The Evals tab: the evaluation list plus one "active" evaluation being
 * followed.
 *
 * An evaluation is a background job. `POST /evaluations` returns 202 with a
 * `pending` row and the work then runs server-side; progress arrives on
 * `GET /evaluations/{id}/events` as NDJSON. That log is *retained*, so
 * attaching late replays it from the beginning — which is why `followEvaluation`
 * clears the local log before subscribing and why progress is recomputed from
 * the log rather than incremented blindly.
 *
 * `progress` is kept as a state field (not a derived selector) on purpose: a
 * zustand v5 selector that builds a fresh object on every call breaks
 * `useSyncExternalStore`'s snapshot identity check. Components read
 * `state.progress` and get a stable reference between events.
 *
 * Cross-store coupling: a `determinism` evaluation executes real runs, so on
 * `eval_complete` we call `useHistoryStore.getState().invalidate()`.
 */

import { create } from 'zustand'
import { api } from '../api'
import type {
  EvalStreamEvent,
  EvaluationDetail,
  EvaluationListParams,
  EvaluationRequest,
  EvaluationResult,
  Page
} from '../api'
import { isAborted, toStoreError, type StoreError } from './errors'
import { useHistoryStore } from './historyStore'

/** Client-side lifecycle of the followed evaluation. */
export type EvalPhase =
  | 'idle'
  | 'starting'
  | 'running'
  | 'grading'
  | 'completed'
  | 'error'
  | 'cancelled'

/** Run counters for the progress bar. `total` is the planned run count. */
export interface EvalProgress {
  completed: number
  failed: number
  total: number
}

export const EMPTY_PROGRESS: EvalProgress = { completed: 0, failed: 0, total: 0 }

export interface EvalStateData {
  /* --- active evaluation --------------------------------------------------- */
  activeEvaluationId: string | null
  /** The row as last fetched (`create`/`get`); the stream is the live view. */
  activeEvaluation: EvaluationDetail | null
  status: EvalPhase
  /** The replayed/live event log, in order. */
  events: EvalStreamEvent[]
  progress: EvalProgress
  result: EvaluationResult | null
  error: StoreError | null

  /* --- list ---------------------------------------------------------------- */
  evaluations: EvaluationDetail[]
  nextCursor: string | null
  listLoading: boolean
  listError: StoreError | null
  listLoaded: boolean
}

export interface EvalActions {
  /** `POST /evaluations`, then follow its event stream. Never throws. */
  startEvaluation(request: EvaluationRequest): Promise<string | null>
  /** Attach to a running *or finished* evaluation (the log replays). */
  followEvaluation(evaluationId: string): Promise<void>
  /** `DELETE /evaluations/{id}` and detach. A finished eval is a no-op. */
  cancelEvaluation(): Promise<void>
  /** Apply one event. Safe to call from outside React. */
  handleEvent(event: EvalStreamEvent): void
  /** Detach from the stream and reset the active-evaluation half. */
  clearActive(): void

  /** `GET /evaluations` page 1 (replaces the list). */
  loadEvaluations(params?: EvaluationListParams): Promise<void>
  /** Next page, appended. No-op without a cursor. */
  loadMoreEvaluations(): Promise<void>
  /** `GET /evaluations/{id}` — refreshes the row in the list and, if it is the
   *  active one, `activeEvaluation`. */
  refreshEvaluation(evaluationId: string): Promise<EvaluationDetail | null>
}

export type EvalStore = EvalStateData & EvalActions

export const INITIAL_EVAL_STATE: EvalStateData = {
  activeEvaluationId: null,
  activeEvaluation: null,
  status: 'idle',
  events: [],
  progress: EMPTY_PROGRESS,
  result: null,
  error: null,
  evaluations: [],
  nextCursor: null,
  listLoading: false,
  listError: null,
  listLoaded: false
}

/* -------------------------------------------------------------------------- */
/* Pure reducer                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Recompute `{completed, failed, total}` from an event log.
 *
 * Derived from the whole log so a replay (reconnect, late subscribe) lands on
 * the same numbers a live subscriber has. `total` comes from `eval_start.n`,
 * falling back to `fallbackTotal` (the planned `n` on the created row).
 */
export function computeProgress(
  events: EvalStreamEvent[],
  fallbackTotal = 0
): EvalProgress {
  let completed = 0
  let failed = 0
  let total = fallbackTotal
  for (const event of events) {
    if (event.type === 'eval_start') total = event.n
    else if (event.type === 'run_completed') completed += 1
    else if (event.type === 'run_failed') failed += 1
  }
  return { completed, failed, total }
}

/** Map an `eval_complete.status` onto a client phase. */
export function phaseForEvalStatus(status: string): EvalPhase {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  return 'error'
}

/**
 * Apply one `EvalStreamEvent`. Pure — no clocks, no cross-store calls (that
 * lives in the `handleEvent` action).
 */
export function reduceEvalEvent(
  state: EvalStateData,
  event: EvalStreamEvent
): Partial<EvalStateData> {
  const events = [...state.events, event]
  const patch: Partial<EvalStateData> = {
    events,
    progress: computeProgress(events, state.progress.total)
  }

  switch (event.type) {
    case 'eval_start':
      patch.activeEvaluationId = event.evaluation_id
      patch.status = 'running'
      break
    case 'grading_started':
      patch.status = 'grading'
      break
    case 'grading_completed':
      patch.result = event.result
      break
    case 'run_failed':
      // Individual run failures do not fail the evaluation; the result carries
      // them in `failed_runs`. Only `eval_complete` decides the final status.
      break
    case 'eval_complete':
      patch.status = phaseForEvalStatus(event.status)
      if (event.result) patch.result = event.result
      break
    default:
      break
  }

  return patch
}

/* -------------------------------------------------------------------------- */
/* Derived selectors (primitives only)                                        */
/* -------------------------------------------------------------------------- */

export const selectIsEvaluating = (state: EvalStateData): boolean =>
  state.status === 'starting' || state.status === 'running' || state.status === 'grading'

/** 0 – 1; counts failures as finished work. `0` when the total is unknown. */
export function progressFraction(progress: EvalProgress): number {
  if (progress.total <= 0) return 0
  return Math.min(1, (progress.completed + progress.failed) / progress.total)
}

export const selectProgressFraction = (state: EvalStateData): number =>
  progressFraction(state.progress)

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

/** Controller for the active event subscription (not serializable → module scope). */
let controller: AbortController | null = null

/** Test/devtool hook: the controller for the current subscription, if any. */
export function activeEvalController(): AbortController | null {
  return controller
}

export const useEvalStore = create<EvalStore>()((set, get) => ({
  ...INITIAL_EVAL_STATE,

  handleEvent: (event) => {
    set((state) => reduceEvalEvent(state, event))
    // A determinism evaluation persists one run row per iteration.
    if (event.type === 'eval_complete') useHistoryStore.getState().invalidate()
  },

  startEvaluation: async (request) => {
    controller?.abort()
    controller = null
    set({
      ...INITIAL_EVAL_STATE,
      evaluations: get().evaluations,
      nextCursor: get().nextCursor,
      listLoaded: get().listLoaded,
      status: 'starting'
    })

    let created: EvaluationDetail
    try {
      created = await api.evaluations.create(request)
    } catch (error) {
      set({ status: 'error', error: toStoreError(error) })
      return null
    }

    set((state) => ({
      activeEvaluationId: created.id,
      activeEvaluation: created,
      // Show the planned run count before `eval_start` arrives.
      progress: { ...state.progress, total: created.config?.n ?? 0 },
      // Newest first, matching the list endpoint's ordering.
      evaluations: [created, ...state.evaluations.filter((row) => row.id !== created.id)]
    }))

    await get().followEvaluation(created.id)
    return created.id
  },

  followEvaluation: async (evaluationId) => {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal

    // The server replays the whole log, so start from an empty one.
    set((state) => ({
      activeEvaluationId: evaluationId,
      events: [],
      result: null,
      error: null,
      progress: {
        completed: 0,
        failed: 0,
        total: state.activeEvaluationId === evaluationId ? state.progress.total : 0
      },
      status: state.status === 'starting' ? 'starting' : 'running'
    }))

    try {
      await api.evaluations.events(evaluationId, {
        onEvent: (event) => get().handleEvent(event),
        signal
      })
    } catch (error) {
      if (isAborted(error)) {
        // Detaching is not a failure: the job keeps running server-side.
        return
      }
      set({ status: 'error', error: toStoreError(error) })
    } finally {
      if (controller?.signal === signal) controller = null
    }
  },

  cancelEvaluation: async () => {
    const evaluationId = get().activeEvaluationId
    controller?.abort()
    controller = null
    if (!evaluationId) {
      set({ status: 'cancelled' })
      return
    }
    try {
      await api.evaluations.cancel(evaluationId)
      set({ status: 'cancelled' })
    } catch (error) {
      // 409 `conflict` = it already finished; keep whatever status we have.
      const stored = toStoreError(error)
      if (stored.code === 'conflict') return
      set({ status: 'cancelled', error: stored })
    }
  },

  clearActive: () => {
    controller?.abort()
    controller = null
    set({
      activeEvaluationId: null,
      activeEvaluation: null,
      status: 'idle',
      events: [],
      progress: EMPTY_PROGRESS,
      result: null,
      error: null
    })
  },

  loadEvaluations: async (params = {}) => {
    set({ listLoading: true, listError: null })
    try {
      const page: Page<EvaluationDetail> = await api.evaluations.list(params)
      set({
        evaluations: page.items,
        nextCursor: page.next_cursor,
        listLoading: false,
        listLoaded: true
      })
    } catch (error) {
      if (isAborted(error)) {
        set({ listLoading: false })
        return
      }
      set({ listLoading: false, listError: toStoreError(error) })
    }
  },

  loadMoreEvaluations: async () => {
    const { nextCursor, listLoading } = get()
    if (!nextCursor || listLoading) return
    set({ listLoading: true, listError: null })
    try {
      const page: Page<EvaluationDetail> = await api.evaluations.list({ cursor: nextCursor })
      set((state) => ({
        evaluations: [...state.evaluations, ...page.items],
        nextCursor: page.next_cursor,
        listLoading: false
      }))
    } catch (error) {
      if (isAborted(error)) {
        set({ listLoading: false })
        return
      }
      set({ listLoading: false, listError: toStoreError(error) })
    }
  },

  refreshEvaluation: async (evaluationId) => {
    try {
      const detail = await api.evaluations.get(evaluationId)
      set((state) => ({
        evaluations: state.evaluations.map((row) => (row.id === detail.id ? detail : row)),
        activeEvaluation:
          state.activeEvaluationId === detail.id ? detail : state.activeEvaluation
      }))
      return detail
    } catch (error) {
      if (!isAborted(error)) set({ listError: toStoreError(error) })
      return null
    }
  }
}))
