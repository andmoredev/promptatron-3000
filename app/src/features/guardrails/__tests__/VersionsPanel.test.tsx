/**
 * VersionsPanel against a stubbed `guardrailStore`: loads on open, lists what
 * `GuardrailVersionSummary` actually carries (version + description — the
 * wire type has no per-version timestamp), and the publish flow.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import VersionsPanel from '../VersionsPanel'
import { INITIAL_GUARDRAIL_STATE, useGuardrailStore } from '../../../stores'
import type { GuardrailVersionSummary } from '../../../api'

const VERSIONS: GuardrailVersionSummary[] = [
  { id: 'gr-1', version: 'DRAFT', description: null },
  { id: 'gr-1', version: '1', description: 'Initial release' }
]

const loadVersions = vi.fn().mockResolvedValue(VERSIONS)
const publishVersion = vi.fn()

beforeEach(() => {
  loadVersions.mockClear().mockResolvedValue(VERSIONS)
  publishVersion.mockReset().mockResolvedValue({ id: 'gr-1', version: '2', description: 'v2' })
  useGuardrailStore.setState({
    ...INITIAL_GUARDRAIL_STATE,
    loadVersions,
    publishVersion
  })
})

describe('VersionsPanel', () => {
  it('loads versions for the guardrail on open', async () => {
    useGuardrailStore.setState({ versions: { 'gr-1': VERSIONS } })
    render(
      <VersionsPanel guardrailId="gr-1" guardrailName="fraud-guardrail" onClose={vi.fn()} />
    )
    expect(loadVersions).toHaveBeenCalledWith('gr-1')
    await screen.findByText('DRAFT')
  })

  it('lists each version with its description', async () => {
    useGuardrailStore.setState({ versions: { 'gr-1': VERSIONS } })
    render(
      <VersionsPanel guardrailId="gr-1" guardrailName="fraud-guardrail" onClose={vi.fn()} />
    )

    expect(await screen.findByText('DRAFT')).toBeInTheDocument()
    expect(screen.getByText('Version 1')).toBeInTheDocument()
    expect(screen.getByText('Initial release')).toBeInTheDocument()
  })

  it('shows an empty state with no versions', async () => {
    useGuardrailStore.setState({ versions: { 'gr-1': [] } })
    render(
      <VersionsPanel guardrailId="gr-1" guardrailName="fraud-guardrail" onClose={vi.fn()} />
    )

    expect(await screen.findByTestId('versions-empty')).toBeInTheDocument()
  })

  it('publishes the current DRAFT with a description', async () => {
    useGuardrailStore.setState({ versions: { 'gr-1': VERSIONS } })
    render(
      <VersionsPanel guardrailId="gr-1" guardrailName="fraud-guardrail" onClose={vi.fn()} />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Publish current DRAFT' }))
    fireEvent.change(screen.getByLabelText('Version description (optional)'), {
      target: { value: 'Adds PII policy' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publish' }))

    expect(publishVersion).toHaveBeenCalledWith('gr-1', 'Adds PII policy')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish current DRAFT' })).toBeInTheDocument()
    )
  })

  it('publishes with no description when left blank', async () => {
    useGuardrailStore.setState({ versions: { 'gr-1': VERSIONS } })
    render(
      <VersionsPanel guardrailId="gr-1" guardrailName="fraud-guardrail" onClose={vi.fn()} />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Publish current DRAFT' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publish' }))

    expect(publishVersion).toHaveBeenCalledWith('gr-1', undefined)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish current DRAFT' })).toBeInTheDocument()
    )
  })
})
