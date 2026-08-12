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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { create } from 'zustand';
import { api } from '../api';
import type { RunMetrics, RunRequest, RunStatus as WireRunStatus, RunStreamEvent } from '../api';
import { isAborted, toStoreError, type StoreError } from './errors';
import { useHistoryStore } from './historyStore';

/** Client-side lifecycle. Wider than the server's `RunStatus`. */
export type RunPhase = 'idle' | 'starting' | 'streaming' | 'completed' | 'error' | 'cancelled';

/** What the `RobotGraphic` renders. */
export type RobotMood = 'idle' | 'thinking' | 'talking' | 'error';

/** One tool call, merged from `tool_use_start` + `tool_input_delta`* + `tool_result`. */
export interface ToolEventEntry {
  tool_use_id: string;
  name: string;
  /** Concatenated `tool_input_delta.json` fragments; partial until the result. */
  inputJson: string;
  /** The parsed input echoed back by `tool_result` (authoritative). */
  input?: Record<string, unknown>;
  /** `tool_result.output`. Absent while the call is still running. */
  result?: unknown;
  duration_ms?: number;
  error?: Record<string, unknown> | null;
}

/** A `message` event: the assistant/user turns the engine emitted. */
export interface RunMessage {
  role: string;
  content: unknown[];
}

/** The data half of the store (no actions) — what the reducer operates on. */
export interface RunStateData {
  status: RunPhase;
  runId: string | null;
  /** Echoed by `run_start`; useful before the run row exists in history. */
  modelId: string | null;
  /** Accumulated `text_delta`. */
  streamedText: string;
  /** Accumulated `reasoning_delta`. */
  reasoningText: string;
  /** The authoritative text from `run_complete` (may differ from the deltas). */
  finalText: string | null;
  toolEvents: ToolEventEntry[];
  messages: RunMessage[];
  guardrailTrace: Record<string, unknown> | null;
  metrics: RunMetrics | null;
  error: StoreError | null;
  /** `Date.now()` when `startRun` was called / when the run reached a terminal state. */
  startedAt: number | null;
  endedAt: number | null;
}
export interface RunActions {
  /** POST the run and stream it. Resolves when the stream closes (never throws). */
  startRun(config: RunRequest): Promise<void>;
  /** Abort the in-flight stream. Lands in `cancelled`, not `error`. */
  cancelRun(): void;
  /** Apply one NDJSON event. Safe to call from outside React. */
  handleEvent(event: RunStreamEvent): void;
  /** Back to `idle` with empty panes (does not abort — call `cancelRun` first). */
  clear(): void;
}
export type RunStore = RunStateData & RunActions;
export const INITIAL_RUN_STATE: RunStateData = stryMutAct_9fa48("874") ? {} : (stryCov_9fa48("874"), {
  status: stryMutAct_9fa48("875") ? "" : (stryCov_9fa48("875"), 'idle'),
  runId: null,
  modelId: null,
  streamedText: stryMutAct_9fa48("876") ? "Stryker was here!" : (stryCov_9fa48("876"), ''),
  reasoningText: stryMutAct_9fa48("877") ? "Stryker was here!" : (stryCov_9fa48("877"), ''),
  finalText: null,
  toolEvents: stryMutAct_9fa48("878") ? ["Stryker was here"] : (stryCov_9fa48("878"), []),
  messages: stryMutAct_9fa48("879") ? ["Stryker was here"] : (stryCov_9fa48("879"), []),
  guardrailTrace: null,
  metrics: null,
  error: null,
  startedAt: null,
  endedAt: null
});

/* -------------------------------------------------------------------------- */
/* Pure reducer                                                               */
/* -------------------------------------------------------------------------- */

