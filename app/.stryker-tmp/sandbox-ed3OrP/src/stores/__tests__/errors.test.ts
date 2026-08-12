/**
 * `toStoreError` / `isAborted`: the one place that flattens whatever the API
 * layer threw into the shape every store's `error` field holds.
 */
// @ts-nocheck


import { describe, expect, it } from 'vitest'
import { ApiError, StreamAbortedError } from '../../api'
import { isAborted, toStoreError } from '../errors'

describe('toStoreError', () => {
  it('carries the code and message off an ApiError verbatim', () => {
    const error = new ApiError('Run abc not found', { code: 'not_found', status: 404 })

    expect(toStoreError(error)).toEqual({ code: 'not_found', message: 'Run abc not found' })
  })

  it('maps a StreamAbortedError to code "aborted"', () => {
    const error = new StreamAbortedError('Stream aborted by caller')

    expect(toStoreError(error)).toEqual({
      code: 'aborted',
      message: 'Stream aborted by caller'
    })
  })

  it('maps a plain Error to code "unknown_error" with its message', () => {
    expect(toStoreError(new Error('boom'))).toEqual({
      code: 'unknown_error',
      message: 'boom'
    })
  })

  it('stringifies a non-Error throw under code "unknown_error"', () => {
    expect(toStoreError('just a string')).toEqual({
      code: 'unknown_error',
      message: 'just a string'
    })
    expect(toStoreError(42)).toEqual({ code: 'unknown_error', message: '42' })
    expect(toStoreError(null)).toEqual({ code: 'unknown_error', message: 'null' })
  })
})

describe('isAborted', () => {
  it('is true for a StreamAbortedError', () => {
    expect(isAborted(new StreamAbortedError())).toBe(true)
  })

  it('is true for a DOMException-shaped AbortError', () => {
    expect(isAborted(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true)
  })

  it('is false for an ordinary ApiError or Error', () => {
    expect(isAborted(new ApiError('nope', { code: 'not_found' }))).toBe(false)
    expect(isAborted(new Error('nope'))).toBe(false)
    expect(isAborted('nope')).toBe(false)
  })
})
