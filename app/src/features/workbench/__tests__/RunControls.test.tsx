/**
 * RunControls, focused on the guardrail x provider invariant: guardrails
 * only run against Bedrock, so the select must be disabled (with a hint) off
 * of it, and switching the provider away from bedrock must clear any
 * already-selected guardrail — the latter is enforced centrally in
 * `runConfigStore`, exercised here through the real store.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import RunControls from '../RunControls'
import {
  DEFAULT_RUN_CONFIG,
  INITIAL_RUN_STATE,
  useGuardrailStore,
  useRunConfigStore,
  useRunStore
} from '../../../stores'
import type { GuardrailSummary } from '../../../api'

const GUARDRAILS: GuardrailSummary[] = [
  {
    id: 'gr-1',
    arn: 'arn:aws:bedrock:us-east-1:123:guardrail/gr-1',
    name: 'PII shield',
    description: null,
    version: 'DRAFT',
    status: 'READY',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: null
  }
]

beforeEach(() => {
  useRunConfigStore.setState({ ...DEFAULT_RUN_CONFIG })
  useRunStore.setState({ ...INITIAL_RUN_STATE, startRun: vi.fn(), cancelRun: vi.fn() })
  useGuardrailStore.setState({
    guardrails: GUARDRAILS,
    loaded: true,
    loadGuardrails: vi.fn().mockResolvedValue(undefined)
  })
})

describe('RunControls guardrail gating', () => {
  it('leaves the guardrail select enabled on the bedrock default', () => {
    render(<RunControls />)

    expect(screen.getByLabelText('Guardrail')).toBeEnabled()
    expect(screen.queryByText('Guardrails require the Bedrock provider')).not.toBeInTheDocument()
  })

  it('disables the guardrail select with a hint when the provider is not bedrock', () => {
    useRunConfigStore.setState({ provider: 'openai' })

    render(<RunControls />)

    const select = screen.getByLabelText('Guardrail')
    expect(select).toBeDisabled()
    expect(select).toHaveAttribute('title', 'Guardrails require the Bedrock provider')
    expect(screen.getByText('Guardrails require the Bedrock provider')).toBeInTheDocument()
  })

  it('re-enables the guardrail select when the provider switches back to bedrock', () => {
    useRunConfigStore.setState({ provider: 'anthropic' })
    const { rerender } = render(<RunControls />)
    expect(screen.getByLabelText('Guardrail')).toBeDisabled()

    act(() => useRunConfigStore.getState().setProvider('bedrock'))
    rerender(<RunControls />)

    expect(screen.getByLabelText('Guardrail')).toBeEnabled()
  })

  it('clears an already-selected guardrail when the provider switches away from bedrock', () => {
    useRunConfigStore.getState().setGuardrail({ id: 'gr-1', trace: true })
    expect(useRunConfigStore.getState().guardrail).not.toBeNull()

    useRunConfigStore.getState().setProvider('ollama')

    expect(useRunConfigStore.getState().guardrail).toBeNull()
  })
})
