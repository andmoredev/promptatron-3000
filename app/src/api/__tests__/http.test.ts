import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, StreamAbortedError, isErrorEnvelope } from '../errors'
import { apiUrl, baseUrl, buildQuery, http, request } from '../http'
import { bodyOf, fakeResponse, headersOf, jsonResponse, mockFetch, urlOf } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('url building', () => {
  it('defaults to localhost:8000 and mounts the /api/v1 prefix', () => {
    expect(baseUrl()).toBe('http://localhost:8000')
    expect(apiUrl('/runs')).toBe('http://localhost:8000/api/v1/runs')
    expect(apiUrl('runs')).toBe('http://localhost:8000/api/v1/runs')
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

  it('returns undefined for a 204', async () => {
    mockFetch(fakeResponse({ status: 204, statusText: 'No Content' }))

    await expect(http.delete('/runs/r1')).resolves.toBeUndefined()
  })

  it('returns undefined for a 200 with an empty body', async () => {
    mockFetch(fakeResponse({ status: 200, statusText: 'OK', text: '' }))

    await expect(http.get('/runs/r1')).resolves.toBeUndefined()
  })

  it('passes the AbortSignal through to fetch', async () => {
    const spy = mockFetch(jsonResponse({ ok: true }))
    const controller = new AbortController()

    await http.get('/runs', { signal: controller.signal })

    expect(spy.mock.calls[0][1]?.signal).toBe(controller.signal)
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
