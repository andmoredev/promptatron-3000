/**
 * The Guardrails tab: the guardrail list, per-guardrail detail/version caches,
 * and the CRUD wrappers around `api.guardrails`.
 *
 * Bedrock's model is DRAFT-plus-versions: `get`/`update` act on the mutable
 * DRAFT working copy, and `publishVersion` freezes it into a numbered version.
 * Anything that mutates a guardrail invalidates its cached detail, because the
 * server returns the *new* DRAFT and the list row's `status` may still be
 * `UPDATING`/`VERSIONING` for a moment.
 *
 * Wire casing here is camelCase (see `api/types.ts`).
 */

import { create } from 'zustand'
import { api } from '../api'
import type {
  GuardrailConfig,
  GuardrailDetail,
  GuardrailSummary,
  GuardrailVersionSummary
} from '../api'
import { isAborted, toStoreError, type StoreError } from './errors'

export interface GuardrailStateData {
  guardrails: GuardrailSummary[]
  loading: boolean
  loaded: boolean
  error: StoreError | null

  /** Detail cache keyed by `id` for the DRAFT, `id@version` for a version. */
  details: Record<string, GuardrailDetail>
  detailLoading: Record<string, boolean>

  /** `GET /guardrails/{id}/versions`, keyed by guardrail id. */
  versions: Record<string, GuardrailVersionSummary[]>

  /** True while a create/update/delete/publish is in flight. */
  saving: boolean
  saveError: StoreError | null
}

export interface GuardrailActions {
  /** `GET /guardrails`. Idempotent unless `force`. */
  loadGuardrails(force?: boolean): Promise<void>
  /** `GET /guardrails/{id}` (DRAFT unless `version`). Cached unless `force`. */
  loadGuardrail(
    guardrailId: string,
    version?: string,
    force?: boolean
  ): Promise<GuardrailDetail | null>
  /** `POST /guardrails` -> 201. Returns the new detail, or `null` on failure. */
  createGuardrail(config: GuardrailConfig): Promise<GuardrailDetail | null>
  /** `PUT /guardrails/{id}` — updates the DRAFT working copy. */
  updateGuardrail(guardrailId: string, config: GuardrailConfig): Promise<GuardrailDetail | null>
  /** `DELETE /guardrails/{id}`; a numbered `version` deletes just that version. */
  removeGuardrail(guardrailId: string, version?: string): Promise<boolean>
  /** `GET /guardrails/{id}/versions` (includes DRAFT). */
  loadVersions(guardrailId: string, force?: boolean): Promise<GuardrailVersionSummary[]>
  /** `POST /guardrails/{id}/versions` — publish the current DRAFT. */
  publishVersion(
    guardrailId: string,
    description?: string
  ): Promise<GuardrailVersionSummary | null>
  /** Drop a cached detail (and its versions) so the next load refetches. */
  invalidateGuardrail(guardrailId: string): void
  clear(): void
}

export type GuardrailStore = GuardrailStateData & GuardrailActions

export const INITIAL_GUARDRAIL_STATE: GuardrailStateData = {
  guardrails: [],
  loading: false,
  loaded: false,
  error: null,
  details: {},
  detailLoading: {},
  versions: {},
  saving: false,
  saveError: null
}

/** Cache key for a guardrail detail: the DRAFT is the bare id. */
export function guardrailCacheKey(guardrailId: string, version?: string): string {
  return version ? `${guardrailId}@${version}` : guardrailId
}

let listRequest: Promise<void> | null = null

