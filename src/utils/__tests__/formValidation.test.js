/**
 * Tests for form validation utilities
 */

import { validateField, validateForm, validateModelId, validateDatasetContent } from '../formValidation.js'

describe('Form Validation', () => {
  test('should validate model field correctly', () => {
    // Valid model
    const validResult = validateField('model', 'amazon.nova-pro-v1:0')
    expect(validResult.isValid).toBe(true)
    expect(validResult.error).toBeNull()

    // Invalid model (empty)
    const invalidResult = validateField('model', '')
    expect(invalidResult.isValid).toBe(false)
    expect(invalidResult.error).toBe('Model selection is required')
  })

  test('should validate prompt field correctly', () => {
    // Valid prompt
    const validResult = validateField('prompt', 'This is a valid prompt with enough characters')
    expect(validResult.isValid).toBe(true)
    expect(validResult.error).toBeNull()

    // Invalid prompt (too short)
    const shortResult = validateField('prompt', 'short')
    expect(shortResult.isValid).toBe(false)
    expect(shortResult.error).toBe('Prompt must be at least 10 characters long')

    // Invalid prompt (empty)
    const emptyResult = validateField('prompt', '')
    expect(emptyResult.isValid).toBe(false)
    expect(emptyResult.error).toBe('Prompt is required')
  })

  test('should validate dataset field correctly', () => {
    // Valid dataset
    const validDataset = {
      type: 'enterprise-fraud',
      option: 'dataset1.json',
      content: '{"data": "test"}'
    }
    const validResult = validateField('dataset', validDataset)
    expect(validResult.isValid).toBe(true)
    expect(validResult.error).toBeNull()

    // Invalid dataset (missing type)
    const invalidDataset = {
      type: '',
      option: 'dataset1.json',
      content: '{"data": "test"}'
    }
    const invalidResult = validateField('dataset', invalidDataset)
    expect(invalidResult.isValid).toBe(false)
    expect(invalidResult.error).toBe('Dataset type selection is required')
  })

  test('should validate entire form correctly', () => {
    const validFormData = {
      selectedModel: 'amazon.nova-pro-v1:0',
      prompt: 'This is a valid prompt with enough characters',
      selectedDataset: {
        type: 'enterprise-fraud',
        option: 'dataset1.json',
        content: '{"data": "test"}'
      }
    }

    const result = validateForm(validFormData)
    expect(result.isValid).toBe(true)
    expect(Object.keys(result.errors)).toHaveLength(0)
  })

  test('should validate model ID format', () => {
    // Valid model IDs
    expect(validateModelId('amazon.nova-pro-v1:0').isValid).toBe(true)
    expect(validateModelId('anthropic.claude-3-sonnet').isValid).toBe(true)

    // Invalid model IDs
    expect(validateModelId('').isValid).toBe(false)
    expect(validateModelId('invalid model id').isValid).toBe(false)
    expect(validateModelId(null).isValid).toBe(false)
  })

  test('should validate dataset content', () => {
    // Valid JSON
    const jsonResult = validateDatasetContent('{"key": "value"}', 'json')
    expect(jsonResult.isValid).toBe(true)

    // Invalid JSON
    const invalidJsonResult = validateDatasetContent('invalid json', 'json')
    expect(invalidJsonResult.isValid).toBe(false)

    // Valid CSV
    const csvResult = validateDatasetContent('header1,header2\nvalue1,value2', 'csv')
    expect(csvResult.isValid).toBe(true)

    // Empty content
    const emptyResult = validateDatasetContent('', 'json')
    expect(emptyResult.isValid).toBe(false)
  })
})