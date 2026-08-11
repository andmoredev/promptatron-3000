import { describe, it, expect } from 'vitest'
import { sanitizeInput, validateModelId, validateDatasetContent } from '../formValidation'

describe('sanitizeInput', () => {
  it('strips angle brackets from HTML-like input', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script')
  })

  it('removes javascript: protocol references', () => {
    expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)')
  })

  it('removes inline event handler attributes', () => {
    expect(sanitizeInput('onclick=doSomething()')).toBe('doSomething()')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeInput('  hello world  ')).toBe('hello world')
  })

  it('returns an empty string for non-string input', () => {
    expect(sanitizeInput(null)).toBe('')
    expect(sanitizeInput(undefined)).toBe('')
    expect(sanitizeInput(42)).toBe('')
  })
})

describe('validateModelId', () => {
  it('accepts a known AWS Bedrock model id', () => {
    const result = validateModelId('anthropic.claude-3-sonnet-20240229-v1:0')
    expect(result.isValid).toBe(true)
    expect(result.warning).toBeUndefined()
  })

  it('rejects non-string input', () => {
    const result = validateModelId(null)
    expect(result.isValid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects model ids with invalid characters', () => {
    const result = validateModelId('anthropic/claude v1')
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('Invalid model ID format')
  })

  it('warns on well-formed but unknown model prefixes', () => {
    const result = validateModelId('unknown-vendor.model-v1')
    expect(result.isValid).toBe(true)
    expect(result.warning).toBeTruthy()
  })
})

describe('validateDatasetContent', () => {
  it('rejects empty content', () => {
    const result = validateDatasetContent('   ', 'json')
    expect(result.isValid).toBe(false)
  })

  it('validates well-formed JSON content', () => {
    const result = validateDatasetContent('{"a": 1}', 'json')
    expect(result.isValid).toBe(true)
  })

  it('rejects malformed JSON content', () => {
    const result = validateDatasetContent('{not valid json', 'json')
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('Invalid JSON format')
  })

  it('accepts non-empty CSV content', () => {
    const result = validateDatasetContent('a,b,c\n1,2,3', 'csv')
    expect(result.isValid).toBe(true)
  })
})
