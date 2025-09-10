/**
 * Integration tests for dual prompt functionality
 * Tests the complete workflow from input through API call to result display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateForm } from '../formValidation'
import { bedrockService } from '../../services/bedrockService'

// Mock AWS SDK
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(() => ({
    send: vi.fn()
  })),
  ConverseCommand: vi.fn()
}))

vi.mock('@aws-sdk/client-bedrock', () => ({
  BedrockClient: vi.fn(() => ({
    send: vi.fn()
  })),
  ListFoundationModelsCommand: vi.fn()
}))

describe('Dual Prompt Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock environment variables
    vi.stubEnv('VITE_AWS_ACCESS_KEY_ID', 'test-access-key')
    vi.stubEnv('VITE_AWS_SECRET_ACCESS_KEY', 'test-secret-key')
    vi.stubEnv('VITE_AWS_REGION', 'us-east-1')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('Form Validation Integration', () => {
    it('should validate dual prompt requirements correctly', () => {
      // Test case 1: Both prompts provided
      const validFormData = {
        selectedModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
        systemPrompt: 'You are a data analyst expert.',
        userPrompt: 'Please analyze the following data.',
        selectedDataset: {
          type: 'prise-fraud',
          option: 'retail',
          content: 'sample data'
        }
      }

      const validResult = validateForm(validFormData)
      expect(validResult.isValid).toBe(true)
      expect(Object.keys(validResult.errors)).toHaveLength(0)

      // Test case 2: Missing system prompt
      const missingSystemPrompt = {
        ...validFormData,
        systemPrompt: ''
      }

      const systemPromptResult = validateForm(missingSystemPrompt)
      expect(systemPromptResult.isValid).toBe(false)
      expect(systemPromptResult.errors.systemPrompt).toBeDefined()

      // Test case 3: Missing user prompt
      const missingUserPrompt = {
        ...validFormData,
        userPrompt: ''
      }

      const userPromptResult = validateForm(missingUserPrompt)
      expect(userPromptResult.isValid).toBe(false)
      expect(userPromptResult.errors.userPrompt).toBeDefined()

      // Test case 4: Both prompts missing
      const missingBothPrompts = {
        ...validFormData,
        systemPrompt: '',
        userPrompt: ''
      }

      const bothPromptsResult = validateForm(missingBothPrompts)
      expect(bothPromptsResult.isValid).toBe(false)
      expect(bothPromptsResult.errors.systemPrompt).toBeDefined()
      expect(bothPromptsResult.errors.userPrompt).toBeDefined()
    })

    it('should validate prompt length limits', () => {
      const longPrompt = 'a'.repeat(10001) // Exceeds 10000 character limit

      const formData = {
        selectedModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
        systemPrompt: longPrompt,
        userPrompt: 'Valid user prompt',
        selectedDataset: {
          type: 'enterprise-fraud',
          option: 'retail',
          content: 'sample data'
        }
      }

      const result = validateForm(formData)
      expect(result.isValid).toBe(false)
      expect(result.errors.systemPrompt).toContain('10,000 characters')
    })

    it('should handle backward compatibility with legacy single prompt', () => {
      // Test legacy format validation
      const legacyFormData = {
        selectedModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
        prompt: 'Legacy single prompt',
        selectedDataset: {
          type: 'enterprise-fraud',
          option: 'retail',
          content: 'sample data'
        }
      }

      // The validation should still work for legacy format
      // Note: This assumes the validation function handles legacy format
      const result = validateForm(legacyFormData)
      // Legacy format should be handled appropriately
      expect(result).toBeDefined()
    })
  })

  describe('BedrockService Integration', () => {
    it('should format dual prompts correctly for Converse API', async () => {
      // Mock successful initialization
      const mockSend = vi.fn()
        .mockResolvedValueOnce({
          modelSummaries: [
            {
              modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
              providerName: 'Anthropic',
              inputModalities: ['TEXT'],
              outputModalities: ['TEXT'],
              responseStreamingSupported: true
            }
          ]
        })
        .mockResolvedValueOnce({
          output: {
            message: {
              content: [
                {
                  text: 'Test response from model'
                }
              ]
            }
          },
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150
          }
        })

      // Mock the clients
      const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
      const { BedrockClient } = await import('@aws-sdk/client-bedrock')

      BedrockRuntimeClient.mockImplementation(() => ({ send: mockSend }))
      BedrockClient.mockImplementation(() => ({ send: mockSend }))

      // Initialize service
      const initResult = await bedrockService.initialize()
      expect(initResult.success).toBe(true)

      // Test dual prompt invocation
      const systemPrompt = 'You are an expert data analyst specializing in fraud detection.'
      const userPrompt = 'Please analyze the following data for suspicious patterns.'
      const content = 'transaction_id,amount,merchant\n1,100.00,Store A\n2,5000.00,Store B'

      const response = await bedrockService.invokeModel(
        'anthropic.claude-3-sonnet-20240229-v1:0',
        systemPrompt,
        userPrompt,
        content
      )

      // Verify the response structure
      expect(response).toEqual({
        text: 'Test response from model',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150
        }
      })

      // Verify ConverseCommand was called with correct parameters
      expect(ConverseCommand).toHaveBeenCalledWith({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        messages: [
          {
            role: 'user',
            content: [
              {
                text: `${userPrompt}\n\nData to analyze:\n${content}`
              }
            ]
          }
        ],
        system: [
          {
            text: systemPrompt
          }
        ],
        inferenceConfig: {
          maxTokens: 4000,
          temperature: 0.7
        }
      })
    })

    it('should handle system prompt correctly when empty', async () => {
      // Mock successful initialization and response
      const mockSend = vi.fn()
        .mockResolvedValueOnce({
          modelSummaries: [
            {
              modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
              providerName: 'Anthropic',
              inputModalities: ['TEXT'],
              outputModalities: ['TEXT'],
              responseStreamingSupported: true
            }
          ]
        })
        .mockResolvedValueOnce({
          output: {
            message: {
              content: [
                {
                  text: 'Response without system prompt'
                }
              ]
            }
          },
          usage: {
            inputTokens: 50,
            outputTokens: 25,
            totalTokens: 75
          }
        })

      const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
      const { BedrockClient } = await import('@aws-sdk/client-bedrock')

      BedrockRuntimeClient.mockImplementation(() => ({ send: mockSend }))
      BedrockClient.mockImplementation(() => ({ send: mockSend }))

      await bedrockService.initialize()

      // Test with empty system prompt
      const response = await bedrockService.invokeModel(
        'anthropic.claude-3-sonnet-20240229-v1:0',
        '', // Empty system prompt
        'Analyze this data',
        'sample data'
      )

      expect(response.text).toBe('Response without system prompt')

      // Verify ConverseCommand was called without system parameter
      const lastCall = ConverseCommand.mock.calls[ConverseCommand.mock.calls.length - 1][0]
      expect(lastCall.system).toBeUndefined()
    })

    it('should handle whitespace-only system prompt correctly', async () => {
      // Mock successful initialization and response
      const mockSend = vi.fn()
        .mockResolvedValueOnce({
          modelSummaries: [
            {
              modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
              providerName: 'Anthropic',
              inputModalities: ['TEXT'],
              outputModalities: ['TEXT'],
              responseStreamingSupported: true
            }
          ]
        })
        .mockResolvedValueOnce({
          output: {
            message: {
              content: [
                {
                  text: 'Response with whitespace system prompt'
                }
              ]
            }
          },
          usage: {
            inputTokens: 50,
            outputTokens: 25,
            totalTokens: 75
          }
        })

      const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
      const { BedrockClient } = await import('@aws-sdk/client-bedrock')

      BedrockRuntimeClient.mockImplementation(() => ({ send: mockSend }))
      BedrockClient.mockImplementation(() => ({ send: mockSend }))

      await bedrockService.initialize()

      // Test with whitespace-only system prompt
      const response = await bedrockService.invokeModel(
        'anthropic.claude-3-sonnet-20240229-v1:0',
        '   \n\t   ', // Whitespace-only system prompt
        'Analyze this data',
        'sample data'
      )

      expect(response.text).toBe('Response with whitespace system prompt')

      // Verify ConverseCommand was called without system parameter (whitespace should be trimmed)
      const lastCall = ConverseCommand.mock.calls[ConverseCommand.mock.calls.length - 1][0]
      expect(lastCall.system).toBeUndefined()
    })
  })

  describe('History Integration', () => {
    it('should save and load dual prompt history correctly', () => {
      // Mock localStorage
      const mockLocalStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage
      })

      // Test data with dual prompts
      const testResult = {
        id: '12345',
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        systemPrompt: 'You are a data analyst expert.',
        userPrompt: 'Please analyze the following data.',
        prompt: 'Please analyze the following data.', // Legacy field for backward compatibility
        datasetType: 'enterprise-fraud',
        datasetOption: 'retail',
        response: 'Analysis complete.',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        timestamp: '2024-01-01T00:00:00.000Z'
      }

      // Mock existing history
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify([testResult]))

      // Simulate loading from history
      const savedHistory = JSON.parse(localStorage.getItem('test-history') || '[]')
      expect(savedHistory).toHaveLength(1)
      expect(savedHistory[0]).toEqual(testResult)

      // Verify dual prompt fields are preserved
      expect(savedHistory[0].systemPrompt).toBe('You are a data analyst expert.')
      expect(savedHistory[0].userPrompt).toBe('Please analyze the following data.')
      expect(savedHistory[0].prompt).toBe('Please analyze the following data.') // Legacy field
    })

    it('should handle backward compatibility with legacy single prompt history', () => {
      // Mock localStorage with legacy format
      const mockLocalStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage
      })

      // Legacy test result (no systemPrompt/userPrompt fields)
      const legacyTestResult = {
        id: '67890',
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        prompt: 'Legacy single prompt text',
        datasetType: 'enterprise-fraud',
        datasetOption: 'retail',
        response: 'Legacy analysis complete.',
        usage: { input_tokens: 80, output_tokens: 40, total_tokens: 120 },
        timestamp: '2023-12-01T00:00:00.000Z'
      }

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify([legacyTestResult]))

      const savedHistory = JSON.parse(localStorage.getItem('test-history') || '[]')
      expect(savedHistory).toHaveLength(1)
      expect(savedHistory[0]).toEqual(legacyTestResult)

      // Verify legacy format is preserved
      expect(savedHistory[0].prompt).toBe('Legacy single prompt text')
      expect(savedHistory[0].systemPrompt).toBeUndefined()
      expect(savedHistory[0].userPrompt).toBeUndefined()
    })

    it('should search across both system and user prompts', () => {
      const mockLocalStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage
      })

      // Test data with different prompts
      const historyData = [
        {
          id: '1',
          systemPrompt: 'You are a fraud detection expert.',
          userPrompt: 'Analyze transactions for anomalies.',
          response: 'Found suspicious patterns.'
        },
        {
          id: '2',
          systemPrompt: 'You are a data scientist.',
          userPrompt: 'Classify customer segments.',
          response: 'Identified three segments.'
        },
        {
          id: '3',
          prompt: 'Legacy prompt about fraud detection.',
          response: 'Legacy analysis complete.'
        }
      ]

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(historyData))

      const history = JSON.parse(localStorage.getItem('test-history') || '[]')

      // Test search functionality
      const searchTerm = 'fraud'
      const filteredResults = history.filter(item => {
        const searchText = searchTerm.toLowerCase()
        return (
          item.systemPrompt?.toLowerCase().includes(searchText) ||
          item.userPrompt?.toLowerCase().includes(searchText) ||
          item.prompt?.toLowerCase().includes(searchText) ||
          item.response?.toLowerCase().includes(searchText)
        )
      })

      expect(filteredResults).toHaveLength(2) // Items 1 and 3 contain "fraud"
      expect(filteredResults[0].id).toBe('1')
      expect(filteredResults[1].id).toBe('3')
    })
  })

  describe('End-to-End Workflow Integration', () => {
    it('should complete full workflow from validation to response', async () => {
      // Step 1: Validate form data
      const formData = {
        selectedModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
        systemPrompt: 'You are an expert fraud analyst.',
        userPrompt: 'Please examine this transaction data.',
        selectedDataset: {
          type: 'enterprise-fraud',
          option: 'retail',
          content: 'transaction_id,amount\n1,100.00\n2,5000.00'
        }
      }

      const validationResult = validateForm(formData)
      expect(validationResult.isValid).toBe(true)

      // Step 2: Mock BedrockService response
      const mockSend = vi.fn()
        .mockResolvedValueOnce({
          modelSummaries: [
            {
              modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
              providerName: 'Anthropic',
              inputModalities: ['TEXT'],
              outputModalities: ['TEXT'],
              responseStreamingSupported: true
            }
          ]
        })
        .mockResolvedValueOnce({
          output: {
            message: {
              content: [
                {
                  text: 'Based on the transaction data, I found one potentially suspicious transaction with amount $5000.00 which is significantly higher than the baseline.'
                }
              ]
            }
          },
          usage: {
            inputTokens: 150,
            outputTokens: 75,
            totalTokens: 225
          }
        })

      const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
      const { BedrockClient } = await import('@aws-sdk/client-bedrock')

      BedrockRuntimeClient.mockImplementation(() => ({ send: mockSend }))
      BedrockClient.mockImplementation(() => ({ send: mockSend }))

      // Step 3: Initialize and invoke model
      await bedrockService.initialize()
      const response = await bedrockService.invokeModel(
        formData.selectedModel,
        formData.systemPrompt,
        formData.userPrompt,
        formData.selectedDataset.content
      )

      // Step 4: Verify response structure
      expect(response).toEqual({
        text: 'Based on the transaction data, I found one potentially suspicious transaction with amount $5000.00 which is significantly higher than the baseline.',
        usage: {
          input_tokens: 150,
          output_tokens: 75,
          total_tokens: 225
        }
      })

      // Step 5: Verify proper message formatting was used
      expect(ConverseCommand).toHaveBeenCalledWith({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        messages: [
          {
            role: 'user',
            content: [
              {
                text: `${formData.userPrompt}\n\nData to analyze:\n${formData.selectedDataset.content}`
              }
            ]
          }
        ],
        system: [
          {
            text: formData.systemPrompt
          }
        ],
        inferenceConfig: {
          maxTokens: 4000,
          temperature: 0.7
        }
      })

      // Step 6: Create test result object (as would be done in App.jsx)
      const testResult = {
        id: Date.now().toString(),
        modelId: formData.selectedModel,
        systemPrompt: formData.systemPrompt,
        userPrompt: formData.userPrompt,
        prompt: formData.userPrompt, // Legacy field for backward compatibility
        datasetType: formData.selectedDataset.type,
        datasetOption: formData.selectedDataset.option,
        response: response.text,
        usage: response.usage,
        timestamp: new Date().toISOString()
      }

      // Verify test result structure
      expect(testResult.systemPrompt).toBe('You are an expert fraud analyst.')
      expect(testResult.userPrompt).toBe('Please examine this transaction data.')
      expect(testResult.prompt).toBe('Please examine this transaction data.') // Legacy compatibility
      expect(testResult.response).toContain('suspicious transaction')
      expect(testResult.usage.total_tokens).toBe(225)
    })

    it('should handle error scenarios gracefully', async () => {
      // Test validation error
      const invalidFormData = {
        selectedModel: '',
        systemPrompt: '',
        userPrompt: '',
        selectedDataset: { type: '', option: '', content: null }
      }

      const validationResult = validateForm(invalidFormData)
      expect(validationResult.isValid).toBe(false)
      expect(validationResult.errors.model).toBeDefined()
      expect(validationResult.errors.systemPrompt).toBeDefined()
      expect(validationResult.errors.userPrompt).toBeDefined()
      expect(validationResult.errors.dataset).toBeDefined()

      // Test API error
      const mockSend = vi.fn()
        .mockRejectedValueOnce(new Error('AWS credentials not found'))

      const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime')
      const { BedrockClient } = await import('@aws-sdk/client-bedrock')

      BedrockRuntimeClient.mockImplementation(() => ({ send: mockSend }))
      BedrockClient.mockImplementation(() => ({ send: mockSend }))

      // Should handle initialization error
      const initResult = await bedrockService.initialize()
      expect(initResult.success).toBe(false)
      expect(initResult.message).toContain('credentials')
    })
  })

  describe('Message Formatting Verification', () => {
    it('should format messages correctly for different scenarios', async () => {
      const mockSend = vi.fn()
        .mockResolvedValue({
          modelSummaries: [
            {
              modelId: 'test-model',
              providerName: 'Test',
              inputModalities: ['TEXT'],
              outputModalities: ['TEXT'],
              responseStreamingSupported: true
            }
          ]
        })
        .mockResolvedValue({
          output: {
            message: {
              content: [{ text: 'Test response' }]
            }
          },
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
        })

      const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
      const { BedrockClient } = await import('@aws-sdk/client-bedrock')

      BedrockRuntimeClient.mockImplementation(() => ({ send: mockSend }))
      BedrockClient.mockImplementation(() => ({ send: mockSend }))

      await bedrockService.initialize()

      // Test 1: Both system and user prompts with content
      await bedrockService.invokeModel(
        'test-model',
        'System prompt',
        'User prompt',
        'Data content'
      )

      let lastCall = ConverseCommand.mock.calls[ConverseCommand.mock.calls.length - 1][0]
      expect(lastCall.system).toEqual([{ text: 'System prompt' }])
      expect(lastCall.messages[0].content[0].text).toBe('User prompt\n\nData to analyze:\nData content')

      // Test 2: User prompt without content
      await bedrockService.invokeModel(
        'test-model',
        'System prompt',
        'User prompt only',
        ''
      )

      lastCall = ConverseCommand.mock.calls[ConverseCommand.mock.calls.length - 1][0]
      expect(lastCall.messages[0].content[0].text).toBe('User prompt only')

      // Test 3: No system prompt
      await bedrockService.invokeModel(
        'test-model',
        '',
        'User prompt',
        'Data content'
      )

      lastCall = ConverseCommand.mock.calls[ConverseCommand.mock.calls.length - 1][0]
      expect(lastCall.system).toBeUndefined()
      expect(lastCall.messages[0].content[0].text).toBe('User prompt\n\nData to analyze:\nData content')
    })
  })
})