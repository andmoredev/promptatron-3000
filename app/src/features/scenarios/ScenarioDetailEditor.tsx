/**
 * Prompts, datasets, and tools for one hydrated scenario.
 *
 * Prompts and datasets come off `scenarioStore`'s `ScenarioDetail` (so they
 * share the cache the Workbench reads); tools are fetched separately here
 * straight from `api.scenarios.tools.list`, because that's the only endpoint
 * that carries `handler_registered` — `ScenarioDetail.tools` (`ToolDefinition[]`)
 * does not.
 *
 * Every successful write invalidates the cached detail and reloads it, so the
 * rest of this editor (and any other consumer of `scenarioStore`, e.g. the
 * Workbench's scenario picker) sees the change immediately.
 */

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { api } from '../../api'
import type {
  Dataset,
  DatasetContentType,
  DatasetMeta,
  PromptKind,
  PromptSummary,
  ScenarioDetail,
  ToolListItem
} from '../../api'
import { selectScenarioDetail, selectScenarioLoading, useScenarioStore } from '../../stores'
import LoadingSpinner from '../../components/LoadingSpinner'
import Tooltip from '../../components/Tooltip'
import { isConfigStoreUnreachable } from './configStoreError'

const SLUG_PATTERN = /^[a-z0-9-]+$/

const CONTENT_TYPES: Array<{ value: DatasetContentType; label: string }> = [
  { value: 'text/csv', label: 'CSV (text/csv)' },
  { value: 'application/json', label: 'JSON (application/json)' }
]

interface SectionProps {
  scenarioId: string
  onConfigStoreDown: () => void
}

/* -------------------------------------------------------------------------- */
/* Prompts                                                                    */
/* -------------------------------------------------------------------------- */

