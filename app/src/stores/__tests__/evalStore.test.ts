/** evalStore: progress derivation from a scripted event log, follow/cancel, list. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  EvalStreamEvent,
  EvaluationDetail,
  EvaluationResult,
  Page
} from '../../api'

const createMock = vi.fn()
const eventsMock = vi.fn()
const cancelMock = vi.fn()
const listMock = vi.fn()
const getMock = vi.fn()

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      evaluations: {
        ...actual.api.evaluations,
        create: createMock,
        events: eventsMock,
        cancel: cancelMock,
        list: listMock,
        get: getMock
      }
    }
  }
})

const { ApiError, StreamAbortedError } = await import('../../api')
const {
  useEvalStore,
  computeProgress,
  reduceEvalEvent,
  progressFraction,
  selectIsEvaluating,
  phaseForEvalStatus,
  INITIAL_EVAL_STATE,
  activeEvalController
} = await import('../evalStore')
const { useHistoryStore } = await import('../historyStore')

const result: EvaluationResult = {
  grade: 'B',
  score: 82,
  reasoning: 'Mostly consistent.',
  judge: { model_id: 'amazon.nova-pro-v1:0', system_prompt_used: false, rubric_used: true },
  metrics: { runs_analyzed: 3, unique_outputs: 2 },
  run_ids: ['run-0', 'run-1', 'run-2'],
  failed_runs: [{ index: 3, error: { code: 'upstream_error' } }]
}

/** A determinism run of 4 where one iteration fails. */
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
    summary: { output_chars: 118, tool_calls: 1, duration_ms: 880 }
  },
  { type: 'run_started', index: 2 },
  {
    type: 'run_completed',
    index: 2,
    run_id: 'run-2',
    status: 'completed',
    summary: { output_chars: 130, tool_calls: 1, duration_ms: 950 }
  },
  { type: 'run_started', index: 3 },
  { type: 'run_failed', index: 3, error: { code: 'upstream_error', message: 'throttled' } },
  { type: 'grading_started' },
  { type: 'grading_completed', result },
  { type: 'eval_complete', status: 'completed', result }
]

const createdRow: EvaluationDetail = {
  id: 'eval-1',
  ts: '2026-08-11T18:00:00Z',
  kind: 'determinism',
  status: 'pending',
  config: {
    kind: 'determinism',
    n: 4,
    run_config: { model_id: 'm', user_prompt: 'p' },
    rubric: null,
    grader: { model_id: 'amazon.nova-pro-v1:0', system_prompt: null }
  },
  run_ids: [],
  result: null,
  progress: null,
  error: null
}

beforeEach(() => {
  createMock.mockReset()
  eventsMock.mockReset()
  cancelMock.mockReset()
  listMock.mockReset()
  getMock.mockReset()
  useEvalStore.setState({ ...INITIAL_EVAL_STATE })
  useHistoryStore.setState({ stale: false })
})

