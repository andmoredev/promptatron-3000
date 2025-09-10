/**
 * Tests for form validation utilities
 */

import { validateField, validateForm, validateModelId, validateDatasetContent, validateDualPrompts } from '../formValidation.js'

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

  test('should validate entire form correctly with single prompt', () => {
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

  test('should validate entire form correctly with dual prompts', () => {
    const validFormData = {
      selectedModel: 'amazon.nova-pro-v1:0',
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'What is the weather today?',
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

  describe('Dual Prompt Validation', () => {
    test('should validate system prompt field correctly', () => {
      // Valid system prompt
      const validResult = validateField('systemPrompt', 'You are a helpful assistant.')
      expect(validResult.isValid).toBe(true)
      expect(validResult.error).toBeNull()

      // Invalid system prompt (empty)
      const emptyResult = validateField('systemPrompt', '')
      expect(emptyResult.isValid).toBe(false)
      expect(emptyResult.error).toBe('System prompt is required')

      // Invalid system prompt (too long)
      const longPrompt = 'a'.repeat(10001)
      const longResult = validateField('systemPrompt', longPrompt)
      expect(longResult.isValid).toBe(false)
      expect(longResult.error).toBe('System prompt must be less than 10,000 characters')
    })

    test('should validate user prompt field correctly', () => {
      // Valid user prompt
      const validResult = validateField('userPrompt', 'What is the weather today?')
      expect(validResult.isValid).toBe(true)
      expect(validResult.error).toBeNull()

      // Invalid user prompt (empty)
      const emptyResult = validateField('userPrompt', '')
      expect(emptyResult.isValid).toBe(false)
      expect(emptyResult.error).toBe('User prompt is required')

      // Invalid user prompt (too long)
      const longPrompt = 'a'.repeat(10001)
      const longResult = validateField('userPrompt', longPrompt)
      expect(longResult.isValid).toBe(false)
      expect(longResult.error).toBe('User prompt must be less than 10,000 characters')
    })

    test('should validate dual prompts together', () => {
      // Valid dual prompts
      const validResult = validateDualPrompts('You are a helpful assistant.', 'What is the weather?')
      expect(validResult.isValid).toBe(true)
      expect(Object.keys(validResult.errors)).toHaveLength(0)

      // Missing system prompt
      const missingSystemResult = validateDualPrompts('', 'What is the weather?')
      expect(missingSystemResult.isValid).toBe(false)
      expect(missingSystemResult.errors.systemPrompt).toBe('System prompt is required')

      // Missing user prompt
      const missingUserResult = validateDualPrompts('You are a helpful assistant.', '')
      expect(missingUserResult.isValid).toBe(false)
      expect(missingUserResult.errors.userPrompt).toBe('User prompt is required')

      // Both prompts missing
      const bothMissingResult = validateDualPrompts('', '')
      expect(bothMissingResult.isValid).toBe(false)
      expect(bothMissingResult.errors.systemPrompt).toBe('System prompt is required')
      expect(bothMissingResult.errors.userPrompt).toBe('User prompt is required')
    })

    test('should warn about combined prompt length', () => {
      const longSystemPrompt = 'a'.repeat(8000)
      const longUserPrompt = 'b'.repeat(8000)

      const result = validateDualPrompts(longSystemPrompt, longUserPrompt)
      expect(result.isValid).toBe(true)
      expect(result.warnings).toBeTruthy()
      expect(result.warnings.combinedLength).toContain('Combined prompt length is very long')
    })

    test('should validate form with dual prompts and show specific errors', () => {
      const invalidDualPromptForm = {
        selectedModel: 'amazon.nova-pro-v1:0',
        systemPrompt: '', // Missing system prompt
        userPrompt: 'What is the weather?',
        selectedDataset: {
          type: 'enterprise-fraud',
          option: 'dataset1.json',
          content: '{"data": "test"}'
        }
      }

      const result = validateForm(invalidDualPromptForm)
      expect(result.isValid).toBe(false)
      expect(result.errors.systemPrompt).toBe('System prompt is required')
      expect(result.errors.userPrompt).toBeUndefined()
    })

    test('should handle form validation mode detection correctly', () => {
      // Single prompt mode
      const singlePromptForm = {
        selectedModel: 'amazon.nova-pro-v1:0',
        prompt: 'This is a single prompt',
        selectedDataset: {
          type: 'enterprise-fraud',
          option: 'dataset1.json',
          content: '{"data": "test"}'
        }
      }

      const singleResult = validateForm(singlePromptForm)
      expect(singleResult.results.prompt).toBeDefined()
      expect(singleResult.results.systemPrompt).toBeUndefined()
      expect(singleResult.results.userPrompt).toBeUndefined()

      // Dual prompt mode
      const dualPromptForm = {
        selectedModel: 'amazon.nova-pro-v1:0',
        systemPrompt: 'You are helpful.',
        userPrompt: 'What is the weather?',
        selectedDataset: {
          type: 'enterprise-fraud',
          option: 'dataset1.json',
          content: '{"data": "test"}'
        }
      }

      const dualResult = validateForm(dualPromptForm)
      expect(dualResult.results.systemPrompt).toBeDefined()
      expect(dualResult.results.userPrompt).toBeDefined()
      expect(dualResult.results.prompt).toBeUndefined()
    })
  })
})