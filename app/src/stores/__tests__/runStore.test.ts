/**
 * runStore, driven by the real NDJSON fixture the API-layer tests use.
 *
 * The fixture is parsed line by line and pushed through `handleEvent` — the
 * exact path the live stream callback takes — so text accumulation, tool
 * merging and metrics are exercised against real server output rather than a
 * hand-written approximation.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunStreamEvent } from '../../api'

// The same NDJSON fixture the API-layer stream tests replay, loaded verbatim.
// Read from disk rather than a Vite `?raw` import: the latter routes through
// Vite's asset-transform pipeline, which some non-browser test runners
// (Stryker's mutation test runner, in particular) don't apply consistently.
// `readFileSync` is plain Node and behaves the same everywhere. Built via
// `node:path`/`node:url` rather than `new URL(...)` directly — the jsdom test
// environment replaces the global `URL` with its own implementation, which
// Node's `fs` functions don't recognize as a `file:` URL.
const THIS_DIR = dirname(fileURLToPath(import.meta.url))
const fixtureNdjson = readFileSync(
  join(THIS_DIR, '../../api/__tests__/fixtures/run-stream.ndjson'),
  'utf8'
)

const streamMock = vi.fn()

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      runs: { ...actual.api.runs, stream: streamMock }
    }
  }
})

const { StreamAbortedError } = await import('../../api')
const {
  useRunStore,
  robotMoodFor,
  selectRobotMood,
  selectIsRunning,
  selectHasOutput,
  elapsedMs,
  reduceRunEvent,
  phaseForWireStatus,
  activeRunController,
  isTerminalPhase,
  INITIAL_RUN_STATE
} = await import('../runStore')
const { useHistoryStore } = await import('../historyStore')

function fixtureEvents(): RunStreamEvent[] {
  return fixtureNdjson
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as RunStreamEvent)
}

beforeEach(() => {
  streamMock.mockReset()
  useRunStore.setState({ ...INITIAL_RUN_STATE })
  useHistoryStore.setState({ stale: false })
})

describe('fixture replay through handleEvent', () => {
  it('parses the fixture into the expected event sequence', () => {
    expect(fixtureEvents().map((event) => event.type)).toEqual([
      'run_start',
      'text_delta',
      'text_delta',
      'text_delta',
      'tool_use_start',
      'tool_input_delta',
      'tool_result',
      'metrics',
      'run_complete'
    ])
  })

  it('accumulates text, merges tool events, and records metrics', () => {
    const { handleEvent } = useRunStore.getState()
    for (const event of fixtureEvents()) handleEvent(event)

    const state = useRunStore.getState()
    expect(state.runId).toBe('01JBQZ7K3M9X2VQY8N4F6TWR5A')
    expect(state.modelId).toBe('anthropic.claude-3-sonnet')
    expect(state.streamedText).toBe('Checking order B456')
    expect(state.reasoningText).toBe('')
    expect(state.finalText).toBe(
      'Checking order B456 — the carrier reports it as delayed, ETA 2026-08-14.'
    )
    expect(state.status).toBe('completed')
    expect(state.metrics).toEqual({
      input_tokens: 412,
      output_tokens: 86,
      total_tokens: 498,
      latency_ms: 1873,
      cycle_count: 2
    })
  })

  it('merges start/input-delta/result into one tool entry per tool_use_id', () => {
    const { handleEvent } = useRunStore.getState()
    for (const event of fixtureEvents()) handleEvent(event)

    const toolEvents = useRunStore.getState().toolEvents
    expect(toolEvents).toHaveLength(1)
    expect(toolEvents[0]).toMatchObject({
      tool_use_id: 'tooluse_9dK1aQ',
      name: 'getCarrierStatus',
      inputJson: '{"order_id": "B456"}',
      input: { order_id: 'B456' },
      result: { carrier: 'UPS', status: 'delayed', eta: '2026-08-14' },
      duration_ms: 42,
      error: null
    })
  })

  it('concatenates multiple input deltas in order before the result lands', () => {
    const { handleEvent } = useRunStore.getState()
    handleEvent({ type: 'tool_use_start', tool_use_id: 'tu_1', name: 'lookup' })
    handleEvent({ type: 'tool_input_delta', tool_use_id: 'tu_1', json: '{"a":' })
    handleEvent({ type: 'tool_input_delta', tool_use_id: 'tu_1', json: ' 1,' })
    handleEvent({ type: 'tool_input_delta', tool_use_id: 'tu_1', json: '"b": 2}' })

    expect(useRunStore.getState().toolEvents[0]).toEqual({
      tool_use_id: 'tu_1',
      name: 'lookup',
      inputJson: '{"a": 1,"b": 2}'
    })
    expect(useRunStore.getState().toolEvents[0].result).toBeUndefined()

    handleEvent({
      type: 'tool_result',
      tool_use_id: 'tu_1',
      name: 'lookup',
      input: { a: 1, b: 2 },
      output: 'ok',
      duration_ms: 7,
      error: null
    })

    const entry = useRunStore.getState().toolEvents[0]
    expect(entry.inputJson).toBe('{"a": 1,"b": 2}')
    expect(entry.result).toBe('ok')
    expect(entry.duration_ms).toBe(7)
  })

  it('creates a fresh tool entry with an empty name when an input delta arrives with no prior tool_use_start', () => {
    const { handleEvent } = useRunStore.getState()
    handleEvent({ type: 'tool_input_delta', tool_use_id: 'orphan', json: '{"a":1}' })

    expect(useRunStore.getState().toolEvents).toEqual([
      { tool_use_id: 'orphan', name: '', inputJson: '{"a":1}' }
    ])
  })

  it('keeps two concurrent tool calls apart and preserves their order', () => {
    const { handleEvent } = useRunStore.getState()
    handleEvent({ type: 'tool_use_start', tool_use_id: 'a', name: 'first' })
    handleEvent({ type: 'tool_use_start', tool_use_id: 'b', name: 'second' })
    handleEvent({ type: 'tool_input_delta', tool_use_id: 'b', json: '{"x":1}' })
    handleEvent({ type: 'tool_input_delta', tool_use_id: 'a', json: '{"y":2}' })

    const toolEvents = useRunStore.getState().toolEvents
    expect(toolEvents.map((entry) => entry.tool_use_id)).toEqual(['a', 'b'])
    expect(toolEvents[0].inputJson).toBe('{"y":2}')
    expect(toolEvents[1].inputJson).toBe('{"x":1}')
  })

  it('collects messages and the guardrail trace', () => {
    const { handleEvent } = useRunStore.getState()
    handleEvent({ type: 'message', role: 'assistant', content: [{ text: 'hi' }] })
    handleEvent({ type: 'guardrail_trace', assessment: { topicPolicy: { topics: [] } } })

    const state = useRunStore.getState()
    expect(state.messages).toEqual([{ role: 'assistant', content: [{ text: 'hi' }] }])
    expect(state.guardrailTrace).toEqual({ topicPolicy: { topics: [] } })
  })

  it('invalidates the history store when the run completes', () => {
    expect(useHistoryStore.getState().stale).toBe(false)
    for (const event of fixtureEvents()) useRunStore.getState().handleEvent(event)
    expect(useHistoryStore.getState().stale).toBe(true)
  })
})

describe('robot mood', () => {
  it('maps every phase', () => {
    expect(robotMoodFor('idle')).toBe('idle')
    expect(robotMoodFor('starting')).toBe('thinking')
    expect(robotMoodFor('streaming')).toBe('talking')
    expect(robotMoodFor('completed')).toBe('idle')
    expect(robotMoodFor('cancelled')).toBe('idle')
    expect(robotMoodFor('error')).toBe('error')
  })

  it('transitions idle -> thinking -> talking -> idle across the fixture', () => {
    const moods: string[] = [selectRobotMood(useRunStore.getState())]
    for (const event of fixtureEvents()) {
      useRunStore.getState().handleEvent(event)
      moods.push(selectRobotMood(useRunStore.getState()))
    }

    // one entry per event, plus the initial mood
    expect(moods).toEqual([
      'idle', // before anything
      'thinking', // run_start
      'talking', // text_delta
      'talking',
      'talking',
      'talking', // tool_use_start
      'talking', // tool_input_delta
      'talking', // tool_result
      'talking', // metrics
      'idle' // run_complete
    ])
  })

  it('goes to error on an in-band error event', () => {
    const { handleEvent } = useRunStore.getState()
    handleEvent({
      type: 'run_start',
      run_id: 'r1',
      ts: '2026-08-11T18:04:11Z',
      model_id: 'm'
    })
    handleEvent({ type: 'error', code: 'upstream_error', message: 'throttled', retryable: true })

    expect(useRunStore.getState().status).toBe('error')
    expect(useRunStore.getState().error).toEqual({
      code: 'upstream_error',
      message: 'throttled'
    })
    expect(selectRobotMood(useRunStore.getState())).toBe('error')
  })
})

describe('startRun', () => {
  it('streams events into state and ends completed', async () => {
    streamMock.mockImplementation(
      async (_body: unknown, options: { onEvent: (event: RunStreamEvent) => void }) => {
        for (const event of fixtureEvents()) options.onEvent(event)
      }
    )

    await useRunStore.getState().startRun({ model_id: 'm', user_prompt: 'where is B456?' })

    expect(streamMock).toHaveBeenCalledTimes(1)
    expect(streamMock.mock.calls[0][0]).toMatchObject({
      model_id: 'm',
      user_prompt: 'where is B456?',
      stream: true
    })

    const state = useRunStore.getState()
    expect(state.status).toBe('completed')
    expect(state.streamedText).toBe('Checking order B456')
    expect(state.startedAt).not.toBeNull()
    expect(state.endedAt).not.toBeNull()
    expect(selectIsRunning(state)).toBe(false)
  })

  it('reports isRunning while the stream is open', async () => {
    let seen: boolean | null = null
    streamMock.mockImplementation(
      async (_body: unknown, options: { onEvent: (event: RunStreamEvent) => void }) => {
        options.onEvent({
          type: 'run_start',
          run_id: 'r1',
          ts: '2026-08-11T18:04:11Z',
          model_id: 'm'
        })
        options.onEvent({ type: 'text_delta', text: 'hi' })
        seen = selectIsRunning(useRunStore.getState())
      }
    )

    await useRunStore.getState().startRun({ model_id: 'm', user_prompt: 'p' })
    expect(seen).toBe(true)
    expect(selectIsRunning(useRunStore.getState())).toBe(false)
  })

  it('maps a StreamAbortedError onto cancelled, not error', async () => {
    streamMock.mockImplementation(
      (_body: unknown, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new StreamAbortedError()))
        })
    )

    const pending = useRunStore.getState().startRun({ model_id: 'm', user_prompt: 'p' })
    expect(useRunStore.getState().status).toBe('starting')

    useRunStore.getState().cancelRun()
    await pending

    const state = useRunStore.getState()
    expect(state.status).toBe('cancelled')
    expect(state.error).toBeNull()
    expect(selectRobotMood(state)).toBe('idle')
    // a cancelled run is still persisted server-side
    expect(useHistoryStore.getState().stale).toBe(true)
  })

  it('lands an ApiError in the error field as {code, message}', async () => {
    const { ApiError } = await import('../../api')
    streamMock.mockRejectedValue(
      new ApiError('model is not enabled', { code: 'upstream_error', status: 502 })
    )

    await useRunStore.getState().startRun({ model_id: 'm', user_prompt: 'p' })

    expect(useRunStore.getState().status).toBe('error')
    expect(useRunStore.getState().error).toEqual({
      code: 'upstream_error',
      message: 'model is not enabled'
    })
  })

  it('resets the panes when a second run starts', async () => {
    streamMock.mockImplementation(
      async (_body: unknown, options: { onEvent: (event: RunStreamEvent) => void }) => {
        for (const event of fixtureEvents()) options.onEvent(event)
      }
    )
    await useRunStore.getState().startRun({ model_id: 'm', user_prompt: 'p' })

    streamMock.mockImplementation(
      async (_body: unknown, options: { onEvent: (event: RunStreamEvent) => void }) => {
        options.onEvent({ type: 'text_delta', text: 'second' })
        options.onEvent({
          type: 'run_complete',
          run_id: 'r2',
          status: 'completed',
          final_text: 'second'
        })
      }
    )
    await useRunStore.getState().startRun({ model_id: 'm', user_prompt: 'p2' })

    const state = useRunStore.getState()
    expect(state.streamedText).toBe('second')
    expect(state.toolEvents).toEqual([])
    expect(state.runId).toBe('r2')
  })

  it('a stale startRun does not null out the controller for a newer, still-live run', async () => {
    // Simulates two overlapping startRun calls: the first's `finally` must not
    // clear the controller the second call just installed.
    let releaseFirst!: () => void
    streamMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => { releaseFirst = resolve })
    )
    const firstPending = useRunStore.getState().startRun({ model_id: 'm', user_prompt: 'first' })

    streamMock.mockImplementationOnce(() => new Promise<void>(() => {})) // never resolves
    useRunStore.getState().startRun({ model_id: 'm', user_prompt: 'second' })
    const controllerDuringSecond = activeRunController()

    releaseFirst()
    await firstPending

    // The second run's controller must survive the first (stale) run's finally block.
    expect(activeRunController()).toBe(controllerDuringSecond)
  })
})

describe('cancelRun', () => {
  it('is a no-op while idle', () => {
    useRunStore.setState({ status: 'idle' })
    useRunStore.getState().cancelRun()
    expect(useRunStore.getState().status).toBe('idle')
  })

  it('is a no-op once the run already reached a terminal phase', () => {
    for (const status of ['completed', 'error', 'cancelled'] as const) {
      useRunStore.setState({ status, endedAt: null })
      useRunStore.getState().cancelRun()
      expect(useRunStore.getState().status).toBe(status)
      expect(useRunStore.getState().endedAt).toBeNull()
    }
  })

  it('marks an in-flight run cancelled and stamps endedAt', () => {
    useRunStore.setState({ status: 'streaming', endedAt: null })
    useRunStore.getState().cancelRun()
    expect(useRunStore.getState().status).toBe('cancelled')
    expect(useRunStore.getState().endedAt).not.toBeNull()
  })
})

describe('helpers', () => {
  it('clear() returns to the initial state', () => {
    for (const event of fixtureEvents()) useRunStore.getState().handleEvent(event)
    useRunStore.getState().clear()
    const { startRun, cancelRun, handleEvent, clear, ...data } = useRunStore.getState()
    expect(data).toEqual(INITIAL_RUN_STATE)
    expect(typeof startRun).toBe('function')
    expect(typeof cancelRun).toBe('function')
    expect(typeof handleEvent).toBe('function')
    expect(typeof clear).toBe('function')
  })

  it('elapsedMs counts up while running and freezes when ended', () => {
    expect(elapsedMs({ ...INITIAL_RUN_STATE })).toBe(0)
    expect(elapsedMs({ ...INITIAL_RUN_STATE, startedAt: 1000 }, 1750)).toBe(750)
    expect(elapsedMs({ ...INITIAL_RUN_STATE, startedAt: 1000, endedAt: 1500 }, 9999)).toBe(500)
  })

  it('reduceRunEvent is pure — it does not mutate the input state', () => {
    const state = { ...INITIAL_RUN_STATE, streamedText: 'a' }
    const patch = reduceRunEvent(state, { type: 'text_delta', text: 'b' })
    expect(patch.streamedText).toBe('ab')
    expect(state.streamedText).toBe('a')
  })

  it('text_delta/reasoning_delta only promote "starting" to "streaming"; any other status passes through unchanged', () => {
    const streaming = { ...INITIAL_RUN_STATE, status: 'streaming' as const }
    expect(reduceRunEvent(streaming, { type: 'text_delta', text: 'x' }).status).toBe('streaming')

    const idle = { ...INITIAL_RUN_STATE, status: 'idle' as const }
    expect(reduceRunEvent(idle, { type: 'text_delta', text: 'x' }).status).toBe('idle')

    const starting = { ...INITIAL_RUN_STATE, status: 'starting' as const }
    expect(reduceRunEvent(starting, { type: 'reasoning_delta', text: 'x' }).status).toBe(
      'streaming'
    )
    expect(reduceRunEvent(idle, { type: 'reasoning_delta', text: 'x' }).status).toBe('idle')
  })

  it('isTerminalPhase is true only for completed/error/cancelled', () => {
    expect(isTerminalPhase('completed')).toBe(true)
    expect(isTerminalPhase('error')).toBe(true)
    expect(isTerminalPhase('cancelled')).toBe(true)
    expect(isTerminalPhase('idle')).toBe(false)
    expect(isTerminalPhase('starting')).toBe(false)
    expect(isTerminalPhase('streaming')).toBe(false)
  })

  it('handleEvent invalidates history only on run_complete, not on other event types', () => {
    useHistoryStore.setState({ stale: false })
    useRunStore.getState().handleEvent({ type: 'text_delta', text: 'x' })
    expect(useHistoryStore.getState().stale).toBe(false)

    useRunStore.getState().handleEvent({
      type: 'run_complete',
      run_id: 'r1',
      status: 'completed',
      final_text: 'done'
    })
    expect(useHistoryStore.getState().stale).toBe(true)
  })

  it('falls back to run_complete.final_text when no deltas were streamed', () => {
    useRunStore.getState().handleEvent({
      type: 'run_complete',
      run_id: 'r9',
      status: 'completed',
      final_text: 'whole answer'
    })
    expect(useRunStore.getState().streamedText).toBe('whole answer')
  })

  it('maps a cancelled run_complete onto the cancelled phase', () => {
    useRunStore.getState().handleEvent({
      type: 'run_complete',
      run_id: 'r9',
      status: 'cancelled',
      final_text: ''
    })
    expect(useRunStore.getState().status).toBe('cancelled')
  })

  it('phaseForWireStatus maps completed/cancelled verbatim and anything else to error', () => {
    expect(phaseForWireStatus('completed')).toBe('completed')
    expect(phaseForWireStatus('cancelled')).toBe('cancelled')
    expect(phaseForWireStatus('error')).toBe('error')
    expect(phaseForWireStatus('some_unknown_status')).toBe('error')
  })

  it('reduceRunEvent returns an empty patch for an unrecognized event type', () => {
    const state = { ...INITIAL_RUN_STATE }
    // @ts-expect-error deliberately an event type reduceRunEvent doesn't know
    expect(reduceRunEvent(state, { type: 'totally_unknown' })).toEqual({})
  })

  it('selectHasOutput is true once streamedText or finalText is non-empty', () => {
    expect(selectHasOutput(INITIAL_RUN_STATE)).toBe(false)
    expect(selectHasOutput({ ...INITIAL_RUN_STATE, streamedText: 'hi' })).toBe(true)
    expect(selectHasOutput({ ...INITIAL_RUN_STATE, finalText: 'done' })).toBe(true)
  })

  it('activeRunController exposes the live stream controller only while a run is in flight', async () => {
    expect(activeRunController()).toBeNull()

    let sawControllerDuringStream = false
    streamMock.mockImplementation(async (_body: unknown, options: { signal?: AbortSignal }) => {
      sawControllerDuringStream = activeRunController()?.signal === options.signal
    })

    await useRunStore.getState().startRun({ model_id: 'm', user_prompt: 'hi' })

    expect(sawControllerDuringStream).toBe(true)
    expect(activeRunController()).toBeNull()
  })
})