/** Merge one tool event into the list, keyed by `tool_use_id` (order preserved). */
function mergeToolEvent(toolEvents: ToolEventEntry[], tool_use_id: string, patch: Partial<ToolEventEntry>): ToolEventEntry[] {
  if (stryMutAct_9fa48("880")) {
    {}
  } else {
    stryCov_9fa48("880");
    const index = toolEvents.findIndex(stryMutAct_9fa48("881") ? () => undefined : (stryCov_9fa48("881"), entry => stryMutAct_9fa48("884") ? entry.tool_use_id !== tool_use_id : stryMutAct_9fa48("883") ? false : stryMutAct_9fa48("882") ? true : (stryCov_9fa48("882", "883", "884"), entry.tool_use_id === tool_use_id)));
    if (stryMutAct_9fa48("887") ? index !== -1 : stryMutAct_9fa48("886") ? false : stryMutAct_9fa48("885") ? true : (stryCov_9fa48("885", "886", "887"), index === (stryMutAct_9fa48("888") ? +1 : (stryCov_9fa48("888"), -1)))) {
      if (stryMutAct_9fa48("889")) {
        {}
      } else {
        stryCov_9fa48("889");
        return stryMutAct_9fa48("890") ? [] : (stryCov_9fa48("890"), [...toolEvents, stryMutAct_9fa48("891") ? {} : (stryCov_9fa48("891"), {
          tool_use_id,
          name: stryMutAct_9fa48("892") ? "Stryker was here!" : (stryCov_9fa48("892"), ''),
          inputJson: stryMutAct_9fa48("893") ? "Stryker was here!" : (stryCov_9fa48("893"), ''),
          ...patch
        })]);
      }
    }
    const next = stryMutAct_9fa48("894") ? toolEvents : (stryCov_9fa48("894"), toolEvents.slice());
    next[index] = stryMutAct_9fa48("895") ? {} : (stryCov_9fa48("895"), {
      ...next[index],
      ...patch
    });
    return next;
  }
}

/** Map the server's terminal `RunStatus` onto a client phase. */
export function phaseForWireStatus(status: WireRunStatus | string): RunPhase {
  if (stryMutAct_9fa48("896")) {
    {}
  } else {
    stryCov_9fa48("896");
    if (stryMutAct_9fa48("899") ? status !== 'completed' : stryMutAct_9fa48("898") ? false : stryMutAct_9fa48("897") ? true : (stryCov_9fa48("897", "898", "899"), status === (stryMutAct_9fa48("900") ? "" : (stryCov_9fa48("900"), 'completed')))) return stryMutAct_9fa48("901") ? "" : (stryCov_9fa48("901"), 'completed');
    if (stryMutAct_9fa48("904") ? status !== 'cancelled' : stryMutAct_9fa48("903") ? false : stryMutAct_9fa48("902") ? true : (stryCov_9fa48("902", "903", "904"), status === (stryMutAct_9fa48("905") ? "" : (stryCov_9fa48("905"), 'cancelled')))) return stryMutAct_9fa48("906") ? "" : (stryCov_9fa48("906"), 'cancelled');
    return stryMutAct_9fa48("907") ? "" : (stryCov_9fa48("907"), 'error');
  }
}

/**
 * Apply one `RunStreamEvent` to run state and return the changed keys.
 *
 * Pure: no clocks other than the `now` argument, no cross-store calls. That
 * lives in the `handleEvent` action so tests can replay a whole fixture
 * without side effects.
 */
