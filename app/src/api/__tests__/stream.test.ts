import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, StreamAbortedError } from '../errors'
import { getNdjson, streamNdjson } from '../stream'
import type { RunStreamEvent } from '../types'
import {
  bodyOf,
  controlledStream,
  fakeResponse,
  headersOf,
  mockFetch,
  ndjsonResponse,
  urlOf
} from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Collect every event a stream delivers, in order. */
function collector() {
  const events: RunStreamEvent[] = []
  return { events, onEvent: (event: RunStreamEvent) => events.push(event) }
}

describe('streamNdjson: request shape', () => {
  it('POSTs the body as JSON and asks for NDJSON', async () => {
    const spy = mockFetch(ndjsonResponse(['{"type":"text_delta","text":"hi"}\n']))
    const { events, onEvent } = collector()

    await streamNdjson('/runs', { model_id: 'm', user_prompt: 'p', stream: true }, { onEvent })

    expect(urlOf(spy)).toBe('http://localhost:8000/api/v1/runs')
    expect(spy.mock.calls[0][1]?.method).toBe('POST')
    expect(headersOf(spy)).toMatchObject({
      accept: 'application/x-ndjson',
      'content-type': 'application/json'
    })
    expect(bodyOf(spy)).toEqual({ model_id: 'm', user_prompt: 'p', stream: true })
    expect(events).toEqual([{ type: 'text_delta', text: 'hi' }])
  })
})

describe('streamNdjson: chunk boundaries', () => {
  it('reassembles one JSON object split across three chunks', async () => {
    const line = '{"type":"run_start","run_id":"r1","model_id":"m1","ts":"2026-08-11T00:00:00Z"}'
    mockFetch(
      ndjsonResponse([line.slice(0, 20), line.slice(20, 55), `${line.slice(55)}\n`])
    )
    const { events, onEvent } = collector()

    await streamNdjson('/runs', {}, { onEvent })

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      type: 'run_start',
      run_id: 'r1',
      model_id: 'm1',
      ts: '2026-08-11T00:00:00Z'
    })
  })

  it('emits every event when several lines arrive in one chunk', async () => {
    mockFetch(
      ndjsonResponse([
        '{"type":"text_delta","text":"a"}\n{"type":"text_delta","text":"b"}\n{"type":"text_delta","text":"c"}\n'
      ])
    )
    const { events, onEvent } = collector()

    await streamNdjson('/runs', {}, { onEvent })

    expect(events.map(e => (e.type === 'text_delta' ? e.text : null))).toEqual(['a', 'b', 'c'])
  })

  it('parses a trailing line that never got its newline before EOF', async () => {
    mockFetch(
      ndjsonResponse([
        '{"type":"text_delta","text":"a"}\n',
        '{"type":"run_complete","run_id":"r1","status":"completed","final_text":"a"}'
      ])
    )
    const { events, onEvent } = collector()

    await streamNdjson('/runs', {}, { onEvent })

    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({
      type: 'run_complete',
      run_id: 'r1',
      status: 'completed',
      final_text: 'a'
    })
  })

  it('tolerates CRLF line endings and ignores blank lines', async () => {
    mockFetch(
      ndjsonResponse(['{"type":"text_delta","text":"a"}\r\n', '\n', '   \n', '{"type":"metrics","input_tokens":1,"output_tokens":2,"total_tokens":3,"latency_ms":4,"cycle_count":1}\r\n'])
    )
    const { events, onEvent } = collector()

    await streamNdjson('/runs', {}, { onEvent })

    expect(events.map(e => e.type)).toEqual(['text_delta', 'metrics'])
  })

  it('decodes a multi-byte character split across a chunk boundary', async () => {
    const bytes = new TextEncoder().encode('{"type":"text_delta","text":"€uro"}\n')
    const split = 30 // lands inside the 3-byte "€"
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split))
        controller.enqueue(bytes.slice(split))
        controller.close()
      }
    })
    mockFetch(fakeResponse({ status: 200, statusText: 'OK', body: stream }))
    const { events, onEvent } = collector()

    await streamNdjson('/runs', {}, { onEvent })

    expect(events).toEqual([{ type: 'text_delta', text: '€uro' }])
  })
})