describe('progress derivation', () => {
  it('computeProgress counts completions and failures against eval_start.n', () => {
    expect(computeProgress(scriptedLog)).toEqual({ completed: 3, failed: 1, total: 4 })
    expect(computeProgress(scriptedLog.slice(0, 5))).toEqual({
      completed: 2,
      failed: 0,
      total: 4
    })
    expect(computeProgress([], 10)).toEqual({ completed: 0, failed: 0, total: 10 })
  })

  it('advances progress one event at a time through handleEvent', () => {
    const { handleEvent } = useEvalStore.getState()
    const seen: string[] = []
    for (const event of scriptedLog) {
      handleEvent(event)
      const { completed, failed, total } = useEvalStore.getState().progress
      seen.push(`${completed}/${failed}/${total}`)
    }

    expect(seen).toEqual([
      '0/0/4', // eval_start
      '0/0/4', // run_started 0
      '1/0/4', // run_completed 0
      '1/0/4',
      '2/0/4',
      '2/0/4',
      '3/0/4',
      '3/0/4', // run_started 3
      '3/1/4', // run_failed 3
      '3/1/4', // grading_started
      '3/1/4', // grading_completed
      '3/1/4' // eval_complete
    ])
  })

  it('tracks the phase across the log and keeps the full event log', () => {
    const { handleEvent } = useEvalStore.getState()
    const phases: string[] = []
    for (const event of scriptedLog) {
      handleEvent(event)
      phases.push(useEvalStore.getState().status)
    }

    expect(phases[0]).toBe('running')
    expect(phases[phases.length - 3]).toBe('grading') // grading_started
    expect(phases[phases.length - 1]).toBe('completed')

    const state = useEvalStore.getState()
    expect(state.events).toHaveLength(scriptedLog.length)
    expect(state.activeEvaluationId).toBe('eval-1')
    expect(state.result).toEqual(result)
    expect(selectIsEvaluating(state)).toBe(false)
  })

  it('does not fail the evaluation just because a run failed', () => {
    const { handleEvent } = useEvalStore.getState()
    handleEvent(scriptedLog[0])
    handleEvent({ type: 'run_failed', index: 0, error: { code: 'upstream_error' } })

    expect(useEvalStore.getState().status).toBe('running')
    expect(useEvalStore.getState().progress.failed).toBe(1)
  })

  it('maps a failed eval_complete onto the error phase', () => {
    const { handleEvent } = useEvalStore.getState()
    handleEvent(scriptedLog[0])
    handleEvent({ type: 'eval_complete', status: 'error', result: null })
    expect(useEvalStore.getState().status).toBe('error')
  })

  it('progressFraction counts failures as finished work', () => {
    expect(progressFraction({ completed: 3, failed: 1, total: 4 })).toBe(1)
    expect(progressFraction({ completed: 1, failed: 0, total: 4 })).toBe(0.25)
    expect(progressFraction({ completed: 0, failed: 0, total: 0 })).toBe(0)
  })

  it('reduceEvalEvent is pure', () => {
    const state = { ...INITIAL_EVAL_STATE }
    const patch = reduceEvalEvent(state, scriptedLog[0])
    expect(patch.progress).toEqual({ completed: 0, failed: 0, total: 4 })
    expect(state.events).toHaveLength(0)
  })

  it('invalidates history on eval_complete (determinism persists run rows)', () => {
    for (const event of scriptedLog) useEvalStore.getState().handleEvent(event)
    expect(useHistoryStore.getState().stale).toBe(true)
  })

  it('does not invalidate history for a non-eval_complete event', () => {
    useHistoryStore.setState({ stale: false })
    useEvalStore.getState().handleEvent(scriptedLog[0])
    expect(useHistoryStore.getState().stale).toBe(false)
  })

  it('grading_completed sets the result immediately, without waiting for eval_complete', () => {
    const patch = reduceEvalEvent(
      { ...INITIAL_EVAL_STATE, events: [scriptedLog[0]] },
      { type: 'grading_completed', result }
    )
    expect(patch.result).toBe(result)
    expect(patch.status).toBeUndefined() // grading_completed alone doesn't change phase
  })

  it('eval_complete with a null result leaves result untouched (only a truthy result overwrites it)', () => {
    const primed = reduceEvalEvent(INITIAL_EVAL_STATE, {
      type: 'grading_completed',
      result
    })
    const state = { ...INITIAL_EVAL_STATE, ...primed }
    const patch = reduceEvalEvent(state, { type: 'eval_complete', status: 'completed', result: null })

    expect(patch.result).toBeUndefined()
    expect(state.result).toBe(result) // the previously-set result survives
  })

  it('reduceEvalEvent leaves status/result untouched for an unrecognized event type', () => {
    const state = { ...INITIAL_EVAL_STATE, status: 'running' as const }
    // @ts-expect-error deliberately an event type reduceEvalEvent doesn't know
    const patch = reduceEvalEvent(state, { type: 'totally_unknown' })
    expect(patch.status).toBeUndefined()
    expect(patch.result).toBeUndefined()
  })

  it('phaseForEvalStatus maps completed/cancelled verbatim and anything else to error', () => {
    expect(phaseForEvalStatus('completed')).toBe('completed')
    expect(phaseForEvalStatus('cancelled')).toBe('cancelled')
    expect(phaseForEvalStatus('error')).toBe('error')
    expect(phaseForEvalStatus('some_unknown_status')).toBe('error')
  })

  it('selectIsEvaluating is true only for starting/running/grading', () => {
    for (const status of ['starting', 'running', 'grading'] as const) {
      expect(selectIsEvaluating({ ...INITIAL_EVAL_STATE, status })).toBe(true)
    }
    for (const status of ['idle', 'completed', 'error', 'cancelled'] as const) {
      expect(selectIsEvaluating({ ...INITIAL_EVAL_STATE, status })).toBe(false)
    }
  })
})

