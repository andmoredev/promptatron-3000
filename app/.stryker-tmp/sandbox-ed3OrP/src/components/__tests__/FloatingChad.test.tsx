/**
 * FloatingChad: gated on `settingsStore.chadEnabled`, dismissible, and reacts
 * to `runStore` status transitions with a deterministic, auto-hiding quip.
 */
// @ts-nocheck


import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FloatingChad from '../FloatingChad'
import { DEFAULT_SETTINGS, INITIAL_RUN_STATE, useRunStore, useSettingsStore } from '../../stores'
import { pickQuip } from '../../utils/chadQuips'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({ ...DEFAULT_SETTINGS })
  useRunStore.setState({ ...INITIAL_RUN_STATE })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('visibility', () => {
  it('renders when chadEnabled is true', () => {
    render(<FloatingChad />)
    expect(screen.getByTestId('floating-chad')).toBeInTheDocument()
  })

  it('renders nothing when chadEnabled is false', () => {
    useSettingsStore.setState({ chadEnabled: false })
    render(<FloatingChad />)
    expect(screen.queryByTestId('floating-chad')).not.toBeInTheDocument()
  })
})

describe('dismissing', () => {
  it('the close button flips chadEnabled off and unmounts Chad', () => {
    render(<FloatingChad />)
    expect(screen.getByTestId('floating-chad')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Chad' }))

    expect(useSettingsStore.getState().chadEnabled).toBe(false)
    expect(screen.queryByTestId('floating-chad')).not.toBeInTheDocument()
  })
})

describe('quips', () => {
  it('shows a thinking quip on an idle -> starting transition, and it auto-hides', () => {
    vi.useFakeTimers()
    render(<FloatingChad />)

    expect(screen.queryByTestId('chad-quip')).not.toBeInTheDocument()

    act(() => {
      useRunStore.setState({ status: 'starting', runId: 'run-quip-1' })
    })

    const bubble = screen.getByTestId('chad-quip')
    expect(bubble).toBeInTheDocument()
    expect(['Crunching tokens…', 'On it, boss.', 'Let me think on that.']).toContain(
      bubble.textContent
    )

    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(screen.queryByTestId('chad-quip')).not.toBeInTheDocument()
  })

  it('picks the same variant deterministically for a fixed run id', () => {
    render(<FloatingChad />)

    act(() => {
      useRunStore.setState({ status: 'starting', runId: 'fixed-run-id-42' })
    })

    const expected = pickQuip('thinking', 'fixed-run-id-42')
    expect(screen.getByTestId('chad-quip')).toHaveTextContent(expected)
  })

  it('shows a success quip on completion', () => {
    render(<FloatingChad />)

    act(() => {
      useRunStore.setState({ status: 'starting', runId: 'run-quip-2' })
    })
    act(() => {
      useRunStore.setState({ status: 'completed', runId: 'run-quip-2' })
    })

    const expected = pickQuip('success', 'run-quip-2')
    expect(screen.getByTestId('chad-quip')).toHaveTextContent(expected)
  })

  it('shows an error quip on failure', () => {
    render(<FloatingChad />)

    act(() => {
      useRunStore.setState({ status: 'starting', runId: 'run-quip-3' })
    })
    act(() => {
      useRunStore.setState({ status: 'error', runId: 'run-quip-3' })
    })

    const expected = pickQuip('error', 'run-quip-3')
    expect(screen.getByTestId('chad-quip')).toHaveTextContent(expected)
  })

  it('shows a cancelled quip when a run is aborted', () => {
    render(<FloatingChad />)

    act(() => {
      useRunStore.setState({ status: 'starting', runId: 'run-quip-4' })
    })
    act(() => {
      useRunStore.setState({ status: 'cancelled', runId: 'run-quip-4' })
    })

    const expected = pickQuip('cancelled', 'run-quip-4')
    expect(screen.getByTestId('chad-quip')).toHaveTextContent(expected)
  })

  it('leaves an existing quip alone on a starting -> streaming transition (no quip category)', () => {
    render(<FloatingChad />)

    act(() => {
      useRunStore.setState({ status: 'starting', runId: 'run-quip-5' })
    })
    const expected = pickQuip('thinking', 'run-quip-5')
    expect(screen.getByTestId('chad-quip')).toHaveTextContent(expected)

    // 'streaming' has no quip category of its own — the thinking quip from
    // the earlier transition is left exactly as it was.
    act(() => {
      useRunStore.setState({ status: 'streaming', runId: 'run-quip-5' })
    })

    expect(screen.getByTestId('chad-quip')).toHaveTextContent(expected)
  })
})
