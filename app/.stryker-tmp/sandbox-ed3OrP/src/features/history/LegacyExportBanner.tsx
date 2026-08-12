/**
 * One-time banner for the pre-revamp local history.
 *
 * Before runs were persisted server-side, the app kept everything in
 * `localStorage`/IndexedDB on the browser. This offers a last export of that
 * data and a way to wipe it; it renders nothing once the legacy key is gone
 * (either it was never there, or the user already cleared it), so it can
 * never come back after a clear.
 */
// @ts-nocheck


import { useState } from 'react'

export const LEGACY_HISTORY_KEY = 'bedrock-test-history'
export const LEGACY_FORM_STATE_KEY = 'promptatron_form_state'
export const LEGACY_SETTINGS_KEY = 'promptatron_app_settings'
export const LEGACY_DB_NAMES = [
  'DeterminismEvaluationDB',
  'WorkflowTrackingDB',
  'WorkflowDataPersistenceDB'
]

function readLegacyValue(key: string): unknown {
  const raw = window.localStorage.getItem(key)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function hasLegacyHistory(): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(LEGACY_HISTORY_KEY) !== null
}

function downloadLegacyBundle(): void {
  const bundle: Record<string, unknown> = {}
  const history = readLegacyValue(LEGACY_HISTORY_KEY)
  if (history !== undefined) bundle[LEGACY_HISTORY_KEY] = history

  for (const key of [LEGACY_FORM_STATE_KEY, LEGACY_SETTINGS_KEY]) {
    const value = readLegacyValue(key)
    if (value !== undefined) bundle[key] = value
  }

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'promptatron-legacy-history.json'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function clearLegacyStorage(): void {
  window.localStorage.removeItem(LEGACY_HISTORY_KEY)
  window.localStorage.removeItem(LEGACY_FORM_STATE_KEY)
  window.localStorage.removeItem(LEGACY_SETTINGS_KEY)

  const indexedDB = typeof window !== 'undefined' ? window.indexedDB : undefined
  if (!indexedDB) return
  for (const name of LEGACY_DB_NAMES) {
    try {
      const request = indexedDB.deleteDatabase(name)
      request.onerror = () => undefined
      request.onblocked = () => undefined
    } catch {
      // Ignored — this is best-effort cleanup of an already-legacy store.
    }
  }
}

export default function LegacyExportBanner() {
  const [visible, setVisible] = useState(hasLegacyHistory)

  if (!visible) return null

  function handleClear() {
    clearLegacyStorage()
    setVisible(false)
  }

  return (
    <div
      className="card border-amber-300 bg-amber-50 flex flex-wrap items-center justify-between gap-3"
      role="region"
      aria-label="Legacy history found"
      data-testid="legacy-export-banner"
    >
      <div>
        <p className="text-sm font-medium text-amber-900">Legacy history found</p>
        <p className="text-xs text-amber-800">
          This browser has run history saved locally from before the history revamp. Download it
          before clearing it — it will not be recoverable afterwards.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={downloadLegacyBundle}
          data-testid="legacy-download-btn"
        >
          Download legacy history (JSON)
        </button>
        <button
          type="button"
          className="btn-primary text-sm"
          onClick={handleClear}
          data-testid="legacy-clear-btn"
        >
          Dismiss &amp; clear
        </button>
      </div>
    </div>
  )
}
