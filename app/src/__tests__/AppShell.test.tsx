/**
 * AppShell: the tab bar mounts exactly one page at a time, and every tab in
 * `TABS` resolves to a real page (a missing case in `TabPage` would render
 * nothing and fail here rather than silently showing a blank tab).
 *
 * The Workbench's catalog loaders are stubbed at the store level — this is a
 * shell test, not a network test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AppShell, { TABS } from '../AppShell'
import {
  DEFAULT_RUN_CONFIG,
  INITIAL_RUN_STATE,
  useGuardrailStore,
  useRunConfigStore,
  useRunStore,
  useScenarioStore
} from '../stores'

/** Test ids rendered by each page, keyed by tab. */
const PAGE_TEST_IDS: Record<string, string> = {
  workbench: 'workbench-page',
  evals: 'evals-page',
  history: 'history-page',
  guardrails: 'guardrails-page',
  scenarios: 'scenarios-page',
  about: 'about-page'
}

beforeEach(() => {
  useRunStore.setState({ ...INITIAL_RUN_STATE })
  useRunConfigStore.setState({ ...DEFAULT_RUN_CONFIG })
  // Stub the loaders so mounting the Workbench never reaches the network.
  useScenarioStore.setState({
    models: [],
    scenarios: [],
    loadModels: vi.fn().mockResolvedValue(undefined),
    loadScenarios: vi.fn().mockResolvedValue(undefined),
    loadScenario: vi.fn().mockResolvedValue(null)
  })
  useGuardrailStore.setState({
    guardrails: [],
    loadGuardrails: vi.fn().mockResolvedValue(undefined)
  })
})

describe('AppShell', () => {
  it('renders the header, the mascot and all six tabs', () => {
    render(<AppShell />)

    expect(screen.getByRole('heading', { name: 'Promptatron 3000' })).toBeInTheDocument()
    expect(screen.getByTestId('robot-graphic')).toBeInTheDocument()

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Workbench',
      'Evals',
      'History',
      'Guardrails',
      'Scenarios',
      'About'
    ])
  })

  it('opens on the Workbench', () => {
    render(<AppShell />)

    expect(screen.getByTestId('workbench-page')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Workbench' })).toHaveAttribute('aria-selected', 'true')
  })

  it.each(TABS.map((tab) => [tab.id, tab.label] as const))(
    'switching to %s mounts its page and nothing else',
    (id, label) => {
      render(<AppShell />)

      fireEvent.click(screen.getByRole('tab', { name: label }))

      expect(screen.getByTestId(PAGE_TEST_IDS[id])).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true')

      // Every other page is unmounted.
      for (const [otherId, testId] of Object.entries(PAGE_TEST_IDS)) {
        if (otherId === id) continue
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument()
      }
    }
  )

  it('points the tabpanel at the active tab', () => {
    render(<AppShell />)

    fireEvent.click(screen.getByRole('tab', { name: 'About' }))

    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('id', 'tabpanel-about')
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-about')
  })
})
