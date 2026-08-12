/**
 * NDJSON stream consumer.
 *
 * The server writes one JSON object per line (`event.model_dump_json() + "\n"`,
 * see server/promptatron/engine/events.py) and flushes as it goes, so a chunk
 * boundary can land anywhere — mid-line, between lines, or several lines at
 * once. This module buffers across chunks, tolerates CRLF, ignores blank lines,
 * and parses a trailing line that never got its newline before EOF.
 */

import { ApiError, StreamAbortedError, isAbortError } from './errors'
import { apiUrl, NDJSON_MEDIA_TYPE, type QueryParams } from './http'

/**
 * The subset of `fetch`'s init this module builds. Spelled out structurally
 * because the ambient `RequestInit` type name trips the repo's core `no-undef`
 * lint rule, which is not TypeScript-aware.
 */
interface FetchInit {
  method: string
  headers: Record<string, string>
  body?: string
  signal?: AbortSignal
}

export interface StreamOptions<T> {
  /** Called once per parsed line, in stream order. */
  // eslint-disable-next-line no-unused-vars -- core rule misreads function-type params
  onEvent: (event: T) => void
  signal?: AbortSignal
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>
}

export interface GetStreamOptions<T> extends StreamOptions<T> {
  query?: QueryParams
}

/**
 * POST `body` to `path` and consume the NDJSON response.
 *
 * Resolves when the server closes the stream. Rejects with `ApiError` if the
 * response is non-2xx (the error envelope is read from the body first) and with
 * `StreamAbortedError` if `opts.signal` aborts mid-stream — in which case the
 * underlying reader is cancelled so the server sees the disconnect (and records
 * the run as `cancelled`).
 */
export async function streamNdjson<T>(
  path: string,
  body: unknown,
  opts: StreamOptions<T>
): Promise<void> {
  return consume(
    path,
    {
      method: 'POST',
      headers: {
        accept: NDJSON_MEDIA_TYPE,
        'content-type': 'application/json',
        ...opts.headers
      },
      body: JSON.stringify(body ?? {}),
      signal: opts.signal
    },
    opts
  )
}

/** GET `path` and consume the NDJSON response (evaluation events, exports). */
export async function getNdjson<T>(path: string, opts: GetStreamOptions<T>): Promise<void> {
  return consume(
    path,
    {
      method: 'GET',
      headers: { accept: NDJSON_MEDIA_TYPE, ...opts.headers },
      signal: opts.signal
    },
    opts,
    opts.query
  )
}

async function consume<T>(
  path: string,
  init: FetchInit,
  opts: StreamOptions<T>,
  query?: QueryParams
): Promise<void> {
  const { signal } = opts
  if (signal?.aborted) throw new StreamAbortedError()

  let response: Response
  try {
    response = await fetch(apiUrl(path, query), init)
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw new StreamAbortedError()
    throw new ApiError(error instanceof Error ? error.message : 'Network request failed', {
      code: 'network_error'
    })
  }

  if (!response.ok) {
    let text: string | null = null
    try {
      text = await response.text()
    } catch {
      text = null
    }
    throw ApiError.fromBody(response.status, response.statusText, text)
  }

  if (!response.body) {
    throw new ApiError('Response carried no readable body', {
      code: 'stream_unavailable',
      status: response.status
    })
  }

  await readLines(response.body, opts)
}

async function readLines<T>(stream: ReadableStream<Uint8Array>, opts: StreamOptions<T>) {
  const { onEvent, signal } = opts
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  // Cancelling the reader on abort is what surfaces the disconnect to the
  // server; it also unblocks the pending read() so the loop can exit.
  const onAbort = () => {
    void reader.cancel(new StreamAbortedError()).catch(() => undefined)
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (signal?.aborted) throw new StreamAbortedError()

      if (done) {
        // Flush any bytes the decoder is still holding, then the final line.
        buffer += decoder.decode()
        emitLine(buffer, onEvent, signal)
        return
      }

      buffer += decoder.decode(value, { stream: true })

      let newlineAt = buffer.indexOf('\n')
      while (newlineAt !== -1) {
        const line = buffer.slice(0, newlineAt)
        buffer = buffer.slice(newlineAt + 1)
        emitLine(line, onEvent, signal)
        newlineAt = buffer.indexOf('\n')
      }
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      void reader.cancel(new StreamAbortedError()).catch(() => undefined)
      throw new StreamAbortedError()
    }
    void reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Parse one NDJSON line and dispatch it. Blank lines are skipped. */
function emitLine<T>(
  rawLine: string,
  // eslint-disable-next-line no-unused-vars -- core rule misreads function-type params
  onEvent: (event: T) => void,
  signal?: AbortSignal
): void {
  // Tolerate CRLF: the split is on "\n", so "\r" can survive on the tail.
  const line = rawLine.replace(/\r$/, '').trim()
  if (line === '') return
  if (signal?.aborted) throw new StreamAbortedError()

  let parsed: T
  try {
    parsed = JSON.parse(line) as T
  } catch {
    throw new ApiError('Malformed NDJSON line in stream', {
      code: 'invalid_stream_line',
      detail: { line: line.slice(0, 500) }
    })
  }
  onEvent(parsed)
}
