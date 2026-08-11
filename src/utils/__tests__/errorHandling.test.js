import { describe, it, expect } from 'vitest'
import { analyzeError, ErrorTypes, ErrorSeverity } from '../errorHandling'

describe('analyzeError', () => {
  it('categorizes network errors', () => {
    const result = analyzeError(new Error('Network request failed'))
    expect(result.type).toBe(ErrorTypes.NETWORK)
    expect(result.severity).toBe(ErrorSeverity.MEDIUM)
    expect(result.userMessage).toMatch(/internet connection/i)
  })

  it('categorizes AWS credentials errors as high severity', () => {
    const result = analyzeError(new Error('Missing AWS credentials'))
    expect(result.type).toBe(ErrorTypes.AWS_CREDENTIALS)
    expect(result.severity).toBe(ErrorSeverity.HIGH)
  })

  it('accepts plain string errors, not just Error objects', () => {
    const result = analyzeError('Access denied to this resource')
    expect(result.type).toBe(ErrorTypes.AWS_PERMISSIONS)
    expect(result.originalMessage).toBe('Access denied to this resource')
  })

  it('falls back to unknown for unrecognized errors', () => {
    const result = analyzeError(new Error('something totally unexpected happened'))
    expect(result.type).toBe(ErrorTypes.UNKNOWN)
  })

  it('includes suggested actions and a generated id', () => {
    const result = analyzeError(new Error('throttling exceeded'))
    expect(Array.isArray(result.suggestedActions)).toBe(true)
    expect(result.suggestedActions.length).toBeGreaterThan(0)
    expect(result.id).toMatch(/^err_/)
  })
})