describe('startEvaluation', () => {
  it('creates the evaluation then follows its event stream', async () => {
    createMock.mockResolvedValueOnce(createdRow)
    eventsMock.mockImplementation(
      async (_id: string, options: { onEvent: (event: EvalStreamEvent) => void }) => {
        for (const event of scriptedLog) options.onEvent(event)
      }
    )

    const id = await useEvalStore
      .getState()
      .startEvaluation({ kind: 'determinism', n: 4, run_config: { model_id: 'm', user_prompt: 'p' } })

    expect(id).toBe('eval-1')
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(eventsMock).toHaveBeenCalledTimes(1)
    expect(eventsMock.mock.calls[0][0]).toBe('eval-1')

    const state = useEvalStore.getState()
    expect(state.status).toBe('completed')
    expect(state.progress).toEqual({ completed: 3, failed: 1, total: 4 })
    expect(state.result).toEqual(result)
    expect(state.activeEvaluation?.id).toBe('eval-1')
    expect(state.evaluations.map((row) => row.id)).toEqual(['eval-1'])
  })

  it('records a create failure and never subscribes', async () => {
    createMock.mockRejectedValueOnce(
      new ApiError('run_config is required', { code: 'bad_request', status: 400 })
    )

    const id = await useEvalStore.getState().startEvaluation({ kind: 'determinism' })

    expect(id).toBeNull()
    expect(eventsMock).not.toHaveBeenCalled()
    expect(useEvalStore.getState().status).toBe('error')
    expect(useEvalStore.getState().error).toEqual({
      code: 'bad_request',
      message: 'run_config is required'
    })
  })

  it('seeds progress.total from the created row\'s config.n before any events arrive', async () => {
    createMock.mockResolvedValueOnce(createdRow) // createdRow.config.n === 4
    let eventsResolve!: () => void
    eventsMock.mockImplementation(
      () => new Promise<void>((resolve) => { eventsResolve = resolve })
    )

    const pending = useEvalStore
      .getState()
      .startEvaluation({ kind: 'determinism', n: 4, run_config: { model_id: 'm', user_prompt: 'p' } })
    await Promise.resolve()
    await Promise.resolve()

    expect(useEvalStore.getState().progress.total).toBe(4)
    eventsResolve()
    await pending
  })

  it('seeds progress.total as 0 when the created row carries no config.n', async () => {
    createMock.mockResolvedValueOnce({ ...createdRow, config: { ...createdRow.config, n: undefined } })
    let eventsResolve!: () => void
    eventsMock.mockImplementation(
      () => new Promise<void>((resolve) => { eventsResolve = resolve })
    )

    const pending = useEvalStore.getState().startEvaluation({ kind: 'determinism' })
    await Promise.resolve()
    await Promise.resolve()

    expect(useEvalStore.getState().progress.total).toBe(0)
    eventsResolve()
    await pending
  })

  it('de-dupes only the matching id, keeping unrelated rows, newest-first', async () => {
    useEvalStore.setState({ evaluations: [createdRow, { ...createdRow, id: 'eval-99' }] })
    createMock.mockResolvedValueOnce(createdRow) // id: 'eval-1', same as the stale row
    eventsMock.mockResolvedValueOnce(undefined)

    await useEvalStore
      .getState()
      .startEvaluation({ kind: 'determinism', run_config: { model_id: 'm', user_prompt: 'p' } })

    expect(useEvalStore.getState().evaluations.map((row) => row.id)).toEqual(['eval-1', 'eval-99'])
  })
})

