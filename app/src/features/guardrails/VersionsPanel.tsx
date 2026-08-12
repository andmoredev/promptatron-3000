/**
 * Version history for one guardrail, plus publishing the current DRAFT.
 *
 * Bedrock's model is DRAFT-plus-versions: `loadVersions` returns the DRAFT row
 * alongside every numbered version, and `publishVersion` freezes the DRAFT
 * into a new numbered version (with an optional description).
 */

import { useEffect, useState } from 'react'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useGuardrailStore } from '../../stores'
import type { GuardrailVersionSummary } from '../../api'

/**
 * A stable empty-array fallback. Building `[]` inline inside the selector
 * would return a new array identity on every render and fail zustand v5's
 * `useSyncExternalStore` snapshot check (see `guardrailStore.readyGuardrails`).
 */
const EMPTY_VERSIONS: GuardrailVersionSummary[] = []

export default function VersionsPanel({
  guardrailId,
  guardrailName,
  onClose
}: {
  guardrailId: string
  guardrailName: string
  onClose: () => void
}) {
  const [publishing, setPublishing] = useState(false)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)

  const versions = useGuardrailStore((state) => state.versions[guardrailId]) ?? EMPTY_VERSIONS
  const loadVersions = useGuardrailStore((state) => state.loadVersions)
  const publishVersion = useGuardrailStore((state) => state.publishVersion)
  const saving = useGuardrailStore((state) => state.saving)
  const saveError = useGuardrailStore((state) => state.saveError)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void loadVersions(guardrailId).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [guardrailId, loadVersions])

  async function handlePublish() {
    const trimmed = description.trim()
    const result = await publishVersion(guardrailId, trimmed === '' ? undefined : trimmed)
    if (result) {
      setPublishing(false)
      setDescription('')
    }
  }

  return (
    <div className="card max-w-3xl mx-auto" data-testid="versions-panel">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Versions</h2>
          <p className="text-sm text-gray-600">{guardrailName}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Back
        </button>
      </div>

      {loading && (
        <LoadingSpinner size="md" color="primary" text="Loading versions…" inline={false} />
      )}

      {!loading && versions.length === 0 && (
        <p className="text-sm text-gray-600" data-testid="versions-empty">
          No versions yet.
        </p>
      )}

      {!loading && versions.length > 0 && (
        <ul className="divide-y divide-gray-100" data-testid="versions-list">
          {versions.map((version) => (
            <li key={version.version} className="py-2 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-900">
                  {version.version === 'DRAFT' ? 'DRAFT' : `Version ${version.version}`}
                </span>
                {version.description && (
                  <p className="text-xs text-gray-600 mt-0.5">{version.description}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 pt-4 border-t border-gray-200">
        {publishing ? (
          <div className="space-y-2">
            <label
              htmlFor="publish-description"
              className="block text-xs font-medium text-gray-700"
            >
              Version description (optional)
            </label>
            <input
              id="publish-description"
              type="text"
              className="input-field"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What changed in this version?"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={saving}
                onClick={() => void handlePublish()}
              >
                {saving ? 'Publishing…' : 'Confirm publish'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={() => {
                  setPublishing(false)
                  setDescription('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setPublishing(true)}>
            Publish current DRAFT
          </button>
        )}

        {saveError && (
          <p className="mt-2 text-xs text-red-600" role="alert">
            Could not publish: {saveError.message}
          </p>
        )}
      </div>
    </div>
  )
}
