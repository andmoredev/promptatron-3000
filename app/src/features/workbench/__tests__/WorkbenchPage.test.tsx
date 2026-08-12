/**
 * Workbench, wired to the real `runConfigStore` with only the network-facing
 * actions stubbed.
 *
 * The point of the test is the seam between the form and the run: Run stays
 * disabled until `selectCanRun` is satisfied, and pressing it hands `startRun`
 * exactly the `toRunRequest` body — optional fields omitted rather than sent as
 * empty noise.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import WorkbenchPage from '../WorkbenchPage'
import {
  DEFAULT_RUN_CONFIG,
  INITIAL_RUN_STATE,
  useGuardrailStore,
  useRunConfigStore,
  useRunStore,
  useScenarioStore
} from '../../../stores'
import type { ModelInfo } from '../../../api'

const MODELS: ModelInfo[] = [
  {
    model_id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    supports_streaming: true,
    kind: 'foundation-model',
    source: 'bedrock'
  },
  {
    model_id: 'amazon.nova-pro-v1:0',
    name: 'Nova Pro',
    provider: 'Amazon',
    supports_streaming: true,
    kind: 'foundation-model',
    source: 'bedrock'
  }
]

const startRun = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  startRun.mockClear()
  useRunStore.setState({ ...INITIAL_RUN_STATE, startRun })
  useRunConfigStore.setState({ ...DEFAULT_RUN_CONFIG })
  useScenarioStore.setState({
    models: MODELS,
    modelsLoaded: true,
    scenarios: [],
    scenariosLoaded: true,
    details: {},
    loadModels: vi.fn().mockResolvedValue(undefined),
    loadScenarios: vi.fn().mockResolvedValue(undefined),
    loadScenario: vi.fn().mockResolvedValue(null)
  })
  useGuardrailStore.setState({
    guardrails: [],
    loaded: true,
    loadGuardrails: vi.fn().mockResolvedValue(undefined)
  })
})

describe('WorkbenchPage', () => {
  it('keeps Run disabled until a model and a user prompt are set', () => {
    render(<WorkbenchPage />)

    const runButton = screen.getByRole('button', { name: 'Run' })
    expect(runButton).toBeDisabled()

    // A model alone is not enough.
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: MODELS[0].model_id } })
    expect(runButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('User prompt'), {
      target: { value: 'Summarise this transaction.' }
    })
    expect(runButton).toBeEnabled()
  })

  it('starts a run with the toRunRequest body built from the form', () => {
    render(<WorkbenchPage />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: MODELS[1].model_id } })
    fireEvent.change(screen.getByLabelText('System prompt'), {
      target: { value: 'You are a fraud analyst.' }
    })
    fireEvent.change(screen.getByLabelText('User prompt'), {
      target: { value: 'Is this suspicious?' }
    })
    fireEvent.click(screen.getByLabelText('Enable tools'))

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    expect(startRun).toHaveBeenCalledTimes(1)
    expect(startRun).toHaveBeenCalledWith({
      model_id: 'amazon.nova-pro-v1:0',
      user_prompt: 'Is this suspicious?',
      system_prompt: 'You are a fraud analyst.',
      tools_enabled: true,
      max_tool_iterations: 10,
      provider: 'bedrock',
      stream: true
    })
  })

  it('offers Cancel only while a run is in flight', () => {
    render(<WorkbenchPage />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: MODELS[0].model_id } })
    fireEvent.change(screen.getByLabelText('User prompt'), { target: { value: 'go' } })
    act(() => useRunStore.setState({ status: 'streaming' }))

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled()
  })
})
