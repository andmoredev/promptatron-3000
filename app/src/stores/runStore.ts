/**
 * The single active run: lifecycle, streamed text, tool calls, metrics.
 *
 * Everything the Workbench renders while a run is in flight lives here — the
 * output pane, the reasoning pane, the tool timeline, the metrics strip and the
 * robot mascot all subscribe to slices of this one store, so a single
 * `handleEvent` call updates all of them in one notification.
 *
 * `handleEvent` is written to be called from *outside* React: the NDJSON
 * callback in `startRun` is `useRunStore.getState().handleEvent`, and any other
 * transport (a replay, a test, a devtool) can drive the exact same reducer.
 *
 * Cross-store coupling (deliberate, and the only one here): when a run reaches
 * a terminal state the server has persisted a new row, so we call
 * `useHistoryStore.getState().invalidate()`. It only flips a `stale` flag —
 * the History tab decides when to refetch.
 */

import { create } from 'zustand'
import { api } from '../api'
import type {
  RunMetrics,
  RunRequest,
  RunStatus as WireRunStatus,
  RunStreamEvent
} from '../api'
import { isAborted, toStoreError, type StoreError } from './errors'
import { useHistoryStore } from './historyStore'

/** Client-side lifecycle. Wider than the server's `RunStatus`. */
export type RunPhase = 'idle' | 'starting' | 'streaming' | 'completed' | 'error' | 'cancelled'

/** What the `RobotGraphic` renders. */
export type RobotMood = 'idle' | 'thinking' | 'talking' | 'error'

/** One tool call, merged from `tool_use_start` + `tool_input_delta`* + `tool_result`. */
export interface ToolEventEntry {
  tool_use_id: string
  name: string
  /** Concatenated `tool_input_delta.json` fragments; partial until the result. */
  inputJson: string
  /** The parsed input echoed back by `tool_result` (authoritative). */
  input?: Record<string, unknown>
  /** `tool_result.output`. Absent while the call is still running. */
  result?: unknown
  duration_ms?: number
  error?: Record<string, unknown> | null
}

/** A `message` event: the assistant/user turns the engine emitted. */
export interface RunMessage {
  role: string
  content: unknown[]
}

/** The data half of the store (no actions) — what the reducer operates on. */
export interface RunStateData {
  status: RunPhase
  runId: string | null
  /** Echoed by `run_start`; useful before the run row exists in history. */
  modelId: string | null
  /** Accumulated `text_delta`. */
  streamedText: string
  /** Accumulated `reasoning_delta`. */
  reasoningText: string
  /** The authoritative text from `run_complete` (may differ from the deltas). */
  finalText: string | null
  toolEvents: ToolEventEntry[]
  messages: RunMessage[]
  guardrailTrace: Record<string, unknown> | null
  metrics: RunMetrics | null
  error: StoreError | null
  /** `Date.now()` when `startRun` was called / when the run reached a terminal state. */
  startedAt: number | null
  endedAt: number | null
}

export interface RunActions {
  /** POST the run and stream it. Resolves when the stream closes (never throws). */
  startRun(config: RunRequest): Promise<void>
  /** Abort the in-flight stream. Lands in `cancelled`, not `error`. */
  cancelRun(): void
  /** Apply one NDJSON event. Safe to call from outside React. */
  handleEvent(event: RunStreamEvent): void
  /** Back to `idle` with empty panes (does not abort — call `cancelRun` first). */
  clear(): void
}

export type RunStore = RunStateData & RunActions

export const INITIAL_RUN_STATE: RunStateData = {
  status: 'idle',
  runId: null,
  modelId: null,
  streamedText: '',
  reasoningText: '',
  finalText: null,
  toolEvents: [],
  messages: [],
  guardrailTrace: null,
  metrics: null,
  error: null,
  startedAt: null,
  endedAt: null
}

/* -------------------------------------------------------------------------- */
/* Pure reducer                                                               */
/* -------------------------------------------------------------------------- */

/** Merge one tool event into the list, keyed by `tool_use_id` (order preserved). */
function mergeToolEvent(
  toolEvents: ToolEventEntry[],
  tool_use_id: string,
  patch: Partial<ToolEventEntry>
): ToolEventEntry[] {
  const index = toolEvents.findIndex((entry) => entry.tool_use_id === tool_use_id)
  if (index === -1) {
    return [...toolEvents, { tool_use_id, name: '', inputJson: '', ...patch }]
  }
  const next = toolEvents.slice()
  next[index] = { ...next[index], ...patch }
  return next
}

/** Map the server's terminal `RunStatus` onto a client phase. */
export function phaseForWireStatus(status: WireRunStatus | string): RunPhase {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  return 'error'
}

/**
 * Apply one `RunStreamEvent` to run state and return the changed keys.
 *
 * Pure: no clocks other than the `now` argument, no cross-store calls. That
 * lives in the `handleEvent` action so tests can replay a whole fixture
 * without side effects.
 */
