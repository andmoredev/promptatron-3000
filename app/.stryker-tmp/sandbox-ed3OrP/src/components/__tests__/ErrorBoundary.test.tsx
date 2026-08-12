/**
 * ErrorBoundary: renders children until a descendant throws, then swaps to
 * the fallback UI, records a report in localStorage, and offers a reset
 * (retry) and a reload.
 */
// @ts-nocheck


import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ErrorBoundary from '../ErrorBoundary'

let bombShouldThrow = true

function Bomb() {
  if (bombShouldThrow) throw new Error('kaboom')
  return <div data-testid="safe-child">All good</div>
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  bombShouldThrow = true
  localStorage.clear()
  // React (and the boundary itself) log the caught error — keep the test
  // output clean without hiding a real assertion on the logging.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    bombShouldThrow = false
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )

    expect(screen.getByTestId('safe-child')).toBeInTheDocument()
  })

  it('shows the fallback UI and logs the error when a descendant throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByTestId('safe-child')).not.toBeInTheDocument()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'ErrorBoundary caught an error:',
      expect.any(Error),
      expect.anything()
    )
  })

  it('records an error report in localStorage', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )

    const reports = JSON.parse(localStorage.getItem('error-reports') ?? '[]')
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ message: 'kaboom' })
    expect(typeof reports[0].errorId).toBe('string')
  })

  it('"Try Again" resets hasError so a subsequently-fixed subtree renders again', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    bombShouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))

    expect(screen.getByTestId('safe-child')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('"Reload Page" calls window.location.reload', () => {
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy }
    })

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reload Page' }))

    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })
})
