/**
 * ModelPanel driven by a scripted `scenarioStore` — in particular the
 * error path (no AWS creds / PROMPTATRON_FAKE_MODEL dev runs), where the
 * catalog never loads and a model id must be typeable by hand.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ModelPanel from '../ModelPanel'
import { DEFAULT_RUN_CONFIG, useRunConfigStore, useScenarioStore } from '../../../stores'
import type { ModelInfo } from '../../../api'

const MODELS: ModelInfo[] = [
  {
    model_id: 'amazon.nova-pro-v1:0',
    name: 'Nova Pro',
    provider: 'Amazon',
    supports_streaming: true,
    kind: 'foundation-model'
  }
]

beforeEach(() => {
  useRunConfigStore.setState({ ...DEFAULT_RUN_CONFIG })
  useScenarioStore.setState({
    models: [],
    modelsLoading: false,
    modelsLoaded: false,
    modelsError: null,
    modelsCached: false,
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
})