function PromptAddForm({
  scenarioId,
  kind,
  onDone,
  onCancel,
  onConfigStoreDown
}: SectionProps & { kind: PromptKind; onDone: () => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim() !== '' && content.trim() !== '' && !submitting

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await api.scenarios.prompts.create(scenarioId, { kind, name: name.trim(), content })
      await onDone()
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to add prompt')
      setSubmitting(false)
    }
  }

  return (
    <form
      className="mt-2 space-y-2 rounded-md bg-gray-50 p-2"
      aria-label={`Add ${kind === 'SYSTEM' ? 'system' : 'user'} prompt`}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <input
        className="input-field text-xs"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="New prompt name"
      />
      <textarea
        className="input-field text-xs"
        rows={3}
        placeholder="Content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label="New prompt content"
      />
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="btn-primary py-1 px-2 text-xs disabled:opacity-50"
          disabled={!canSubmit}
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          className="btn-secondary py-1 px-2 text-xs"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function PromptEditForm({
  scenarioId,
  prompt,
  onDone,
  onCancel,
  onConfigStoreDown
}: SectionProps & { prompt: PromptSummary; onDone: () => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(prompt.name)
  const [content, setContent] = useState(prompt.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (name.trim() === '') return
    setSaving(true)
    setError(null)
    try {
      await api.scenarios.prompts.update(scenarioId, prompt.id, { name: name.trim(), content })
      await onDone()
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to update prompt')
      setSaving(false)
    }
  }

  return (
    <li>
      <form
        className="space-y-2 rounded-md bg-gray-50 p-2"
        aria-label={`Edit ${prompt.name}`}
        onSubmit={(event) => void handleSave(event)}
      >
        <input
          className="input-field text-xs"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Prompt name"
        />
        <textarea
          className="input-field text-xs"
          rows={3}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          aria-label="Prompt content"
        />
        {error && (
          <p className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            className="btn-primary py-1 px-2 text-xs disabled:opacity-50"
            disabled={saving || name.trim() === ''}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn-secondary py-1 px-2 text-xs"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  )
}

function PromptRow({
  scenarioId,
  prompt,
  onEdit,
  onRefresh,
  onConfigStoreDown
}: SectionProps & { prompt: PromptSummary; onEdit: () => void; onRefresh: () => Promise<void> }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await api.scenarios.prompts.remove(scenarioId, prompt.id)
      await onRefresh()
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to delete prompt')
      setDeleting(false)
    }
  }

  return (
    <li className="text-xs" data-testid={`prompt-row-${prompt.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{prompt.name}</p>
          <p className="text-gray-600 truncate">{prompt.content}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="text-primary-700 hover:text-primary-800"
            onClick={onEdit}
          >
            Edit
          </button>
          {confirmingDelete ? (
            <>
              <button
                type="button"
                className="text-red-700 hover:text-red-800"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? '…' : 'Confirm'}
              </button>
              <button
                type="button"
                className="text-gray-600 hover:text-gray-800"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-red-700 hover:text-red-800"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="text-red-600 mt-1" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

function PromptList({
  scenarioId,
  kind,
  title,
  prompts,
  onRefresh,
  onConfigStoreDown
}: SectionProps & {
  kind: PromptKind
  title: string
  prompts: PromptSummary[]
  onRefresh: () => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div
      className="rounded-lg border border-gray-200 p-3"
      data-testid={`prompt-section-${kind.toLowerCase()}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</h4>
        <button
          type="button"
          className="text-xs font-medium text-primary-700 hover:text-primary-800"
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {prompts.length === 0 && !adding && <p className="text-xs text-gray-500">None yet.</p>}

      <ul className="space-y-2" data-testid={`prompt-list-${kind.toLowerCase()}`}>
        {prompts.map((prompt) =>
          editingId === prompt.id ? (
            <PromptEditForm
              key={prompt.id}
              scenarioId={scenarioId}
              prompt={prompt}
              onCancel={() => setEditingId(null)}
              onConfigStoreDown={onConfigStoreDown}
              onDone={async () => {
                setEditingId(null)
                await onRefresh()
              }}
            />
          ) : (
            <PromptRow
              key={prompt.id}
              scenarioId={scenarioId}
              prompt={prompt}
              onEdit={() => setEditingId(prompt.id)}
              onRefresh={onRefresh}
              onConfigStoreDown={onConfigStoreDown}
            />
          )
        )}
      </ul>

      {adding && (
        <PromptAddForm
          scenarioId={scenarioId}
          kind={kind}
          onCancel={() => setAdding(false)}
          onConfigStoreDown={onConfigStoreDown}
          onDone={async () => {
            setAdding(false)
            await onRefresh()
          }}
        />
      )}
    </div>
  )
}

function PromptsSection({
  scenarioId,
  detail,
  onRefresh,
  onConfigStoreDown
}: SectionProps & { detail: ScenarioDetail; onRefresh: () => Promise<void> }) {
  return (
    <section aria-labelledby={`prompts-heading-${scenarioId}`}>
      <h3 id={`prompts-heading-${scenarioId}`} className="text-sm font-semibold text-gray-900 mb-2">
        Prompts
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PromptList
          scenarioId={scenarioId}
          kind="SYSTEM"
          title="System prompts"
          prompts={detail.systemPrompts}
          onRefresh={onRefresh}
          onConfigStoreDown={onConfigStoreDown}
        />
        <PromptList
          scenarioId={scenarioId}
          kind="USER"
          title="User prompts"
          prompts={detail.userPrompts}
          onRefresh={onRefresh}
          onConfigStoreDown={onConfigStoreDown}
        />
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Datasets                                                                   */
/* -------------------------------------------------------------------------- */

function DatasetEditForm({
  scenarioId,
  dataset,
  onDone,
  onCancel,
  onConfigStoreDown
}: SectionProps & { dataset: Dataset; onDone: (next: Dataset) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(dataset.name)
  const [description, setDescription] = useState(dataset.description ?? '')
  const [contentType, setContentType] = useState<DatasetContentType>(dataset.contentType)
  const [content, setContent] = useState(dataset.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (name.trim() === '') return
    setSaving(true)
    setError(null)
    try {
      await api.scenarios.datasets.update(scenarioId, dataset.id, {
        name: name.trim(),
        description: description.trim() === '' ? undefined : description.trim(),
        contentType,
        content
      })
      await onDone({
        ...dataset,
        name: name.trim(),
        description: description.trim() === '' ? null : description.trim(),
        contentType,
        content
      })
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to update dataset')
      setSaving(false)
    }
  }

  return (
    <form
      className="mt-2 space-y-2 rounded-md bg-gray-50 p-2"
      aria-label={`Edit ${dataset.name}`}
      onSubmit={(event) => void handleSave(event)}
    >
      <input
        className="input-field text-xs"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Dataset name"
      />
      <input
        className="input-field text-xs"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description (optional)"
        aria-label="Dataset description"
      />
      <select
        className="select-field text-xs"
        value={contentType}
        onChange={(event) => setContentType(event.target.value as DatasetContentType)}
        aria-label="Dataset content type"
      >
        {CONTENT_TYPES.map((ct) => (
          <option key={ct.value} value={ct.value}>
            {ct.label}
          </option>
        ))}
      </select>
      <textarea
        className="input-field text-xs font-mono"
        rows={6}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label="Dataset content"
      />
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="btn-primary py-1 px-2 text-xs disabled:opacity-50"
          disabled={saving || name.trim() === ''}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn-secondary py-1 px-2 text-xs"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function DatasetAddForm({
  scenarioId,
  onDone,
  onCancel,
  onConfigStoreDown
}: SectionProps & { onDone: () => Promise<void>; onCancel: () => void }) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [contentType, setContentType] = useState<DatasetContentType>('text/csv')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idValid = SLUG_PATTERN.test(id)
  const canSubmit = idValid && name.trim() !== '' && content.trim() !== '' && !submitting

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setContent(reader.result)
    }
    reader.readAsText(file)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await api.scenarios.datasets.create(scenarioId, {
        id,
        name: name.trim(),
        description: description.trim() === '' ? undefined : description.trim(),
        contentType,
        content
      })
      await onDone()
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to add dataset')
      setSubmitting(false)
    }
  }

  return (
    <form
      className="mt-3 space-y-2 rounded-md bg-gray-50 p-2"
      aria-label="Add dataset"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <input
        className={`input-field text-xs ${id !== '' && !idValid ? 'input-field-error' : ''}`}
        placeholder="Id (slug)"
        value={id}
        onChange={(event) => setId(event.target.value)}
        aria-label="New dataset id"
      />
      {id !== '' && !idValid && (
        <p className="validation-error-text">
          Id must be lowercase letters, numbers, and hyphens only.
        </p>
      )}
      <input
        className="input-field text-xs"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="New dataset name"
      />
      <input
        className="input-field text-xs"
        placeholder="Description (optional)"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        aria-label="New dataset description"
      />
      <select
        className="select-field text-xs"
        value={contentType}
        onChange={(event) => setContentType(event.target.value as DatasetContentType)}
        aria-label="New dataset content type"
      >
        {CONTENT_TYPES.map((ct) => (
          <option key={ct.value} value={ct.value}>
            {ct.label}
          </option>
        ))}
      </select>
      <div>
        <label className="block text-xs text-gray-600 mb-1" htmlFor={`dataset-file-upload-${scenarioId}`}>
          Upload a file (optional, fills content below)
        </label>
        <input
          id={`dataset-file-upload-${scenarioId}`}
          type="file"
          accept=".csv,.json,text/csv,application/json,text/plain"
          onChange={handleFile}
          className="text-xs"
        />
      </div>
      <textarea
        className="input-field text-xs font-mono"
        rows={6}
        placeholder="Content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label="New dataset content"
      />
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="btn-primary py-1 px-2 text-xs disabled:opacity-50"
          disabled={!canSubmit}
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          className="btn-secondary py-1 px-2 text-xs"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function DatasetRow({
  scenarioId,
  dataset,
  onRefresh,
  onConfigStoreDown
}: SectionProps & { dataset: DatasetMeta; onRefresh: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false)
  const [content, setContent] = useState<Dataset | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function ensureContentLoaded() {
    if (content) return
    setLoadingContent(true)
    setContentError(null)
    try {
      const fetched = await api.scenarios.datasets.get(scenarioId, dataset.id)
      setContent(fetched)
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setContentError(err instanceof Error ? err.message : 'Failed to load dataset content')
    } finally {
      setLoadingContent(false)
    }
  }

  async function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next) await ensureContentLoaded()
  }

  async function handleEdit() {
    setEditing(true)
    if (!expanded) {
      setExpanded(true)
      await ensureContentLoaded()
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.scenarios.datasets.remove(scenarioId, dataset.id)
      await onRefresh()
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete dataset')
      setDeleting(false)
    }
  }

  return (
    <li className="rounded-lg border border-gray-200 p-2 text-xs" data-testid={`dataset-row-${dataset.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">
            {dataset.name} <span className="ml-1 font-mono text-gray-500">{dataset.id}</span>
          </p>
          <p className="text-gray-600">{dataset.contentType}</p>
          {dataset.description && <p className="text-gray-500">{dataset.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="text-primary-700 hover:text-primary-800"
            onClick={() => void handleToggle()}
          >
            {expanded ? 'Hide content' : 'View content'}
          </button>
          <button
            type="button"
            className="text-primary-700 hover:text-primary-800"
            onClick={() => (editing ? setEditing(false) : void handleEdit())}
          >
            {editing ? 'Cancel edit' : 'Edit'}
          </button>
          {confirmingDelete ? (
            <>
              <button
                type="button"
                className="text-red-700 hover:text-red-800"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? '…' : 'Confirm'}
              </button>
              <button
                type="button"
                className="text-gray-600 hover:text-gray-800"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-red-700 hover:text-red-800"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {deleteError && (
        <p className="text-red-600 mt-1" role="alert">
          {deleteError}
        </p>
      )}

      {expanded && (
        <div className="mt-2">
          {loadingContent && (
            <LoadingSpinner size="sm" color="primary" text="Loading content…" inline={false} />
          )}
          {contentError && (
            <p className="text-red-600" role="alert">
              {contentError}
            </p>
          )}
          {!loadingContent && content && !editing && (
            <>
              <pre
                data-testid={`dataset-content-${dataset.id}`}
                className="max-h-48 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-800"
              >
                {content.content}
              </pre>
              <p className="mt-1 text-gray-500">{content.content.length} characters</p>
            </>
          )}
          {editing && content && (
            <DatasetEditForm
              scenarioId={scenarioId}
              dataset={content}
              onCancel={() => setEditing(false)}
              onConfigStoreDown={onConfigStoreDown}
              onDone={async (updated) => {
                setContent(updated)
                setEditing(false)
                await onRefresh()
              }}
            />
          )}
        </div>
      )}
    </li>
  )
}

function DatasetsSection({
  scenarioId,
  detail,
  onRefresh,
  onConfigStoreDown
}: SectionProps & { detail: ScenarioDetail; onRefresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false)

  return (
    <section aria-labelledby={`datasets-heading-${scenarioId}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 id={`datasets-heading-${scenarioId}`} className="text-sm font-semibold text-gray-900">
          Datasets
        </h3>
        <button
          type="button"
          className="text-xs font-medium text-primary-700 hover:text-primary-800"
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? 'Cancel' : '+ Add dataset'}
        </button>
      </div>

      {detail.datasets.length === 0 && !adding && (
        <p className="text-xs text-gray-500">No datasets yet.</p>
      )}

      <ul className="space-y-2" data-testid="dataset-list">
        {detail.datasets.map((dataset) => (
          <DatasetRow
            key={dataset.id}
            scenarioId={scenarioId}
            dataset={dataset}
            onRefresh={onRefresh}
            onConfigStoreDown={onConfigStoreDown}
          />
        ))}
      </ul>

      {adding && (
        <DatasetAddForm
          scenarioId={scenarioId}
          onCancel={() => setAdding(false)}
          onConfigStoreDown={onConfigStoreDown}
          onDone={async () => {
            setAdding(false)
            await onRefresh()
          }}
        />
      )}
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                      */
/* -------------------------------------------------------------------------- */

const HANDLER_MISSING_EXPLANATION =
  'No local handler is registered for this tool. Tool handlers are implemented in Python and live server-side; a definition without a matching handler will not run anything when the model calls it.'

function ToolEditForm({
  scenarioId,
  tool,
  onDone,
  onCancel,
  onConfigStoreDown
}: SectionProps & { tool: ToolListItem; onDone: () => Promise<void>; onCancel: () => void }) {
  const [description, setDescription] = useState(tool.description)
  const [schemaText, setSchemaText] = useState(JSON.stringify(tool.inputSchema, null, 2))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setError(null)

    let inputSchema: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(schemaText)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('not an object')
      }
      inputSchema = parsed as Record<string, unknown>
    } catch {
      setError('Input schema must be valid JSON (an object).')
      return
    }

    setSaving(true)
    try {
      await api.scenarios.tools.upsert(scenarioId, tool.name, {
        description: description.trim(),
        inputSchema,
        handlerKey: tool.handlerKey
      })
      await onDone()
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to save tool definition')
      setSaving(false)
    }
  }

  return (
    <form
      className="mt-2 space-y-2 rounded-md bg-gray-50 p-2"
      aria-label={`Edit ${tool.name}`}
      onSubmit={(event) => void handleSave(event)}
    >
      <label className="block text-xs text-gray-600" htmlFor={`tool-description-${tool.name}`}>
        Description
      </label>
      <textarea
        id={`tool-description-${tool.name}`}
        className="input-field text-xs"
        rows={2}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        aria-label="Tool description"
      />
      <label className="block text-xs text-gray-600" htmlFor={`tool-schema-input-${tool.name}`}>
        Input schema (JSON)
      </label>
      <textarea
        id={`tool-schema-input-${tool.name}`}
        className="input-field text-xs font-mono"
        rows={8}
        value={schemaText}
        onChange={(event) => setSchemaText(event.target.value)}
        aria-label="Tool input schema (JSON)"
      />
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="btn-primary py-1 px-2 text-xs disabled:opacity-50"
          disabled={saving || description.trim() === ''}
        >
          {saving ? 'Saving…' : 'Save definition'}
        </button>
        <button
          type="button"
          className="btn-secondary py-1 px-2 text-xs"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function ToolRow({
  scenarioId,
  tool,
  onRefresh,
  onConfigStoreDown
}: SectionProps & { tool: ToolListItem; onRefresh: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)

  return (
    <li className="rounded-lg border border-gray-200 p-2 text-xs" data-testid={`tool-row-${tool.name}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 font-mono">{tool.name}</p>
          <p className="text-gray-600">{tool.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tool.handler_registered ? (
            <span
              className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800"
              data-testid={`handler-badge-${tool.name}`}
            >
              handler available
            </span>
          ) : (
            <Tooltip content={HANDLER_MISSING_EXPLANATION} position="left">
              <span
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 cursor-help"
                data-testid={`handler-badge-${tool.name}`}
              >
                no local handler — definition only
              </span>
            </Tooltip>
          )}
          <button
            type="button"
            className="text-primary-700 hover:text-primary-800"
            onClick={() => setEditing((open) => !open)}
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-gray-600">Input schema</summary>
        <pre
          data-testid={`tool-schema-${tool.name}`}
          className="mt-1 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-800"
        >
          {JSON.stringify(tool.inputSchema, null, 2)}
        </pre>
      </details>

      {editing && (
        <ToolEditForm
          scenarioId={scenarioId}
          tool={tool}
          onCancel={() => setEditing(false)}
          onConfigStoreDown={onConfigStoreDown}
          onDone={async () => {
            setEditing(false)
            await onRefresh()
          }}
        />
      )}
    </li>
  )
}

function ToolsSection({ scenarioId, onConfigStoreDown }: SectionProps) {
  const [tools, setTools] = useState<ToolListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchTools() {
    setLoading(true)
    setError(null)
    try {
      const response = await api.scenarios.tools.list(scenarioId)
      setTools(response.items)
    } catch (err) {
      if (isConfigStoreUnreachable(err)) {
        onConfigStoreDown()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to load tools')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchTools()
    // fetchTools is recreated every render but only scenarioId should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId])

  return (
    <section aria-labelledby={`tools-heading-${scenarioId}`}>
      <h3 id={`tools-heading-${scenarioId}`} className="text-sm font-semibold text-gray-900 mb-2">
        Tools
      </h3>

      {loading && <LoadingSpinner size="sm" color="primary" text="Loading tools…" inline={false} />}
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      {!loading && tools && tools.length === 0 && (
        <p className="text-xs text-gray-500">No tools defined for this scenario.</p>
      )}

      {!loading && tools && tools.length > 0 && (
        <ul className="space-y-2" data-testid="tools-list">
          {tools.map((tool) => (
            <ToolRow
              key={tool.name}
              scenarioId={scenarioId}
              tool={tool}
              onRefresh={fetchTools}
              onConfigStoreDown={onConfigStoreDown}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Root                                                                       */
/* -------------------------------------------------------------------------- */

export default function ScenarioDetailEditor({ scenarioId, onConfigStoreDown }: SectionProps) {
  const detail = useScenarioStore(selectScenarioDetail(scenarioId))
  const detailLoading = useScenarioStore(selectScenarioLoading(scenarioId))
  const detailError = useScenarioStore((state) => state.detailError[scenarioId] ?? null)
  const loadScenario = useScenarioStore((state) => state.loadScenario)
  const invalidateScenario = useScenarioStore((state) => state.invalidateScenario)

  useEffect(() => {
    void loadScenario(scenarioId)
  }, [scenarioId, loadScenario])

  useEffect(() => {
    if (detailError?.code === 'upstream_error') onConfigStoreDown()
    // Only the error itself should re-trigger this — onConfigStoreDown is a
    // fresh closure from the parent on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailError])

  async function refresh() {
    invalidateScenario(scenarioId)
    await loadScenario(scenarioId)
  }

  if (detailLoading && !detail) {
    return <LoadingSpinner size="sm" color="primary" text="Loading scenario…" inline={false} />
  }

  if (detailError && !detail) {
    return (
      <p className="text-xs text-red-600" role="alert">
        Could not load scenario: {detailError.message}
      </p>
    )
  }

  if (!detail) return null

  return (
    <div
      className="space-y-4 border-t border-gray-200 pt-3"
      data-testid={`scenario-editor-${scenarioId}`}
    >
      <PromptsSection
        scenarioId={scenarioId}
        detail={detail}
        onRefresh={refresh}
        onConfigStoreDown={onConfigStoreDown}
      />
      <DatasetsSection
        scenarioId={scenarioId}
        detail={detail}
        onRefresh={refresh}
        onConfigStoreDown={onConfigStoreDown}
      />
      <ToolsSection scenarioId={scenarioId} onConfigStoreDown={onConfigStoreDown} />
    </div>
  )
}