describe('followEvaluation', () => {
  it('replays a finished evaluation from the retained log', async () => {
    eventsMock.mockImplementation(
      async (_id: string, options: { onEvent: (event: EvalStreamEvent) => void }) => {
        for (const event of scriptedLog) options.onEvent(event)
      }
    )

    await useEvalStore.getState().followEvaluation('eval-1')

    expect(useEvalStore.getState().progress).toEqual({ completed: 3, failed: 1, total: 4 })
    expect(useEvalStore.getState().status).toBe('completed')
  })

  it('clears the previous log before re-attaching, so a replay does not double-count', async () => {
    eventsMock.mockImplementation(
      async (_id: string, options: { onEvent: (event: EvalStreamEvent) => void }) => {
        for (const event of scriptedLog) options.onEvent(event)
      }
    )

    await useEvalStore.getState().followEvaluation('eval-1')
    await useEvalStore.getState().followEvaluation('eval-1')

    expect(useEvalStore.getState().events).toHaveLength(scriptedLog.length)
    expect(useEvalStore.getState().progress).toEqual({ completed: 3, failed: 1, total: 4 })
  })

  it('preserves progress.total when re-attaching to the SAME evaluation, but resets it for a DIFFERENT one', async () => {
    eventsMock.mockImplementationOnce(
      async (_id: string, options: { onEvent: (event: EvalStreamEvent) => void }) => {
        options.onEvent({ type: 'eval_start', evaluation_id: 'eval-1', kind: 'determinism', n: 7 })
      }
    )
    await useEvalStore.getState().followEvaluation('eval-1')
    expect(useEvalStore.getState().progress.total).toBe(7)

    // Re-attach to the same evaluation before any further events: total survives.
    eventsMock.mockImplementationOnce(() => new Promise<void>(() => {}))
    void useEvalStore.getState().followEvaluation('eval-1')
    await Promise.resolve()
    await Promise.resolve()
    expect(useEvalStore.getState().progress.total).toBe(7)

    // Attach to a *different* evaluation: total resets to 0 until its own eval_start.
    eventsMock.mockImplementationOnce(() => new Promise<void>(() => {}))
    void useEvalStore.getState().followEvaluation('eval-2')
    await Promise.resolve()
    await Promise.resolve()
    expect(useEvalStore.getState().progress.total).toBe(0)
  })

  it('sets status "running" when attaching fresh (not already "starting")', async () => {
    useEvalStore.setState({ status: 'idle' })
    eventsMock.mockImplementationOnce(() => new Promise<void>(() => {}))

    void useEvalStore.getState().followEvaluation('eval-1')
    await Promise.resolve()
    await Promise.resolve()

    expect(useEvalStore.getState().status).toBe('running')
  })

  it('keeps status "starting" when followEvaluation is the continuation of startEvaluation', async () => {
    useEvalStore.setState({ status: 'starting' })
    eventsMock.mockImplementationOnce(() => new Promise<void>(() => {}))

    void useEvalStore.getState().followEvaluation('eval-1')
    await Promise.resolve()
    await Promise.resolve()

    expect(useEvalStore.getState().status).toBe('starting')
  })

  it('records a stream failure as an error', async () => {
    eventsMock.mockRejectedValueOnce(
      new ApiError('evaluation not found', { code: 'not_found', status: 404 })
    )

    await useEvalStore.getState().followEvaluation('missing')

    expect(useEvalStore.getState().status).toBe('error')
    expect(useEvalStore.getState().error).toEqual({
      code: 'not_found',
      message: 'evaluation not found'
    })
  })

  it('treats a detach (abort) as a non-error', async () => {
    eventsMock.mockRejectedValueOnce(new StreamAbortedError())
    await useEvalStore.getState().followEvaluation('eval-1')
    expect(useEvalStore.getState().status).toBe('running')
    expect(useEvalStore.getState().error).toBeNull()
  })

  it('activeEvalController exposes the live subscription controller while attached, then clears it', async () => {
    expect(activeEvalController()).toBeNull()

    let capturedSignal: AbortSignal | undefined
    eventsMock.mockImplementation(
      async (_id: string, options: { signal?: AbortSignal }) => {
        capturedSignal = options.signal
        expect(activeEvalController()?.signal).toBe(capturedSignal)
      }
    )

    await useEvalStore.getState().followEvaluation('eval-1')

    // Cleared once the subscription settles.
    expect(activeEvalController()).toBeNull()
  })
})

