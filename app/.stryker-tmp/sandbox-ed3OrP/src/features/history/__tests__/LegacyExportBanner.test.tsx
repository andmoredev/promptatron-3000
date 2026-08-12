/**
 * LegacyExportBanner: visible only while the pre-revamp `localStorage` key is
 * present, downloads a bundle Blob, and clears local/IndexedDB state.
 */
// @ts-nocheck


import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import LegacyExportBanner, {
  LEGACY_DB_NAMES,
  LEGACY_FORM_STATE_KEY,
  LEGACY_HISTORY_KEY,
  LEGACY_SETTINGS_KEY
} from '../LegacyExportBanner'

let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>
let clickSpy: ReturnType<typeof vi.spyOn>
let deleteDatabase: ReturnType<typeof vi.fn>

beforeEach(() => {
  window.localStorage.clear()

  createObjectURL = vi.fn(() => 'blob:mock-url')
  revokeObjectURL = vi.fn()
  // jsdom does not implement the Blob URL registry.
  window.URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
  window.URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL

  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

  deleteDatabase = vi.fn(() => ({}) as IDBOpenDBRequest)
  // jsdom does not implement IndexedDB at all.
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: { deleteDatabase }
  })
})

afterEach(() => {
  clickSpy.mockRestore()
  window.localStorage.clear()
})

describe('LegacyExportBanner', () => {
  it('renders nothing when there is no legacy history', () => {
    render(<LegacyExportBanner />)
    expect(screen.queryByTestId('legacy-export-banner')).not.toBeInTheDocument()
  })

  it('appears when the legacy key is seeded', () => {
    window.localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([{ id: 'old-1' }]))
    render(<LegacyExportBanner />)
    expect(screen.getByTestId('legacy-export-banner')).toBeInTheDocument()
  })

  it('downloads a JSON blob bundling every legacy key that is present', () => {
    window.localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([{ id: 'old-1' }]))
    window.localStorage.setItem(LEGACY_FORM_STATE_KEY, JSON.stringify({ model: 'x' }))
    window.localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify({ theme: 'dark' }))

    render(<LegacyExportBanner />)
    fireEvent.click(screen.getByTestId('legacy-download-btn'))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/json')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    // The banner stays up after a download — only "clear" dismisses it.
    expect(screen.getByTestId('legacy-export-banner')).toBeInTheDocument()
  })

  it('clears local storage and every legacy IndexedDB database, then hides itself', () => {
    window.localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([{ id: 'old-1' }]))
    window.localStorage.setItem(LEGACY_FORM_STATE_KEY, JSON.stringify({ model: 'x' }))
    window.localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify({ theme: 'dark' }))

    render(<LegacyExportBanner />)
    fireEvent.click(screen.getByTestId('legacy-clear-btn'))

    expect(window.localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_FORM_STATE_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull()

    expect(deleteDatabase).toHaveBeenCalledTimes(LEGACY_DB_NAMES.length)
    for (const name of LEGACY_DB_NAMES) {
      expect(deleteDatabase).toHaveBeenCalledWith(name)
    }

    expect(screen.queryByTestId('legacy-export-banner')).not.toBeInTheDocument()
  })

  it('does not resurrect after a clear + remount, since the key is gone', () => {
    window.localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([{ id: 'old-1' }]))
    const { unmount } = render(<LegacyExportBanner />)
    fireEvent.click(screen.getByTestId('legacy-clear-btn'))
    unmount()

    render(<LegacyExportBanner />)
    expect(screen.queryByTestId('legacy-export-banner')).not.toBeInTheDocument()
  })
})
