/** scenarioStore: idempotent catalog loads and the detail cache. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelListResponse, ScenarioDetail, ScenarioListResponse } from '../../api'

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

const { ApiError } = await import('../../api')
const {
  useScenarioStore,
  findModel,
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

const modelsResponse: ModelListResponse = {
  models: [
    {
      model_id: 'anthropic.claude-3-sonnet',
      name: 'Claude 3 Sonnet',
      provider: 'Anthropic',
      supports_streaming: true,
      kind: 'foundation-model'
    }
  ],
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

    scenariosListMock.mockResolvedValueOnce(listResponse)
    await useScenarioStore.getState().loadScenarios()
    expect(useScenarioStore.getState().scenariosError).toBeNull()
    expect(useScenarioStore.getState().scenarios).toHaveLength(1)
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
  })

  it('findModel looks a row up by model_id', async () => {
    modelsListMock.mockResolvedValue(modelsResponse)
    await useScenarioStore.getState().loadModels()

    const models = useScenarioStore.getState().models
    expect(findModel(models, 'anthropic.claude-3-sonnet')?.name).toBe('Claude 3 Sonnet')
    expect(findModel(models, 'nope')).toBeNull()
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
  })

  it('selectScenarioDetail tolerates a null id', () => {
    expect(selectScenarioDetail(null)(useScenarioStore.getState())).toBeNull()
    expect(selectScenarioLoading(null)(useScenarioStore.getState())).toBe(false)
  })
})