export function reduceRunEvent(state: RunStateData, event: RunStreamEvent, now: number = Date.now()): Partial<RunStateData> {
  if (stryMutAct_9fa48("908")) {
    {}
  } else {
    stryCov_9fa48("908");
    switch (event.type) {
      case stryMutAct_9fa48("910") ? "" : (stryCov_9fa48("910"), 'run_start'):
        if (stryMutAct_9fa48("909")) {} else {
          stryCov_9fa48("909");
          // Still "thinking": the model has not emitted a token yet.
          return stryMutAct_9fa48("911") ? {} : (stryCov_9fa48("911"), {
            runId: event.run_id,
            modelId: event.model_id,
            status: stryMutAct_9fa48("912") ? "" : (stryCov_9fa48("912"), 'starting')
          });
        }
      case stryMutAct_9fa48("914") ? "" : (stryCov_9fa48("914"), 'text_delta'):
        if (stryMutAct_9fa48("913")) {} else {
          stryCov_9fa48("913");
          return stryMutAct_9fa48("915") ? {} : (stryCov_9fa48("915"), {
            streamedText: stryMutAct_9fa48("916") ? state.streamedText - event.text : (stryCov_9fa48("916"), state.streamedText + event.text),
            status: (stryMutAct_9fa48("919") ? state.status !== 'starting' : stryMutAct_9fa48("918") ? false : stryMutAct_9fa48("917") ? true : (stryCov_9fa48("917", "918", "919"), state.status === (stryMutAct_9fa48("920") ? "" : (stryCov_9fa48("920"), 'starting')))) ? stryMutAct_9fa48("921") ? "" : (stryCov_9fa48("921"), 'streaming') : state.status
          });
        }
      case stryMutAct_9fa48("923") ? "" : (stryCov_9fa48("923"), 'reasoning_delta'):
        if (stryMutAct_9fa48("922")) {} else {
          stryCov_9fa48("922");
          return stryMutAct_9fa48("924") ? {} : (stryCov_9fa48("924"), {
            reasoningText: stryMutAct_9fa48("925") ? state.reasoningText - event.text : (stryCov_9fa48("925"), state.reasoningText + event.text),
            status: (stryMutAct_9fa48("928") ? state.status !== 'starting' : stryMutAct_9fa48("927") ? false : stryMutAct_9fa48("926") ? true : (stryCov_9fa48("926", "927", "928"), state.status === (stryMutAct_9fa48("929") ? "" : (stryCov_9fa48("929"), 'starting')))) ? stryMutAct_9fa48("930") ? "" : (stryCov_9fa48("930"), 'streaming') : state.status
          });
        }
      case stryMutAct_9fa48("932") ? "" : (stryCov_9fa48("932"), 'tool_use_start'):
        if (stryMutAct_9fa48("931")) {} else {
          stryCov_9fa48("931");
          return stryMutAct_9fa48("933") ? {} : (stryCov_9fa48("933"), {
            toolEvents: mergeToolEvent(state.toolEvents, event.tool_use_id, stryMutAct_9fa48("934") ? {} : (stryCov_9fa48("934"), {
              name: event.name
            }))
          });
        }
      case stryMutAct_9fa48("936") ? "" : (stryCov_9fa48("936"), 'tool_input_delta'):
        if (stryMutAct_9fa48("935")) {} else {
          stryCov_9fa48("935");
          {
            if (stryMutAct_9fa48("937")) {
              {}
            } else {
              stryCov_9fa48("937");
              const existing = state.toolEvents.find(stryMutAct_9fa48("938") ? () => undefined : (stryCov_9fa48("938"), e => stryMutAct_9fa48("941") ? e.tool_use_id !== event.tool_use_id : stryMutAct_9fa48("940") ? false : stryMutAct_9fa48("939") ? true : (stryCov_9fa48("939", "940", "941"), e.tool_use_id === event.tool_use_id)));
              return stryMutAct_9fa48("942") ? {} : (stryCov_9fa48("942"), {
                toolEvents: mergeToolEvent(state.toolEvents, event.tool_use_id, stryMutAct_9fa48("943") ? {} : (stryCov_9fa48("943"), {
                  inputJson: stryMutAct_9fa48("944") ? (existing?.inputJson ?? '') - event.json : (stryCov_9fa48("944"), (stryMutAct_9fa48("945") ? existing?.inputJson && '' : (stryCov_9fa48("945"), (stryMutAct_9fa48("946") ? existing.inputJson : (stryCov_9fa48("946"), existing?.inputJson)) ?? (stryMutAct_9fa48("947") ? "Stryker was here!" : (stryCov_9fa48("947"), '')))) + event.json)
                }))
              });
            }
          }
        }
      case stryMutAct_9fa48("949") ? "" : (stryCov_9fa48("949"), 'tool_result'):
        if (stryMutAct_9fa48("948")) {} else {
          stryCov_9fa48("948");
          return stryMutAct_9fa48("950") ? {} : (stryCov_9fa48("950"), {
            toolEvents: mergeToolEvent(state.toolEvents, event.tool_use_id, stryMutAct_9fa48("951") ? {} : (stryCov_9fa48("951"), {
              name: event.name,
              input: event.input,
              result: event.output,
              duration_ms: event.duration_ms,
              error: event.error
            }))
          });
        }
      case stryMutAct_9fa48("953") ? "" : (stryCov_9fa48("953"), 'message'):
        if (stryMutAct_9fa48("952")) {} else {
          stryCov_9fa48("952");
          return stryMutAct_9fa48("954") ? {} : (stryCov_9fa48("954"), {
            messages: stryMutAct_9fa48("955") ? [] : (stryCov_9fa48("955"), [...state.messages, stryMutAct_9fa48("956") ? {} : (stryCov_9fa48("956"), {
              role: event.role,
              content: event.content
            })])
          });
        }
      case stryMutAct_9fa48("958") ? "" : (stryCov_9fa48("958"), 'guardrail_trace'):
        if (stryMutAct_9fa48("957")) {} else {
          stryCov_9fa48("957");
          return stryMutAct_9fa48("959") ? {} : (stryCov_9fa48("959"), {
            guardrailTrace: event.assessment
          });
        }
      case stryMutAct_9fa48("961") ? "" : (stryCov_9fa48("961"), 'metrics'):
        if (stryMutAct_9fa48("960")) {} else {
          stryCov_9fa48("960");
          return stryMutAct_9fa48("962") ? {} : (stryCov_9fa48("962"), {
            metrics: stryMutAct_9fa48("963") ? {} : (stryCov_9fa48("963"), {
              input_tokens: event.input_tokens,
              output_tokens: event.output_tokens,
              total_tokens: event.total_tokens,
              latency_ms: event.latency_ms,
              cycle_count: event.cycle_count
            })
          });
        }
      case stryMutAct_9fa48("965") ? "" : (stryCov_9fa48("965"), 'error'):
        if (stryMutAct_9fa48("964")) {} else {
          stryCov_9fa48("964");
          // In-band failure: HTTP stayed 200. `run_complete` usually follows.
          return stryMutAct_9fa48("966") ? {} : (stryCov_9fa48("966"), {
            status: stryMutAct_9fa48("967") ? "" : (stryCov_9fa48("967"), 'error'),
            error: stryMutAct_9fa48("968") ? {} : (stryCov_9fa48("968"), {
              code: event.code,
              message: event.message
            })
          });
        }
      case stryMutAct_9fa48("970") ? "" : (stryCov_9fa48("970"), 'run_complete'):
        if (stryMutAct_9fa48("969")) {} else {
          stryCov_9fa48("969");
          return stryMutAct_9fa48("971") ? {} : (stryCov_9fa48("971"), {
            runId: event.run_id,
            status: phaseForWireStatus(event.status),
            finalText: event.final_text,
            // Prefer the streamed text when we have it; fall back for non-delta runs.
            streamedText: (stryMutAct_9fa48("974") ? state.streamedText !== '' : stryMutAct_9fa48("973") ? false : stryMutAct_9fa48("972") ? true : (stryCov_9fa48("972", "973", "974"), state.streamedText === (stryMutAct_9fa48("975") ? "Stryker was here!" : (stryCov_9fa48("975"), '')))) ? event.final_text : state.streamedText,
            endedAt: now
          });
        }
      default:
        if (stryMutAct_9fa48("976")) {} else {
          stryCov_9fa48("976");
          return {};
        }
    }
  }
}

