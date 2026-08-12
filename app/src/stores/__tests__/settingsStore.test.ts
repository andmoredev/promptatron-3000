/** settingsStore: defaults, setters, persistence. */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  useSettingsStore,
  resolveTheme,
  DEFAULT_SETTINGS,
  DEFAULT_EVAL_N,
  DEFAULT_GRADER_MODEL_ID,
  SETTINGS_STORAGE_KEY
} from '../settingsStore'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({ ...DEFAULT_SETTINGS })
})

describe('defaults', () => {
  it('starts with system theme, the robot on, Chad on, nova-pro grading, n=10 and local eval execution', () => {
    const state = useSettingsStore.getState()
    expect(state.theme).toBe('system')
    expect(state.robotEnabled).toBe(true)
    expect(state.chadEnabled).toBe(true)
    expect(state.defaultGraderModelId).toBe('amazon.nova-pro-v1:0')
    expect(state.defaultN).toBe(10)
    expect(state.defaultEvalExecution).toBe('local')
  })

  it('exports the defaults as constants', () => {
    expect(DEFAULT_GRADER_MODEL_ID).toBe('amazon.nova-pro-v1:0')
    expect(DEFAULT_EVAL_N).toBe(10)
    expect(DEFAULT_SETTINGS).toEqual({
      theme: 'system',
      robotEnabled: true,
      chadEnabled: true,
      defaultGraderModelId: 'amazon.nova-pro-v1:0',
      defaultN: 10,
      defaultEvalExecution: 'local'
    })
  })
})

describe('setters', () => {
  it('updates each preference and resets back to the defaults', () => {
    const state = useSettingsStore.getState()
    state.setTheme('dark')
    state.setRobotEnabled(false)
    state.setChadEnabled(false)
    state.setDefaultGraderModelId('anthropic.claude-3-sonnet')
    state.setDefaultN(25)
    state.setDefaultEvalExecution('cloud')

    expect(useSettingsStore.getState()).toMatchObject({
      theme: 'dark',
      robotEnabled: false,
      chadEnabled: false,
      defaultGraderModelId: 'anthropic.claude-3-sonnet',
      defaultN: 25,
      defaultEvalExecution: 'cloud'
    })

    useSettingsStore.getState().reset()
    expect(useSettingsStore.getState()).toMatchObject(DEFAULT_SETTINGS)
  })
})

describe('persistence', () => {
  it('writes only the preference fields under the v1 key', () => {
    useSettingsStore.getState().setTheme('light')

    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(parsed.version).toBe(1)
    expect(parsed.state).toEqual({
      theme: 'light',
      robotEnabled: true,
      chadEnabled: true,
      defaultGraderModelId: 'amazon.nova-pro-v1:0',
      defaultN: 10,
      defaultEvalExecution: 'local'
    })
  })

  it('rehydrates a stored payload', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: { ...DEFAULT_SETTINGS, theme: 'dark', robotEnabled: false, defaultN: 3 }
      })
    )

    await useSettingsStore.persist.rehydrate()

    expect(useSettingsStore.getState()).toMatchObject({
      theme: 'dark',
      robotEnabled: false,
      defaultN: 3
    })
  })

  it('a pre-chadEnabled (v1) payload merges cleanly, defaulting chadEnabled to true', async () => {
    // Simulates a payload persisted before `chadEnabled` existed: the key is
    // simply absent, not `undefined`-valued.
    const legacyState: Record<string, unknown> = {
      theme: 'dark',
      robotEnabled: true,
      defaultGraderModelId: 'amazon.nova-pro-v1:0',
      defaultN: 10
    }
    expect('chadEnabled' in legacyState).toBe(false)

    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, state: legacyState })
    )

    await useSettingsStore.persist.rehydrate()

    expect(useSettingsStore.getState().chadEnabled).toBe(true)
  })

  it('a pre-defaultEvalExecution payload merges cleanly, defaulting it to local', async () => {
    // Simulates a payload persisted before `defaultEvalExecution` existed: the
    // key is simply absent, not `undefined`-valued. Same no-version-bump
    // pattern as `chadEnabled` above.
    const legacyState: Record<string, unknown> = {
      theme: 'dark',
      robotEnabled: true,
      chadEnabled: false,
      defaultGraderModelId: 'amazon.nova-pro-v1:0',
      defaultN: 10
    }
    expect('defaultEvalExecution' in legacyState).toBe(false)

    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, state: legacyState })
    )

    await useSettingsStore.persist.rehydrate()

    expect(useSettingsStore.getState().defaultEvalExecution).toBe('local')
    // Every other field from the legacy payload still round-trips.
    expect(useSettingsStore.getState().chadEnabled).toBe(false)
  })
})

describe('resolveTheme', () => {
  it('resolves system against the OS preference and passes explicit choices through', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})
