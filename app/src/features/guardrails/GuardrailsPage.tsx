/**
 * The Guardrails tab: list, create/edit, and version management.
 *
 * A single piece of local view state decides what's on screen — the list, the
 * editor (create or edit), or the versions panel for one guardrail — so only
 * one of them is ever mounted at a time and each can own its own effects.
 */

import { useEffect, useState } from 'react'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useGuardrailStore, type GuardrailStateData } from '../../stores'
import type { GuardrailLifecycleStatus, GuardrailSummary } from '../../api'
import GuardrailEditor from './GuardrailEditor'
import VersionsPanel from './VersionsPanel'

type View =
  | { mode: 'list' }
  | { mode: 'editor'; guardrailId: string | null }
  | { mode: 'versions'; guardrailId: string; name: string }

const STATUS_LABELS: Record<GuardrailLifecycleStatus, string> = {
  READY: 'Ready',
  CREATING: 'Creating',
  UPDATING: 'Updating',
  VERSIONING: 'Versioning',
  FAILED: 'Failed',
  DELETING: 'Deleting'
}

const STATUS_CLASSES: Record<GuardrailLifecycleStatus, string> = {
  READY: 'bg-green-100 text-green-800',
  CREATING: 'bg-amber-100 text-amber-800',
  UPDATING: 'bg-amber-100 text-amber-800',
  VERSIONING: 'bg-blue-100 text-blue-800',
  FAILED: 'bg-red-100 text-red-800',
  DELETING: 'bg-gray-200 text-gray-700'
}

function StatusBadge({ status }: { status: GuardrailLifecycleStatus }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString()
}

function GuardrailRow({
  guardrail,
  onEdit,
  onVersions
}: {
  guardrail: GuardrailSummary
  onEdit: () => void
  onVersions: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const removeGuardrail = useGuardrailStore((state) => state.removeGuardrail)
  const saving = useGuardrailStore((state) => state.saving)

  async function handleDelete() {
    const removed = await removeGuardrail(guardrail.id)
    if (removed) setConfirmingDelete(false)
  }

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 pr-4">
        <div className="text-sm font-medium text-gray-900">{guardrail.name}</div>
        <div className="text-xs text-gray-500 font-mono">{guardrail.id}</div>
      </td>
      <td className="py-2 pr-4">
        <StatusBadge status={guardrail.status} />
      </td>
      <td className="py-2 pr-4 text-sm text-gray-700">{guardrail.version}</td>
      <td className="py-2 pr-4 text-sm text-gray-600">{formatDate(guardrail.createdAt)}</td>
      <td className="py-2 pl-2">
        {confirmingDelete ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-gray-600">Delete?</span>
            <button
              type="button"
              className="text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
              disabled={saving}
              onClick={() => void handleDelete()}
            >
              Confirm
            </button>
            <button
              type="button"
              className="text-xs font-medium text-gray-600 hover:text-gray-800"
              disabled={saving}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className="text-xs font-medium text-primary-700 hover:text-primary-800"
              onClick={onEdit}
            >
              Edit
            </button>
            <button
              type="button"
              className="text-xs font-medium text-primary-700 hover:text-primary-800"
              onClick={onVersions}
            >
              Versions
            </button>
            <button
              type="button"
              className="text-xs font-medium text-red-700 hover:text-red-800"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

function GuardrailList({
  guardrails,
  loading,
  loaded,
  error,
  onNew,
  onEdit,
  onVersions
}: {
  guardrails: GuardrailSummary[]
  loading: GuardrailStateData['loading']
  loaded: GuardrailStateData['loaded']
  error: GuardrailStateData['error']
  onNew: () => void
  onEdit: (id: string) => void
  onVersions: (guardrail: GuardrailSummary) => void
}) {
  return (
    <section className="card" aria-labelledby="guardrails-heading">
      <div className="flex items-center justify-between mb-4">
        <h2 id="guardrails-heading" className="text-lg font-semibold text-gray-900">
          Guardrails
        </h2>
        <button type="button" className="btn-primary" onClick={onNew}>
          New guardrail
        </button>
      </div>

      {error && (
        <p className="mb-3 text-xs text-red-600" role="alert">
          Could not load guardrails: {error.message}
        </p>
      )}

      {loading && guardrails.length === 0 && (
        <LoadingSpinner size="md" color="primary" text="Loading guardrails…" inline={false} />
      )}

      {loaded && !loading && guardrails.length === 0 && !error && (
        <p className="text-sm text-gray-600" data-testid="guardrails-empty">
          No guardrails yet. Create one to get started.
        </p>
      )}

      {guardrails.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="guardrails-table">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pl-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {guardrails.map((guardrail) => (
                <GuardrailRow
                  key={guardrail.id}
                  guardrail={guardrail}
                  onEdit={() => onEdit(guardrail.id)}
                  onVersions={() => onVersions(guardrail)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function GuardrailsPage() {
  const [view, setView] = useState<View>({ mode: 'list' })

  const guardrails = useGuardrailStore((state) => state.guardrails)
  const loading = useGuardrailStore((state) => state.loading)
  const loaded = useGuardrailStore((state) => state.loaded)
  const error = useGuardrailStore((state) => state.error)
  const loadGuardrails = useGuardrailStore((state) => state.loadGuardrails)

  useEffect(() => {
    void loadGuardrails()
  }, [loadGuardrails])

  if (view.mode === 'editor') {
    return (
      <GuardrailEditor
        guardrailId={view.guardrailId}
        onClose={() => setView({ mode: 'list' })}
      />
    )
  }

  if (view.mode === 'versions') {
    return (
      <VersionsPanel
        guardrailId={view.guardrailId}
        guardrailName={view.name}
        onClose={() => setView({ mode: 'list' })}
      />
    )
  }

  return (
    <div data-testid="guardrails-page">
      <GuardrailList
        guardrails={guardrails}
        loading={loading}
        loaded={loaded}
        error={error}
        onNew={() => setView({ mode: 'editor', guardrailId: null })}
        onEdit={(id) => setView({ mode: 'editor', guardrailId: id })}
        onVersions={(guardrail) =>
          setView({ mode: 'versions', guardrailId: guardrail.id, name: guardrail.name })
        }
      />
    </div>
  )
}
