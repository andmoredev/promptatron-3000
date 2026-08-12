/**
 * The two error types this API layer throws.
 *
 * `ApiError` carries the server's uniform error envelope
 * (`{"error": {"code", "message", "detail"}}`, see server/promptatron/errors.py)
 * plus the HTTP status; `StreamAbortedError` marks a caller-initiated abort so
 * callers can tell "I cancelled this" apart from "the server/network failed".
 */
// @ts-nocheck


import type { ApiErrorEnvelope } from './types'

/** A non-2xx response from the API. */
export class ApiError extends Error {
  /** Envelope `error.code`, e.g. `not_found`, `validation_error`. */
  readonly code: string
  /** Envelope `error.detail` — arbitrary JSON, `undefined` when absent. */
  readonly detail: unknown
  /** HTTP status code (0 when the failure was not an HTTP response). */
  readonly status: number
  /** The parsed body, when it was JSON. Useful for non-enveloped responses. */
  readonly body: unknown

  constructor(
    message: string,
    options: { code?: string; detail?: unknown; status?: number; body?: unknown } = {}
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code ?? 'http_error'
    this.detail = options.detail
    this.status = options.status ?? 0
    this.body = options.body
  }

  /** True when the failure was a 5xx (the caller may reasonably retry). */
  get isServerError(): boolean {
    return this.status >= 500
  }

  /** True for `404 not_found`. */
  get isNotFound(): boolean {
    return this.status === 404 || this.code === 'not_found'
  }

  /**
   * Build an `ApiError` from a failed response's body.
   *
   * Falls back through: envelope -> any JSON body -> raw text -> status text.
   */
  static fromBody(
    status: number,
    statusText: string,
    rawBody: string | null | undefined
  ): ApiError {
    const fallbackMessage = statusText || `Request failed with status ${status}`
    const text = typeof rawBody === 'string' ? rawBody : ''

    let parsed: unknown
    if (text.trim() !== '') {
      try {
        parsed = JSON.parse(text)
      } catch {
        // Non-JSON error body (proxy HTML, plain text, truncated JSON, ...).
        return new ApiError(text.trim().slice(0, 500) || fallbackMessage, {
          code: 'http_error',
          status,
          body: text
        })
      }
    }

    if (isErrorEnvelope(parsed)) {
      const envelope = parsed.error
      return new ApiError(envelope.message || fallbackMessage, {
        code: envelope.code || 'http_error',
        detail: envelope.detail,
        status,
        body: parsed
      })
    }

    return new ApiError(fallbackMessage, { code: 'http_error', status, body: parsed })
  }
}

/** Thrown when a request or stream is aborted through its `AbortSignal`. */
export class StreamAbortedError extends Error {
  constructor(message = 'Stream aborted by caller') {
    super(message)
    this.name = 'StreamAbortedError'
  }
}

/** Type guard for the server's error envelope. */
export function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const inner = (value as { error: unknown }).error
  return (
    typeof inner === 'object' &&
    inner !== null &&
    typeof (inner as { code?: unknown }).code === 'string' &&
    typeof (inner as { message?: unknown }).message === 'string'
  )
}

/** True for the `AbortError` DOMException that `fetch`/streams reject with. */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof StreamAbortedError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'AbortError')
  )
}
