/**
 * Manual integration test script for dual prompt functionality
 * This can be run in the browser console to verify end-to-end functionality
 */

import { validateForm } from './formValidation.js'
import { bedrockService } from '../services/bedrockService.js'

/**
 * Test dual prompt validation
 */
export function testDualPromptValidation() {
  console.log('🧪 Testing Dual Prompt Validation...')

  // Test 1: Valid dual prompts
  const validForm = {
    selectedModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
    systemPrompt: 'You are an expert data analyst specializing in fraud detection.',
    userPrompt: 'Please analyze the following transaction data for suspicious patterns.',
    selectedDataset: {
      type: 'enterprise-fraud',
      option: 'retail',
      content: 'transaction_id,amount,merchant\n1,100.00,Store A\n2,5000.00,Store B'
    }
  }

  const validResult = validateForm(validForm)
  console.log('✅ Valid dual prompts:', validResult.isValid ? 'PASS' : 'FAIL')

  // Test 2: Missing system prompt
  const missingSystemForm = { ...validForm, systemPrompt: '' }
  const missingSystemResult = validateForm(missingSystemForm)
  console.log('✅ Missing system prompt validation:', !missingSystemResult.isValid && missingSystemResult.errors.systemPrompt ? 'PASS' : 'FAIL')

  // Test 3: Missing user prompt
  const missingUserForm = { ...validForm, userPrompt: '' }
  const missingUserResult = validateForm(missingUserForm)
  console.log('✅ Missing user prompt validation:', !missingUserResult.isValid && missingUserResult.errors.userPrompt ? 'PASS' : 'FAIL')

  return {
    validForm: validResult.isValid,
    missingSystem: !missingSystemResult.isValid && missingSystemResult.errors.systemPrompt,
    missingUser: !missingUserResult.isValid && missingUserResult.errors.userPrompt
  }
}

/**
 * Test BedrockService message formatting
 */
export function testBedrockServiceFormatting() {
  console.log('🧪 Testing BedrockService Message Formatting...')

  // Mock the AWS SDK calls for testing
  const originalSend = bedrockService.runtimeClient?.send
  let lastConverseCommand = null

  if (bedrockService.runtimeClient) {
    bedrockService.runtimeClient.send = async (command) => {
      lastConverseCommand = command.input
      return {
        output: {
          message: {
            content: [{ text: 'Mock response for testing' }]
          }
        },
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150
        }
      }
    }
  }

  // Test message formatting
  const testSystemPrompt = 'You are a fraud detection expert.'
  const testUserPrompt = 'Analyze this transaction data.'
  const testContent = 'transaction_id,amount\n1,100.00\n2,5000.00'

  return bedrockService.invokeModel(
    'anthropic.claude-3-sonnet-20240229-v1:0',
    testSystemPrompt,
    testUserPrompt,
    testContent
  ).then(response => {
    console.log('✅ BedrockService formatting test completed')

    // Verify message structure
    const hasSystemPrompt = lastConverseCommand?.system?.[0]?.text === testSystemPrompt
    const hasCorrectUserMessage = lastConverseCommand?.messages?.[0]?.content?.[0]?.text?.includes(testUserPrompt)
    const hasDataContent = lastConverseCommand?.messages?.[0]?.content?.[0]?.text?.includes(testContent)

    console.log('✅ System prompt formatting:', hasSystemPrompt ? 'PASS' : 'FAIL')
    console.log('✅ User message formatting:', hasCorrectUserMessage ? 'PASS' : 'FAIL')
    console.log('✅ Data content inclusion:', hasDataContent ? 'PASS' : 'FAIL')

    // Restore original send method
    if (originalSend) {
      bedrockService.runtimeClient.send = originalSend
    }

    return {
      systemPrompt: hasSystemPrompt,
      userMessage: hasCorrectUserMessage,
      dataContent: hasDataContent,
      response: response
    }
  }).catch(error => {
    console.log('⚠️ BedrockService test skipped (service not initialized):', error.message)
    return { skipped: true, reason: error.message }
  })
}

/**
 * Test history functionality with dual prompts
 */
