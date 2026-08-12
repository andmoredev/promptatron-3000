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
import type { EvalStreamEvent, EvaluationDetail, EvaluationListParams, EvaluationRequest, EvaluationResult, Page } from '../api';
import { isAborted, toStoreError, type StoreError } from './errors';
import { useHistoryStore } from './historyStore';

/** Client-side lifecycle of the followed evaluation. */
export type EvalPhase = 'idle' | 'starting' | 'running' | 'grading' | 'completed' | 'error' | 'cancelled';

/** Run counters for the progress bar. `total` is the planned run count. */
export interface EvalProgress {
  completed: number;
  failed: number;
  total: number;
}
export const EMPTY_PROGRESS: EvalProgress = stryMutAct_9fa48("226") ? {} : (stryCov_9fa48("226"), {
  completed: 0,
  failed: 0,
  total: 0
});
export interface EvalStateData {
  /* --- active evaluation --------------------------------------------------- */
  activeEvaluationId: string | null;
  /** The row as last fetched (`create`/`get`); the stream is the live view. */
  activeEvaluation: EvaluationDetail | null;
  status: EvalPhase;
  /** The replayed/live event log, in order. */
  events: EvalStreamEvent[];
  progress: EvalProgress;
  result: EvaluationResult | null;
  error: StoreError | null;

  /* --- list ---------------------------------------------------------------- */
  evaluations: EvaluationDetail[];
  nextCursor: string | null;
  listLoading: boolean;
  listError: StoreError | null;
  listLoaded: boolean;
  /**
   * The filters `loadEvaluations` was last called with (including
   * `execution`), so `loadMoreEvaluations` can carry them onto the next page
   * — a cursor is only valid for the filter set it was issued under.
   */
  listParams: EvaluationListParams;
}
export interface EvalActions {
  /** `POST /evaluations`, then follow its event stream. Never throws. */
  startEvaluation(request: EvaluationRequest): Promise<string | null>;
  /** Attach to a running *or finished* evaluation (the log replays). */
  followEvaluation(evaluationId: string): Promise<void>;
  /** `DELETE /evaluations/{id}` and detach. A finished eval is a no-op. */
  cancelEvaluation(): Promise<void>;
  /** Apply one event. Safe to call from outside React. */
  handleEvent(event: EvalStreamEvent): void;
  /** Detach from the stream and reset the active-evaluation half. */
  clearActive(): void;

  /** `GET /evaluations` page 1 (replaces the list). */
  loadEvaluations(params?: EvaluationListParams): Promise<void>;
  /** Next page, appended. No-op without a cursor. */
  loadMoreEvaluations(): Promise<void>;
  /** `GET /evaluations/{id}` — refreshes the row in the list and, if it is the
   *  active one, `activeEvaluation`. */
  refreshEvaluation(evaluationId: string): Promise<EvaluationDetail | null>;
}
export type EvalStore = EvalStateData & EvalActions;
export const INITIAL_EVAL_STATE: EvalStateData = stryMutAct_9fa48("227") ? {} : (stryCov_9fa48("227"), {
  activeEvaluationId: null,
  activeEvaluation: null,
  status: stryMutAct_9fa48("228") ? "" : (stryCov_9fa48("228"), 'idle'),
  events: stryMutAct_9fa48("229") ? ["Stryker was here"] : (stryCov_9fa48("229"), []),
  progress: EMPTY_PROGRESS,
  result: null,
  error: null,
  evaluations: stryMutAct_9fa48("230") ? ["Stryker was here"] : (stryCov_9fa48("230"), []),
  nextCursor: null,
  listLoading: stryMutAct_9fa48("231") ? true : (stryCov_9fa48("231"), false),
  listError: null,
  listLoaded: stryMutAct_9fa48("232") ? true : (stryCov_9fa48("232"), false),
  listParams: {}
});

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
export function computeProgress(events: EvalStreamEvent[], fallbackTotal = 0): EvalProgress {
  if (stryMutAct_9fa48("233")) {
    {}
  } else {
    stryCov_9fa48("233");
    let completed = 0;
    let failed = 0;
    let total = fallbackTotal;
    for (const event of events) {
      if (stryMutAct_9fa48("234")) {
        {}
      } else {
        stryCov_9fa48("234");
        if (stryMutAct_9fa48("237") ? event.type !== 'eval_start' : stryMutAct_9fa48("236") ? false : stryMutAct_9fa48("235") ? true : (stryCov_9fa48("235", "236", "237"), event.type === (stryMutAct_9fa48("238") ? "" : (stryCov_9fa48("238"), 'eval_start')))) total = event.n;else if (stryMutAct_9fa48("241") ? event.type !== 'run_completed' : stryMutAct_9fa48("240") ? false : stryMutAct_9fa48("239") ? true : (stryCov_9fa48("239", "240", "241"), event.type === (stryMutAct_9fa48("242") ? "" : (stryCov_9fa48("242"), 'run_completed')))) stryMutAct_9fa48("243") ? completed -= 1 : (stryCov_9fa48("243"), completed += 1);else if (stryMutAct_9fa48("246") ? event.type !== 'run_failed' : stryMutAct_9fa48("245") ? false : stryMutAct_9fa48("244") ? true : (stryCov_9fa48("244", "245", "246"), event.type === (stryMutAct_9fa48("247") ? "" : (stryCov_9fa48("247"), 'run_failed')))) stryMutAct_9fa48("248") ? failed -= 1 : (stryCov_9fa48("248"), failed += 1);
      }
    }
    return stryMutAct_9fa48("249") ? {} : (stryCov_9fa48("249"), {
      completed,
      failed,
      total
    });
  }
}