describe('cancelEvaluation', () => {
  it('aborts the subscription and cancels server-side', async () => {
    let aborted = false
    createMock.mockResolvedValueOnce(createdRow)
    eventsMock.mockImplementation(
      (_id: string, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new StreamAbortedError())
          })
        })
    )
    cancelMock.mockResolvedValue(undefined)

    const pending = useEvalStore
      .getState()
      .startEvaluation({ kind: 'determinism', n: 4, run_config: { model_id: 'm', user_prompt: 'p' } })
    // let create() settle and the subscription open
    await Promise.resolve()
    await Promise.resolve()

    await useEvalStore.getState().cancelEvaluation()
    await pending

    expect(aborted).toBe(true)
    expect(cancelMock).toHaveBeenCalledWith('eval-1')
    expect(useEvalStore.getState().status).toBe('cancelled')
  })

  it('swallows the 409 raised for an already-finished evaluation', async () => {
    useEvalStore.setState({ activeEvaluationId: 'eval-1', status: 'completed' })
    cancelMock.mockRejectedValueOnce(
      new ApiError('evaluation already finished', { code: 'conflict', status: 409 })
    )

    await useEvalStore.getState().cancelEvaluation()

    expect(useEvalStore.getState().status).toBe('completed')
    expect(useEvalStore.getState().error).toBeNull()
  })

  it('records a non-conflict cancel failure as an error, still marking cancelled', async () => {
    useEvalStore.setState({ activeEvaluationId: 'eval-1', status: 'running' })
    cancelMock.mockRejectedValueOnce(new ApiError('server exploded', { code: 'http_error' }))

    await useEvalStore.getState().cancelEvaluation()

    expect(useEvalStore.getState().status).toBe('cancelled')
    expect(useEvalStore.getState().error).toEqual({ code: 'http_error', message: 'server exploded' })
  })

  it('goes straight to cancelled without calling the API when there is no active evaluation', async () => {
    useEvalStore.setState({ activeEvaluationId: null, status: 'idle' })

    await useEvalStore.getState().cancelEvaluation()

    expect(cancelMock).not.toHaveBeenCalled()
    expect(useEvalStore.getState().status).toBe('cancelled')
  })
})

describe('clearActive', () => {
  it('resets the active evaluation, its log, and progress back to idle', () => {
    useEvalStore.setState({
      activeEvaluationId: 'eval-1',
      activeEvaluation: createdRow,
      status: 'error',
      events: [{ type: 'grading_started' }],
      progress: { completed: 3, failed: 1, total: 4 },
      result,
      error: { code: 'http_error', message: 'nope' }
    })

    useEvalStore.getState().clearActive()

    const state = useEvalStore.getState()
    expect(state.activeEvaluationId).toBeNull()
    expect(state.activeEvaluation).toBeNull()
    expect(state.status).toBe('idle')
    expect(state.events).toEqual([])
    expect(state.progress).toEqual({ completed: 0, failed: 0, total: 0 })
    expect(state.result).toBeNull()
    expect(state.error).toBeNull()
  })
})

