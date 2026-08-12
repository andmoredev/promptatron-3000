/** guardrailStore: list caching, DRAFT detail cache, CRUD, version publishing. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuardrailDetail, GuardrailVersionSummary } from '../../api'

const listMock = vi.fn()
const getMock = vi.fn()
const createMock = vi.fn()
const updateMock = vi.fn()
const removeMock = vi.fn()
const versionsListMock = vi.fn()
const versionsCreateMock = vi.fn()

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      guardrails: {
        ...actual.api.guardrails,
        list: listMock,
        get: getMock,
        create: createMock,
        update: updateMock,
        remove: removeMock,
        versions: { list: versionsListMock, create: versionsCreateMock }
      }
    }
  }
})

const { ApiError } = await import('../../api')
const { useGuardrailStore, guardrailCacheKey, toSummary, readyGuardrails } = await import(
  '../guardrailStore'
)

const detail: GuardrailDetail = {
  id: 'gr-1',
  arn: 'arn:aws:bedrock:us-east-1:1:guardrail/gr-1',
  name: 'pii-blocker',
  description: 'blocks pii',
  version: 'DRAFT',
  status: 'READY',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: null,
  contentPolicy: null,
  deniedTopics: [],
  wordPolicy: null,
  piiPolicy: { entities: [{ type: 'EMAIL', action: 'ANONYMIZE' }] },
  contextualGrounding: null,
  blockedInputMessage: null,
  blockedOutputMessage: null
}

const publishedVersion: GuardrailVersionSummary = {
  id: 'gr-1',
  version: '2',
  description: 'first cut'
}

beforeEach(() => {
  listMock.mockReset()
  getMock.mockReset()
  createMock.mockReset()
  updateMock.mockReset()
  removeMock.mockReset()
  versionsListMock.mockReset()
  versionsCreateMock.mockReset()
  useGuardrailStore.getState().clear()
})

describe('list', () => {
  it('loads once for two concurrent calls', async () => {
    listMock.mockResolvedValue({ guardrails: [toSummary(detail)] })

    await Promise.all([
      useGuardrailStore.getState().loadGuardrails(),
      useGuardrailStore.getState().loadGuardrails()
    ])

    expect(listMock).toHaveBeenCalledTimes(1)
    expect(useGuardrailStore.getState().guardrails).toHaveLength(1)
    expect(useGuardrailStore.getState().loaded).toBe(true)
  })

  it('records an ApiError as {code, message}', async () => {
    listMock.mockRejectedValueOnce(
      new ApiError('access denied', { code: 'upstream_error', status: 403 })
    )
    await useGuardrailStore.getState().loadGuardrails()
    expect(useGuardrailStore.getState().error).toEqual({
      code: 'upstream_error',
      message: 'access denied'
    })
  })

  it('readyGuardrails filters to attachable rows', () => {
    const rows = [toSummary(detail), { ...toSummary(detail), id: 'gr-2', status: 'CREATING' as const }]
    expect(readyGuardrails(rows).map((row) => row.id)).toEqual(['gr-1'])
  })
})

describe('detail cache', () => {
  it('caches the DRAFT under the bare id and a version under id@version', async () => {
    getMock.mockResolvedValue(detail)

    await useGuardrailStore.getState().loadGuardrail('gr-1')
    await useGuardrailStore.getState().loadGuardrail('gr-1')
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('gr-1', { version: undefined })

    await useGuardrailStore.getState().loadGuardrail('gr-1', '2')
    expect(getMock).toHaveBeenCalledTimes(2)

    const details = useGuardrailStore.getState().details
    expect(details[guardrailCacheKey('gr-1')]).toBeDefined()
    expect(details[guardrailCacheKey('gr-1', '2')]).toBeDefined()
  })

  it('invalidateGuardrail drops every cached key for that guardrail', async () => {
    getMock.mockResolvedValue(detail)
    await useGuardrailStore.getState().loadGuardrail('gr-1')
    await useGuardrailStore.getState().loadGuardrail('gr-1', '2')

    useGuardrailStore.getState().invalidateGuardrail('gr-1')
    expect(useGuardrailStore.getState().details).toEqual({})
  })
})

describe('CRUD', () => {
  it('create adds the row and caches the detail', async () => {
    createMock.mockResolvedValueOnce(detail)

    const created = await useGuardrailStore
      .getState()
      .createGuardrail({ name: 'pii-blocker', description: 'blocks pii' })

    expect(created).toBe(detail)
    const state = useGuardrailStore.getState()
    expect(state.guardrails.map((row) => row.id)).toEqual(['gr-1'])
    expect(state.details['gr-1']).toBe(detail)
    expect(state.saving).toBe(false)
  })

  it('update replaces the DRAFT cache and the list row', async () => {
    createMock.mockResolvedValueOnce(detail)
    await useGuardrailStore.getState().createGuardrail({ name: 'pii-blocker' })

    const updated = { ...detail, description: 'blocks pii and profanity' }
    updateMock.mockResolvedValueOnce(updated)
    await useGuardrailStore.getState().updateGuardrail('gr-1', { name: 'pii-blocker' })

    const state = useGuardrailStore.getState()
    expect(state.details['gr-1']).toBe(updated)
    expect(state.guardrails[0].description).toBe('blocks pii and profanity')
  })

  it('records a save failure without touching the list', async () => {
    createMock.mockRejectedValueOnce(
      new ApiError('name already in use', { code: 'conflict', status: 409 })
    )

    const created = await useGuardrailStore.getState().createGuardrail({ name: 'pii-blocker' })

    expect(created).toBeNull()
    expect(useGuardrailStore.getState().guardrails).toEqual([])
    expect(useGuardrailStore.getState().saveError).toEqual({
      code: 'conflict',
      message: 'name already in use'
    })
  })

  it('remove drops the row plus its detail and version caches', async () => {
    createMock.mockResolvedValueOnce(detail)
    await useGuardrailStore.getState().createGuardrail({ name: 'pii-blocker' })
    versionsListMock.mockResolvedValueOnce({ versions: [publishedVersion] })
    await useGuardrailStore.getState().loadVersions('gr-1')
    removeMock.mockResolvedValueOnce(undefined)

    const ok = await useGuardrailStore.getState().removeGuardrail('gr-1')

    expect(ok).toBe(true)
    const state = useGuardrailStore.getState()
    expect(state.guardrails).toEqual([])
    expect(state.details).toEqual({})
    expect(state.versions).toEqual({})
  })
})

describe('versions', () => {
  it('loadVersions caches per guardrail', async () => {
    versionsListMock.mockResolvedValue({ versions: [publishedVersion] })

    await useGuardrailStore.getState().loadVersions('gr-1')
    await useGuardrailStore.getState().loadVersions('gr-1')

    expect(versionsListMock).toHaveBeenCalledTimes(1)
    expect(useGuardrailStore.getState().versions['gr-1']).toEqual([publishedVersion])
  })

  it('publishVersion appends the new version and marks the list stale', async () => {
    listMock.mockResolvedValue({ guardrails: [toSummary(detail)] })
    await useGuardrailStore.getState().loadGuardrails()
    versionsCreateMock.mockResolvedValueOnce(publishedVersion)

    const version = await useGuardrailStore.getState().publishVersion('gr-1', 'first cut')

    expect(versionsCreateMock).toHaveBeenCalledWith('gr-1', { description: 'first cut' })
    expect(version).toBe(publishedVersion)
    expect(useGuardrailStore.getState().versions['gr-1']).toEqual([publishedVersion])
    // the list row's version/status moved on
    expect(useGuardrailStore.getState().loaded).toBe(false)
  })
})