/** Map an `eval_complete.status` onto a client phase. */
export function phaseForEvalStatus(status: string): EvalPhase {
  if (stryMutAct_9fa48("250")) {
    {}
  } else {
    stryCov_9fa48("250");
    if (stryMutAct_9fa48("253") ? status !== 'completed' : stryMutAct_9fa48("252") ? false : stryMutAct_9fa48("251") ? true : (stryCov_9fa48("251", "252", "253"), status === (stryMutAct_9fa48("254") ? "" : (stryCov_9fa48("254"), 'completed')))) return stryMutAct_9fa48("255") ? "" : (stryCov_9fa48("255"), 'completed');
    if (stryMutAct_9fa48("258") ? status !== 'cancelled' : stryMutAct_9fa48("257") ? false : stryMutAct_9fa48("256") ? true : (stryCov_9fa48("256", "257", "258"), status === (stryMutAct_9fa48("259") ? "" : (stryCov_9fa48("259"), 'cancelled')))) return stryMutAct_9fa48("260") ? "" : (stryCov_9fa48("260"), 'cancelled');
    return stryMutAct_9fa48("261") ? "" : (stryCov_9fa48("261"), 'error');
  }
}

/**
 * Apply one `EvalStreamEvent`. Pure — no clocks, no cross-store calls (that
 * lives in the `handleEvent` action).
 */
