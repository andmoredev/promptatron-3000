/**
 * Scenarios tab: config-store CRUD for scenarios, and the entry point into
 * per-scenario prompt/dataset/tool authoring (`ScenarioDetailEditor`).
 *
 * The list (`GET /scenarios`) never carries prompt/dataset/tool counts, so a
 * row only hydrates its own detail — through `scenarioStore.loadScenario`,
 * same cache the Workbench uses — once expanded.
 *
 * Writes (create/delete here; prompts/datasets/tools inside the detail
 * editor) go straight through `api.scenarios.*` rather than the store, which
 * is read-oriented. Every successful write invalidates the relevant store
 * cache so the next read is fresh.
 */
// @ts-nocheck


import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../api'
import type { ScenarioSummary } from '../../api'
import {
  selectScenarioDetail,
  selectScenarioLoading,
  useScenarioStore
} from '../../stores'
import LoadingSpinner from '../../components/LoadingSpinner'
import ScenarioDetailEditor from './ScenarioDetailEditor'
import { isConfigStoreUnreachable } from './configStoreError'

const SLUG_PATTERN = /^[a-z0-9-]+$/

function ConfigStoreNotice() {
  return (
    <div
      className="card max-w-2xl mx-auto text-center"
      role="alert"
      data-testid="config-store-notice"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Config store not reachable</h2>
      <p className="text-sm text-gray-600">
        Deploy the SAM stack (<code className="font-mono">make deploy-api</code>) and set{' '}
        <code className="font-mono">CONFIG_API_URL</code> so the Scenarios tab can reach it.
      </p>
    </div>
  )
}

interface NewScenarioFormProps {
  onCancel: () => void
  onCreated: () => Promise<void>
  onConfigStoreDown: () => void
}

