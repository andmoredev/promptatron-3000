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

const { ApiError, StreamAbortedError } = await import('../../api')
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

/** A promise plus its resolver, so a test can inspect mid-flight state. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
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

  it('tolerates an abort, clearing loading without recording an error', async () => {
    listMock.mockRejectedValueOnce(new StreamAbortedError())

    await useGuardrailStore.getState().loadGuardrails()

    expect(useGuardrailStore.getState().loading).toBe(false)
    expect(useGuardrailStore.getState().error).toBeNull()
    expect(useGuardrailStore.getState().loaded).toBe(false)
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

  it('records a non-aborted loadGuardrail failure and returns null', async () => {
    getMock.mockRejectedValueOnce(new ApiError('not found', { code: 'not_found', status: 404 }))

    const result = await useGuardrailStore.getState().loadGuardrail('missing')

    expect(result).toBeNull()
    expect(useGuardrailStore.getState().detailLoading[guardrailCacheKey('missing')]).toBe(false)
    expect(useGuardrailStore.getState().error).toEqual({ code: 'not_found', message: 'not found' })
  })

  it('leaves the existing error untouched on an aborted loadGuardrail', async () => {
    useGuardrailStore.setState({ error: { code: 'stale', message: 'stale error' } })
    getMock.mockRejectedValueOnce(new StreamAbortedError())

    const result = await useGuardrailStore.getState().loadGuardrail('gr-1')

    expect(result).toBeNull()
    expect(useGuardrailStore.getState().error).toEqual({ code: 'stale', message: 'stale error' })
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

  it('removing a single version drops only that version\'s cache entry, keeping the guardrail row', async () => {
    createMock.mockResolvedValueOnce(detail)
    await useGuardrailStore.getState().createGuardrail({ name: 'pii-blocker' })
    getMock.mockResolvedValueOnce({ ...detail, version: '2' })
    await useGuardrailStore.getState().loadGuardrail('gr-1', '2')
    versionsListMock.mockResolvedValueOnce({ versions: [publishedVersion] })
    await useGuardrailStore.getState().loadVersions('gr-1')
    removeMock.mockResolvedValueOnce(undefined)

    const ok = await useGuardrailStore.getState().removeGuardrail('gr-1', '2')

    expect(ok).toBe(true)
    const state = useGuardrailStore.getState()
    // The guardrail row itself and its DRAFT detail survive; only @2 and the
    // versions list entry are gone.
    expect(state.guardrails.map((row) => row.id)).toEqual(['gr-1'])
    expect(state.details[guardrailCacheKey('gr-1')]).toBeDefined()
    expect(state.details[guardrailCacheKey('gr-1', '2')]).toBeUndefined()
    expect(state.versions['gr-1']).toBeUndefined()
  })

  it('records a remove failure as saveError and returns false, leaving caches intact', async () => {
    createMock.mockResolvedValueOnce(detail)
    await useGuardrailStore.getState().createGuardrail({ name: 'pii-blocker' })
    removeMock.mockRejectedValueOnce(new ApiError('in use', { code: 'conflict', status: 409 }))

    const ok = await useGuardrailStore.getState().removeGuardrail('gr-1')

    expect(ok).toBe(false)
    const state = useGuardrailStore.getState()
    expect(state.saving).toBe(false)
    expect(state.saveError).toEqual({ code: 'conflict', message: 'in use' })
    expect(state.guardrails.map((row) => row.id)).toEqual(['gr-1'])
  })

  it('records an update failure as saveError without touching the cached detail', async () => {
    createMock.mockResolvedValueOnce(detail)
    await useGuardrailStore.getState().createGuardrail({ name: 'pii-blocker' })
    updateMock.mockRejectedValueOnce(new ApiError('bad config', { code: 'validation_error' }))

    const updated = await useGuardrailStore.getState().updateGuardrail('gr-1', { name: 'x' })

    expect(updated).toBeNull()
    const state = useGuardrailStore.getState()
    expect(state.saveError).toEqual({ code: 'validation_error', message: 'bad config' })
    expect(state.details['gr-1']).toBe(detail)
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

  it('records a loadVersions failure and returns an empty list, without setting error on abort', async () => {
    versionsListMock.mockRejectedValueOnce(new StreamAbortedError())
    expect(await useGuardrailStore.getState().loadVersions('gr-1')).toEqual([])
    expect(useGuardrailStore.getState().error).toBeNull()

    versionsListMock.mockRejectedValueOnce(new ApiError('nope', { code: 'http_error' }))
    expect(await useGuardrailStore.getState().loadVersions('gr-2')).toEqual([])
    expect(useGuardrailStore.getState().error).toEqual({ code: 'http_error', message: 'nope' })
  })

  it('records a publishVersion failure as saveError', async () => {
    versionsCreateMock.mockRejectedValueOnce(
      new ApiError('too many versions', { code: 'conflict' })
    )

    const version = await useGuardrailStore.getState().publishVersion('gr-1', 'oops')

    expect(version).toBeNull()
    expect(useGuardrailStore.getState().saveError).toEqual({
      code: 'conflict',
      message: 'too many versions'
    })
    expect(useGuardrailStore.getState().saving).toBe(false)
  })
})

describe('in-flight state', () => {
  it('loadGuardrails sets loading:true (and clears a stale error) synchronously, before the request resolves', async () => {
    useGuardrailStore.setState({ error: { code: 'stale', message: 'stale' } })
    const d = deferred<{ guardrails: ReturnType<typeof toSummary>[] }>()
    listMock.mockReturnValueOnce(d.promise)

    const pending = useGuardrailStore.getState().loadGuardrails()

    expect(useGuardrailStore.getState().loading).toBe(true)
    expect(useGuardrailStore.getState().error).toBeNull()

    d.resolve({ guardrails: [] })
    await pending
    expect(useGuardrailStore.getState().loading).toBe(false)
  })

  it('loadGuardrail sets detailLoading[key]:true synchronously, then clears it on success', async () => {
    const d = deferred<GuardrailDetail>()
    getMock.mockReturnValueOnce(d.promise)

    const pending = useGuardrailStore.getState().loadGuardrail('gr-9')
    const key = guardrailCacheKey('gr-9')
    expect(useGuardrailStore.getState().detailLoading[key]).toBe(true)

    d.resolve(detail)
    await pending
    expect(useGuardrailStore.getState().detailLoading[key]).toBe(false)
  })

  it('createGuardrail sets saving:true (clearing saveError) synchronously, then clears it', async () => {
    useGuardrailStore.setState({ saveError: { code: 'stale', message: 'stale' } })
    const d = deferred<GuardrailDetail>()
    createMock.mockReturnValueOnce(d.promise)

    const pending = useGuardrailStore.getState().createGuardrail({ name: 'x' })
    expect(useGuardrailStore.getState().saving).toBe(true)
    expect(useGuardrailStore.getState().saveError).toBeNull()

    d.resolve(detail)
    await pending
    expect(useGuardrailStore.getState().saving).toBe(false)
  })

  it('updateGuardrail sets saving:true synchronously, then clears it', async () => {
    const d = deferred<GuardrailDetail>()
    updateMock.mockReturnValueOnce(d.promise)

    const pending = useGuardrailStore.getState().updateGuardrail('gr-1', { name: 'x' })
    expect(useGuardrailStore.getState().saving).toBe(true)

    d.resolve(detail)
    await pending
    expect(useGuardrailStore.getState().saving).toBe(false)
  })

  it('removeGuardrail sets saving:true synchronously, then clears it', async () => {
    const d = deferred<void>()
    removeMock.mockReturnValueOnce(d.promise)

    const pending = useGuardrailStore.getState().removeGuardrail('gr-1')
    expect(useGuardrailStore.getState().saving).toBe(true)

    d.resolve(undefined)
    await pending
    expect(useGuardrailStore.getState().saving).toBe(false)
  })

  it('publishVersion sets saving:true synchronously, then clears it', async () => {
    const d = deferred<GuardrailVersionSummary>()
    versionsCreateMock.mockReturnValueOnce(d.promise)

    const pending = useGuardrailStore.getState().publishVersion('gr-1')
    expect(useGuardrailStore.getState().saving).toBe(true)

    d.resolve(publishedVersion)
    await pending
    expect(useGuardrailStore.getState().saving).toBe(false)
  })
})

describe('CRUD cache precision', () => {
  it('updateGuardrail replaces only the matching row, leaving other list rows untouched', async () => {
    const other: GuardrailDetail = { ...detail, id: 'gr-2', name: 'other-guardrail' }
    createMock.mockResolvedValueOnce(detail)
    await useGuardrailStore.getState().createGuardrail({ name: 'pii-blocker' })
    createMock.mockResolvedValueOnce(other)
    await useGuardrailStore.getState().createGuardrail({ name: 'other-guardrail' })

    const updated = { ...detail, description: 'updated' }
    updateMock.mockResolvedValueOnce(updated)
    await useGuardrailStore.getState().updateGuardrail('gr-1', { name: 'pii-blocker' })

    const rows = useGuardrailStore.getState().guardrails
    expect(rows.find((r) => r.id === 'gr-1')?.description).toBe('updated')
    expect(rows.find((r) => r.id === 'gr-2')?.name).toBe('other-guardrail')
  })

  it("removeGuardrail's whole-guardrail delete does not touch a different guardrail whose id is a prefix collision", async () => {
    createMock.mockResolvedValueOnce(detail)
    await useGuardrailStore.getState().createGuardrail({ name: 'pii-blocker' })
    const other: GuardrailDetail = { ...detail, id: 'gr-10' }
    getMock.mockResolvedValueOnce(other)
    await useGuardrailStore.getState().loadGuardrail('gr-10')

    removeMock.mockResolvedValueOnce(undefined)
    await useGuardrailStore.getState().removeGuardrail('gr-1')

    // 'gr-10' must survive: it is not `gr-1` and does not start with `gr-1@`.
    expect(useGuardrailStore.getState().details[guardrailCacheKey('gr-10')]).toBeDefined()
    expect(useGuardrailStore.getState().details[guardrailCacheKey('gr-1')]).toBeUndefined()
  })

  it('removing a single version does not touch a different guardrail\'s versions list', async () => {
    versionsListMock.mockResolvedValueOnce({ versions: [publishedVersion] })
    await useGuardrailStore.getState().loadVersions('gr-1')
    versionsListMock.mockResolvedValueOnce({ versions: [{ ...publishedVersion, id: 'gr-2' }] })
    await useGuardrailStore.getState().loadVersions('gr-2')

    removeMock.mockResolvedValueOnce(undefined)
    await useGuardrailStore.getState().removeGuardrail('gr-1', '2')

    expect(useGuardrailStore.getState().versions['gr-1']).toBeUndefined()
    expect(useGuardrailStore.getState().versions['gr-2']).toBeDefined()
  })
})
