import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, StreamAbortedError, isErrorEnvelope } from '../errors'
import { apiUrl, baseUrl, buildQuery, http, request } from '../http'
import { bodyOf, fakeResponse, headersOf, jsonResponse, mockFetch, urlOf } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('url building', () => {
  it('defaults to localhost:8000 and mounts the /api/v1 prefix', () => {
    expect(baseUrl()).toBe('http://localhost:8000')
    expect(apiUrl('/runs')).toBe('http://localhost:8000/api/v1/runs')
    expect(apiUrl('runs')).toBe('http://localhost:8000/api/v1/runs')
  })

  it('uses VITE_API_URL when set, trimming whitespace and a trailing slash', () => {
    vi.stubEnv('VITE_API_URL', '  https://api.example.com/  ')
    expect(baseUrl()).toBe('https://api.example.com')
  })

  it('strips multiple trailing slashes', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com///')
    expect(baseUrl()).toBe('https://api.example.com')
  })

  it('tolerates a configured base that already carries the /api/v1 prefix', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api/v1')
    expect(baseUrl()).toBe('https://api.example.com')
    expect(apiUrl('/runs')).toBe('https://api.example.com/api/v1/runs')
  })

  it('falls back to the default when VITE_API_URL is set but blank', () => {
    vi.stubEnv('VITE_API_URL', '   ')
    expect(baseUrl()).toBe('http://localhost:8000')
  })

  it('drops undefined and null query values, keeps false and 0', () => {
    expect(buildQuery({ a: undefined, b: null, c: false, d: 0, e: 'x' })).toBe(
      '?c=false&d=0&e=x'
    )
    expect(buildQuery()).toBe('')
    expect(buildQuery({ a: undefined })).toBe('')
  })

  it('expands array params into repeated keys and encodes values', () => {
    expect(buildQuery({ status: ['completed', 'error'] })).toBe('?status=completed&status=error')
    expect(apiUrl('/runs', { model_id: 'anthropic.claude 3' })).toBe(
      'http://localhost:8000/api/v1/runs?model_id=anthropic.claude+3'
    )
  })
})

