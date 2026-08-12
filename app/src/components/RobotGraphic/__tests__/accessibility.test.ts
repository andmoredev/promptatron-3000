/**
 * accessibility.ts: media-query preference reads, WCAG contrast math, ARIA
 * attribute derivation for robot state, and the forced-colors / high-contrast
 * color-scheme overrides.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  announceToScreenReader,
  createAccessibilityListener,
  getAccessibleColors,
  getRobotAriaAttributes,
  isForcedColorsActive,
  prefersHighContrast,
  prefersReducedMotion,
  shouldDisableAnimations,
  validateColorContrast
} from '../accessibility'

/** Install a matchMedia stub where `matches` is true only for `activeQuery`. */
function stubMatchMedia(activeQuery: string | null) {
  const addEventListener = vi.fn()
  const removeEventListener = vi.fn()
  const addListener = vi.fn()
  const removeListener = vi.fn()
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === activeQuery,
    media: query,
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener,
    removeListener,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
  return { addEventListener, removeEventListener, addListener, removeListener }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('preference reads', () => {
  it('prefersReducedMotion reflects the matching media query', () => {
    stubMatchMedia('(prefers-reduced-motion: reduce)')
    expect(prefersReducedMotion()).toBe(true)
    expect(shouldDisableAnimations()).toBe(true)

    stubMatchMedia(null)
    expect(prefersReducedMotion()).toBe(false)
    expect(shouldDisableAnimations()).toBe(false)
  })

  it('prefersHighContrast and isForcedColorsActive read their own queries independently', () => {
    stubMatchMedia('(prefers-contrast: high)')
    expect(prefersHighContrast()).toBe(true)
    expect(isForcedColorsActive()).toBe(false)

    stubMatchMedia('(forced-colors: active)')
    expect(isForcedColorsActive()).toBe(true)
    expect(prefersHighContrast()).toBe(false)
  })
})

describe('createAccessibilityListener', () => {
  it('invokes the callback immediately with the current match state, then on change via addEventListener', () => {
    const { addEventListener, removeEventListener } = stubMatchMedia('(min-width: 1px)')
    const callback = vi.fn()

    const cleanup = createAccessibilityListener('(min-width: 1px)', callback)

    expect(callback).toHaveBeenCalledWith(true)
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    cleanup()
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('falls back to addListener/removeListener when addEventListener is unavailable', () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    window.matchMedia = vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener,
      removeListener,
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia

    const cleanup = createAccessibilityListener('(min-width: 1px)', vi.fn())

    expect(addListener).toHaveBeenCalledWith(expect.any(Function))
    cleanup()
    expect(removeListener).toHaveBeenCalledWith(expect.any(Function))
  })
})

describe('validateColorContrast', () => {
  it('reports the max ratio (21:1) for pure black on white', () => {
    const result = validateColorContrast('#000000', '#ffffff')
    expect(result.ratio).toBe(21)
    expect(result).toMatchObject({ AA: true, AAA: true, AALarge: true, AAALarge: true })
  })

  it('reports 1:1 (fails everything but AA-large is also false) for identical colors', () => {
    const result = validateColorContrast('#5c8c5a', '#5c8c5a')
    expect(result.ratio).toBe(1)
    expect(result).toEqual({ ratio: 1, AA: false, AAA: false, AALarge: false, AAALarge: false })
  })

  it('is symmetric in its two arguments', () => {
    const a = validateColorContrast('#333333', '#eeeeee')
    const b = validateColorContrast('#eeeeee', '#333333')
    expect(a.ratio).toBe(b.ratio)
  })
})

describe('getRobotAriaAttributes', () => {
  it('maps a known state to its label/description and sets aria-live "off" without a state change', () => {
    const attrs = getRobotAriaAttributes('thinking', 'thinking')
    expect(attrs['aria-label']).toBe('Robot is processing your request')
    expect(attrs['data-description']).toContain('focused expression')
    expect(attrs['aria-describedby']).toBe('robot-description-thinking')
    expect(attrs['aria-live']).toBe('off')
  })

  it('sets aria-live "polite" when the state actually changed', () => {
    expect(getRobotAriaAttributes('talking', 'idle')['aria-live']).toBe('polite')
  })

  it('treats a missing previousState the same as "off"', () => {
    expect(getRobotAriaAttributes('error')['aria-live']).toBe('off')
  })

  it('falls back to the idle label/description for an unrecognized state', () => {
    const attrs = getRobotAriaAttributes('some_unknown_state')
    expect(attrs['aria-label']).toBe('Robot is ready and waiting for input')
    expect(attrs['data-description']).toContain('happy and ready')
  })
})

describe('announceToScreenReader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends a live-region div with the message, then removes it after 1s', () => {
    announceToScreenReader('Run started', 'assertive')

    const node = document.querySelector('[aria-live="assertive"]')
    expect(node).not.toBeNull()
    expect(node?.textContent).toBe('Run started')
    expect(node?.getAttribute('aria-atomic')).toBe('true')

    vi.advanceTimersByTime(1000)
    expect(document.querySelector('[aria-live="assertive"]')).toBeNull()
  })

  it('defaults to "polite" priority', () => {
    announceToScreenReader('hello')
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('hello')
    vi.advanceTimersByTime(1000)
  })
})

describe('getAccessibleColors', () => {
  const defaults = {
    robotStroke: '#475569',
    eyeColor: '#111827',
    robotBody: '#f8fafc',
    happyMouth: '#047857',
    thinkingMouth: '#b45309',
    talkingElements: '#1d4ed8',
    errorElements: '#b91c1c'
  }

  it('overrides with system colors when forced-colors mode is active, taking priority over high-contrast', () => {
    stubMatchMedia('(forced-colors: active)')
    const colors = getAccessibleColors(defaults)
    expect(colors.robotStroke).toBe('CanvasText')
    expect(colors.robotBody).toBe('Canvas')
    expect(colors.happyMouth).toBe('Highlight')
  })

  it('overrides with high-contrast hex colors when only prefers-contrast is set', () => {
    stubMatchMedia('(prefers-contrast: high)')
    const colors = getAccessibleColors(defaults)
    expect(colors.robotStroke).toBe('#000000')
    expect(colors.happyMouth).toBe('#006600')
    // robotBody is untouched by the high-contrast branch (only forced-colors overrides it).
    expect(colors.robotBody).toBe(defaults.robotBody)
  })

  it('passes the defaults through unchanged with no accessibility preference active', () => {
    stubMatchMedia(null)
    expect(getAccessibleColors(defaults)).toEqual(defaults)
  })
})