function NewScenarioForm({ onCancel, onCreated, onConfigStoreDown }: NewScenarioFormProps) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idValid = SLUG_PATTERN.test(id)
  const nameValid = name.trim() !== ''
  const canSubmit = idValid && nameValid && !submitting

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await api.scenarios.create({
        id,
        name: name.trim(),
        description: description.trim() === '' ? undefined : description.trim()
      })
      await onCreated()
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to create scenario')
      setSubmitting(false)
    }
  }

  return (
    <form
      className="card mt-4 space-y-3"
      aria-label="New scenario"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <h3 className="text-base font-semibold text-gray-900">New scenario</h3>

      <div>
        <label htmlFor="new-scenario-id" className="block text-xs font-medium text-gray-700 mb-1">
          Id (slug)
        </label>
        <input
          id="new-scenario-id"
          type="text"
          className={`input-field ${id !== '' && !idValid ? 'input-field-error' : ''}`}
          value={id}
          onChange={(event) => setId(event.target.value)}
          placeholder="shipping-support"
        />
        {id !== '' && !idValid && (
          <p className="validation-error-text">
            Id must be lowercase letters, numbers, and hyphens only.
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="new-scenario-name"
          className="block text-xs font-medium text-gray-700 mb-1"
        >
          Name
        </label>
        <input
          id="new-scenario-name"
          type="text"
          className="input-field"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div>
        <label
          htmlFor="new-scenario-description"
          className="block text-xs font-medium text-gray-700 mb-1"
        >
          Description
        </label>
        <textarea
          id="new-scenario-description"
          className="input-field"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canSubmit}
        >
          {submitting ? 'Creating…' : 'Create scenario'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

interface ScenarioRowProps {
  scenario: ScenarioSummary
  expanded: boolean
  onToggle: () => void
  onConfigStoreDown: () => void
  onDeleted: () => void
}

function ScenarioRow({ scenario, expanded, onToggle, onConfigStoreDown, onDeleted }: ScenarioRowProps) {
  const loadScenario = useScenarioStore((state) => state.loadScenario)
  const detail = useScenarioStore(selectScenarioDetail(scenario.id))
  const detailLoading = useScenarioStore(selectScenarioLoading(scenario.id))

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (expanded) void loadScenario(scenario.id)
  }, [expanded, scenario.id, loadScenario])

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.scenarios.remove(scenario.id)
      onDeleted()
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete scenario')
      setDeleting(false)
    }
  }

  const promptCount = detail ? detail.systemPrompts.length + detail.userPrompts.length : null
  const datasetCount = detail ? detail.datasets.length : null
  const toolCount = detail ? detail.tools.length : null

  return (
    <li className="py-3" data-testid={`scenario-row-${scenario.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="text-left w-full"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            <span className="text-sm font-semibold text-gray-900">{scenario.name}</span>
            <span className="ml-2 text-xs font-mono text-gray-500">{scenario.id}</span>
          </button>
          {scenario.description && (
            <p className="text-xs text-gray-600 mt-0.5">{scenario.description}</p>
          )}
          {expanded && (
            <p className="text-xs text-gray-500 mt-1" data-testid={`scenario-counts-${scenario.id}`}>
              {detailLoading && !detail
                ? 'Loading…'
                : detail
                  ? `${promptCount} prompt${promptCount === 1 ? '' : 's'} · ${datasetCount} dataset${datasetCount === 1 ? '' : 's'} · ${toolCount} tool${toolCount === 1 ? '' : 's'}`
                  : null}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="text-xs font-medium text-primary-700 hover:text-primary-800"
            onClick={onToggle}
          >
            {expanded ? 'Close' : 'View / Edit'}
          </button>

          {confirmingDelete ? (
            <span className="flex items-center gap-1">
              <span className="text-xs text-gray-600">Delete?</span>
              <button
                type="button"
                className="text-xs font-medium text-red-700 hover:text-red-800"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? 'Deleting…' : 'Yes'}
              </button>
              <button
                type="button"
                className="text-xs font-medium text-gray-600 hover:text-gray-800"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="text-xs font-medium text-red-700 hover:text-red-800"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {deleteError && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {deleteError}
        </p>
      )}

      {expanded && (
        <div className="mt-3">
          <ScenarioDetailEditor scenarioId={scenario.id} onConfigStoreDown={onConfigStoreDown} />
        </div>
      )}
    </li>
  )
}

export default function ScenariosPage() {
  const scenarios = useScenarioStore((state) => state.scenarios)
  const scenariosLoading = useScenarioStore((state) => state.scenariosLoading)
  const scenariosError = useScenarioStore((state) => state.scenariosError)
  const loadScenarios = useScenarioStore((state) => state.loadScenarios)
  const invalidateScenarios = useScenarioStore((state) => state.invalidateScenarios)
  const invalidateScenario = useScenarioStore((state) => state.invalidateScenario)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [configStoreDown, setConfigStoreDown] = useState(false)

  useEffect(() => {
    void loadScenarios()
  }, [loadScenarios])

  function handleConfigStoreDown() {
    setConfigStoreDown(true)
  }

  async function refetchList() {
    invalidateScenarios()
    await loadScenarios()
  }

  if (configStoreDown || scenariosError?.code === 'upstream_error') {
    return <ConfigStoreNotice />
  }

  return (
    <div className="max-w-3xl mx-auto" data-testid="scenarios-page">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Scenarios</h2>
          <p className="text-sm text-gray-600">
            Prompts, datasets, and tools live here, one scenario at a time.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={() => setShowCreate((open) => !open)}
        >
          {showCreate ? 'Cancel' : 'New scenario'}
        </button>
      </div>

      {showCreate && (
        <NewScenarioForm
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            await refetchList()
          }}
          onConfigStoreDown={handleConfigStoreDown}
        />
      )}

      {scenariosError && scenariosError.code !== 'upstream_error' && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          Could not load scenarios: {scenariosError.message}
        </p>
      )}

      <div className="card mt-4">
        {scenariosLoading && scenarios.length === 0 && (
          <LoadingSpinner text="Loading scenarios…" />
        )}

        {!scenariosLoading && scenarios.length === 0 && (
          <p className="text-sm text-gray-600" data-testid="scenarios-empty">
            No scenarios yet.
          </p>
        )}

        {scenarios.length > 0 && (
          <ul className="divide-y divide-gray-100" data-testid="scenarios-list">
            {scenarios.map((scenario) => (
              <ScenarioRow
                key={scenario.id}
                scenario={scenario}
                expanded={expandedId === scenario.id}
                onToggle={() =>
                  setExpandedId((current) => (current === scenario.id ? null : scenario.id))
                }
                onConfigStoreDown={handleConfigStoreDown}
                onDeleted={() => {
                  if (expandedId === scenario.id) setExpandedId(null)
                  invalidateScenario(scenario.id)
                  void refetchList()
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
