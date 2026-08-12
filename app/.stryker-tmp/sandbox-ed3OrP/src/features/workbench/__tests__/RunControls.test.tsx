/**
 * RunControls, focused on the guardrail x provider invariant: guardrails
 * only run against Bedrock, so the select must be disabled (with a hint) off
 * of it, and switching the provider away from bedrock must clear any
 * already-selected guardrail — the latter is enforced centrally in
 * `runConfigStore`, exercised here through the real store.
 */
// @ts-nocheck


import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  it('selecting a guardrail from the dropdown sets it with trace on; back to "None" clears it', () => {
    render(<RunControls />)

    fireEvent.change(screen.getByLabelText('Guardrail'), { target: { value: 'gr-1' } })
    expect(useRunConfigStore.getState().guardrail).toEqual({ id: 'gr-1', trace: true })

    fireEvent.change(screen.getByLabelText('Guardrail'), { target: { value: '' } })
    expect(useRunConfigStore.getState().guardrail).toBeNull()
  })
})

describe('RunControls tools toggle', () => {
  it('toggling "Enable tools" flips tools_enabled and enables the max-iterations field', () => {
    render(<RunControls />)

    const checkbox = screen.getByLabelText('Enable tools')
    const maxIterations = screen.getByLabelText('Max tool iterations')
    expect(checkbox).not.toBeChecked()
    expect(maxIterations).toBeDisabled()

    fireEvent.click(checkbox)

    expect(useRunConfigStore.getState().tools_enabled).toBe(true)
    expect(checkbox).toBeChecked()
    expect(maxIterations).toBeEnabled()
  })

  it('typing a max-iterations value updates the store; a non-numeric value falls back to 1', () => {
    useRunConfigStore.setState({ tools_enabled: true })
    render(<RunControls />)

    const maxIterations = screen.getByLabelText('Max tool iterations')
    fireEvent.change(maxIterations, { target: { value: '25' } })
    expect(useRunConfigStore.getState().max_tool_iterations).toBe(25)

    fireEvent.change(maxIterations, { target: { value: 'not-a-number' } })
    expect(useRunConfigStore.getState().max_tool_iterations).toBe(1)
  })
})

describe('RunControls inference parameters', () => {
  it('is collapsed by default and expands on click, toggling the disclosure caret and aria-expanded', () => {
    render(<RunControls />)

    expect(screen.queryByLabelText('Temperature')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /Inference parameters/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle.textContent).toContain('▸')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle.textContent).toContain('▾')
    expect(screen.getByLabelText('Temperature')).toBeInTheDocument()
    expect(screen.getByLabelText('Top P')).toBeInTheDocument()
    expect(screen.getByLabelText('Max tokens')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(screen.queryByLabelText('Temperature')).not.toBeInTheDocument()
  })

  it('editing temperature/top-p/max-tokens writes finite numbers, and blanking a field deletes the key', () => {
    render(<RunControls />)
    fireEvent.click(screen.getByRole('button', { name: /Inference parameters/ }))

    fireEvent.change(screen.getByLabelText('Temperature'), { target: { value: '0.7' } })
    expect(useRunConfigStore.getState().inference.temperature).toBe(0.7)

    fireEvent.change(screen.getByLabelText('Top P'), { target: { value: '0.9' } })
    expect(useRunConfigStore.getState().inference.top_p).toBe(0.9)

    fireEvent.change(screen.getByLabelText('Max tokens'), { target: { value: '512' } })
    expect(useRunConfigStore.getState().inference.max_tokens).toBe(512)

    // Blanking a field drops the key entirely rather than writing NaN/0.
    fireEvent.change(screen.getByLabelText('Temperature'), { target: { value: '' } })
    expect(useRunConfigStore.getState().inference).not.toHaveProperty('temperature')
    expect(useRunConfigStore.getState().inference.top_p).toBe(0.9)
  })
})

describe('RunControls run/cancel buttons', () => {
  it('disables Run when the config cannot run, and Cancel when nothing is running', () => {
    useRunConfigStore.setState({ model_id: '', user_prompt: '' })
    render(<RunControls />)

    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('clicking Run builds the request from the live config and calls startRun; label flips to Running… while in flight', () => {
    const startRun = vi.fn().mockResolvedValue(undefined)
    useRunStore.setState({ startRun })
    useRunConfigStore.setState({
      model_id: 'claude-3',
      user_prompt: 'hello',
      provider: 'bedrock',
      tools_enabled: true,
      max_tool_iterations: 5
    })

    render(<RunControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    expect(startRun).toHaveBeenCalledTimes(1)
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        model_id: 'claude-3',
        user_prompt: 'hello',
        provider: 'bedrock',
        tools_enabled: true,
        max_tool_iterations: 5
      })
    )
  })

  it('while running, Run is disabled and shows "Running…"; Cancel is enabled and calls cancelRun', () => {
    const cancelRun = vi.fn()
    useRunStore.setState({ status: 'streaming', cancelRun })
    useRunConfigStore.setState({ model_id: 'claude-3', user_prompt: 'hi' })

    render(<RunControls />)

    const runButton = screen.getByRole('button', { name: 'Running…' })
    expect(runButton).toBeDisabled()

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    expect(cancelButton).toBeEnabled()
    fireEvent.click(cancelButton)
    expect(cancelRun).toHaveBeenCalledTimes(1)
  })
})