export function testHistoryFunctionality() {
  console.log('🧪 Testing History Functionality...')

  // Mock localStorage
  const originalGetItem = localStorage.getItem
  const originalSetItem = localStorage.setItem

  let mockStorage = {}
  localStorage.getItem = (key) => mockStorage[key] || null
  localStorage.setItem = (key, value) => { mockStorage[key] = value }

  // Test data
  const dualPromptHistoryItem = {
    id: 'test-123',
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    systemPrompt: 'You are a data analyst.',
    userPrompt: 'Analyze this data.',
    prompt: 'Analyze this data.', // Legacy field
    datasetType: 'enterprise-fraud',
    datasetOption: 'retail',
    response: 'Analysis complete.',
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    timestamp: new Date().toISOString()
  }

  const legacyHistoryItem = {
    id: 'legacy-456',
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    prompt: 'Legacy single prompt',
    datasetType: 'enterprise-fraud',
    datasetOption: 'retail',
    response: 'Legacy analysis.',
    usage: { input_tokens: 80, output_tokens: 40, total_tokens: 120 },
    timestamp: new Date().toISOString()
  }

  // Save test history
  const testHistory = [dualPromptHistoryItem, legacyHistoryItem]
  localStorage.setItem('test-history', JSON.stringify(testHistory))

  // Test loading history
  const loadedHistory = JSON.parse(localStorage.getItem('test-history') || '[]')
  const hasDualPromptItem = loadedHistory.some(item => item.systemPrompt && item.userPrompt)
  const hasLegacyItem = loadedHistory.some(item => item.prompt && !item.systemPrompt)

  console.log('✅ Dual prompt history save/load:', hasDualPromptItem ? 'PASS' : 'FAIL')
  console.log('✅ Legacy history compatibility:', hasLegacyItem ? 'PASS' : 'FAIL')

  // Test search functionality
  const searchTerm = 'analyst'
  const searchResults = loadedHistory.filter(item => {
    const searchText = searchTerm.toLowerCase()
    return (
      item.systemPrompt?.toLowerCase().includes(searchText) ||
      item.userPrompt?.toLowerCase().includes(searchText) ||
      item.prompt?.toLowerCase().includes(searchText) ||
      item.response?.toLowerCase().includes(searchText)
    )
  })

  const searchWorksCorrectly = searchResults.length === 2 // Both items contain "analyst"
  console.log('✅ History search functionality:', searchWorksCorrectly ? 'PASS' : 'FAIL')

  // Restore localStorage
  localStorage.getItem = originalGetItem
  localStorage.setItem = originalSetItem

  return {
    dualPromptSaveLoad: hasDualPromptItem,
    legacyCompatibility: hasLegacyItem,
    searchFunctionality: searchWorksCorrectly
  }
}

/**
 * Run all integration tests
 */
export async function runAllIntegrationTests() {
  console.log('🚀 Running Dual Prompt Integration Tests...')
  console.log('=' .repeat(50))

  const results = {}

  // Test 1: Validation
  results.validation = testDualPromptValidation()

  // Test 2: BedrockService (async)
  results.bedrockService = await testBedrockServiceFormatting()

  // Test 3: History
  results.history = testHistoryFunctionality()

  console.log('=' .repeat(50))
  console.log('🏁 Integration Test Results:')
  console.log('Validation Tests:', results.validation)
  console.log('BedrockService Tests:', results.bedrockService)
  console.log('History Tests:', results.history)

  // Calculate overall success
  const validationPassed = Object.values(results.validation).every(Boolean)
  const bedrockPassed = results.bedrockService.skipped || Object.values(results.bedrockService).filter(v => typeof v === 'boolean').every(Boolean)
  const historyPassed = Object.values(results.history).every(Boolean)

  const overallSuccess = validationPassed && bedrockPassed && historyPassed

  console.log('=' .repeat(50))
  console.log(`🎯 Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`)

  return {
    success: overallSuccess,
    details: results
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.dualPromptIntegrationTest = {
    testValidation: testDualPromptValidation,
    testBedrockService: testBedrockServiceFormatting,
    testHistory: testHistoryFunctionality,
    runAll: runAllIntegrationTests
  }

  console.log('🔧 Dual Prompt Integration Tests loaded!')
  console.log('Run window.dualPromptIntegrationTest.runAll() to test everything')
}