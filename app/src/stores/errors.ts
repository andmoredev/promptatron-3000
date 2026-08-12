/**
 * Shared error shape for every store.
 *
 * The API layer throws `ApiError` (server envelope + HTTP status) and
 * `StreamAbortedError` (caller-initiated abort). Stores never hold those
 * instances: they hold a flat, serializable `{code, message}` so that a
 * component can render an error without knowing anything about the transport.
 *
 * Aborts are *not* errors. `isAborted` is the single place that decides that,
 * and callers map it onto their own "cancelled" state instead of `error`.
 */

import { ApiError, StreamAbortedError, isAbortError } from '../api'

/** The flat error record stored in every `error` field. */
export interface StoreError {
  /** `ApiError.code` (e.g. `not_found`, `validation_error`) or a fallback. */
  code: string
  message: string
}

/** True when the failure was a caller-initiated abort, not a real failure. */
export function isAborted(error: unknown): boolean {
  return error instanceof StreamAbortedError || isAbortError(error)
}

/** Normalize anything thrown by the API layer into a `StoreError`. */
export function toStoreError(error: unknown): StoreError {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof StreamAbortedError) {
    return { code: 'aborted', message: error.message }
  }
  if (error instanceof Error) {
    return { code: 'unknown_error', message: error.message }
  }
  return { code: 'unknown_error', message: String(error) }
}
