/**
 * UI preferences. Nothing here is sent to the server — it only shapes what the
 * app renders and what it pre-fills forms with.
 *
 * Persisted to localStorage under `promptatron.settings.v1`.
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
import { persist } from 'zustand/middleware';

/** localStorage key. Bump the suffix when the shape changes incompatibly. */
export const SETTINGS_STORAGE_KEY = stryMutAct_9fa48("1280") ? "" : (stryCov_9fa48("1280"), 'promptatron.settings.v1');
export type ThemePreference = 'light' | 'dark' | 'system';

/** The default judge model for new evaluations. */
export const DEFAULT_GRADER_MODEL_ID = stryMutAct_9fa48("1281") ? "" : (stryCov_9fa48("1281"), 'amazon.nova-pro-v1:0');

/** The default run count for a determinism evaluation (server clamps to 2–25). */
export const DEFAULT_EVAL_N = 10;

/**
 * Lane a new determinism evaluation launches in when the user doesn't change
 * the launcher's "Run location" toggle.
 *
 * contract: docs/cloud-evals.md "Frontend" — "Choice remembered in settings
 * (defaultEvalExecution)".
 */
export type EvalExecutionPreference = 'local' | 'cloud';
export interface SettingsData {
  theme: ThemePreference;
  /** Whether the robot mascot is rendered at all. */
  robotEnabled: boolean;
  /** Whether the floating Chad companion is rendered. */
  chadEnabled: boolean;
  defaultGraderModelId: string;
  defaultN: number;
  /** Which lane the determinism launcher's "Run location" toggle starts on. */
  defaultEvalExecution: EvalExecutionPreference;
}
export interface SettingsActions {
  setTheme(theme: ThemePreference): void;
  setRobotEnabled(enabled: boolean): void;
  setChadEnabled(enabled: boolean): void;
  setDefaultGraderModelId(modelId: string): void;
  setDefaultN(n: number): void;
  setDefaultEvalExecution(execution: EvalExecutionPreference): void;
  reset(): void;
}
export type SettingsStore = SettingsData & SettingsActions;
export const DEFAULT_SETTINGS: SettingsData = stryMutAct_9fa48("1282") ? {} : (stryCov_9fa48("1282"), {
  theme: stryMutAct_9fa48("1283") ? "" : (stryCov_9fa48("1283"), 'system'),
  robotEnabled: stryMutAct_9fa48("1284") ? false : (stryCov_9fa48("1284"), true),
  chadEnabled: stryMutAct_9fa48("1285") ? false : (stryCov_9fa48("1285"), true),
  defaultGraderModelId: DEFAULT_GRADER_MODEL_ID,
  defaultN: DEFAULT_EVAL_N,
  defaultEvalExecution: stryMutAct_9fa48("1286") ? "" : (stryCov_9fa48("1286"), 'local')
});
export const useSettingsStore = create<SettingsStore>()(persist(stryMutAct_9fa48("1287") ? () => undefined : (stryCov_9fa48("1287"), set => stryMutAct_9fa48("1288") ? {} : (stryCov_9fa48("1288"), {
  ...DEFAULT_SETTINGS,
  setTheme: stryMutAct_9fa48("1289") ? () => undefined : (stryCov_9fa48("1289"), theme => set(stryMutAct_9fa48("1290") ? {} : (stryCov_9fa48("1290"), {
    theme
  }))),
  setRobotEnabled: stryMutAct_9fa48("1291") ? () => undefined : (stryCov_9fa48("1291"), enabled => set(stryMutAct_9fa48("1292") ? {} : (stryCov_9fa48("1292"), {
    robotEnabled: enabled
  }))),
  setChadEnabled: stryMutAct_9fa48("1293") ? () => undefined : (stryCov_9fa48("1293"), enabled => set(stryMutAct_9fa48("1294") ? {} : (stryCov_9fa48("1294"), {
    chadEnabled: enabled
  }))),
  setDefaultGraderModelId: stryMutAct_9fa48("1295") ? () => undefined : (stryCov_9fa48("1295"), modelId => set(stryMutAct_9fa48("1296") ? {} : (stryCov_9fa48("1296"), {
    defaultGraderModelId: modelId
  }))),
  setDefaultN: stryMutAct_9fa48("1297") ? () => undefined : (stryCov_9fa48("1297"), n => set(stryMutAct_9fa48("1298") ? {} : (stryCov_9fa48("1298"), {
    defaultN: n
  }))),
  setDefaultEvalExecution: stryMutAct_9fa48("1299") ? () => undefined : (stryCov_9fa48("1299"), execution => set(stryMutAct_9fa48("1300") ? {} : (stryCov_9fa48("1300"), {
    defaultEvalExecution: execution
  }))),
  reset: stryMutAct_9fa48("1301") ? () => undefined : (stryCov_9fa48("1301"), () => set(stryMutAct_9fa48("1302") ? {} : (stryCov_9fa48("1302"), {
    ...DEFAULT_SETTINGS
  })))
})), stryMutAct_9fa48("1303") ? {} : (stryCov_9fa48("1303"), {
  name: SETTINGS_STORAGE_KEY,
  // `chadEnabled` (and, since, `defaultEvalExecution`) were added without
  // a version bump: zustand's default `merge` is
  // `{ ...currentState, ...persistedState }`, so a payload that predates
  // one of these fields (and therefore doesn't mention it) simply falls
  // through to the freshly-created store's default rather than
  // clobbering it with `undefined`. Every other field round-trips
  // unchanged. A version bump + `migrate` would only be needed if an
  // *existing* field's meaning or shape changed.
  version: 1,
  partialize: stryMutAct_9fa48("1304") ? () => undefined : (stryCov_9fa48("1304"), (state): SettingsData => stryMutAct_9fa48("1305") ? {} : (stryCov_9fa48("1305"), {
    theme: state.theme,
    robotEnabled: state.robotEnabled,
    chadEnabled: state.chadEnabled,
    defaultGraderModelId: state.defaultGraderModelId,
    defaultN: state.defaultN,
    defaultEvalExecution: state.defaultEvalExecution
  }))
})));

/**
 * Resolve `theme: 'system'` against the OS preference.
 *
 * Pure apart from the `prefersDark` argument, which the caller reads from
 * `matchMedia` so this stays testable and SSR-safe.
 */
export function resolveTheme(theme: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (stryMutAct_9fa48("1306")) {
    {}
  } else {
    stryCov_9fa48("1306");
    if (stryMutAct_9fa48("1309") ? theme !== 'system' : stryMutAct_9fa48("1308") ? false : stryMutAct_9fa48("1307") ? true : (stryCov_9fa48("1307", "1308", "1309"), theme === (stryMutAct_9fa48("1310") ? "" : (stryCov_9fa48("1310"), 'system')))) return prefersDark ? stryMutAct_9fa48("1311") ? "" : (stryCov_9fa48("1311"), 'dark') : stryMutAct_9fa48("1312") ? "" : (stryCov_9fa48("1312"), 'light');
    return theme;
  }
}