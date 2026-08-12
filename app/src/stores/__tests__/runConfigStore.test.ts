/** runConfigStore: persistence round-trip, scenario prefill, request building. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScenarioDetail } from '../../api'

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>()
  return { ...actual, api: { ...actual.api } }
})

const {
  useRunConfigStore,
  toRunRequest,
  scenarioDefaults,
  selectCanRun,
  DEFAULT_RUN_CONFIG,
  RUN_CONFIG_STORAGE_KEY
} = await import('../runConfigStore')

const scenario: ScenarioDetail = {
  id: 'shipping',
  name: 'Shipping support',
  description: 'Carrier lookups',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
  systemPrompts: [
    { id: 'sp-1', name: 'Terse agent', content: 'You are a terse support agent.' },
    { id: 'sp-2', name: 'Chatty agent', content: 'You are chatty.' }
  ],
  userPrompts: [
    { id: 'up-1', name: 'Where is my order', content: 'Where is order B456?' },
    { id: 'up-2', name: 'Refund', content: 'I want a refund.' }
  ],
  tools: [
    {
      name: 'getCarrierStatus',
      description: 'Look up a carrier status',
      inputSchema: { type: 'object' },
      handlerKey: 'carrier.status'
    }
  ],
  datasets: [{ id: 'ds-1', name: 'Orders', description: null, contentType: 'text/csv' }]
}

beforeEach(() => {
  localStorage.clear()
  useRunConfigStore.setState({ ...DEFAULT_RUN_CONFIG })
})

describe('defaults', () => {
  it('starts from DEFAULT_RUN_CONFIG with streaming on', () => {
    const state = useRunConfigStore.getState()
    expect(state.model_id).toBe('')
    expect(state.provider).toBe('bedrock')
    expect(state.stream).toBe(true)
    expect(state.tools_enabled).toBe(false)
    expect(state.max_tool_iterations).toBe(10)
    expect(state.guardrail).toBeNull()
    expect(state.inference).toEqual({})
  })

  it('selectCanRun needs a model and a user prompt', () => {
    expect(selectCanRun(useRunConfigStore.getState())).toBe(false)
    useRunConfigStore.getState().setModelId('anthropic.claude-3-sonnet')
    expect(selectCanRun(useRunConfigStore.getState())).toBe(false)
    useRunConfigStore.getState().setUserPrompt('hello')
    expect(selectCanRun(useRunConfigStore.getState())).toBe(true)
  })

  it('selectCanRun treats a whitespace-only model id or user prompt as unset', () => {
    useRunConfigStore.getState().setModelId('   ')
    useRunConfigStore.getState().setUserPrompt('hello')
    expect(selectCanRun(useRunConfigStore.getState())).toBe(false)

    useRunConfigStore.getState().setModelId('m')
    useRunConfigStore.getState().setUserPrompt('  \t ')
    expect(selectCanRun(useRunConfigStore.getState())).toBe(false)
  })
})

describe('setters', () => {
  it('merges inference patches and deletes keys set to undefined', () => {
    const { setInference } = useRunConfigStore.getState()
    setInference({ temperature: 0.2 })
    setInference({ max_tokens: 512 })
    expect(useRunConfigStore.getState().inference).toEqual({ temperature: 0.2, max_tokens: 512 })

    setInference({ temperature: undefined })
    expect(useRunConfigStore.getState().inference).toEqual({ max_tokens: 512 })
  })

  it('selectSystemPrompt/selectUserPrompt set text and id together', () => {
    const state = useRunConfigStore.getState()
    state.selectSystemPrompt('sp-2', 'You are chatty.')
    state.selectUserPrompt('up-2', 'I want a refund.')

    const next = useRunConfigStore.getState()
    expect(next.system_prompt).toBe('You are chatty.')
    expect(next.system_prompt_id).toBe('sp-2')
    expect(next.user_prompt).toBe('I want a refund.')
    expect(next.user_prompt_id).toBe('up-2')
  })

  it('selectSystemPrompt/selectUserPrompt update only the id and leave prompt text alone when content is omitted', () => {
    const state = useRunConfigStore.getState()
    state.setSystemPrompt('Existing system text')
    state.setUserPrompt('Existing user text')

    state.selectSystemPrompt('sp-3')
    state.selectUserPrompt('up-3')

    const next = useRunConfigStore.getState()
    expect(next.system_prompt_id).toBe('sp-3')
    expect(next.system_prompt).toBe('Existing system text')
    expect(next.user_prompt_id).toBe('up-3')
    expect(next.user_prompt).toBe('Existing user text')
  })

  it('reset() restores the defaults', () => {
    const state = useRunConfigStore.getState()
    state.setModelId('m')
    state.setUserPrompt('p')
    state.setGuardrail({ id: 'gr-1', version: 'DRAFT', trace: true })
    state.reset()

    const next = useRunConfigStore.getState()
    expect(next.model_id).toBe('')
    expect(next.user_prompt).toBe('')
    expect(next.guardrail).toBeNull()
    expect(next.provider).toBe('bedrock')
  })
})

describe('provider / guardrail invariant', () => {
  it('selectModel sets model_id and provider together', () => {
    useRunConfigStore.getState().selectModel('claude-3-opus', 'anthropic')

    const state = useRunConfigStore.getState()
    expect(state.model_id).toBe('claude-3-opus')
    expect(state.provider).toBe('anthropic')
  })

  it('setProvider clears an already-selected guardrail when leaving bedrock', () => {
    useRunConfigStore.getState().setGuardrail({ id: 'gr-1', trace: true })
    expect(useRunConfigStore.getState().guardrail).not.toBeNull()

    useRunConfigStore.getState().setProvider('openai')

    const state = useRunConfigStore.getState()
    expect(state.provider).toBe('openai')
    expect(state.guardrail).toBeNull()
  })

  it('selectModel clears an already-selected guardrail when switching to a non-bedrock model', () => {
    useRunConfigStore.getState().setGuardrail({ id: 'gr-1', trace: true })

    useRunConfigStore.getState().selectModel('gpt-4o', 'openai')

    expect(useRunConfigStore.getState().guardrail).toBeNull()
  })

  it('setProvider back to bedrock does not resurrect a cleared guardrail', () => {
    useRunConfigStore.getState().setGuardrail({ id: 'gr-1', trace: true })
    useRunConfigStore.getState().setProvider('openai')
    useRunConfigStore.getState().setProvider('bedrock')

    expect(useRunConfigStore.getState().guardrail).toBeNull()
  })

  it('setProvider leaves an existing guardrail alone when staying on bedrock', () => {
    useRunConfigStore.getState().setGuardrail({ id: 'gr-1', trace: true })
    useRunConfigStore.getState().setProvider('bedrock')

    expect(useRunConfigStore.getState().guardrail).toEqual({ id: 'gr-1', trace: true })
  })
})

describe('applyScenarioDefaults', () => {
  it('fills empty prompts from the first system/user prompt', () => {
    useRunConfigStore.getState().applyScenarioDefaults(scenario)

    const state = useRunConfigStore.getState()
    expect(state.scenario_id).toBe('shipping')
    expect(state.system_prompt).toBe('You are a terse support agent.')
    expect(state.system_prompt_id).toBe('sp-1')
    expect(state.user_prompt).toBe('Where is order B456?')
    expect(state.user_prompt_id).toBe('up-1')
    expect(state.dataset_id).toBe('ds-1')
    expect(state.tools_enabled).toBe(true)
  })

  it('never clobbers text the user already typed', () => {
    useRunConfigStore.getState().setUserPrompt('my own question')
    useRunConfigStore.getState().applyScenarioDefaults(scenario)

    const state = useRunConfigStore.getState()
    expect(state.user_prompt).toBe('my own question')
    expect(state.user_prompt_id).toBeNull()
    // the empty field is still filled
    expect(state.system_prompt).toBe('You are a terse support agent.')
  })

  it('is pure via scenarioDefaults and tolerates an empty scenario', () => {
    const empty: ScenarioDetail = {
      ...scenario,
      id: 'bare',
      systemPrompts: [],
      userPrompts: [],
      tools: [],
      datasets: []
    }
    expect(scenarioDefaults(DEFAULT_RUN_CONFIG, empty)).toEqual({ scenario_id: 'bare' })
  })

  it('leaves an already-chosen dataset alone', () => {
    useRunConfigStore.getState().setDatasetId('ds-other')
    useRunConfigStore.getState().applyScenarioDefaults(scenario)
    expect(useRunConfigStore.getState().dataset_id).toBe('ds-other')
  })

  it('treats whitespace-only prompt text as empty, so a scenario default still fills it in', () => {
    useRunConfigStore.getState().setSystemPrompt('   ')
    useRunConfigStore.getState().setUserPrompt('\t\n')
    useRunConfigStore.getState().applyScenarioDefaults(scenario)

    const state = useRunConfigStore.getState()
    expect(state.system_prompt).toBe('You are a terse support agent.')
    expect(state.user_prompt).toBe('Where is order B456?')
  })

  it('tolerates a scenario response missing the array fields entirely (defensive against a malformed server payload)', () => {
    const malformed = {
      ...scenario,
      systemPrompts: undefined,
      userPrompts: undefined,
      tools: undefined,
      datasets: undefined
    } as unknown as ScenarioDetail

    expect(() => scenarioDefaults(DEFAULT_RUN_CONFIG, malformed)).not.toThrow()
    expect(scenarioDefaults(DEFAULT_RUN_CONFIG, malformed)).toEqual({ scenario_id: 'shipping' })
  })
})

describe('toRunRequest', () => {
  it('omits empty optional fields', () => {
    const state = useRunConfigStore.getState()
    state.setModelId('anthropic.claude-3-sonnet')
    state.setUserPrompt('hi')

    expect(toRunRequest(useRunConfigStore.getState())).toEqual({
      model_id: 'anthropic.claude-3-sonnet',
      user_prompt: 'hi',
      tools_enabled: false,
      max_tool_iterations: 10,
      provider: 'bedrock',
      stream: true
    })
  })

  it('includes scenario, dataset, inference and guardrail when set', () => {
    const state = useRunConfigStore.getState()
    state.setModelId('m')
    state.setUserPrompt('hi')
    state.setSystemPrompt('be terse')
    state.setScenarioId('shipping')
    state.setDatasetId('ds-1')
    state.setInference({ temperature: 0.1, top_p: 0.9 })
    state.setGuardrail({ id: 'gr-1', version: '2', trace: true })
    state.setToolsEnabled(true)
    state.setMaxToolIterations(4)
    state.setStream(false)

    expect(toRunRequest(useRunConfigStore.getState())).toEqual({
      model_id: 'm',
      user_prompt: 'hi',
      system_prompt: 'be terse',
      scenario_id: 'shipping',
      dataset_id: 'ds-1',
      inference: { temperature: 0.1, top_p: 0.9 },
      guardrail: { id: 'gr-1', version: '2', trace: true },
      tools_enabled: true,
      max_tool_iterations: 4,
      provider: 'bedrock',
      stream: false
    })
  })

  it('omits a whitespace-only system prompt (trimmed to empty)', () => {
    const state = useRunConfigStore.getState()
    state.setModelId('m')
    state.setUserPrompt('hi')
    state.setSystemPrompt('   \n\t  ')

    expect(toRunRequest(useRunConfigStore.getState())).not.toHaveProperty('system_prompt')
  })

  it('always includes provider, even the bedrock default', () => {
    const state = useRunConfigStore.getState()
    state.setModelId('m')
    state.setUserPrompt('hi')

    expect(toRunRequest(useRunConfigStore.getState()).provider).toBe('bedrock')

    state.setProvider('anthropic')
    expect(toRunRequest(useRunConfigStore.getState()).provider).toBe('anthropic')
  })
})

describe('persistence', () => {
  it('writes every config field to localStorage under the v1 key', async () => {
    const state = useRunConfigStore.getState()
    state.setModelId('anthropic.claude-3-sonnet')
    state.setSystemPrompt('be terse')
    state.setUserPrompt('where is B456?')
    state.setInference({ temperature: 0.3 })
    state.setGuardrail({ id: 'gr-1', version: 'DRAFT', trace: true })

    const raw = localStorage.getItem(RUN_CONFIG_STORAGE_KEY)
    expect(raw).not.toBeNull()

    const parsed = JSON.parse(raw as string)
    expect(parsed.version).toBe(1)
    expect(parsed.state).toEqual({
      model_id: 'anthropic.claude-3-sonnet',
      provider: 'bedrock',
      system_prompt: 'be terse',
      user_prompt: 'where is B456?',
      scenario_id: null,
      dataset_id: null,
      system_prompt_id: null,
      user_prompt_id: null,
      inference: { temperature: 0.3 },
      tools_enabled: false,
      max_tool_iterations: 10,
      guardrail: { id: 'gr-1', version: 'DRAFT', trace: true },
      stream: true
    })
    // no functions leaked into the persisted payload
    expect(Object.keys(parsed.state)).toHaveLength(13)
  })

  it('round-trips: a stored payload rehydrates back into the store', async () => {
    localStorage.setItem(
      RUN_CONFIG_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          ...DEFAULT_RUN_CONFIG,
          model_id: 'amazon.nova-pro-v1:0',
          user_prompt: 'restored prompt',
          scenario_id: 'shipping',
          inference: { max_tokens: 256 },
          provider: 'anthropic',
          stream: false
        }
      })
    )

    await useRunConfigStore.persist.rehydrate()

    const state = useRunConfigStore.getState()
    expect(state.model_id).toBe('amazon.nova-pro-v1:0')
    expect(state.user_prompt).toBe('restored prompt')
    expect(state.scenario_id).toBe('shipping')
    expect(state.inference).toEqual({ max_tokens: 256 })
    expect(state.provider).toBe('anthropic')
    expect(state.stream).toBe(false)
    // actions survive rehydration
    expect(typeof state.applyScenarioDefaults).toBe('function')
  })

  it('a payload predating provider rehydrates with the bedrock default', async () => {
    // Simulates a pre-multi-provider persisted payload: no `provider` key at
    // all (not even `undefined`), the way real old localStorage looked.
    const withoutProvider: Record<string, unknown> = { ...DEFAULT_RUN_CONFIG }
    delete withoutProvider.provider
    localStorage.setItem(
      RUN_CONFIG_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          ...withoutProvider,
          model_id: 'amazon.nova-pro-v1:0',
          user_prompt: 'restored prompt'
        }
      })
    )

    await useRunConfigStore.persist.rehydrate()

    const state = useRunConfigStore.getState()
    expect(state.model_id).toBe('amazon.nova-pro-v1:0')
    expect(state.provider).toBe('bedrock')
  })
})