export function reduceEvalEvent(state: EvalStateData, event: EvalStreamEvent): Partial<EvalStateData> {
  if (stryMutAct_9fa48("262")) {
    {}
  } else {
    stryCov_9fa48("262");
    const events = stryMutAct_9fa48("263") ? [] : (stryCov_9fa48("263"), [...state.events, event]);
    const patch: Partial<EvalStateData> = stryMutAct_9fa48("264") ? {} : (stryCov_9fa48("264"), {
      events,
      progress: computeProgress(events, state.progress.total)
    });
    switch (event.type) {
      case stryMutAct_9fa48("266") ? "" : (stryCov_9fa48("266"), 'eval_start'):
        if (stryMutAct_9fa48("265")) {} else {
          stryCov_9fa48("265");
          patch.activeEvaluationId = event.evaluation_id;
          patch.status = stryMutAct_9fa48("267") ? "" : (stryCov_9fa48("267"), 'running');
          break;
        }
      case stryMutAct_9fa48("269") ? "" : (stryCov_9fa48("269"), 'grading_started'):
        if (stryMutAct_9fa48("268")) {} else {
          stryCov_9fa48("268");
          patch.status = stryMutAct_9fa48("270") ? "" : (stryCov_9fa48("270"), 'grading');
          break;
        }
      case stryMutAct_9fa48("272") ? "" : (stryCov_9fa48("272"), 'grading_completed'):
        if (stryMutAct_9fa48("271")) {} else {
          stryCov_9fa48("271");
          patch.result = event.result;
          break;
        }
      case stryMutAct_9fa48("274") ? "" : (stryCov_9fa48("274"), 'run_failed'):
        if (stryMutAct_9fa48("273")) {} else {
          stryCov_9fa48("273");
          // Individual run failures do not fail the evaluation; the result carries
          // them in `failed_runs`. Only `eval_complete` decides the final status.
          break;
        }
      case stryMutAct_9fa48("276") ? "" : (stryCov_9fa48("276"), 'eval_complete'):
        if (stryMutAct_9fa48("275")) {} else {
          stryCov_9fa48("275");
          patch.status = phaseForEvalStatus(event.status);
          if (stryMutAct_9fa48("278") ? false : stryMutAct_9fa48("277") ? true : (stryCov_9fa48("277", "278"), event.result)) patch.result = event.result;
          break;
        }
      default:
        if (stryMutAct_9fa48("279")) {} else {
          stryCov_9fa48("279");
          break;
        }
    }
    return patch;
  }
}

/* -------------------------------------------------------------------------- */
/* Derived selectors (primitives only)                                        */
/* -------------------------------------------------------------------------- */

export const selectIsEvaluating = stryMutAct_9fa48("280") ? () => undefined : (stryCov_9fa48("280"), (() => {
  const selectIsEvaluating = (state: EvalStateData): boolean => stryMutAct_9fa48("283") ? (state.status === 'starting' || state.status === 'running') && state.status === 'grading' : stryMutAct_9fa48("282") ? false : stryMutAct_9fa48("281") ? true : (stryCov_9fa48("281", "282", "283"), (stryMutAct_9fa48("285") ? state.status === 'starting' && state.status === 'running' : stryMutAct_9fa48("284") ? false : (stryCov_9fa48("284", "285"), (stryMutAct_9fa48("287") ? state.status !== 'starting' : stryMutAct_9fa48("286") ? false : (stryCov_9fa48("286", "287"), state.status === (stryMutAct_9fa48("288") ? "" : (stryCov_9fa48("288"), 'starting')))) || (stryMutAct_9fa48("290") ? state.status !== 'running' : stryMutAct_9fa48("289") ? false : (stryCov_9fa48("289", "290"), state.status === (stryMutAct_9fa48("291") ? "" : (stryCov_9fa48("291"), 'running')))))) || (stryMutAct_9fa48("293") ? state.status !== 'grading' : stryMutAct_9fa48("292") ? false : (stryCov_9fa48("292", "293"), state.status === (stryMutAct_9fa48("294") ? "" : (stryCov_9fa48("294"), 'grading')))));
  return selectIsEvaluating;
})());

/** 0 – 1; counts failures as finished work. `0` when the total is unknown. */
export function progressFraction(progress: EvalProgress): number {
  if (stryMutAct_9fa48("295")) {
    {}
  } else {
    stryCov_9fa48("295");
    if (stryMutAct_9fa48("299") ? progress.total > 0 : stryMutAct_9fa48("298") ? progress.total < 0 : stryMutAct_9fa48("297") ? false : stryMutAct_9fa48("296") ? true : (stryCov_9fa48("296", "297", "298", "299"), progress.total <= 0)) return 0;
    return stryMutAct_9fa48("300") ? Math.max(1, (progress.completed + progress.failed) / progress.total) : (stryCov_9fa48("300"), Math.min(1, stryMutAct_9fa48("301") ? (progress.completed + progress.failed) * progress.total : (stryCov_9fa48("301"), (stryMutAct_9fa48("302") ? progress.completed - progress.failed : (stryCov_9fa48("302"), progress.completed + progress.failed)) / progress.total)));
  }
}
export const selectProgressFraction = stryMutAct_9fa48("303") ? () => undefined : (stryCov_9fa48("303"), (() => {
  const selectProgressFraction = (state: EvalStateData): number => progressFraction(state.progress);
  return selectProgressFraction;
})());

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

