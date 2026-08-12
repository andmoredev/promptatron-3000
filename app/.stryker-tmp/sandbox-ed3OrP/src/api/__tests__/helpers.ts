/** Shared test doubles: hand-built responses and NDJSON streams. */
// @ts-nocheck


import { vi } from 'vitest'

const encoder = new TextEncoder()

/**
 * The `fetch` init shape under test. Spelled out structurally because the
 * ambient `RequestInit`/`RequestInfo` type names trip the repo's core
 * `no-undef` lint rule, which is not TypeScript-aware.
 */
export interface FetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

export type FetchSpy = ReturnType<typeof mockFetch>

export interface FakeResponseInit {
  status?: number
  statusText?: string
  /** Body for `.text()` / `.json()` (non-streaming responses). */
  text?: string
  /** Body for `.body` (streaming responses). */
  body?: ReadableStream<Uint8Array> | null
  headers?: Record<string, string>
}

/**
 * A minimal `Response` stand-in. Hand-built rather than a real `Response` so a
 * stream passed in is *exactly* the stream the code under test reads — no
 * intermediate pipe that could swallow a cancel.
 */
export function fakeResponse(init: FakeResponseInit = {}): Response {
  const status = init.status ?? 200
  const headers = Object.fromEntries(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  )
  const text = init.text ?? ''
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? '',
    body: init.body ?? null,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => text,
    json: async () => JSON.parse(text)
  } as unknown as Response
}

/** A 200 JSON response. */
export function jsonResponse(body: unknown, status = 200): Response {
  return fakeResponse({
    status,
    statusText: 'OK',
    text: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  })
}

/** A closed NDJSON stream that yields `chunks` verbatim, in order. */
export function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

/** A 200 `application/x-ndjson` response over `chunks`. */
export function ndjsonResponse(chunks: string[]): Response {
  return fakeResponse({
    status: 200,
    statusText: 'OK',
    body: streamOf(chunks),
    headers: { 'content-type': 'application/x-ndjson' }
  })
}

export interface ControlledStream {
  stream: ReadableStream<Uint8Array>
  push: (chunk: string) => void
  close: () => void
  /** Cancel reasons recorded by the underlying source, one per `cancel()`. */
  cancelReasons: unknown[]
}

/** A stream the test drives by hand, recording reader cancellations. */
export function controlledStream(): ControlledStream {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const cancelReasons: unknown[] = []
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel(reason) {
      cancelReasons.push(reason ?? null)
    }
  })
  return {
    stream,
    push: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
    close: () => controller.close(),
    cancelReasons
  }
}

/** Split a string into `count` roughly equal pieces (by UTF-16 code units). */
export function splitInto(text: string, count: number): string[] {
  const size = Math.ceil(text.length / count)
  const parts: string[] = []
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size))
  return parts
}

/** Install a `fetch` spy resolving to `responses` in order (last one repeats). */
export function mockFetch(...responses: Response[]) {
  let callCount = 0
  const spy = vi.fn((input: string | URL, init?: FetchInit): Promise<Response> => {
    void input
    void init
    return Promise.resolve(responses[Math.min(callCount++, responses.length - 1)])
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

/** The fetch init a `fetch` spy was called with on call `index`. */
export function initOf(spy: FetchSpy, index = 0): FetchInit | undefined {
  return spy.mock.calls[index]?.[1]
}

/** The URL a `fetch` spy was called with on call `index`. */
export function urlOf(spy: FetchSpy, index = 0): string {
  return String(spy.mock.calls[index]?.[0])
}

/** The HTTP method of every call, in order. */
export function methodsOf(spy: FetchSpy): Array<string | undefined> {
  return spy.mock.calls.map(call => call[1]?.method)
}

/** Every requested URL, in order. */
export function urlsOf(spy: FetchSpy): string[] {
  return spy.mock.calls.map(call => String(call[0]))
}

/** Headers of call `index`, lower-cased keys. */
export function headersOf(spy: FetchSpy, index = 0): Record<string, string> {
  const headers = initOf(spy, index)?.headers ?? {}
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
}

/** Parsed JSON body of call `index`. */
export function bodyOf(spy: FetchSpy, index = 0): unknown {
  const body = initOf(spy, index)?.body
  return typeof body === 'string' ? JSON.parse(body) : undefined
}