/** Terminal phases: the run will produce no further events. */
export function isTerminalPhase(status: RunPhase): boolean {
  if (stryMutAct_9fa48("977")) {
    {}
  } else {
    stryCov_9fa48("977");
    return stryMutAct_9fa48("980") ? (status === 'completed' || status === 'error') && status === 'cancelled' : stryMutAct_9fa48("979") ? false : stryMutAct_9fa48("978") ? true : (stryCov_9fa48("978", "979", "980"), (stryMutAct_9fa48("982") ? status === 'completed' && status === 'error' : stryMutAct_9fa48("981") ? false : (stryCov_9fa48("981", "982"), (stryMutAct_9fa48("984") ? status !== 'completed' : stryMutAct_9fa48("983") ? false : (stryCov_9fa48("983", "984"), status === (stryMutAct_9fa48("985") ? "" : (stryCov_9fa48("985"), 'completed')))) || (stryMutAct_9fa48("987") ? status !== 'error' : stryMutAct_9fa48("986") ? false : (stryCov_9fa48("986", "987"), status === (stryMutAct_9fa48("988") ? "" : (stryCov_9fa48("988"), 'error')))))) || (stryMutAct_9fa48("990") ? status !== 'cancelled' : stryMutAct_9fa48("989") ? false : (stryCov_9fa48("989", "990"), status === (stryMutAct_9fa48("991") ? "" : (stryCov_9fa48("991"), 'cancelled')))));
  }
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
  if (stryMutAct_9fa48("992")) {
    {}
  } else {
    stryCov_9fa48("992");
    switch (status) {
      case stryMutAct_9fa48("994") ? "" : (stryCov_9fa48("994"), 'starting'):
        if (stryMutAct_9fa48("993")) {} else {
          stryCov_9fa48("993");
          return stryMutAct_9fa48("995") ? "" : (stryCov_9fa48("995"), 'thinking');
        }
      case stryMutAct_9fa48("997") ? "" : (stryCov_9fa48("997"), 'streaming'):
        if (stryMutAct_9fa48("996")) {} else {
          stryCov_9fa48("996");
          return stryMutAct_9fa48("998") ? "" : (stryCov_9fa48("998"), 'talking');
        }
      case stryMutAct_9fa48("1000") ? "" : (stryCov_9fa48("1000"), 'error'):
        if (stryMutAct_9fa48("999")) {} else {
          stryCov_9fa48("999");
          return stryMutAct_9fa48("1001") ? "" : (stryCov_9fa48("1001"), 'error');
        }
      default:
        if (stryMutAct_9fa48("1002")) {} else {
          stryCov_9fa48("1002");
          return stryMutAct_9fa48("1003") ? "" : (stryCov_9fa48("1003"), 'idle');
        }
    }
  }
}
export const selectRobotMood = stryMutAct_9fa48("1004") ? () => undefined : (stryCov_9fa48("1004"), (() => {
  const selectRobotMood = (state: RunStateData): RobotMood => robotMoodFor(state.status);
  return selectRobotMood;
})());
export const selectIsRunning = stryMutAct_9fa48("1005") ? () => undefined : (stryCov_9fa48("1005"), (() => {
  const selectIsRunning = (state: RunStateData): boolean => stryMutAct_9fa48("1008") ? state.status === 'starting' && state.status === 'streaming' : stryMutAct_9fa48("1007") ? false : stryMutAct_9fa48("1006") ? true : (stryCov_9fa48("1006", "1007", "1008"), (stryMutAct_9fa48("1010") ? state.status !== 'starting' : stryMutAct_9fa48("1009") ? false : (stryCov_9fa48("1009", "1010"), state.status === (stryMutAct_9fa48("1011") ? "" : (stryCov_9fa48("1011"), 'starting')))) || (stryMutAct_9fa48("1013") ? state.status !== 'streaming' : stryMutAct_9fa48("1012") ? false : (stryCov_9fa48("1012", "1013"), state.status === (stryMutAct_9fa48("1014") ? "" : (stryCov_9fa48("1014"), 'streaming')))));
  return selectIsRunning;
})());

