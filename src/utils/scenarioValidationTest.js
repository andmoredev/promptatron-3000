/**
 * Test utility for scenario validation and file management
 * This file provides comprehensive testing for the enhanced scenario service
 */

import { scenarioService } from '../services/scenarioService.js'
import { createDefaultScenario, createScenarioTemplate } from './scenarioModels.js'

/**
 * Run comprehensive scenario service tests
 * @returns {Promise<Object>} Test results
 */
export async function runScenarioServiceTests() {
  console.log('[ScenarioTest] Starting comprehensive scenario service tests...')

  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      total: 0,
sed: 0,
      failed: 0,
      warnings: 0
    }
  }

  // Test 1: Service initialization
  await runTest(results, 'Service Initialization', async () => {
    const initResult = await scenarioService.initialize()
    if (!initResult.success) {
      throw new Error(`Initialization failed: ${initResult.message}`)
    }
    return { scenarioCount: initResult.scenarioCount }
  })

  // Test 2: Scenario validation - valid scenario
  await runTest(results, 'Valid Scenario Validation', async () => {
    const validScenario = createDefaultScenario('test-scenario', 'Test Scenario', 'A test scenario for validation')
    validScenario.systemPrompts = [{
      id: 'test-prompt',
      name: 'Test Prompt',
      content: 'You are a helpful assistant.'
    }]

    const validation = await scenarioService.validateScenario(validScenario)
    if (!validation.isValid) {
      throw new Error(`Valid scenario failed validation: ${JSON.stringify(validation.errors)}`)
    }
    return { validationDetails: validation.validationDetails }
  })

  // Test 3: Scenario validation - invalid scenario
  await runTest(results, 'Invalid Scenario Validation', async () => {
    const invalidScenario = {
      // Missing required fields
      name: 'Invalid Scenario'
    }

    const validation = await scenarioService.validateScenario(invalidScenario)
    if (validation.isValid) {
      throw new Error('Invalid scenario passed validation')
    }

    const hasIdError = validation.errors.id
    const hasDescriptionError = validation.errors.description

    if (!hasIdError || !hasDescriptionError) {
      throw new Error('Validation did not catch all required field errors')
    }

    return { errorCount: Object.keys(validation.errors).length }
  })

  // Test 4: Malformed JSON handling
  await runTest(results, 'Malformed JSON Error Handling', async () => {
    const malformedJson = '{ "id": "test", "name": "Test" invalid json }'

    try {
      JSON.parse(malformedJson)
      throw new Error('JSON.parse should have failed')
    } catch (jsonError) {
      const errorDetails = scenarioService.getJsonErrorDetails(jsonError, malformedJson)
      if (!errorDetails.includes('invalid json')) {
        throw new Error('Error details do not contain expected content')
      }
    }

    return { errorHandled: true }
  })

  // Test 5: Cache functionality
  await runTest(results, 'Cache Functionality', async () => {
    const testScenario = createDefaultScenario('cache-test', 'Cache Test', 'Testing cache functionality')

    // First validation (should cache)
    const validation1 = await scenarioService.validateScenario(testScenario)

    // Second validation (should use cache)
    const validation2 = await scenarioService.validateScenario(testScenario)

    if (validation1.isValid !== validation2.isValid) {
      throw new Error('Cache returned different validation results')
    }

    const cacheStats = scenarioService.getCacheStats()
    return { cacheStats }
  })

  // Test 6: Scenario templates
  await runTest(results, 'Scenario Templates', async () => {
    const fraudTemplate = createScenarioTemplate('fraud-detection', 'fraud-test', 'Fraud Detection Test')
    const dataTemplate = createScenarioTemplate('data-analysis', 'data-test', 'Data Analysis Test')
    const contentTemplate = createScenarioTemplate('content-generation', 'content-test', 'Content Generation Test')

    const templates = [fraudTemplate, dataTemplate, contentTemplate]

    for (const template of templates) {
      const validation = await scenarioService.validateScenario(template)
      if (!validation.isValid) {
        throw new Error(`Template ${template.id} failed validation: ${JSON.stringify(validation.errors)}`)
      }
    }

    return { templatesValidated: templates.length }
  })

  // Test 7: Cross-reference validation
  await runTest(results, 'Cross-Reference Validation', async () => {
    const scenario = createDefaultScenario('cross-ref-test', 'Cross Reference Test', 'Testing cross-reference validation')

    scenario.systemPrompts = [{
      id: 'system-1',
      name: 'System Prompt 1',
      content: 'System prompt content'
    }]

    scenario.datasets = [{
      id: 'dataset-1',
      name: 'Dataset 1',
      description: 'Test dataset',
      file: 'test.csv'
    }]

    scenario.examples = [{
      name: 'Valid Example',
      description: 'Example with valid references',
      systemPrompt: 'system-1',
      dataset: 'dataset-1'
    }, {
      name: 'Invalid Example',
      description: 'Example with invalid references',
      systemPrompt: 'non-existent-prompt',
      dataset: 'non-existent-dataset'
    }]

    const validation = await scenarioService.validateScenario(scenario, { validateFiles: false })

    // Should have cross-reference errors
    const hasSystemPromptError = validation.errors['examples[1].systemPrompt']
    const hasDatasetError = validation.errors['examples[1].dataset']

    if (!hasSystemPromptError || !hasDatasetError) {
      throw new Error('Cross-reference validation did not catch invalid references')
    }

    return { crossRefErrorsDetected: 2 }
  })

  // Test 8: File operation simulation
  await runTest(results, 'File Operations', async () => {
    const testScenario = createDefaultScenario('file-test', 'File Test', 'Testing file operations')

    // Test save operation
    const saveResult = await scenarioService.saveScenario(testScenario)
    if (!saveResult.success) {
      throw new Error(`Save operation failed: ${saveResult.message}`)
    }

    // Test duplicate operation
    const duplicateResult = await scenarioService.duplicateScenario('file-test', 'file-test-copy', 'File Test Copy')
    if (!duplicateResult.success) {
      throw new Error(`Duplicate operation failed: ${duplicateResult.message}`)
    }

    // Test delete operation
    const deleteResult = await scenarioService.deleteScenario('file-test-copy')
    if (!deleteResult.success) {
      throw new Error(`Delete operation failed: ${deleteResult.message}`)
    }

    return { operationsCompleted: 3 }
  })

  // Test 9: Performance and caching
  await runTest(results, 'Performance Metrics', async () => {
    const status = scenarioService.getStatus()
    const cacheStats = scenarioService.getCacheStats()

    return {
      serviceStatus: status.initialized,
      cacheSize: cacheStats.validationCache.size,
      operationHistory: status.fileManagement.operationHistorySize
    }
  })

  // Test 10: Error classification
  await runTest(results, 'Error Classification', async () => {
    const errors = [
      new Error('Invalid JSON syntax'),
      new Error('File not found (404)'),
      new Error('Access denied (403)'),
      new Error('Network connection failed'),
      new Error('Validation failed: missing required field')
    ]

    const classifications = errors.map(error => scenarioService.classifyError(error))

    const expectedTypes = ['json_parse_error', 'file_not_found', 'access_denied', 'network_error', 'validation_error']

    for (let i = 0; i < expectedTypes.length; i++) {
      if (classifications[i] !== expectedTypes[i]) {
        throw new Error(`Error classification mismatch: expected ${expectedTypes[i]}, got ${classifications[i]}`)
      }
    }

    return { classificationsCorrect: classifications.length }
  })

  // Generate summary
  results.summary.total = results.tests.length
  results.summary.passed = results.tests.filter(t => t.status === 'passed').length
  results.summary.failed = results.tests.filter(t => t.status === 'failed').length
  results.summary.warnings = results.tests.filter(t => t.warnings && t.warnings.length > 0).length

  console.log('[ScenarioTest] Test results:', results.summary)

  return results
}

