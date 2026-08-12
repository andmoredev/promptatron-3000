/**
 * ModelPanel driven by a scripted `scenarioStore` — in particular the
 * error path (no AWS creds / PROMPTATRON_FAKE_MODEL dev runs), where the
 * catalog never loads and a model id must be typeable by hand — and the
 * multi-provider grouping (unconfigured / unreachable sources).
 */
// @ts-nocheck


import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ModelPanel from '../ModelPanel'
import { DEFAULT_RUN_CONFIG, useRunConfigStore, useScenarioStore } from '../../../stores'
import type { ModelInfo, ModelProviders } from '../../../api'

const MODELS: ModelInfo[] = [
  {
    model_id: 'amazon.nova-pro-v1:0',
    name: 'Nova Pro',
    provider: 'Amazon',
    supports_streaming: true,
    kind: 'foundation-model',
    source: 'bedrock'
  }
]

const MULTI_PROVIDER_MODELS: ModelInfo[] = [
  {
    model_id: 'amazon.nova-pro-v1:0',
    name: 'Nova Pro',
    provider: 'Amazon',
    supports_streaming: true,
    kind: 'foundation-model',
    source: 'bedrock'
  },
  {
    model_id: 'claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'Anthropic',
    supports_streaming: true,
    kind: 'foundation-model',
    source: 'anthropic'
  },
  {
    model_id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    supports_streaming: true,
    kind: 'foundation-model',
    source: 'openai'
  },
  {
    model_id: 'llama3',
    name: 'Llama 3',
    provider: 'Ollama',
    supports_streaming: false,
    kind: 'foundation-model',
    source: 'ollama'
  }
]

const ALL_CONFIGURED: ModelProviders = {
  bedrock: { configured: true },
  anthropic: { configured: true },
  openai: { configured: true },
  ollama: { configured: true, reachable: true }
}

beforeEach(() => {
  useRunConfigStore.setState({ ...DEFAULT_RUN_CONFIG })
  useScenarioStore.setState({
    models: [],
    modelsLoading: false,
    modelsLoaded: false,
    modelsError: null,
    modelsCached: false,
    modelProviders: null,
    loadModels: vi.fn().mockResolvedValue(undefined)
  })
})

