/**
 * Base fetch wrapper for the Promptatron API.
 *
 * JSON in, JSON out; every non-2xx becomes an `ApiError` built from the
 * server's error envelope (falling back to the raw body / status text), and
 * aborts become `StreamAbortedError`. No retries, no caching, no state — the
 * stores above this layer own all of that.
 */

import { ApiError, StreamAbortedError, isAbortError } from './errors'

/** Routers are mounted under this prefix (see server/promptatron/main.py). */
export const API_PREFIX = '/api/v1'

const DEFAULT_BASE_URL = 'http://localhost:8000'

export const NDJSON_MEDIA_TYPE = 'application/x-ndjson'

export type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue | QueryValue[]>

/**
 * The configured API origin, without a trailing slash and without the
 * `/api/v1` prefix (which `apiUrl` adds).
 */
export function baseUrl(): string {
  const configured = import.meta.env?.VITE_API_URL
  const raw = typeof configured === 'string' && configured.trim() !== '' ? configured : DEFAULT_BASE_URL
  const trimmed = raw.trim().replace(/\/+$/, '')
  // Tolerate a base that already carries the version prefix.
  return trimmed.endsWith(API_PREFIX) ? trimmed.slice(0, -API_PREFIX.length) : trimmed
}

/**
 * Serialize query params, dropping `undefined`/`null` and expanding arrays into
 * repeated keys. Returns `""` when nothing survives.
 */
export function buildQuery(params?: QueryParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      if (item === undefined || item === null) continue
      search.append(key, String(item))
    }
  }
  const query = search.toString()
  return query === '' ? '' : `?${query}`
}

/** Absolute URL for an API path (path is relative to `/api/v1`). */
export function apiUrl(path: string, params?: QueryParams): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl()}${API_PREFIX}${suffix}${buildQuery(params)}`
}

export interface RequestOptions {
  /** Query string parameters. */
  query?: QueryParams
  /** JSON request body. Omit for bodyless methods. */
  body?: unknown
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>
  signal?: AbortSignal
}

/** Perform a JSON request, returning the parsed body (`undefined` for 204). */
export async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers }
  let body: string | undefined

  if (options.body !== undefined) {
    headers['content-type'] = headers['content-type'] ?? 'application/json'
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(apiUrl(path, options.query), {
      method,
      headers,
      body,
      signal: options.signal
    })
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) throw new StreamAbortedError()
    throw new ApiError(error instanceof Error ? error.message : 'Network request failed', {
      code: 'network_error'
    })
  }

  if (!response.ok) {
    throw ApiError.fromBody(response.status, response.statusText, await readText(response))
  }

  return (await readJson<T>(response)) as T
}

/** Read a successful response's body as JSON; `undefined` when empty/204. */
async function readJson<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204 || response.status === 205) return undefined
  const text = await readText(response)
  if (text === null || text.trim() === '') return undefined
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError('Response body was not valid JSON', {
      code: 'invalid_response',
      status: response.status,
      body: text
    })
  }
}

async function readText(response: Response): Promise<string | null> {
  try {
    return await response.text()
  } catch {
    return null
  }
}

export const http = {
  get: <T>(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<T> =>
    request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T = void>(path: string, options: RequestOptions = {}): Promise<T> =>
    request<T>('DELETE', path, options)
}