export const useGuardrailStore = create<GuardrailStore>()((set, get) => ({
  ...INITIAL_GUARDRAIL_STATE,

  loadGuardrails: (force = false) => {
    if (!force) {
      if (listRequest) return listRequest
      if (get().loaded) return Promise.resolve()
    }

    set({ loading: true, error: null })
    listRequest = (async () => {
      try {
        const response = await api.guardrails.list()
        set({ guardrails: response.guardrails, loading: false, loaded: true })
      } catch (error) {
        if (isAborted(error)) {
          set({ loading: false })
          return
        }
        set({ loading: false, error: toStoreError(error) })
      } finally {
        listRequest = null
      }
    })()
    return listRequest
  },

  loadGuardrail: async (guardrailId, version, force = false) => {
    const key = guardrailCacheKey(guardrailId, version)
    if (!force) {
      const cached = get().details[key]
      if (cached) return cached
    }

    set((state) => ({ detailLoading: { ...state.detailLoading, [key]: true } }))
    try {
      const detail = await api.guardrails.get(guardrailId, { version })
      set((state) => ({
        details: { ...state.details, [key]: detail },
        detailLoading: { ...state.detailLoading, [key]: false }
      }))
      return detail
    } catch (error) {
      set((state) => ({
        detailLoading: { ...state.detailLoading, [key]: false },
        error: isAborted(error) ? state.error : toStoreError(error)
      }))
      return null
    }
  },

  createGuardrail: async (config) => {
    set({ saving: true, saveError: null })
    try {
      const detail = await api.guardrails.create(config)
      set((state) => ({
        saving: false,
        details: { ...state.details, [guardrailCacheKey(detail.id)]: detail },
        guardrails: [...state.guardrails, toSummary(detail)]
      }))
      return detail
    } catch (error) {
      set({ saving: false, saveError: toStoreError(error) })
      return null
    }
  },

  updateGuardrail: async (guardrailId, config) => {
    set({ saving: true, saveError: null })
    try {
      const detail = await api.guardrails.update(guardrailId, config)
      set((state) => ({
        saving: false,
        details: { ...state.details, [guardrailCacheKey(guardrailId)]: detail },
        guardrails: state.guardrails.map((row) =>
          row.id === guardrailId ? toSummary(detail) : row
        )
      }))
      return detail
    } catch (error) {
      set({ saving: false, saveError: toStoreError(error) })
      return null
    }
  },

  removeGuardrail: async (guardrailId, version) => {
    set({ saving: true, saveError: null })
    try {
      await api.guardrails.remove(guardrailId, { version })
    } catch (error) {
      set({ saving: false, saveError: toStoreError(error) })
      return false
    }
    set((state) => {
      const details = { ...state.details }
      const versions = { ...state.versions }
      if (version) {
        delete details[guardrailCacheKey(guardrailId, version)]
        delete versions[guardrailId]
        return { saving: false, details, versions }
      }
      // Whole-guardrail delete: drop every cached key for it.
      for (const key of Object.keys(details)) {
        if (key === guardrailId || key.startsWith(`${guardrailId}@`)) delete details[key]
      }
      delete versions[guardrailId]
      return {
        saving: false,
        details,
        versions,
        guardrails: state.guardrails.filter((row) => row.id !== guardrailId)
      }
    })
    return true
  },

  loadVersions: async (guardrailId, force = false) => {
    if (!force) {
      const cached = get().versions[guardrailId]
      if (cached) return cached
    }
    try {
      const response = await api.guardrails.versions.list(guardrailId)
      set((state) => ({
        versions: { ...state.versions, [guardrailId]: response.versions }
      }))
      return response.versions
    } catch (error) {
      if (!isAborted(error)) set({ error: toStoreError(error) })
      return []
    }
  },

  publishVersion: async (guardrailId, description) => {
    set({ saving: true, saveError: null })
    try {
      const version = await api.guardrails.versions.create(guardrailId, { description })
      set((state) => {
        const existing = state.versions[guardrailId] ?? []
        return {
          saving: false,
          versions: { ...state.versions, [guardrailId]: [...existing, version] }
        }
      })
      // The list row's `status`/`version` moved on; refetch it lazily.
      set({ loaded: false })
      return version
    } catch (error) {
      set({ saving: false, saveError: toStoreError(error) })
      return null
    }
  },

  invalidateGuardrail: (guardrailId) => {
    set((state) => {
      const details = { ...state.details }
      for (const key of Object.keys(details)) {
        if (key === guardrailId || key.startsWith(`${guardrailId}@`)) delete details[key]
      }
      const versions = { ...state.versions }
      delete versions[guardrailId]
      return { details, versions }
    })
  },

  clear: () => {
    listRequest = null
    set({ ...INITIAL_GUARDRAIL_STATE })
  }
}))

/** Pure: narrow a `GuardrailDetail` to its list-row fields. */
export function toSummary(detail: GuardrailDetail): GuardrailSummary {
  return {
    id: detail.id,
    arn: detail.arn,
    name: detail.name,
    description: detail.description,
    version: detail.version,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt
  }
}

/** Selector factory: a cached detail (DRAFT unless `version`). */
export const selectGuardrailDetail =
  (guardrailId: string | null, version?: string) =>
  (state: GuardrailStateData): GuardrailDetail | null =>
    guardrailId ? (state.details[guardrailCacheKey(guardrailId, version)] ?? null) : null

/**
 * Pure: guardrails that can actually be attached to a run.
 *
 * A plain helper rather than a selector — it builds a new array, and a zustand
 * v5 selector that does that fails `useSyncExternalStore`'s snapshot identity
 * check. Select `state.guardrails` and call this in render.
 */
export function readyGuardrails(guardrails: GuardrailSummary[]): GuardrailSummary[] {
  return guardrails.filter((row) => row.status === 'READY')
}