/** Controller for the active event subscription (not serializable → module scope). */
let controller: AbortController | null = null;

/** Test/devtool hook: the controller for the current subscription, if any. */
export function activeEvalController(): AbortController | null {
  if (stryMutAct_9fa48("304")) {
    {}
  } else {
    stryCov_9fa48("304");
    return controller;
  }
}
export const useEvalStore = create<EvalStore>()(stryMutAct_9fa48("305") ? () => undefined : (stryCov_9fa48("305"), (set, get) => stryMutAct_9fa48("306") ? {} : (stryCov_9fa48("306"), {
  ...INITIAL_EVAL_STATE,
  handleEvent: event => {
    if (stryMutAct_9fa48("307")) {
      {}
    } else {
      stryCov_9fa48("307");
      set(stryMutAct_9fa48("308") ? () => undefined : (stryCov_9fa48("308"), state => reduceEvalEvent(state, event)));
      // A determinism evaluation persists one run row per iteration.
      if (stryMutAct_9fa48("311") ? event.type !== 'eval_complete' : stryMutAct_9fa48("310") ? false : stryMutAct_9fa48("309") ? true : (stryCov_9fa48("309", "310", "311"), event.type === (stryMutAct_9fa48("312") ? "" : (stryCov_9fa48("312"), 'eval_complete')))) useHistoryStore.getState().invalidate();
    }
  },
  startEvaluation: async request => {
    if (stryMutAct_9fa48("313")) {
      {}
    } else {
      stryCov_9fa48("313");
      stryMutAct_9fa48("314") ? controller.abort() : (stryCov_9fa48("314"), controller?.abort());
      controller = null;
      set(stryMutAct_9fa48("315") ? {} : (stryCov_9fa48("315"), {
        ...INITIAL_EVAL_STATE,
        evaluations: get().evaluations,
        nextCursor: get().nextCursor,
        listLoaded: get().listLoaded,
        status: stryMutAct_9fa48("316") ? "" : (stryCov_9fa48("316"), 'starting')
      }));
      let created: EvaluationDetail;
      try {
        if (stryMutAct_9fa48("317")) {
          {}
        } else {
          stryCov_9fa48("317");
          created = await api.evaluations.create(request);
        }
      } catch (error) {
        if (stryMutAct_9fa48("318")) {
          {}
        } else {
          stryCov_9fa48("318");
          set(stryMutAct_9fa48("319") ? {} : (stryCov_9fa48("319"), {
            status: stryMutAct_9fa48("320") ? "" : (stryCov_9fa48("320"), 'error'),
            error: toStoreError(error)
          }));
          return null;
        }
      }
      set(stryMutAct_9fa48("321") ? () => undefined : (stryCov_9fa48("321"), state => stryMutAct_9fa48("322") ? {} : (stryCov_9fa48("322"), {
        activeEvaluationId: created.id,
        activeEvaluation: created,
        // Show the planned run count before `eval_start` arrives.
        progress: stryMutAct_9fa48("323") ? {} : (stryCov_9fa48("323"), {
          ...state.progress,
          total: stryMutAct_9fa48("324") ? created.config?.n && 0 : (stryCov_9fa48("324"), (stryMutAct_9fa48("325") ? created.config.n : (stryCov_9fa48("325"), created.config?.n)) ?? 0)
        }),
        // Newest first, matching the list endpoint's ordering.
        evaluations: stryMutAct_9fa48("326") ? [] : (stryCov_9fa48("326"), [created, ...(stryMutAct_9fa48("327") ? state.evaluations : (stryCov_9fa48("327"), state.evaluations.filter(stryMutAct_9fa48("328") ? () => undefined : (stryCov_9fa48("328"), row => stryMutAct_9fa48("331") ? row.id === created.id : stryMutAct_9fa48("330") ? false : stryMutAct_9fa48("329") ? true : (stryCov_9fa48("329", "330", "331"), row.id !== created.id)))))])
      })));
      await get().followEvaluation(created.id);
      return created.id;
    }
  },
  followEvaluation: async evaluationId => {
    if (stryMutAct_9fa48("332")) {
      {}
    } else {
      stryCov_9fa48("332");
      stryMutAct_9fa48("333") ? controller.abort() : (stryCov_9fa48("333"), controller?.abort());
      controller = new AbortController();
      const signal = controller.signal;

      // The server replays the whole log, so start from an empty one.
      set(stryMutAct_9fa48("334") ? () => undefined : (stryCov_9fa48("334"), state => stryMutAct_9fa48("335") ? {} : (stryCov_9fa48("335"), {
        activeEvaluationId: evaluationId,
        events: stryMutAct_9fa48("336") ? ["Stryker was here"] : (stryCov_9fa48("336"), []),
        result: null,
        error: null,
        progress: stryMutAct_9fa48("337") ? {} : (stryCov_9fa48("337"), {
          completed: 0,
          failed: 0,
          total: (stryMutAct_9fa48("340") ? state.activeEvaluationId !== evaluationId : stryMutAct_9fa48("339") ? false : stryMutAct_9fa48("338") ? true : (stryCov_9fa48("338", "339", "340"), state.activeEvaluationId === evaluationId)) ? state.progress.total : 0
        }),
        status: (stryMutAct_9fa48("343") ? state.status !== 'starting' : stryMutAct_9fa48("342") ? false : stryMutAct_9fa48("341") ? true : (stryCov_9fa48("341", "342", "343"), state.status === (stryMutAct_9fa48("344") ? "" : (stryCov_9fa48("344"), 'starting')))) ? stryMutAct_9fa48("345") ? "" : (stryCov_9fa48("345"), 'starting') : stryMutAct_9fa48("346") ? "" : (stryCov_9fa48("346"), 'running')
      })));
      try {
        if (stryMutAct_9fa48("347")) {
          {}
        } else {
          stryCov_9fa48("347");
          await api.evaluations.events(evaluationId, stryMutAct_9fa48("348") ? {} : (stryCov_9fa48("348"), {
            onEvent: stryMutAct_9fa48("349") ? () => undefined : (stryCov_9fa48("349"), event => get().handleEvent(event)),
            signal
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("350")) {
          {}
        } else {
          stryCov_9fa48("350");
          if (stryMutAct_9fa48("352") ? false : stryMutAct_9fa48("351") ? true : (stryCov_9fa48("351", "352"), isAborted(error))) {
            if (stryMutAct_9fa48("353")) {
              {}
            } else {
              stryCov_9fa48("353");
              // Detaching is not a failure: the job keeps running server-side.
              return;
            }
          }
          set(stryMutAct_9fa48("354") ? {} : (stryCov_9fa48("354"), {
            status: stryMutAct_9fa48("355") ? "" : (stryCov_9fa48("355"), 'error'),
            error: toStoreError(error)
          }));
        }
      } finally {
        if (stryMutAct_9fa48("356")) {
          {}
        } else {
          stryCov_9fa48("356");
          if (stryMutAct_9fa48("359") ? controller?.signal !== signal : stryMutAct_9fa48("358") ? false : stryMutAct_9fa48("357") ? true : (stryCov_9fa48("357", "358", "359"), (stryMutAct_9fa48("360") ? controller.signal : (stryCov_9fa48("360"), controller?.signal)) === signal)) controller = null;
        }
      }
    }
  },
  cancelEvaluation: async () => {
    if (stryMutAct_9fa48("361")) {
      {}
    } else {
      stryCov_9fa48("361");
      const evaluationId = get().activeEvaluationId;
      stryMutAct_9fa48("362") ? controller.abort() : (stryCov_9fa48("362"), controller?.abort());
      controller = null;
      if (stryMutAct_9fa48("365") ? false : stryMutAct_9fa48("364") ? true : stryMutAct_9fa48("363") ? evaluationId : (stryCov_9fa48("363", "364", "365"), !evaluationId)) {
        if (stryMutAct_9fa48("366")) {
          {}
        } else {
          stryCov_9fa48("366");
          set(stryMutAct_9fa48("367") ? {} : (stryCov_9fa48("367"), {
            status: stryMutAct_9fa48("368") ? "" : (stryCov_9fa48("368"), 'cancelled')
          }));
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("369")) {
          {}
        } else {
          stryCov_9fa48("369");
          await api.evaluations.cancel(evaluationId);
          set(stryMutAct_9fa48("370") ? {} : (stryCov_9fa48("370"), {
            status: stryMutAct_9fa48("371") ? "" : (stryCov_9fa48("371"), 'cancelled')
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("372")) {
          {}
        } else {
          stryCov_9fa48("372");
          // 409 `conflict` = it already finished; keep whatever status we have.
          const stored = toStoreError(error);
          if (stryMutAct_9fa48("375") ? stored.code !== 'conflict' : stryMutAct_9fa48("374") ? false : stryMutAct_9fa48("373") ? true : (stryCov_9fa48("373", "374", "375"), stored.code === (stryMutAct_9fa48("376") ? "" : (stryCov_9fa48("376"), 'conflict')))) return;
          set(stryMutAct_9fa48("377") ? {} : (stryCov_9fa48("377"), {
            status: stryMutAct_9fa48("378") ? "" : (stryCov_9fa48("378"), 'cancelled'),
            error: stored
          }));
        }
      }
    }
  },
  clearActive: () => {
    if (stryMutAct_9fa48("379")) {
      {}
    } else {
      stryCov_9fa48("379");
      stryMutAct_9fa48("380") ? controller.abort() : (stryCov_9fa48("380"), controller?.abort());
      controller = null;
      set(stryMutAct_9fa48("381") ? {} : (stryCov_9fa48("381"), {
        activeEvaluationId: null,
        activeEvaluation: null,
        status: stryMutAct_9fa48("382") ? "" : (stryCov_9fa48("382"), 'idle'),
        events: stryMutAct_9fa48("383") ? ["Stryker was here"] : (stryCov_9fa48("383"), []),
        progress: EMPTY_PROGRESS,
        result: null,
        error: null
      }));
    }
  },
  loadEvaluations: async (params = {}) => {
    if (stryMutAct_9fa48("384")) {
      {}
    } else {
      stryCov_9fa48("384");
      set(stryMutAct_9fa48("385") ? {} : (stryCov_9fa48("385"), {
        listLoading: stryMutAct_9fa48("386") ? false : (stryCov_9fa48("386"), true),
        listError: null,
        listParams: params
      }));
      try {
        if (stryMutAct_9fa48("387")) {
          {}
        } else {
          stryCov_9fa48("387");
          const page: Page<EvaluationDetail> = await api.evaluations.list(params);
          set(stryMutAct_9fa48("388") ? {} : (stryCov_9fa48("388"), {
            evaluations: page.items,
            nextCursor: page.next_cursor,
            listLoading: stryMutAct_9fa48("389") ? true : (stryCov_9fa48("389"), false),
            listLoaded: stryMutAct_9fa48("390") ? false : (stryCov_9fa48("390"), true)
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("391")) {
          {}
        } else {
          stryCov_9fa48("391");
          if (stryMutAct_9fa48("393") ? false : stryMutAct_9fa48("392") ? true : (stryCov_9fa48("392", "393"), isAborted(error))) {
            if (stryMutAct_9fa48("394")) {
              {}
            } else {
              stryCov_9fa48("394");
              set(stryMutAct_9fa48("395") ? {} : (stryCov_9fa48("395"), {
                listLoading: stryMutAct_9fa48("396") ? true : (stryCov_9fa48("396"), false)
              }));
              return;
            }
          }
          set(stryMutAct_9fa48("397") ? {} : (stryCov_9fa48("397"), {
            listLoading: stryMutAct_9fa48("398") ? true : (stryCov_9fa48("398"), false),
            listError: toStoreError(error)
          }));
        }
      }
    }
  },
  loadMoreEvaluations: async () => {
    if (stryMutAct_9fa48("399")) {
      {}
    } else {
      stryCov_9fa48("399");
      const {
        nextCursor,
        listLoading,
        listParams
      } = get();
      if (stryMutAct_9fa48("402") ? !nextCursor && listLoading : stryMutAct_9fa48("401") ? false : stryMutAct_9fa48("400") ? true : (stryCov_9fa48("400", "401", "402"), (stryMutAct_9fa48("403") ? nextCursor : (stryCov_9fa48("403"), !nextCursor)) || listLoading)) return;
      set(stryMutAct_9fa48("404") ? {} : (stryCov_9fa48("404"), {
        listLoading: stryMutAct_9fa48("405") ? false : (stryCov_9fa48("405"), true),
        listError: null
      }));
      try {
        if (stryMutAct_9fa48("406")) {
          {}
        } else {
          stryCov_9fa48("406");
          const page: Page<EvaluationDetail> = await api.evaluations.list(stryMutAct_9fa48("407") ? {} : (stryCov_9fa48("407"), {
            ...listParams,
            cursor: nextCursor
          }));
          set(stryMutAct_9fa48("408") ? () => undefined : (stryCov_9fa48("408"), state => stryMutAct_9fa48("409") ? {} : (stryCov_9fa48("409"), {
            evaluations: stryMutAct_9fa48("410") ? [] : (stryCov_9fa48("410"), [...state.evaluations, ...page.items]),
            nextCursor: page.next_cursor,
            listLoading: stryMutAct_9fa48("411") ? true : (stryCov_9fa48("411"), false)
          })));
        }
      } catch (error) {
        if (stryMutAct_9fa48("412")) {
          {}
        } else {
          stryCov_9fa48("412");
          if (stryMutAct_9fa48("414") ? false : stryMutAct_9fa48("413") ? true : (stryCov_9fa48("413", "414"), isAborted(error))) {
            if (stryMutAct_9fa48("415")) {
              {}
            } else {
              stryCov_9fa48("415");
              set(stryMutAct_9fa48("416") ? {} : (stryCov_9fa48("416"), {
                listLoading: stryMutAct_9fa48("417") ? true : (stryCov_9fa48("417"), false)
              }));
              return;
            }
          }
          set(stryMutAct_9fa48("418") ? {} : (stryCov_9fa48("418"), {
            listLoading: stryMutAct_9fa48("419") ? true : (stryCov_9fa48("419"), false),
            listError: toStoreError(error)
          }));
        }
      }
    }
  },
  refreshEvaluation: async evaluationId => {
    if (stryMutAct_9fa48("420")) {
      {}
    } else {
      stryCov_9fa48("420");
      try {
        if (stryMutAct_9fa48("421")) {
          {}
        } else {
          stryCov_9fa48("421");
          const detail = await api.evaluations.get(evaluationId);
          set(stryMutAct_9fa48("422") ? () => undefined : (stryCov_9fa48("422"), state => stryMutAct_9fa48("423") ? {} : (stryCov_9fa48("423"), {
            evaluations: state.evaluations.map(stryMutAct_9fa48("424") ? () => undefined : (stryCov_9fa48("424"), row => (stryMutAct_9fa48("427") ? row.id !== detail.id : stryMutAct_9fa48("426") ? false : stryMutAct_9fa48("425") ? true : (stryCov_9fa48("425", "426", "427"), row.id === detail.id)) ? detail : row)),
            activeEvaluation: (stryMutAct_9fa48("430") ? state.activeEvaluationId !== detail.id : stryMutAct_9fa48("429") ? false : stryMutAct_9fa48("428") ? true : (stryCov_9fa48("428", "429", "430"), state.activeEvaluationId === detail.id)) ? detail : state.activeEvaluation
          })));
          return detail;
        }
      } catch (error) {
        if (stryMutAct_9fa48("431")) {
          {}
        } else {
          stryCov_9fa48("431");
          if (stryMutAct_9fa48("434") ? false : stryMutAct_9fa48("433") ? true : stryMutAct_9fa48("432") ? isAborted(error) : (stryCov_9fa48("432", "433", "434"), !isAborted(error))) set(stryMutAct_9fa48("435") ? {} : (stryCov_9fa48("435"), {
            listError: toStoreError(error)
          }));
          return null;
        }
      }
    }
  }
})));