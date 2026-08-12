/**
 * themeUtils: null-safe theme color lookup, CSS variable generation, and
 * theme-config validation. Pure functions with a documented fallback for
 * every malformed/partial input, so each fallback path gets its own case.
 */
// @ts-nocheck


import { describe, expect, it, vi } from 'vitest'
import {
  generateThemeVariables,
  getSafeColorClass,
  getThemeColor,
  validateTheme,
  type ThemeConfig
} from '../themeUtils'

describe('getThemeColor', () => {
  it('falls back to the built-in default when no theme is given', () => {
    expect(getThemeColor('primary')).toBe('#5c8c5a')
    expect(getThemeColor('gray', 600)).toBe('#6b7280')
  })

  it('falls back to gray when the color name is not a known default', () => {
    expect(getThemeColor('nonexistent-color')).toBe('#6b7280')
  })

  it('reads DEFAULT or 500 off the theme, preferring DEFAULT', () => {
    const theme: ThemeConfig = { colors: { primary: { DEFAULT: '#111111', 500: '#222222' } } }
    expect(getThemeColor('primary', 'DEFAULT', theme)).toBe('#111111')
    expect(getThemeColor('primary', 500, theme)).toBe('#111111')
  })

  it('falls back to the built-in default when neither DEFAULT nor 500 is set on the theme', () => {
    const theme: ThemeConfig = { colors: { primary: { 700: '#333333' } } }
    expect(getThemeColor('primary', 'DEFAULT', theme)).toBe('#5c8c5a')
  })

  it('reads a specific shade off the theme, falling back to the default if missing', () => {
    const theme: ThemeConfig = { colors: { primary: { 700: '#333333' } } }
    expect(getThemeColor('primary', 700, theme)).toBe('#333333')
    expect(getThemeColor('primary', 900, theme)).toBe('#5c8c5a')
  })

  it('falls back to defaults when the theme has no entry for that color at all', () => {
    const theme: ThemeConfig = { colors: { secondary: { 500: '#00ff00' } } }
    expect(getThemeColor('primary', 500, theme)).toBe('#5c8c5a')
  })

  it('tolerates a theme with colors: null', () => {
    expect(getThemeColor('primary', 500, { colors: null })).toBe('#5c8c5a')
  })
})

describe('generateThemeVariables', () => {
  it('emits every shade of primary/secondary/tertiary as a CSS custom property', () => {
    const vars = generateThemeVariables()

    expect(vars['--color-primary-500']).toBe('#5c8c5a')
    expect(vars['--color-secondary-100']).toBe('#9ecc8c')
    expect(vars['--color-tertiary-900']).toBe('#e6f3d5')
    expect(Object.keys(vars)).toHaveLength(30) // 3 colors x 10 shades
  })

  it('prefers theme-supplied shades over the defaults', () => {
    const theme: ThemeConfig = { colors: { primary: { 500: '#custom' } } }
    const vars = generateThemeVariables(theme)
    expect(vars['--color-primary-500']).toBe('#custom')
  })
})

describe('validateTheme', () => {
  it('rejects a null/undefined theme', () => {
    expect(validateTheme(null)).toEqual({
      isValid: false,
      errors: ['Theme configuration is null or undefined']
    })
    expect(validateTheme(undefined).isValid).toBe(false)
  })

  it('rejects a theme with no colors object', () => {
    const result = validateTheme({})
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Theme colors configuration is missing')
    expect(result.errors).toContain('Missing primary color configuration')
  })

  it('reports each missing required color individually', () => {
    const result = validateTheme({ colors: { primary: { 500: '#fff' } } })
    expect(result.isValid).toBe(false)
    expect(result.errors).toEqual([
      'Missing secondary color configuration',
      'Missing tertiary color configuration'
    ])
  })

  it('accepts a theme with all three required colors present', () => {
    const result = validateTheme({
      colors: {
        primary: { 500: '#1' },
        secondary: { 500: '#2' },
        tertiary: { 500: '#3' }
      }
    })
    expect(result).toEqual({ isValid: true, errors: [] })
  })
})

describe('getSafeColorClass', () => {
  it('builds "<base>-<shade>" and falls back to the default class for an empty base', () => {
    expect(getSafeColorClass('bg-primary')).toBe('bg-primary-600')
    expect(getSafeColorClass('bg-primary', 700)).toBe('bg-primary-700')
    expect(getSafeColorClass('')).toBe('bg-gray-600')
  })

  it('honors a caller-supplied fallback class', () => {
    expect(getSafeColorClass('', 600, 'bg-red-500')).toBe('bg-red-500')
  })

  it('omits the shade suffix when shade is falsy (0 or empty string)', () => {
    expect(getSafeColorClass('bg-primary', 0)).toBe('bg-primary')
    expect(getSafeColorClass('bg-primary', '')).toBe('bg-primary')
  })
})

describe('error tolerance', () => {
  it('getThemeColor swallows a throwing theme accessor and falls back', () => {
    const angryTheme = {
      get colors(): never {
        throw new Error('boom')
      }
    } as unknown as ThemeConfig
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(getThemeColor('primary', 500, angryTheme)).toBe('#5c8c5a')
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
