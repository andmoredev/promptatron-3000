/**
 * UI preferences. Nothing here is sent to the server — it only shapes what the
 * app renders and what it pre-fills forms with.
 *
 * Persisted to localStorage under `promptatron.settings.v1`.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** localStorage key. Bump the suffix when the shape changes incompatibly. */
export const SETTINGS_STORAGE_KEY = 'promptatron.settings.v1'

export type ThemePreference = 'light' | 'dark' | 'system'

/** The default judge model for new evaluations. */
export const DEFAULT_GRADER_MODEL_ID = 'amazon.nova-pro-v1:0'

/** The default run count for a determinism evaluation (server clamps to 2–25). */
export const DEFAULT_EVAL_N = 10

/**
 * Lane a new determinism evaluation launches in when the user doesn't change
 * the launcher's "Run location" toggle.
 *
 * contract: docs/cloud-evals.md "Frontend" — "Choice remembered in settings
 * (defaultEvalExecution)".
 */
export type EvalExecutionPreference = 'local' | 'cloud'

export interface SettingsData {
  theme: ThemePreference
  /** Whether the robot mascot is rendered at all. */
  robotEnabled: boolean
  /** Whether the floating Chad companion is rendered. */
  chadEnabled: boolean
  defaultGraderModelId: string
  defaultN: number
  /** Which lane the determinism launcher's "Run location" toggle starts on. */
  defaultEvalExecution: EvalExecutionPreference
}

export interface SettingsActions {
  setTheme(theme: ThemePreference): void
  setRobotEnabled(enabled: boolean): void
  setChadEnabled(enabled: boolean): void
  setDefaultGraderModelId(modelId: string): void
  setDefaultN(n: number): void
  setDefaultEvalExecution(execution: EvalExecutionPreference): void
  reset(): void
}

export type SettingsStore = SettingsData & SettingsActions

export const DEFAULT_SETTINGS: SettingsData = {
  theme: 'system',
  robotEnabled: true,
  chadEnabled: true,
  defaultGraderModelId: DEFAULT_GRADER_MODEL_ID,
  defaultN: DEFAULT_EVAL_N,
  defaultEvalExecution: 'local'
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setTheme: (theme) => set({ theme }),
      setRobotEnabled: (enabled) => set({ robotEnabled: enabled }),
      setChadEnabled: (enabled) => set({ chadEnabled: enabled }),
      setDefaultGraderModelId: (modelId) => set({ defaultGraderModelId: modelId }),
      setDefaultN: (n) => set({ defaultN: n }),
      setDefaultEvalExecution: (execution) => set({ defaultEvalExecution: execution }),
      reset: () => set({ ...DEFAULT_SETTINGS })
    }),
    {
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
      partialize: (state): SettingsData => ({
        theme: state.theme,
        robotEnabled: state.robotEnabled,
        chadEnabled: state.chadEnabled,
        defaultGraderModelId: state.defaultGraderModelId,
        defaultN: state.defaultN,
        defaultEvalExecution: state.defaultEvalExecution
      })
    }
  )
)

/**
 * Resolve `theme: 'system'` against the OS preference.
 *
 * Pure apart from the `prefersDark` argument, which the caller reads from
 * `matchMedia` so this stays testable and SSR-safe.
 */
export function resolveTheme(
  theme: ThemePreference,
  prefersDark: boolean
): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}
