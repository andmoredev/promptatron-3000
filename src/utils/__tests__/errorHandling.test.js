/**
 * Tests for error handling utilities
 */

import { analyzeError, ErrorTypes, ErrorSeverity } from '../errorHandling.js'

describe('Error Handling', () => {
  test('should categorize network errors correctly', () => {
    const networkError = new Error('Network request failed')
    const result = analyzeError(networkError)

    expect(result.type).toBe(ErrorTypes.NETWORK)
    expect(result.severity).toBe(ErrorSeverity.MEDIUM)
    expect(result.userMessage).toContain('Network connection issue')
  })

  test('should categorize AWS credential errors correctly', () => {
    const credError = new Error('AWS credentials not found')
    const result = analyzeError(credError)

    expect(result.type).toBe(ErrorTypes.AWS_CREDENTIALS)
    expect(result.severity).toBe(ErrorSeverity.HIGH)
    expect(result.userMessage).toContain('AWS credentials are missing')
  })

  test('should categorize validation errors correctly', () => {
    const validationError = new Error('Validation failed: field is required')
    const result = analyzeError(validationError)

    expect(result.type).toBe(ErrorTypes.VALIDATION)
    expect(result.severity).toBe(ErrorSeverity.LOW)
    expect(result.userMessage).toContain('Input validation failed')
  })

  test('should provide suggested actions', () => {
    const networkError = new Error('Network timeout')
    const result = analyzeError(networkError)

    expect(result.suggestedActions).toBeInstanceOf(Array)
    expect(result.suggestedActions.length).toBeGreaterThan(0)
    expect(result.suggestedActions).toContain('Check your internet connection')
  })

  test('should generate unique error IDs', () => {
    const error1 = analyzeError(new Error('Test error 1'))
    const error2 = analyzeError(new Error('Test error 2'))

    expect(error1.id).toBeDefined()
    expect(error2.id).toBeDefined()
    expect(error1.id).not.toBe(error2.id)
  })

  test('should handle string errors', () => {
    const result = analyzeError('Simple error message')

    expect(result.originalMessage).toBe('Simple error message')
    expect(result.type).toBe(ErrorTypes.UNKNOWN)
  })
})