describe('list ops', () => {
  const rows = (ids: string[]): EvaluationDetail[] =>
    ids.map((id) => ({ ...createdRow, id }))

  it('loads a page and appends the next one', async () => {
    listMock
      .mockResolvedValueOnce({
        items: rows(['e1', 'e2']),
        next_cursor: 'c1'
      } as Page<EvaluationDetail>)
      .mockResolvedValueOnce({ items: rows(['e3']), next_cursor: null } as Page<EvaluationDetail>)

    await useEvalStore.getState().loadEvaluations({ kind: 'determinism' })
    expect(listMock).toHaveBeenCalledWith({ kind: 'determinism' })

    // `loadMoreEvaluations` carries the original filters (kind, execution, …)
    // onto the next page — a cursor is only valid for the filter set that
    // issued it.
    await useEvalStore.getState().loadMoreEvaluations()
    expect(listMock).toHaveBeenLastCalledWith({ kind: 'determinism', cursor: 'c1' })

    const state = useEvalStore.getState()
    expect(state.evaluations.map((row) => row.id)).toEqual(['e1', 'e2', 'e3'])
    expect(state.nextCursor).toBeNull()
    expect(state.listLoaded).toBe(true)
  })

  it('loads and pages the cloud lane with ?execution=cloud carried through', async () => {
    listMock
      .mockResolvedValueOnce({
        items: rows(['e1']),
        next_cursor: 'c1'
      } as Page<EvaluationDetail>)
      .mockResolvedValueOnce({ items: rows(['e2']), next_cursor: null } as Page<EvaluationDetail>)

    await useEvalStore.getState().loadEvaluations({ execution: 'cloud' })
    expect(listMock).toHaveBeenCalledWith({ execution: 'cloud' })

    await useEvalStore.getState().loadMoreEvaluations()
    expect(listMock).toHaveBeenLastCalledWith({ execution: 'cloud', cursor: 'c1' })

    expect(useEvalStore.getState().evaluations.map((row) => row.id)).toEqual(['e1', 'e2'])
  })

  it('refreshEvaluation replaces the row in place', async () => {
    listMock.mockResolvedValueOnce({
      items: rows(['e1']),
      next_cursor: null
    } as Page<EvaluationDetail>)
    await useEvalStore.getState().loadEvaluations()

    getMock.mockResolvedValueOnce({ ...createdRow, id: 'e1', status: 'completed' })
    const refreshed = await useEvalStore.getState().refreshEvaluation('e1')

    expect(refreshed?.status).toBe('completed')
    expect(useEvalStore.getState().evaluations[0].status).toBe('completed')
  })

  it('refreshEvaluation returns null and records listError on a real failure', async () => {
    getMock.mockRejectedValueOnce(new ApiError('gone', { code: 'not_found' }))

    const refreshed = await useEvalStore.getState().refreshEvaluation('missing')

    expect(refreshed).toBeNull()
    expect(useEvalStore.getState().listError).toEqual({ code: 'not_found', message: 'gone' })
  })

  it('refreshEvaluation swallows an abort without recording an error', async () => {
    getMock.mockRejectedValueOnce(new StreamAbortedError())

    const refreshed = await useEvalStore.getState().refreshEvaluation('e1')

    expect(refreshed).toBeNull()
    expect(useEvalStore.getState().listError).toBeNull()
  })

  it('loadEvaluations tolerates an abort, clearing listLoading without setting listError', async () => {
    listMock.mockRejectedValueOnce(new StreamAbortedError())

    await useEvalStore.getState().loadEvaluations()

    expect(useEvalStore.getState().listLoading).toBe(false)
    expect(useEvalStore.getState().listError).toBeNull()
    expect(useEvalStore.getState().listLoaded).toBe(false)
  })

  it('loadEvaluations records a real failure as listError', async () => {
    listMock.mockRejectedValueOnce(new ApiError('server exploded', { code: 'http_error' }))

    await useEvalStore.getState().loadEvaluations()

    expect(useEvalStore.getState().listLoading).toBe(false)
    expect(useEvalStore.getState().listError).toEqual({
      code: 'http_error',
      message: 'server exploded'
    })
  })

  it('loadMoreEvaluations is a no-op when there is no nextCursor or a load is already in flight', async () => {
    useEvalStore.setState({ nextCursor: null, listLoading: false })
    await useEvalStore.getState().loadMoreEvaluations()
    expect(listMock).not.toHaveBeenCalled()

    useEvalStore.setState({ nextCursor: 'c1', listLoading: true })
    await useEvalStore.getState().loadMoreEvaluations()
    expect(listMock).not.toHaveBeenCalled()
  })

  it('loadMoreEvaluations tolerates an abort and records a real failure as listError', async () => {
    useEvalStore.setState({ nextCursor: 'c1', listLoading: false })
    listMock.mockRejectedValueOnce(new StreamAbortedError())
    await useEvalStore.getState().loadMoreEvaluations()
    expect(useEvalStore.getState().listLoading).toBe(false)
    expect(useEvalStore.getState().listError).toBeNull()

    useEvalStore.setState({ nextCursor: 'c1', listLoading: false })
    listMock.mockRejectedValueOnce(new ApiError('nope', { code: 'http_error' }))
    await useEvalStore.getState().loadMoreEvaluations()
    expect(useEvalStore.getState().listError).toEqual({ code: 'http_error', message: 'nope' })
  })

  it('loadEvaluations sets listLoading:true (clearing a stale listError) synchronously, before the request resolves', async () => {
    useEvalStore.setState({ listError: { code: 'stale', message: 'stale' } })
    let resolveList!: (page: Page<EvaluationDetail>) => void
    listMock.mockImplementationOnce(
      () => new Promise<Page<EvaluationDetail>>((resolve) => { resolveList = resolve })
    )

    const pending = useEvalStore.getState().loadEvaluations()
    expect(useEvalStore.getState().listLoading).toBe(true)
    expect(useEvalStore.getState().listError).toBeNull()

    resolveList({ items: rows(['e1']), next_cursor: null })
    await pending
    expect(useEvalStore.getState().listLoading).toBe(false)
  })

  it('loadMoreEvaluations sets listLoading:true synchronously, before the request resolves', async () => {
    useEvalStore.setState({ nextCursor: 'c1', listLoading: false })
    let resolveList!: (page: Page<EvaluationDetail>) => void
    listMock.mockImplementationOnce(
      () => new Promise<Page<EvaluationDetail>>((resolve) => { resolveList = resolve })
    )

    const pending = useEvalStore.getState().loadMoreEvaluations()
    expect(useEvalStore.getState().listLoading).toBe(true)

    resolveList({ items: rows(['e2']), next_cursor: null })
    await pending
    expect(useEvalStore.getState().listLoading).toBe(false)
  })

  it('refreshEvaluation replaces only the matching row and only updates activeEvaluation when it is the active one', async () => {
    listMock.mockResolvedValueOnce({
      items: rows(['e1', 'e2']),
      next_cursor: null
    } as Page<EvaluationDetail>)
    await useEvalStore.getState().loadEvaluations()
    useEvalStore.setState({ activeEvaluationId: 'e2', activeEvaluation: { ...createdRow, id: 'e2' } })

    getMock.mockResolvedValueOnce({ ...createdRow, id: 'e1', status: 'completed' })
    await useEvalStore.getState().refreshEvaluation('e1')

    const state = useEvalStore.getState()
    expect(state.evaluations.find((r) => r.id === 'e1')?.status).toBe('completed')
    expect(state.evaluations.find((r) => r.id === 'e2')?.status).toBe('pending')
    // e1 was refreshed, but the *active* evaluation is e2 — untouched.
    expect(state.activeEvaluation?.id).toBe('e2')
    expect(state.activeEvaluation?.status).toBe('pending')
  })
})