export function reduceRunEvent(
  state: RunStateData,
  event: RunStreamEvent,
  now: number = Date.now()
): Partial<RunStateData> {
  switch (event.type) {
    case 'run_start':
      // Still "thinking": the model has not emitted a token yet.
      return { runId: event.run_id, modelId: event.model_id, status: 'starting' }

    case 'text_delta':
      return {
        streamedText: state.streamedText + event.text,
        status: state.status === 'starting' ? 'streaming' : state.status
      }

    case 'reasoning_delta':
      return {
        reasoningText: state.reasoningText + event.text,
        status: state.status === 'starting' ? 'streaming' : state.status
      }

    case 'tool_use_start':
      return {
        toolEvents: mergeToolEvent(state.toolEvents, event.tool_use_id, {
          name: event.name
        })
      }

    case 'tool_input_delta': {
      const existing = state.toolEvents.find((e) => e.tool_use_id === event.tool_use_id)
      return {
        toolEvents: mergeToolEvent(state.toolEvents, event.tool_use_id, {
          inputJson: (existing?.inputJson ?? '') + event.json
        })
      }
    }

    case 'tool_result':
      return {
        toolEvents: mergeToolEvent(state.toolEvents, event.tool_use_id, {
          name: event.name,
          input: event.input,
          result: event.output,
          duration_ms: event.duration_ms,
          error: event.error
        })
      }

    case 'message':
      return { messages: [...state.messages, { role: event.role, content: event.content }] }

    case 'guardrail_trace':
      return { guardrailTrace: event.assessment }

    case 'metrics':
      return {
        metrics: {
          input_tokens: event.input_tokens,
          output_tokens: event.output_tokens,
          total_tokens: event.total_tokens,
          latency_ms: event.latency_ms,
          cycle_count: event.cycle_count
        }
      }

    case 'error':
      // In-band failure: HTTP stayed 200. `run_complete` usually follows.
      return { status: 'error', error: { code: event.code, message: event.message } }

    case 'run_complete':
      return {
        runId: event.run_id,
        status: phaseForWireStatus(event.status),
        finalText: event.final_text,
        // Prefer the streamed text when we have it; fall back for non-delta runs.
        streamedText: state.streamedText === '' ? event.final_text : state.streamedText,
        endedAt: now
      }

    default:
      return {}
  }
}

/** Terminal phases: the run will produce no further events. */
export function isTerminalPhase(status: RunPhase): boolean {
  return status === 'completed' || status === 'error' || status === 'cancelled'
}

/* -------------------------------------------------------------------------- */
/* Derived selectors (all return primitives — safe as zustand selectors)      */
/* -------------------------------------------------------------------------- */

/**
 * The mascot's mood, derived purely from the run phase:
 *
 *   idle      -> 'idle'      nothing running
 *   starting  -> 'thinking'  request sent / stream open, no tokens yet
 *   streaming -> 'talking'   tokens are arriving
 *   completed -> 'idle'      back to rest
 *   cancelled -> 'idle'      back to rest
 *   error     -> 'error'
 */
export function robotMoodFor(status: RunPhase): RobotMood {
  switch (status) {
    case 'starting':
      return 'thinking'
    case 'streaming':
      return 'talking'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

export const selectRobotMood = (state: RunStateData): RobotMood => robotMoodFor(state.status)

export const selectIsRunning = (state: RunStateData): boolean =>
  state.status === 'starting' || state.status === 'streaming'

/** Wall-clock duration; counts up while running, freezes at `endedAt`. */
export function elapsedMs(state: RunStateData, now: number = Date.now()): number {
  if (state.startedAt === null) return 0
  return (state.endedAt ?? now) - state.startedAt
}

export const selectElapsedMs = (state: RunStateData): number => elapsedMs(state)

export const selectHasOutput = (state: RunStateData): boolean =>
  state.streamedText !== '' || state.finalText !== null

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The in-flight stream's controller. Module-level rather than in state: it is
 * not serializable, no component renders it, and keeping it out of state means
 * `clear()` cannot accidentally strand a live stream.
 */
let controller: AbortController | null = null

/** Test/devtool hook: the controller for the current stream, if any. */
export function activeRunController(): AbortController | null {
  return controller
}

export const useRunStore = create<RunStore>()((set, get) => ({
  ...INITIAL_RUN_STATE,

  handleEvent: (event) => {
    set((state) => reduceRunEvent(state, event))
    // The server has persisted the run row by the time `run_complete` ships.
    if (event.type === 'run_complete') useHistoryStore.getState().invalidate()
  },

  startRun: async (config) => {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal

    set({ ...INITIAL_RUN_STATE, status: 'starting', startedAt: Date.now() })

    try {
      await api.runs.stream(
        { ...config, stream: true },
        { onEvent: (event) => get().handleEvent(event), signal }
      )
      // A well-behaved stream ends with `run_complete`, which already set a
      // terminal phase. Close it out defensively if the server just hung up.
      if (!isTerminalPhase(get().status)) {
        set({ status: 'completed', endedAt: Date.now() })
        useHistoryStore.getState().invalidate()
      }
    } catch (error) {
      if (isAborted(error)) {
        // The server records a disconnected run as `cancelled`, so history is
        // stale here too.
        set({ status: 'cancelled', endedAt: Date.now() })
      } else {
        set({ status: 'error', error: toStoreError(error), endedAt: Date.now() })
      }
      useHistoryStore.getState().invalidate()
    } finally {
      if (controller?.signal === signal) controller = null
    }
  },

  cancelRun: () => {
    controller?.abort()
    controller = null
    // `startRun`'s catch sets `cancelled`; do it here too so a cancel with no
    // live stream (e.g. a stalled request) still leaves a terminal phase.
    if (!isTerminalPhase(get().status) && get().status !== 'idle') {
      set({ status: 'cancelled', endedAt: Date.now() })
    }
  },

  clear: () => set({ ...INITIAL_RUN_STATE })
}))