describe('ModelPanel', () => {
  it('renders the catalog dropdown when models load successfully', () => {
    useScenarioStore.setState({ models: MODELS, modelsLoaded: true })

    render(<ModelPanel />)

    expect(screen.getByRole('combobox', { name: 'Model' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Enter model id manually')).not.toBeInTheDocument()
  })

  it('offers a manual model id input when the catalog fails to load', () => {
    useScenarioStore.setState({
      models: [],
      modelsLoaded: false,
      modelsError: { code: 'upstream_error', message: 'Failed to list models: no credentials' }
    })

    render(<ModelPanel />)

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load models')
    expect(screen.getByLabelText('Enter model id manually')).toBeInTheDocument()
  })

  it('writes a manually typed model id straight into runConfigStore', () => {
    useScenarioStore.setState({
      models: [],
      modelsLoaded: false,
      modelsError: { code: 'upstream_error', message: 'no credentials' }
    })

    render(<ModelPanel />)

    fireEvent.change(screen.getByLabelText('Enter model id manually'), {
      target: { value: 'fake.model-v1' }
    })

    expect(useRunConfigStore.getState().model_id).toBe('fake.model-v1')
  })

  it('offers a provider select next to the manual model id fallback, defaulting to bedrock', () => {
    useScenarioStore.setState({
      models: [],
      modelsLoaded: false,
      modelsError: { code: 'upstream_error', message: 'no credentials' }
    })

    render(<ModelPanel />)

    const providerSelect = screen.getByLabelText('Provider') as HTMLSelectElement
    expect(providerSelect.value).toBe('bedrock')

    fireEvent.change(providerSelect, { target: { value: 'openai' } })
    expect(useRunConfigStore.getState().provider).toBe('openai')
  })

  it('selecting a catalog model sets both model_id and provider', () => {
    useScenarioStore.setState({
      models: MULTI_PROVIDER_MODELS,
      modelsLoaded: true,
      modelProviders: ALL_CONFIGURED
    })

    render(<ModelPanel />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'claude-opus-4' }
    })

    const state = useRunConfigStore.getState()
    expect(state.model_id).toBe('claude-opus-4')
    expect(state.provider).toBe('anthropic')
  })

  it('clearing the selection back to "" writes an empty model_id without touching provider', () => {
    useScenarioStore.setState({
      models: MULTI_PROVIDER_MODELS,
      modelsLoaded: true,
      modelProviders: ALL_CONFIGURED
    })
    useRunConfigStore.setState({ model_id: 'claude-opus-4', provider: 'anthropic' })

    render(<ModelPanel />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: '' }
    })

    const state = useRunConfigStore.getState()
    expect(state.model_id).toBe('')
    expect(state.provider).toBe('anthropic')
  })

  it('shows a "cached" badge when the catalog came from the server cache', () => {
    useScenarioStore.setState({ models: MODELS, modelsLoaded: true, modelsCached: true })
    render(<ModelPanel />)
    expect(screen.getByText('cached')).toBeInTheDocument()
    expect(screen.getByText('cached')).toHaveAttribute(
      'title',
      "Served from the server's catalog cache"
    )
  })

  it('shows no "cached" badge when the catalog was freshly fetched', () => {
    useScenarioStore.setState({ models: MODELS, modelsLoaded: true, modelsCached: false })
    render(<ModelPanel />)
    expect(screen.queryByText('cached')).not.toBeInTheDocument()
  })

  it('groups options by source with Bedrock / Anthropic / OpenAI / Ollama (local) labels', () => {
    useScenarioStore.setState({
      models: MULTI_PROVIDER_MODELS,
      modelsLoaded: true,
      modelProviders: ALL_CONFIGURED
    })

    render(<ModelPanel />)

    const select = screen.getByRole('combobox', { name: 'Model' })
    const groupLabels = within(select)
      .getAllByRole('group')
      .map((group) => group.getAttribute('label'))

    expect(groupLabels).toEqual(['Bedrock', 'Anthropic', 'OpenAI', 'Ollama (local)'])
  })

  it('marks an unconfigured provider group as disabled with a "(not configured)" suffix', () => {
    useScenarioStore.setState({
      models: MULTI_PROVIDER_MODELS,
      modelsLoaded: true,
      modelProviders: {
        bedrock: { configured: true },
        anthropic: { configured: false },
        openai: { configured: true },
        ollama: { configured: true, reachable: true }
      }
    })

    render(<ModelPanel />)

    const select = screen.getByRole('combobox', { name: 'Model' })
    const anthropicGroup = within(select)
      .getAllByRole('group')
      .find((group) => group.getAttribute('label')?.startsWith('Anthropic'))

    expect(anthropicGroup).toHaveAttribute('label', 'Anthropic (not configured)')
    expect(anthropicGroup).toBeDisabled()
  })

  it('marks a configured-but-unreachable ollama group with "(unreachable)"', () => {
    useScenarioStore.setState({
      models: MULTI_PROVIDER_MODELS,
      modelsLoaded: true,
      modelProviders: {
        bedrock: { configured: true },
        anthropic: { configured: true },
        openai: { configured: true },
        ollama: { configured: true, reachable: false }
      }
    })

    render(<ModelPanel />)

    const select = screen.getByRole('combobox', { name: 'Model' })
    const ollamaGroup = within(select)
      .getAllByRole('group')
      .find((group) => group.getAttribute('label')?.startsWith('Ollama'))

    expect(ollamaGroup).toHaveAttribute('label', 'Ollama (local) (unreachable)')
    expect(ollamaGroup).toBeDisabled()
  })

  it('footnotes providers with no catalog rows that are also unconfigured', () => {
    // Only bedrock models come back — no openai/ollama rows at all — and the
    // providers block says those two are unconfigured.
    useScenarioStore.setState({
      models: MODELS,
      modelsLoaded: true,
      modelProviders: {
        bedrock: { configured: true },
        anthropic: { configured: true },
        openai: { configured: false },
        ollama: { configured: false, reachable: null }
      }
    })

    render(<ModelPanel />)

    expect(screen.getByText(/Not shown:/)).toHaveTextContent(
      'Not shown: OpenAI (not configured), Ollama (local) (not configured)'
    )
  })

  it('treats a missing providers object as "only bedrock is usable" without crashing', () => {
    useScenarioStore.setState({
      models: MULTI_PROVIDER_MODELS,
      modelsLoaded: true,
      modelProviders: null
    })

    render(<ModelPanel />)

    const select = screen.getByRole('combobox', { name: 'Model' })
    const bedrockGroup = within(select)
      .getAllByRole('group')
      .find((group) => group.getAttribute('label') === 'Bedrock')
    const anthropicGroup = within(select)
      .getAllByRole('group')
      .find((group) => group.getAttribute('label')?.startsWith('Anthropic'))

    expect(bedrockGroup).not.toBeDisabled()
    expect(anthropicGroup).toBeDisabled()
  })
})
