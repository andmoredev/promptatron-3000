/**
 * ThemeProvider: validates the supplied theme, applies its CSS custom
 * properties to the document root on success, and exposes the result (and a
 * safe fallback outside the provider) through `useTheme`.
 */
// @ts-nocheck


import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ThemeProvider, { useTheme, withTheme } from '../ThemeProvider'

function Probe() {
  const theme = useTheme()
  return (
    <div data-testid="probe">
      isValid:{String(theme.isValid)} errors:{theme.errors.join('|')}
    </div>
  )
}

const VALID_THEME = {
  colors: {
    primary: { 500: '#123456' },
    secondary: { 500: '#654321' },
    tertiary: { 500: '#abcdef' }
  }
}

beforeEach(() => {
  document.documentElement.style.cssText = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ThemeProvider', () => {
  it('applies CSS custom properties to the document root for a valid theme', () => {
    render(
      <ThemeProvider theme={VALID_THEME}>
        <Probe />
      </ThemeProvider>
    )

    expect(screen.getByTestId('probe')).toHaveTextContent('isValid:true errors:')
    expect(document.documentElement.style.getPropertyValue('--color-primary-500')).toBe('#123456')
    expect(document.documentElement.style.getPropertyValue('--color-secondary-500')).toBe(
      '#654321'
    )
  })

  it('marks the theme invalid, warns, and skips CSS variables for a missing/incomplete theme', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    render(
      <ThemeProvider theme={{}}>
        <Probe />
      </ThemeProvider>
    )

    expect(screen.getByTestId('probe')).toHaveTextContent('isValid:false')
    expect(screen.getByTestId('probe')).toHaveTextContent('Missing primary color configuration')
    expect(document.documentElement.style.getPropertyValue('--color-primary-500')).toBe('')
    expect(warnSpy).toHaveBeenCalledWith('Theme validation failed:', expect.any(Array))
  })

  it('treats an omitted theme (defaulting to null) the same as an invalid one', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

    expect(screen.getByTestId('probe')).toHaveTextContent('isValid:false')
    expect(screen.getByTestId('probe')).toHaveTextContent(
      'Theme configuration is null or undefined'
    )
  })

  it('useTheme outside a provider returns safe, inert defaults', () => {
    render(<Probe />)

    expect(screen.getByTestId('probe')).toHaveTextContent('isValid:false')
    expect(screen.getByTestId('probe')).toHaveTextContent('Theme context not available')
  })

  it('withTheme injects the current theme context as a prop', () => {
    function Inner({ theme }: { theme: { isValid: boolean } }) {
      return <div data-testid="inner">wrapped-isValid:{String(theme.isValid)}</div>
    }
    const Wrapped = withTheme<Record<string, never>>(Inner)

    render(
      <ThemeProvider theme={VALID_THEME}>
        <Wrapped />
      </ThemeProvider>
    )

    expect(screen.getByTestId('inner')).toHaveTextContent('wrapped-isValid:true')
  })
})
