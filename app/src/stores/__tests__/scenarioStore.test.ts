/** scenarioStore: idempotent catalog loads and the detail cache. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ModelInfo,
  ModelListResponse,
  ModelProviders,
  ScenarioDetail,
  ScenarioListResponse
} from '../../api'

const scenariosListMock = vi.fn()
const scenariosGetMock = vi.fn()
const modelsListMock = vi.fn()

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      scenarios: { ...actual.api.scenarios, list: scenariosListMock, get: scenariosGetMock },
      models: { ...actual.api.models, list: modelsListMock }
    }
  }
})

const { ApiError, StreamAbortedError } = await import('../../api')
const {
  useScenarioStore,
  findModel,
  groupModelsBySource,
  resolveModelProviders,
  DEFAULT_MODEL_PROVIDERS,
  selectScenarioDetail,
  selectScenarioLoading
} = await import('../scenarioStore')

const listResponse: ScenarioListResponse = {
  items: [
    {
      id: 'shipping',
      name: 'Shipping support',
      description: null,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z'
    }
  ],
  count: 1,
  nextToken: null
}

const detail: ScenarioDetail = {
  ...listResponse.items[0],
  systemPrompts: [{ id: 'sp-1', name: 'Terse', content: 'Be terse.' }],
  userPrompts: [{ id: 'up-1', name: 'Order', content: 'Where is B456?' }],
  tools: [],
  datasets: []
}

const modelProviders: ModelProviders = {
  bedrock: { configured: true },
  anthropic: { configured: true },
  openai: { configured: false },
  ollama: { configured: true, reachable: false }
}

const modelsResponse: ModelListResponse = {
  models: [
    {
      model_id: 'anthropic.claude-3-sonnet',
      name: 'Claude 3 Sonnet',
      provider: 'Anthropic',
      supports_streaming: true,
      kind: 'foundation-model',
      source: 'bedrock'
    }
  ],
  providers: modelProviders,
  cached: true
}

beforeEach(() => {
  scenariosListMock.mockReset()
  scenariosGetMock.mockReset()
  modelsListMock.mockReset()
  useScenarioStore.getState().clear()
})

describe('loadScenarios', () => {
  it('hits the API once for two concurrent calls', async () => {
    scenariosListMock.mockResolvedValue(listResponse)

    await Promise.all([
      useScenarioStore.getState().loadScenarios(),
      useScenarioStore.getState().loadScenarios()
    ])

    expect(scenariosListMock).toHaveBeenCalledTimes(1)
    // `limit` is capped at 20 by the config store; the store always asks for a full page.
    expect(scenariosListMock).toHaveBeenCalledWith({ limit: 20 })
    const state = useScenarioStore.getState()
    expect(state.scenarios).toEqual(listResponse.items)
    expect(state.scenariosLoaded).toBe(true)
    expect(state.scenariosLoading).toBe(false)
  })

  it('does not refetch once loaded, unless forced', async () => {
    scenariosListMock.mockResolvedValue(listResponse)

    await useScenarioStore.getState().loadScenarios()
    await useScenarioStore.getState().loadScenarios()
    expect(scenariosListMock).toHaveBeenCalledTimes(1)

    await useScenarioStore.getState().loadScenarios(true)
    expect(scenariosListMock).toHaveBeenCalledTimes(2)
  })

  it('refetches after invalidateScenarios', async () => {
    scenariosListMock.mockResolvedValue(listResponse)
    await useScenarioStore.getState().loadScenarios()
    useScenarioStore.getState().invalidateScenarios()
    await useScenarioStore.getState().loadScenarios()
    expect(scenariosListMock).toHaveBeenCalledTimes(2)
  })

  it('stores an ApiError as {code, message} and allows a retry', async () => {
    scenariosListMock.mockRejectedValueOnce(
      new ApiError('config store unreachable', { code: 'upstream_error', status: 502 })
    )

    await useScenarioStore.getState().loadScenarios()
    expect(useScenarioStore.getState().scenariosError).toEqual({
      code: 'upstream_error',
      message: 'config store unreachable'
    })
    expect(useScenarioStore.getState().scenariosLoaded).toBe(false)
    expect(useScenarioStore.getState().scenariosLoading).toBe(false)

    scenariosListMock.mockResolvedValueOnce(listResponse)
    await useScenarioStore.getState().loadScenarios()
    expect(useScenarioStore.getState().scenariosError).toBeNull()
    expect(useScenarioStore.getState().scenarios).toHaveLength(1)
  })

  it('tolerates an abort, clearing loading without recording an error', async () => {
    scenariosListMock.mockRejectedValueOnce(new StreamAbortedError())

    await useScenarioStore.getState().loadScenarios()

    expect(useScenarioStore.getState().scenariosLoading).toBe(false)
    expect(useScenarioStore.getState().scenariosError).toBeNull()
    expect(useScenarioStore.getState().scenariosLoaded).toBe(false)
  })
})

describe('loadModels', () => {
  it('hits the API once for two concurrent calls', async () => {
    modelsListMock.mockResolvedValue(modelsResponse)

    await Promise.all([
      useScenarioStore.getState().loadModels(),
      useScenarioStore.getState().loadModels()
    ])

    expect(modelsListMock).toHaveBeenCalledTimes(1)
    const state = useScenarioStore.getState()
    expect(state.models).toEqual(modelsResponse.models)
    expect(state.modelsCached).toBe(true)
    expect(state.modelsLoaded).toBe(true)
    expect(state.modelProviders).toEqual(modelProviders)
  })

  it('findModel looks a row up by model_id', async () => {
    modelsListMock.mockResolvedValue(modelsResponse)
    await useScenarioStore.getState().loadModels()

    const models = useScenarioStore.getState().models
    expect(findModel(models, 'anthropic.claude-3-sonnet')?.name).toBe('Claude 3 Sonnet')
    expect(findModel(models, 'nope')).toBeNull()
  })

  it('stores modelProviders as null when the server omits it (older/fake-mode)', async () => {
    modelsListMock.mockResolvedValue({ models: modelsResponse.models, cached: false })
    await useScenarioStore.getState().loadModels()

    expect(useScenarioStore.getState().modelProviders).toBeNull()
  })

  it('tolerates an abort, clearing loading without recording an error', async () => {
    modelsListMock.mockRejectedValueOnce(new StreamAbortedError())

    await useScenarioStore.getState().loadModels()

    expect(useScenarioStore.getState().modelsLoading).toBe(false)
    expect(useScenarioStore.getState().modelsError).toBeNull()
    expect(useScenarioStore.getState().modelsLoaded).toBe(false)
  })

  it('records a real loadModels failure as modelsError', async () => {
    modelsListMock.mockRejectedValueOnce(new ApiError('down', { code: 'http_error' }))

    await useScenarioStore.getState().loadModels()

    expect(useScenarioStore.getState().modelsError).toEqual({ code: 'http_error', message: 'down' })
    expect(useScenarioStore.getState().modelsLoading).toBe(false)
  })

  it('retries on a later call after a failed fetch, rather than replaying the stale in-flight request', async () => {
    modelsListMock.mockRejectedValueOnce(new ApiError('down', { code: 'http_error' }))
    await useScenarioStore.getState().loadModels()
    expect(modelsListMock).toHaveBeenCalledTimes(1)

    modelsListMock.mockResolvedValueOnce(modelsResponse)
    await useScenarioStore.getState().loadModels()

    expect(modelsListMock).toHaveBeenCalledTimes(2)
    expect(useScenarioStore.getState().modelsLoaded).toBe(true)
  })
})

describe('resolveModelProviders', () => {
  it('passes through a real providers object unchanged', () => {
    expect(resolveModelProviders(modelProviders)).toBe(modelProviders)
  })

  it('falls back to "only bedrock configured" for null/undefined', () => {
    expect(resolveModelProviders(null)).toEqual(DEFAULT_MODEL_PROVIDERS)
    expect(resolveModelProviders(undefined)).toEqual(DEFAULT_MODEL_PROVIDERS)
    expect(DEFAULT_MODEL_PROVIDERS.bedrock.configured).toBe(true)
    expect(DEFAULT_MODEL_PROVIDERS.anthropic.configured).toBe(false)
    expect(DEFAULT_MODEL_PROVIDERS.openai.configured).toBe(false)
    expect(DEFAULT_MODEL_PROVIDERS.ollama).toEqual({ configured: false, reachable: null })
  })
})

describe('groupModelsBySource', () => {
  const models: ModelInfo[] = [
    {
      model_id: 'm-bedrock',
      name: 'Bedrock model',
      provider: 'Amazon',
      supports_streaming: true,
      kind: 'foundation-model',
      source: 'bedrock'
    },
    {
      model_id: 'm-anthropic',
      name: 'Anthropic model',
      provider: 'Anthropic',
      supports_streaming: true,
      kind: 'foundation-model',
      source: 'anthropic'
    },
    {
      model_id: 'm-ollama',
      name: 'Ollama model',
      provider: 'Ollama',
      supports_streaming: false,
      kind: 'foundation-model',
      source: 'ollama'
    },
    {
      model_id: 'm-no-source',
      name: 'Legacy model',
      provider: 'Amazon',
      supports_streaming: true,
      kind: 'foundation-model'
      // no `source` — pre-multi-provider / fake-mode row
    }
  ]

  it('groups in a fixed Bedrock/Anthropic/OpenAI/Ollama order, only for sources with rows', () => {
    const { groups } = groupModelsBySource(models, {
      bedrock: { configured: true },
      anthropic: { configured: true },
      openai: { configured: true },
      ollama: { configured: true, reachable: true }
    })

    expect(groups.map((g) => g.source)).toEqual(['bedrock', 'anthropic', 'ollama'])
    // the sourceless row folds into bedrock
    expect(groups[0].models.map((m) => m.model_id)).toEqual(['m-bedrock', 'm-no-source'])
    expect(groups.some((g) => g.disabled)).toBe(false)
  })

  it('disables and suffixes an unconfigured source', () => {
    const { groups } = groupModelsBySource(models, {
      bedrock: { configured: true },
      anthropic: { configured: false },
      openai: { configured: true },
      ollama: { configured: true, reachable: true }
    })

    const anthropicGroup = groups.find((g) => g.source === 'anthropic')
    expect(anthropicGroup?.disabled).toBe(true)
    expect(anthropicGroup?.label).toBe('Anthropic (not configured)')
  })

  it('disables and suffixes a configured-but-unreachable ollama, without affecting other configured sources', () => {
    const { groups } = groupModelsBySource(models, {
      bedrock: { configured: true },
      anthropic: { configured: true },
      openai: { configured: true },
      ollama: { configured: true, reachable: false }
    })

    const ollamaGroup = groups.find((g) => g.source === 'ollama')
    expect(ollamaGroup?.disabled).toBe(true)
    expect(ollamaGroup?.label).toBe('Ollama (local) (unreachable)')

    // Ollama's own unreachable flag must not leak into unrelated sources.
    const bedrockGroup = groups.find((g) => g.source === 'bedrock')
    expect(bedrockGroup?.disabled).toBe(false)
    expect(bedrockGroup?.label).toBe('Bedrock')
    const anthropicGroup = groups.find((g) => g.source === 'anthropic')
    expect(anthropicGroup?.disabled).toBe(false)
    expect(anthropicGroup?.label).toBe('Anthropic')
  })

  it('does not disable ollama when reachable is unknown (null)', () => {
    const { groups } = groupModelsBySource(models, {
      bedrock: { configured: true },
      anthropic: { configured: true },
      openai: { configured: true },
      ollama: { configured: true, reachable: null }
    })

    const ollamaGroup = groups.find((g) => g.source === 'ollama')
    expect(ollamaGroup?.disabled).toBe(false)
    expect(ollamaGroup?.label).toBe('Ollama (local)')
  })

  it('footnotes an unconfigured source that has no catalog rows at all', () => {
    const { groups, unavailable } = groupModelsBySource(models, {
      bedrock: { configured: true },
      anthropic: { configured: true },
      openai: { configured: false },
      ollama: { configured: false, reachable: null }
    })

    expect(groups.some((g) => g.source === 'openai')).toBe(false)
    expect(unavailable).toEqual([{ source: 'openai', label: 'OpenAI' }])
  })

  it('treats a missing providers object as bedrock-only, without crashing', () => {
    const { groups, unavailable } = groupModelsBySource(models, undefined)

    const bedrockGroup = groups.find((g) => g.source === 'bedrock')
    const anthropicGroup = groups.find((g) => g.source === 'anthropic')
    expect(bedrockGroup?.disabled).toBe(false)
    expect(anthropicGroup?.disabled).toBe(true)
    expect(unavailable).toEqual([{ source: 'openai', label: 'OpenAI' }])
  })
})

describe('loadScenario', () => {
  it('hits the API once for two concurrent calls and caches the result', async () => {
    scenariosGetMock.mockResolvedValue(detail)

    const [a, b] = await Promise.all([
      useScenarioStore.getState().loadScenario('shipping'),
      useScenarioStore.getState().loadScenario('shipping')
    ])

    expect(scenariosGetMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(detail)
    expect(b).toBe(detail)

    // third call, after settling, is served from the cache
    await useScenarioStore.getState().loadScenario('shipping')
    expect(scenariosGetMock).toHaveBeenCalledTimes(1)
    expect(selectScenarioDetail('shipping')(useScenarioStore.getState())).toBe(detail)
    expect(selectScenarioLoading('shipping')(useScenarioStore.getState())).toBe(false)
  })

  it('refetches after invalidateScenario', async () => {
    scenariosGetMock.mockResolvedValue(detail)
    await useScenarioStore.getState().loadScenario('shipping')
    useScenarioStore.getState().invalidateScenario('shipping')
    expect(selectScenarioDetail('shipping')(useScenarioStore.getState())).toBeNull()

    await useScenarioStore.getState().loadScenario('shipping')
    expect(scenariosGetMock).toHaveBeenCalledTimes(2)
  })

  it('keeps per-scenario errors apart', async () => {
    scenariosGetMock.mockImplementation(async (id: string) => {
      if (id === 'missing') throw new ApiError('no such scenario', { code: 'not_found', status: 404 })
      return detail
    })

    await useScenarioStore.getState().loadScenario('shipping')
    const failed = await useScenarioStore.getState().loadScenario('missing')

    expect(failed).toBeNull()
    const state = useScenarioStore.getState()
    expect(state.detailError.missing).toEqual({ code: 'not_found', message: 'no such scenario' })
    expect(state.detailError.shipping ?? null).toBeNull()
    expect(state.details.shipping).toBe(detail)

    // Starting a fresh load for a *different* scenario must not wipe the
    // error already recorded for 'missing'.
    await useScenarioStore.getState().loadScenario('shipping', true)
    expect(useScenarioStore.getState().detailError.missing).toEqual({
      code: 'not_found',
      message: 'no such scenario'
    })
  })

  it('retries on a later call after a failed fetch, rather than replaying the stale in-flight request', async () => {
    scenariosGetMock.mockRejectedValueOnce(new ApiError('boom', { code: 'http_error' }))
    await useScenarioStore.getState().loadScenario('flaky')
    expect(scenariosGetMock).toHaveBeenCalledTimes(1)

    scenariosGetMock.mockResolvedValueOnce(detail)
    const result = await useScenarioStore.getState().loadScenario('flaky')

    expect(scenariosGetMock).toHaveBeenCalledTimes(2)
    expect(result).toBe(detail)
  })

  it('selectScenarioDetail tolerates a null id', () => {
    expect(selectScenarioDetail(null)(useScenarioStore.getState())).toBeNull()
    expect(selectScenarioLoading(null)(useScenarioStore.getState())).toBe(false)
  })

  it('sets detailLoading[id]:true synchronously while the fetch is in flight, then clears it', async () => {
    let resolveGet!: (d: ScenarioDetail) => void
    scenariosGetMock.mockImplementationOnce(
      () => new Promise<ScenarioDetail>((resolve) => { resolveGet = resolve })
    )

    const pending = useScenarioStore.getState().loadScenario('shipping')
    expect(useScenarioStore.getState().detailLoading.shipping).toBe(true)

    resolveGet(detail)
    await pending
    expect(useScenarioStore.getState().detailLoading.shipping).toBe(false)
  })
})

describe('in-flight loading state', () => {
  it('loadScenarios sets scenariosLoading:true synchronously, before the request resolves', async () => {
    let resolveList!: (r: ScenarioListResponse) => void
    scenariosListMock.mockImplementationOnce(
      () => new Promise<ScenarioListResponse>((resolve) => { resolveList = resolve })
    )

    const pending = useScenarioStore.getState().loadScenarios()
    expect(useScenarioStore.getState().scenariosLoading).toBe(true)

    resolveList(listResponse)
    await pending
    expect(useScenarioStore.getState().scenariosLoading).toBe(false)
  })

  it('loadModels sets modelsLoading:true synchronously, before the request resolves', async () => {
    let resolveModels!: (r: ModelListResponse) => void
    modelsListMock.mockImplementationOnce(
      () => new Promise<ModelListResponse>((resolve) => { resolveModels = resolve })
    )

    const pending = useScenarioStore.getState().loadModels()
    expect(useScenarioStore.getState().modelsLoading).toBe(true)

    resolveModels(modelsResponse)
    await pending
    expect(useScenarioStore.getState().modelsLoading).toBe(false)
  })
})