describe('streamNdjson: aborting', () => {
  it('rejects with StreamAbortedError and cancels the reader', async () => {
    const source = controlledStream()
    mockFetch(fakeResponse({ status: 200, statusText: 'OK', body: source.stream }))

    const controller = new AbortController()
    const events: RunStreamEvent[] = []
    const promise = streamNdjson<RunStreamEvent>(
      '/runs',
      {},
      {
        signal: controller.signal,
        onEvent: event => {
          events.push(event)
          controller.abort()
        }
      }
    )

    source.push('{"type":"text_delta","text":"a"}\n{"type":"text_delta","text":"b"}\n')

    await expect(promise).rejects.toBeInstanceOf(StreamAbortedError)
    // Only the event that triggered the abort was dispatched.
    expect(events).toHaveLength(1)
    // The reader was cancelled, which is what disconnects the server.
    expect(source.cancelReasons.length).toBeGreaterThanOrEqual(1)
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const spy = mockFetch(ndjsonResponse(['{"type":"text_delta","text":"a"}\n']))
    const controller = new AbortController()
    controller.abort()

    await expect(
      streamNdjson('/runs', {}, { signal: controller.signal, onEvent: () => undefined })
    ).rejects.toBeInstanceOf(StreamAbortedError)
    expect(spy).not.toHaveBeenCalled()
  })

  it('converts a fetch AbortError into StreamAbortedError', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError'
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(abortError))
    )

    await expect(streamNdjson('/runs', {}, { onEvent: () => undefined })).rejects.toBeInstanceOf(
      StreamAbortedError
    )
  })

  it('registers the abort listener as {once: true} on "abort" and removes it when the stream ends', async () => {
    const source = controlledStream()
    mockFetch(fakeResponse({ status: 200, statusText: 'OK', body: source.stream }))
    const controller = new AbortController()
    const addSpy = vi.spyOn(controller.signal, 'addEventListener')
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')

    const promise = streamNdjson(
      '/runs',
      {},
      { signal: controller.signal, onEvent: () => undefined }
    )
    source.push('{"type":"text_delta","text":"a"}\n')
    source.close()
    await promise

    expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true })
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('cancels the reader via the abort listener when the signal aborts while a read is pending', async () => {
    const source = controlledStream()
    mockFetch(fakeResponse({ status: 200, statusText: 'OK', body: source.stream }))
    const controller = new AbortController()

    // Nothing pushed yet: the very first `reader.read()` is pending when we
    // abort. Let the microtask queue drain first so `consume()` has actually
    // reached `readLines` and registered the abort listener before we fire it
    // — otherwise the abort event dispatches into a listener that doesn't
    // exist yet and the pending read() would hang forever.
    const promise = streamNdjson(
      '/runs',
      {},
      { signal: controller.signal, onEvent: () => undefined }
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(StreamAbortedError)
    expect(source.cancelReasons).toHaveLength(1)
    expect(source.cancelReasons[0]).toBeInstanceOf(StreamAbortedError)
  })
})

describe('streamNdjson: failures before the stream', () => {
  it('throws an ApiError carrying the envelope code on a 502', async () => {
    mockFetch(
      fakeResponse({
        status: 502,
        statusText: 'Bad Gateway',
        text: JSON.stringify({
          error: {
            code: 'upstream_error',
            message: 'config store unreachable',
            detail: { attempts: 3 }
          }
        }),
        headers: { 'content-type': 'application/json' }
      })
    )

    const error = await streamNdjson('/runs', {}, { onEvent: () => undefined }).catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'upstream_error',
      message: 'config store unreachable',
      status: 502,
      detail: { attempts: 3 }
    })
  })

  it('falls back to the status text when reading a non-2xx body itself throws', async () => {
    mockFetch({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: { get: () => null },
      text: () => Promise.reject(new Error('body already consumed'))
    } as unknown as Response)

    const error = await streamNdjson('/runs', {}, { onEvent: () => undefined }).catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(503)
    expect((error as ApiError).message).toBe('Service Unavailable')
  })

  it('throws an ApiError when the response has no readable body', async () => {
    mockFetch(fakeResponse({ status: 200, statusText: 'OK', body: null }))

    const error = await streamNdjson('/runs', {}, { onEvent: () => undefined }).catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('stream_unavailable')
    expect((error as ApiError).message).toBe('Response carried no readable body')
  })

  it('throws an ApiError on a malformed NDJSON line', async () => {
    mockFetch(ndjsonResponse(['{"type":"text_delta","text":"a"}\n', 'not json\n']))
    const { events, onEvent } = collector()

    const error = await streamNdjson('/runs', {}, { onEvent }).catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('invalid_stream_line')
    expect((error as ApiError).message).toBe('Malformed NDJSON line in stream')
    expect(events).toHaveLength(1)
  })

  it('truncates the offending line to 500 characters in the error detail', async () => {
    const longBadLine = 'x'.repeat(600)
    mockFetch(ndjsonResponse([`${longBadLine}\n`]))

    const error = await streamNdjson('/runs', {}, { onEvent: () => undefined }).catch(e => e)

    expect((error as ApiError).detail).toEqual({ line: 'x'.repeat(500) })
  })
})

describe('streamNdjson: line splitting', () => {
  it('strips a trailing CR from CRLF line endings before parsing', async () => {
    mockFetch(ndjsonResponse(['{"type":"text_delta","text":"a"}\r\n']))
    const { events, onEvent } = collector()

    await streamNdjson('/runs', {}, { onEvent })

    expect(events).toHaveLength(1)
    expect((events[0] as { text: string }).text).toBe('a')
  })
})

describe('getNdjson', () => {
  it('GETs with NDJSON accept and serialized query params', async () => {
    const spy = mockFetch(
      ndjsonResponse(['{"type":"eval_start","evaluation_id":"e1","kind":"determinism","n":3}\n'])
    )
    const events: unknown[] = []

    await getNdjson('/evaluations/e1/events', {
      query: { limit: 5, cursor: undefined },
      onEvent: event => events.push(event)
    })

    expect(urlOf(spy)).toBe('http://localhost:8000/api/v1/evaluations/e1/events?limit=5')
    expect(spy.mock.calls[0][1]?.method).toBe('GET')
    expect(headersOf(spy).accept).toBe('application/x-ndjson')
    expect(events).toEqual([
      { type: 'eval_start', evaluation_id: 'e1', kind: 'determinism', n: 3 }
    ])
  })
})