describe('request', () => {
  it('parses a JSON response and sends the default accept header', async () => {
    const spy = mockFetch(jsonResponse({ status: 'ok' }))

    const result = await request<{ status: string }>('GET', '/health')

    expect(result).toEqual({ status: 'ok' })
    expect(urlOf(spy)).toBe('http://localhost:8000/api/v1/health')
    expect(headersOf(spy).accept).toBe('application/json')
    expect(spy.mock.calls[0][1]?.body).toBeUndefined()
  })

  it('serializes a JSON body with a content-type header', async () => {
    const spy = mockFetch(jsonResponse({ id: 'r1' }))

    await http.post('/runs', { model_id: 'm', stream: false })

    expect(spy.mock.calls[0][1]?.method).toBe('POST')
    expect(headersOf(spy)['content-type']).toBe('application/json')
    expect(bodyOf(spy)).toEqual({ model_id: 'm', stream: false })
  })

  it('returns undefined for a 204, even if the body is non-empty (a well-behaved server never sends one, but the check must not depend on that)', async () => {
    mockFetch(fakeResponse({ status: 204, statusText: 'No Content', text: '{"ignored":true}' }))

    await expect(http.delete('/runs/r1')).resolves.toBeUndefined()
  })

  it('returns undefined for a 205 too (both no-content statuses), even with a non-empty body', async () => {
    mockFetch(fakeResponse({ status: 205, statusText: 'Reset Content', text: '{"ignored":true}' }))

    await expect(http.delete('/runs/r1')).resolves.toBeUndefined()
  })

  it('returns undefined for a 200 with an empty body', async () => {
    mockFetch(fakeResponse({ status: 200, statusText: 'OK', text: '' }))

    await expect(http.get('/runs/r1')).resolves.toBeUndefined()
  })

  it('returns undefined for a 200 body that is only whitespace', async () => {
    mockFetch(fakeResponse({ status: 200, statusText: 'OK', text: '   \n  ' }))

    await expect(http.get('/runs/r1')).resolves.toBeUndefined()
  })

  it('returns undefined (not a parse attempt) when the body text is unreadable on a success status', async () => {
    mockFetch({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      text: () => Promise.reject(new Error('stream already consumed'))
    } as unknown as Response)

    await expect(http.get('/runs/r1')).resolves.toBeUndefined()
  })

  it('sends no body and no content-type header for a bodyless GET', async () => {
    const spy = mockFetch(jsonResponse({ ok: true }))

    await http.get('/runs')

    expect(spy.mock.calls[0][1]?.body).toBeUndefined()
    expect(headersOf(spy)['content-type']).toBeUndefined()
  })

  it('does not clobber a caller-supplied content-type header', async () => {
    const spy = mockFetch(jsonResponse({ ok: true }))

    await request('POST', '/scenarios', {
      body: { a: 1 },
      headers: { 'content-type': 'application/merge-patch+json' }
    })

    expect(headersOf(spy)['content-type']).toBe('application/merge-patch+json')
  })

  it('passes the AbortSignal through to fetch', async () => {
    const spy = mockFetch(jsonResponse({ ok: true }))
    const controller = new AbortController()

    await http.get('/runs', { signal: controller.signal })

    expect(spy.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('sends a PATCH with a JSON body', async () => {
    const spy = mockFetch(jsonResponse({ id: 'r1' }))

    await http.patch('/runs/r1', { status: 'cancelled' })

    expect(spy.mock.calls[0][1]?.method).toBe('PATCH')
    expect(bodyOf(spy)).toEqual({ status: 'cancelled' })
  })
})

describe('error handling', () => {
  it('parses the error envelope into ApiError fields', async () => {
    mockFetch(
      fakeResponse({
        status: 404,
        statusText: 'Not Found',
        text: JSON.stringify({
          error: { code: 'not_found', message: 'Run abc not found', detail: { id: 'abc' } }
        }),
        headers: { 'content-type': 'application/json' }
      })
    )

    const error = (await http.get('/runs/abc').catch(e => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('not_found')
    expect(error.message).toBe('Run abc not found')
    expect(error.detail).toEqual({ id: 'abc' })
    expect(error.status).toBe(404)
    expect(error.isNotFound).toBe(true)
  })

  it('carries the validation_error detail list from a 422', async () => {
    mockFetch(
      fakeResponse({
        status: 422,
        statusText: 'Unprocessable Entity',
        text: JSON.stringify({
          error: {
            code: 'validation_error',
            message: 'Request validation failed',
            detail: [{ loc: ['body', 'model_id'], msg: 'Field required' }]
          }
        })
      })
    )

    const error = (await http.post('/runs', {}).catch(e => e)) as ApiError

    expect(error.code).toBe('validation_error')
    expect(Array.isArray(error.detail)).toBe(true)
    expect(error.status).toBe(422)
  })

  it('falls back to the raw text for a non-JSON error body', async () => {
    mockFetch(
      fakeResponse({
        status: 502,
        statusText: 'Bad Gateway',
        text: '<html><body>502 Bad Gateway</body></html>',
        headers: { 'content-type': 'text/html' }
      })
    )

    const error = (await http.get('/models').catch(e => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('http_error')
    expect(error.message).toContain('502 Bad Gateway')
    expect(error.status).toBe(502)
    expect(error.isServerError).toBe(true)
  })

  it('falls back to the status text for an empty error body', async () => {
    mockFetch(fakeResponse({ status: 500, statusText: 'Internal Server Error', text: '' }))

    const error = (await http.get('/models').catch(e => e)) as ApiError

    expect(error.message).toBe('Internal Server Error')
    expect(error.code).toBe('http_error')
  })

  it('falls back to the status text for JSON that is not an envelope', async () => {
    mockFetch(
      fakeResponse({ status: 400, statusText: 'Bad Request', text: JSON.stringify({ oops: 1 }) })
    )

    const error = (await http.get('/models').catch(e => e)) as ApiError

    expect(error.message).toBe('Bad Request')
    expect(error.body).toEqual({ oops: 1 })
  })

  it('reports a malformed success body as invalid_response', async () => {
    mockFetch(fakeResponse({ status: 200, statusText: 'OK', text: '{not json' }))

    const error = (await http.get('/models').catch(e => e)) as ApiError

    expect(error.code).toBe('invalid_response')
    expect(error.message).toBe('Response body was not valid JSON')
  })

  it('falls back to the status text when reading the error body itself throws', async () => {
    const brokenResponse = {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: { get: () => null },
      text: () => Promise.reject(new Error('body already consumed')),
      json: () => Promise.reject(new Error('body already consumed'))
    } as unknown as Response
    mockFetch(brokenResponse)

    const error = (await http.get('/models').catch(e => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(503)
    expect(error.message).toBe('Service Unavailable')
  })

  it('wraps a network failure as an ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    )

    const error = (await http.get('/models').catch(e => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('network_error')
    expect(error.status).toBe(0)
  })

  it('falls back to a generic message when fetch rejects with something that is not an Error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject('the network fell over'))
    )

    const error = (await http.get('/models').catch(e => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('network_error')
    expect(error.message).toBe('Network request failed')
  })

  it('converts an aborted request into StreamAbortedError', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(abortError))
    )

    await expect(http.get('/models')).rejects.toBeInstanceOf(StreamAbortedError)
  })

  it('recognizes the server envelope shape', () => {
    expect(isErrorEnvelope({ error: { code: 'x', message: 'y' } })).toBe(true)
    expect(isErrorEnvelope({ error: { code: 'x' } })).toBe(false)
    expect(isErrorEnvelope({ detail: 'nope' })).toBe(false)
    expect(isErrorEnvelope(null)).toBe(false)
  })
})
