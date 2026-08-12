/**
 * The launcher, wired to real `runConfigStore` / `scenarioStore` /
 * `settingsStore` with only `evalStore.startEvaluation` stubbed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DeterminismLauncher from '../DeterminismLauncher'
import {
  DEFAULT_RUN_CONFIG,
  DEFAULT_SETTINGS,
  INITIAL_EVAL_STATE,
  useEvalStore,
  useRunConfigStore,
  useScenarioStore,
  useSettingsStore
} from '../../../stores'
import type { ModelInfo } from '../../../api'

const MODELS: ModelInfo[] = [
  {
    model_id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    supports_streaming: true,
    kind: 'foundation-model'
  },
  {
    model_id: 'amazon.nova-pro-v1:0',
    name: 'Nova Pro',
    provider: 'Amazon',
    supports_streaming: true,
    kind: 'foundation-model'
  }
]

const startEvaluation = vi.fn().mockResolvedValue('eval-new')

beforeEach(() => {
  startEvaluation.mockClear()
  startEvaluation.mockResolvedValue('eval-new')
  useEvalStore.setState({ ...INITIAL_EVAL_STATE, startEvaluation })
  useRunConfigStore.setState({ ...DEFAULT_RUN_CONFIG })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS })
  useScenarioStore.setState({
    models: MODELS,
    modelsLoaded: true,
    scenarios: [],
    scenariosLoaded: true,
    loadModels: vi.fn().mockResolvedValue(undefined),
    loadScenarios: vi.fn().mockResolvedValue(undefined)
  })
})

describe('DeterminismLauncher', () => {
  it('disables Start until the workbench config is valid and shows a hint', () => {
    render(<DeterminismLauncher />)

    expect(
      screen.getByText(/Set a model and a user prompt in the Workbench tab/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start evaluation' })).toBeDisabled()

    act(() =>
      useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'Summarise this.' })
    )

    expect(screen.getByRole('button', { name: 'Start evaluation' })).toBeEnabled()
  })

  it('clamps N to the 2-25 range', () => {
    useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'go' })
    render(<DeterminismLauncher />)

    const nInput = screen.getByLabelText(/Number of runs/i) as HTMLInputElement
    expect(nInput.value).toBe(String(DEFAULT_SETTINGS.defaultN))

    fireEvent.change(nInput, { target: { value: '1' } })
    expect(nInput.value).toBe('2')

    fireEvent.change(nInput, { target: { value: '999' } })
    expect(nInput.value).toBe('25')

    fireEvent.change(nInput, { target: { value: '12' } })
    expect(nInput.value).toBe('12')
  })

  it('starts an evaluation with the exact request, including rubric and grader prompt when filled', () => {
    useRunConfigStore.setState({
      model_id: MODELS[1].model_id,
      system_prompt: 'You are a fraud analyst.',
      user_prompt: 'Is this suspicious?',
      tools_enabled: true
    })
    render(<DeterminismLauncher />)

    fireEvent.change(screen.getByLabelText(/Number of runs/i), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Grader model'), {
      target: { value: MODELS[0].model_id }
    })
    fireEvent.change(screen.getByLabelText(/Custom rubric/i), {
      target: { value: 'Penalize inconsistent tool use.' }
    })

    fireEvent.click(screen.getByRole('button', { name: /Advanced grading/i }))
    fireEvent.change(screen.getByLabelText('Custom grader system prompt'), {
      target: { value: 'You are a strict judge.' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }))

    expect(startEvaluation).toHaveBeenCalledTimes(1)
    expect(startEvaluation).toHaveBeenCalledWith({
      kind: 'determinism',
      run_config: {
        model_id: MODELS[1].model_id,
        user_prompt: 'Is this suspicious?',
        system_prompt: 'You are a fraud analyst.',
        tools_enabled: true,
        max_tool_iterations: 10,
        stream: true
      },
      n: 5,
      grader: {
        model_id: MODELS[0].model_id,
        system_prompt: 'You are a strict judge.'
      },
      rubric: 'Penalize inconsistent tool use.'
    })
  })

  it('omits rubric and grader system prompt from the request when left blank', () => {
    useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'go' })
    render(<DeterminismLauncher />)

    fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }))

    expect(startEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'determinism',
        grader: { model_id: DEFAULT_SETTINGS.defaultGraderModelId }
      })
    )
    const request = startEvaluation.mock.calls[0][0]
    expect(request.rubric).toBeUndefined()
    expect(request.grader.system_prompt).toBeUndefined()
  })

  it('calls onStarted with the new evaluation id', async () => {
    useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'go' })
    const onStarted = vi.fn()
    render(<DeterminismLauncher onStarted={onStarted} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }))

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('eval-new'))
  })
})
