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
  INITIAL_EVAL_STATE
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
})