/**
 * Run a single test with error handling
 * @param {Object} results - Results object to update
 * @param {string} testName - Name of the test
 * @param {Function} testFunction - Test function to run
 */
async function runTest(results, testName, testFunction) {
  const test = {
    name: testName,
    startTime: Date.now(),
    status: 'running',
    result: null,
    error: null,
    warnings: []
  }

  try {
    console.log(`[ScenarioTest] Running test: ${testName}`)
    test.result = await testFunction()
    test.status = 'passed'
    console.log(`[ScenarioTest] ✓ ${testName} passed`)
  } catch (error) {
    test.status = 'failed'
    test.error = error.message
    console.error(`[ScenarioTest] ✗ ${testName} failed:`, error.message)
  } finally {
    test.endTime = Date.now()
    test.duration = test.endTime - test.startTime
    results.tests.push(test)
  }
}

/**
 * Test scenario file management with mock data
 * @returns {Promise<Object>} Test results
 */
export async function testScenarioFileManagement() {
  console.log('[ScenarioTest] Testing scenario file management...')

  try {
    // Initialize service
    await scenarioService.initialize()

    // Create test scenarios
    const scenarios = [
      createScenarioTemplate('fraud-detection', 'fraud-comprehensive', 'Comprehensive Fraud Detection'),
      createScenarioTemplate('data-analysis', 'data-comprehensive', 'Comprehensive Data Analysis'),
      createDefaultScenario('custom-scenario', 'Custom Test Scenario', 'A custom scenario for testing')
    ]

    const results = []

    for (const scenario of scenarios) {
      // Test validation
      const validation = await scenarioService.validateScenario(scenario)

      // Test save
      const saveResult = await scenarioService.saveScenario(scenario)

      results.push({
        scenarioId: scenario.id,
        validation: validation.isValid,
        validationErrors: Object.keys(validation.errors || {}).length,
        validationWarnings: validation.warnings?.length || 0,
        saveSuccess: saveResult.success,
        metadata: validation.metadata
      })
    }

    // Test file change detection
    const changeCheck = await scenarioService.checkForFileChanges()

    // Get final status
    const finalStatus = scenarioService.getStatus()

    return {
      success: true,
      scenarioResults: results,
      fileChangeCheck: changeCheck,
      finalStatus: finalStatus,
      cacheStats: scenarioService.getCacheStats()
    }

  } catch (error) {
    return {
      success: false,
      error: error.message,
      stack: error.stack
    }
  }
}

// Export for use in development console
if (import.meta.env.DEV) {
  window.runScenarioTests = runScenarioServiceTests
  window.testScenarioFileManagement = testScenarioFileManagement
}