/** Wall-clock duration; counts up while running, freezes at `endedAt`. */
export function elapsedMs(state: RunStateData, now: number = Date.now()): number {
  if (stryMutAct_9fa48("1015")) {
    {}
  } else {
    stryCov_9fa48("1015");
    if (stryMutAct_9fa48("1018") ? state.startedAt !== null : stryMutAct_9fa48("1017") ? false : stryMutAct_9fa48("1016") ? true : (stryCov_9fa48("1016", "1017", "1018"), state.startedAt === null)) return 0;
    return stryMutAct_9fa48("1019") ? (state.endedAt ?? now) + state.startedAt : (stryCov_9fa48("1019"), (stryMutAct_9fa48("1020") ? state.endedAt && now : (stryCov_9fa48("1020"), state.endedAt ?? now)) - state.startedAt);
  }
}
export const selectElapsedMs = stryMutAct_9fa48("1021") ? () => undefined : (stryCov_9fa48("1021"), (() => {
  const selectElapsedMs = (state: RunStateData): number => elapsedMs(state);
  return selectElapsedMs;
})());
export const selectHasOutput = stryMutAct_9fa48("1022") ? () => undefined : (stryCov_9fa48("1022"), (() => {
  const selectHasOutput = (state: RunStateData): boolean => stryMutAct_9fa48("1025") ? state.streamedText !== '' && state.finalText !== null : stryMutAct_9fa48("1024") ? false : stryMutAct_9fa48("1023") ? true : (stryCov_9fa48("1023", "1024", "1025"), (stryMutAct_9fa48("1027") ? state.streamedText === '' : stryMutAct_9fa48("1026") ? false : (stryCov_9fa48("1026", "1027"), state.streamedText !== (stryMutAct_9fa48("1028") ? "Stryker was here!" : (stryCov_9fa48("1028"), '')))) || (stryMutAct_9fa48("1030") ? state.finalText === null : stryMutAct_9fa48("1029") ? false : (stryCov_9fa48("1029", "1030"), state.finalText !== null)));
  return selectHasOutput;
})());

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The in-flight stream's controller. Module-level rather than in state: it is
 * not serializable, no component renders it, and keeping it out of state means
 * `clear()` cannot accidentally strand a live stream.
 */
