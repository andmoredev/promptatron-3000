/**
 * The launcher, wired to real `runConfigStore` / `scenarioStore` /
 * `settingsStore` with only `evalStore.startEvaluation` stubbed.
 */
// @ts-nocheck


import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HealthResponse, ModelInfo } from '../../../api'

/**
 * The launcher fetches `api.health()` on mount to decide whether the Cloud
 * option is selectable. Defaults `configured: true` so most tests (which
 * don't care about the toggle) don't need to wait on it; the disabled-lane
 * tests override with `mockResolvedValueOnce`/`mockRejectedValueOnce`.
 */
const healthMock = vi.fn<() => Promise<HealthResponse>>()

function health(configured: boolean): HealthResponse {
  return {
    status: 'ok',
    aws: { region: 'us-east-1', credentials: 'ok' },
    config_store: { configured: false, reachable: null },
    cloud_evals: { configured }
  }
}

vi.mock('../../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api')>()
  return { ...actual, api: { ...actual.api, health: healthMock } }
})

const DeterminismLauncher = (await import('../DeterminismLauncher')).default
const {
  DEFAULT_RUN_CONFIG,
  DEFAULT_SETTINGS,
  INITIAL_EVAL_STATE,
  useEvalStore,
  useRunConfigStore,
  useScenarioStore,
  useSettingsStore
} = await import('../../../stores')

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
  healthMock.mockReset()
  healthMock.mockResolvedValue(health(true))
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
  it('disables Start until the workbench config is valid and shows a hint', async () => {
    render(<DeterminismLauncher />)
    await waitFor(() => expect(healthMock).toHaveBeenCalledTimes(1))

    expect(
      screen.getByText(/Set a model and a user prompt in the Workbench tab/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start evaluation' })).toBeDisabled()

    act(() =>
      useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'Summarise this.' })
    )

    expect(screen.getByRole('button', { name: 'Start evaluation' })).toBeEnabled()
  })

  it('clamps N to the 2-25 range', async () => {
    useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'go' })
    render(<DeterminismLauncher />)
    await waitFor(() => expect(healthMock).toHaveBeenCalledTimes(1))

    const nInput = screen.getByLabelText(/Number of runs/i) as HTMLInputElement
    expect(nInput.value).toBe(String(DEFAULT_SETTINGS.defaultN))

    fireEvent.change(nInput, { target: { value: '1' } })
    expect(nInput.value).toBe('2')

    fireEvent.change(nInput, { target: { value: '999' } })
    expect(nInput.value).toBe('25')

    fireEvent.change(nInput, { target: { value: '12' } })
    expect(nInput.value).toBe('12')
  })

  it('starts an evaluation with the exact request, including rubric and grader prompt when filled', async () => {
    useRunConfigStore.setState({
      model_id: MODELS[1].model_id,
      system_prompt: 'You are a fraud analyst.',
      user_prompt: 'Is this suspicious?',
      tools_enabled: true
    })
    render(<DeterminismLauncher />)
    await waitFor(() => expect(healthMock).toHaveBeenCalledTimes(1))

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
        provider: 'bedrock',
        stream: true
      },
      n: 5,
      grader: {
        model_id: MODELS[0].model_id,
        provider: 'bedrock',
        system_prompt: 'You are a strict judge.'
      },
      rubric: 'Penalize inconsistent tool use.',
      execution: 'local'
    })
  })

  it('omits rubric and grader system prompt from the request when left blank', async () => {
    useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'go' })
    render(<DeterminismLauncher />)
    await waitFor(() => expect(healthMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }))

    expect(startEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'determinism',
        grader: { model_id: DEFAULT_SETTINGS.defaultGraderModelId, provider: 'bedrock' }
      })
    )
    const request = startEvaluation.mock.calls[0][0]
    expect(request.rubric).toBeUndefined()
    expect(request.grader.system_prompt).toBeUndefined()
  })

  it('sends the grader provider matching the chosen grader model source', async () => {
    useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'go' })
    useScenarioStore.setState({
      models: [
        ...MODELS,
        {
          model_id: 'gpt-4o',
          name: 'GPT-4o',
          provider: 'OpenAI',
          supports_streaming: true,
          kind: 'foundation-model',
          source: 'openai'
        }
      ],
      modelsLoaded: true
    })
    render(<DeterminismLauncher />)
    await waitFor(() => expect(healthMock).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Grader model'), { target: { value: 'gpt-4o' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }))

    expect(startEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        grader: expect.objectContaining({ model_id: 'gpt-4o', provider: 'openai' })
      })
    )
  })

  it('calls onStarted with the new evaluation id', async () => {
    useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'go' })
    const onStarted = vi.fn()
    render(<DeterminismLauncher onStarted={onStarted} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }))

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('eval-new'))
  })

  describe('Run location toggle', () => {
    it('renders both options, defaulting to "This machine"', async () => {
      render(<DeterminismLauncher />)
      await waitFor(() => expect(healthMock).toHaveBeenCalledTimes(1))

      const local = screen.getByRole('radio', { name: 'This machine' }) as HTMLInputElement
      const cloud = screen.getByRole('radio', { name: 'Cloud — persisted' }) as HTMLInputElement
      expect(local.checked).toBe(true)
      expect(cloud.checked).toBe(false)
    })

    it('seeds the toggle from settings.defaultEvalExecution', async () => {
      useSettingsStore.setState({ ...DEFAULT_SETTINGS, defaultEvalExecution: 'cloud' })
      render(<DeterminismLauncher />)
      await waitFor(() => expect(healthMock).toHaveBeenCalledTimes(1))

      expect((screen.getByRole('radio', { name: 'Cloud — persisted' }) as HTMLInputElement).checked).toBe(
        true
      )
    })

    it('switching to Cloud persists it as the new default and shows the storage note', async () => {
      render(<DeterminismLauncher />)
      await waitFor(() => expect(healthMock).toHaveBeenCalledTimes(1))

      expect(screen.queryByTestId('cloud-execution-note')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('radio', { name: 'Cloud — persisted' }))

      expect((screen.getByRole('radio', { name: 'Cloud — persisted' }) as HTMLInputElement).checked).toBe(
        true
      )
      expect(useSettingsStore.getState().defaultEvalExecution).toBe('cloud')
      expect(screen.getByTestId('cloud-execution-note')).toHaveTextContent(
        'Runs, prompts, and dataset content are persisted to your AWS account (DynamoDB) for later review.'
      )
    })

    it('disables the Cloud option with a tooltip when health reports the lane unconfigured', async () => {
      healthMock.mockReset()
      healthMock.mockResolvedValueOnce(health(false))
      render(<DeterminismLauncher />)

      await waitFor(() =>
        expect((screen.getByRole('radio', { name: 'Cloud — persisted' }) as HTMLInputElement).disabled).toBe(
          true
        )
      )
      const cloudLabel = screen.getByRole('radio', { name: 'Cloud — persisted' }).closest('label')
      expect(cloudLabel).toHaveAttribute('title', 'Cloud lane not configured on the server')
    })

    it('treats a health-check failure as unconfigured (disabled, no crash)', async () => {
      healthMock.mockReset()
      healthMock.mockRejectedValueOnce(new Error('network down'))
      render(<DeterminismLauncher />)

      await waitFor(() =>
        expect((screen.getByRole('radio', { name: 'Cloud — persisted' }) as HTMLInputElement).disabled).toBe(
          true
        )
      )
    })

    it('carries execution:"cloud" on the launch request when Cloud is selected', async () => {
      useRunConfigStore.setState({ model_id: MODELS[0].model_id, user_prompt: 'go' })
      render(<DeterminismLauncher />)
      await waitFor(() => expect(healthMock).toHaveBeenCalledTimes(1))

      fireEvent.click(screen.getByRole('radio', { name: 'Cloud — persisted' }))
      fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }))

      expect(startEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({ execution: 'cloud' })
      )
    })
  })
})
