/**
 * GuardrailsPage against a stubbed `guardrailStore` — the list rendering, the
 * empty state, delete's inline confirm, and navigation into the editor.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import GuardrailsPage from '../GuardrailsPage'
import { INITIAL_GUARDRAIL_STATE, useGuardrailStore } from '../../../stores'
import type { GuardrailSummary } from '../../../api'

const GUARDRAILS: GuardrailSummary[] = [
  {
    id: 'gr-1',
    arn: 'arn:aws:bedrock:us-east-1:123:guardrail/gr-1',
    name: 'fraud-guardrail',
    description: 'Blocks fraud-adjacent content',
    version: 'DRAFT',
    status: 'READY',
    createdAt: '2026-08-01T12:00:00Z',
    updatedAt: '2026-08-01T12:00:00Z'
  },
  {
    id: 'gr-2',
    arn: 'arn:aws:bedrock:us-east-1:123:guardrail/gr-2',
    name: 'pii-guardrail',
    description: null,
    version: '1',
    status: 'UPDATING',
    createdAt: '2026-07-15T08:30:00Z',
    updatedAt: '2026-07-20T08:30:00Z'
  }
]

const loadGuardrails = vi.fn().mockResolvedValue(undefined)
const removeGuardrail = vi.fn().mockResolvedValue(true)
const loadGuardrail = vi.fn().mockResolvedValue(null)
const loadVersions = vi.fn().mockResolvedValue([])

beforeEach(() => {
  loadGuardrails.mockClear()
  removeGuardrail.mockClear().mockResolvedValue(true)
  loadGuardrail.mockClear()
  loadVersions.mockClear()
  useGuardrailStore.setState({
    ...INITIAL_GUARDRAIL_STATE,
    guardrails: GUARDRAILS,
    loaded: true,
    loadGuardrails,
    removeGuardrail,
    loadGuardrail,
    loadVersions
  })
})

describe('GuardrailsPage', () => {
  it('loads guardrails on mount', () => {
    render(<GuardrailsPage />)
    expect(loadGuardrails).toHaveBeenCalledTimes(1)
  })

  it('renders each guardrail row with name, id, status, version, and created date', () => {
    render(<GuardrailsPage />)

    const table = screen.getByTestId('guardrails-table')
    expect(within(table).getByText('fraud-guardrail')).toBeInTheDocument()
    expect(within(table).getByText('gr-1')).toBeInTheDocument()
    expect(within(table).getByText('Ready')).toBeInTheDocument()
    expect(within(table).getByText('DRAFT')).toBeInTheDocument()

    expect(within(table).getByText('pii-guardrail')).toBeInTheDocument()
    expect(within(table).getByText('Updating')).toBeInTheDocument()
  })

  it('shows the empty state when there are no guardrails', () => {
    useGuardrailStore.setState({ guardrails: [], loaded: true, loading: false })
    render(<GuardrailsPage />)

    expect(screen.getByTestId('guardrails-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('guardrails-table')).not.toBeInTheDocument()
  })

  it('surfaces a load error', () => {
    useGuardrailStore.setState({
      guardrails: [],
      loaded: false,
      loading: false,
      error: { code: 'upstream_error', message: 'Bedrock is unavailable.' }
    })
    render(<GuardrailsPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('Bedrock is unavailable.')
  })

  it('requires a confirm click before deleting a guardrail', async () => {
    render(<GuardrailsPage />)

    const row = screen.getByText('fraud-guardrail').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))

    expect(removeGuardrail).not.toHaveBeenCalled()

    fireEvent.click(within(row).getByRole('button', { name: 'Confirm' }))
    expect(removeGuardrail).toHaveBeenCalledWith('gr-1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument())
  })

  it('cancelling the delete confirm does not call removeGuardrail', () => {
    render(<GuardrailsPage />)

    const row = screen.getByText('fraud-guardrail').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }))

    expect(removeGuardrail).not.toHaveBeenCalled()
    expect(within(row).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('opens the editor for a new guardrail', () => {
    render(<GuardrailsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'New guardrail' }))

    expect(screen.getByTestId('guardrail-editor')).toBeInTheDocument()
    expect(screen.getByText('New guardrail')).toBeInTheDocument()
  })

  it('opens the editor for an existing guardrail on Edit', () => {
    render(<GuardrailsPage />)

    const row = screen.getByText('fraud-guardrail').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))

    expect(screen.getByTestId('guardrail-editor')).toBeInTheDocument()
    expect(screen.getByText('Edit guardrail')).toBeInTheDocument()
  })

  it('opens the versions panel on Versions', async () => {
    render(<GuardrailsPage />)

    const row = screen.getByText('fraud-guardrail').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Versions' }))

    expect(screen.getByTestId('versions-panel')).toBeInTheDocument()
    expect(screen.getByText('fraud-guardrail')).toBeInTheDocument()
    expect(loadVersions).toHaveBeenCalledWith('gr-1')
    await screen.findByTestId('versions-empty')
  })
})