let controller: AbortController | null = null;

/** Test/devtool hook: the controller for the current stream, if any. */
export function activeRunController(): AbortController | null {
  if (stryMutAct_9fa48("1031")) {
    {}
  } else {
    stryCov_9fa48("1031");
    return controller;
  }
}
export const useRunStore = create<RunStore>()(stryMutAct_9fa48("1032") ? () => undefined : (stryCov_9fa48("1032"), (set, get) => stryMutAct_9fa48("1033") ? {} : (stryCov_9fa48("1033"), {
  ...INITIAL_RUN_STATE,
  handleEvent: event => {
    if (stryMutAct_9fa48("1034")) {
      {}
    } else {
      stryCov_9fa48("1034");
      set(stryMutAct_9fa48("1035") ? () => undefined : (stryCov_9fa48("1035"), state => reduceRunEvent(state, event)));
      // The server has persisted the run row by the time `run_complete` ships.
      if (stryMutAct_9fa48("1038") ? event.type !== 'run_complete' : stryMutAct_9fa48("1037") ? false : stryMutAct_9fa48("1036") ? true : (stryCov_9fa48("1036", "1037", "1038"), event.type === (stryMutAct_9fa48("1039") ? "" : (stryCov_9fa48("1039"), 'run_complete')))) useHistoryStore.getState().invalidate();
    }
  },
  startRun: async config => {
    if (stryMutAct_9fa48("1040")) {
      {}
    } else {
      stryCov_9fa48("1040");
      stryMutAct_9fa48("1041") ? controller.abort() : (stryCov_9fa48("1041"), controller?.abort());
      controller = new AbortController();
      const signal = controller.signal;
      set(stryMutAct_9fa48("1042") ? {} : (stryCov_9fa48("1042"), {
        ...INITIAL_RUN_STATE,
        status: stryMutAct_9fa48("1043") ? "" : (stryCov_9fa48("1043"), 'starting'),
        startedAt: Date.now()
      }));
      try {
        if (stryMutAct_9fa48("1044")) {
          {}
        } else {
          stryCov_9fa48("1044");
          await api.runs.stream(stryMutAct_9fa48("1045") ? {} : (stryCov_9fa48("1045"), {
            ...config,
            stream: stryMutAct_9fa48("1046") ? false : (stryCov_9fa48("1046"), true)
          }), stryMutAct_9fa48("1047") ? {} : (stryCov_9fa48("1047"), {
            onEvent: stryMutAct_9fa48("1048") ? () => undefined : (stryCov_9fa48("1048"), event => get().handleEvent(event)),
            signal
          }));
          // A well-behaved stream ends with `run_complete`, which already set a
          // terminal phase. Close it out defensively if the server just hung up.
          if (stryMutAct_9fa48("1051") ? false : stryMutAct_9fa48("1050") ? true : stryMutAct_9fa48("1049") ? isTerminalPhase(get().status) : (stryCov_9fa48("1049", "1050", "1051"), !isTerminalPhase(get().status))) {
            if (stryMutAct_9fa48("1052")) {
              {}
            } else {
              stryCov_9fa48("1052");
              set(stryMutAct_9fa48("1053") ? {} : (stryCov_9fa48("1053"), {
                status: stryMutAct_9fa48("1054") ? "" : (stryCov_9fa48("1054"), 'completed'),
                endedAt: Date.now()
              }));
              useHistoryStore.getState().invalidate();
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("1055")) {
          {}
        } else {
          stryCov_9fa48("1055");
          if (stryMutAct_9fa48("1057") ? false : stryMutAct_9fa48("1056") ? true : (stryCov_9fa48("1056", "1057"), isAborted(error))) {
            if (stryMutAct_9fa48("1058")) {
              {}
            } else {
              stryCov_9fa48("1058");
              // The server records a disconnected run as `cancelled`, so history is
              // stale here too.
              set(stryMutAct_9fa48("1059") ? {} : (stryCov_9fa48("1059"), {
                status: stryMutAct_9fa48("1060") ? "" : (stryCov_9fa48("1060"), 'cancelled'),
                endedAt: Date.now()
              }));
            }
          } else {
            if (stryMutAct_9fa48("1061")) {
              {}
            } else {
              stryCov_9fa48("1061");
              set(stryMutAct_9fa48("1062") ? {} : (stryCov_9fa48("1062"), {
                status: stryMutAct_9fa48("1063") ? "" : (stryCov_9fa48("1063"), 'error'),
                error: toStoreError(error),
                endedAt: Date.now()
              }));
            }
          }
          useHistoryStore.getState().invalidate();
        }
      } finally {
        if (stryMutAct_9fa48("1064")) {
          {}
        } else {
          stryCov_9fa48("1064");
          if (stryMutAct_9fa48("1067") ? controller?.signal !== signal : stryMutAct_9fa48("1066") ? false : stryMutAct_9fa48("1065") ? true : (stryCov_9fa48("1065", "1066", "1067"), (stryMutAct_9fa48("1068") ? controller.signal : (stryCov_9fa48("1068"), controller?.signal)) === signal)) controller = null;
        }
      }
    }
  },
  cancelRun: () => {
    if (stryMutAct_9fa48("1069")) {
      {}
    } else {
      stryCov_9fa48("1069");
      stryMutAct_9fa48("1070") ? controller.abort() : (stryCov_9fa48("1070"), controller?.abort());
      controller = null;
      // `startRun`'s catch sets `cancelled`; do it here too so a cancel with no
      // live stream (e.g. a stalled request) still leaves a terminal phase.
      if (stryMutAct_9fa48("1073") ? !isTerminalPhase(get().status) || get().status !== 'idle' : stryMutAct_9fa48("1072") ? false : stryMutAct_9fa48("1071") ? true : (stryCov_9fa48("1071", "1072", "1073"), (stryMutAct_9fa48("1074") ? isTerminalPhase(get().status) : (stryCov_9fa48("1074"), !isTerminalPhase(get().status))) && (stryMutAct_9fa48("1076") ? get().status === 'idle' : stryMutAct_9fa48("1075") ? true : (stryCov_9fa48("1075", "1076"), get().status !== (stryMutAct_9fa48("1077") ? "" : (stryCov_9fa48("1077"), 'idle')))))) {
        if (stryMutAct_9fa48("1078")) {
          {}
        } else {
          stryCov_9fa48("1078");
          set(stryMutAct_9fa48("1079") ? {} : (stryCov_9fa48("1079"), {
            status: stryMutAct_9fa48("1080") ? "" : (stryCov_9fa48("1080"), 'cancelled'),
            endedAt: Date.now()
          }));
        }
      }
    }
  },
  clear: stryMutAct_9fa48("1081") ? () => undefined : (stryCov_9fa48("1081"), () => set(stryMutAct_9fa48("1082") ? {} : (stryCov_9fa48("1082"), {
    ...INITIAL_RUN_STATE
  })))
})));