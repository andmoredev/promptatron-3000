/**
 * Tool Configuration Test Runner Component
 * Tests task 4.1: Test tool configuration loading from scenarios
 *
 * This componrovides a UI for running tests to verify tool configuration
 * loading from scenarios works correctly.
 */

import { useState, useEffect } from 'react'
import { toolConfigService } from '../services/toolConfigService.js'
import { scenarioService } from '../services/scenarioService.js'

const ToolConfigTestRunner = () => {
  const [testResults, setTestResults] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [summary, setSummary] = useState({ passed: 0, failed: 0, total: 0 })

  const logTest = (testName, passed, message, details = null) => {
    const result = {
      test: testName,
      passed,
      message,
      details,
      timestamp: new Date().toISOString()
    }

    setTestResults(prev => [...prev, result])
    return result
  }

  const runTests = async () => {
    setIsRunning(true)
    setTestResults([])
    setSummary({ passed: 0, failed: 0, total: 0 })

    try {
      // Ensure services are initialized
      if (!scenarioService.isReady()) {
        await scenarioService.initialize()
      }

      // Test 1: Scenarios with tools are correctly identified
      await testScenariosWithToolsIdentified()

      // Test 2: Tool configurations are properly extracted and formatted
      await testToolConfigurationExtraction()

      // Test 3: Scenarios without tools are handled gracefully
      await testScenariosWithoutTools()

      // Test 4: Legacy dataset type mapping functionality
      await testLegacyDatasetTypeMapping()

      // Test 5: Error handling and edge cases
      await testErrorHandlingAndEdgeCases()

    } catch (error) {
      logTest('Test Suite Execution', false, `Test suite failed: ${error.message}`, error)
    } finally {
      setIsRunning(false)
    }
  }

  const testScenariosWithToolsIdentified = async () => {
    try {
      // Test shipping-logistics scenario (has tools)
      const hasShippingTools = toolConfigService.hasToolsForDatasetType('shipping-logistics')
      logTest(
        'Shipping Logistics Tools Detection',
        hasShippingTools === true,
        hasShippingTools ? 'Correctly identified scenario with tools' : 'Failed to identify scenario with tools'
      )

      // Test fraud-detection scenario (has tools)
      const hasFraudTools = toolConfigService.hasToolsForDatasetType('fraud-detection-comprehensive')
      logTest(
        'Fraud Detection Tools Detection',
        hasFraudTools === true,
        hasFraudTools ? 'Correctly identified scenario with tools' : 'Failed to identify scenario with tools'
      )

      // Test test-scenario (has tools)
      const hasTestTools = toolConfigService.hasToolsForDatasetType('test-scenario')
      logTest(
        'Test Scenario Tools Detection',
        hasTestTools === true,
        hasTestTools ? 'Correctly identified scenario with tools' : 'Failed to identify scenario with tools'
      )

      // Get tool names to verify they're properly extracted
      const shippingToolNames = toolConfigService.getToolNamesForDatasetType('shipping-logistics')
      const expectedShippingTools = [
        'getCarrierStatus', 'getPackageContents', 'getCustomerTier', 'getSLA',
        'getExpediteQuote', 'expediteShipment', 'holdForPickup', 'escalateToManager', 'noActionRequired'
      ]

      const hasAllShippingTools = expectedShippingTools.every(tool => shippingToolNames.includes(tool))
      logTest(
        'Shipping Tools Names Extraction',
        hasAllShippingTools,
        hasAllShippingTools ?
          `All ${expectedShippingTools.length} tools correctly extracted` :
          `Missing tools. Expected: ${expectedShippingTools.length}, Got: ${shippingToolNames.length}`,
        { expected: expectedShippingTools, actual: shippingToolNames }
      )

    } catch (error) {
      logTest('Scenarios With Tools Identification', false, 'Error during tool identification test', error.message)
    }
  }

  const testToolConfigurationExtraction = async () => {
    try {
      // Test shipping-logistics tool configuration
      const shippingConfig = toolConfigService.getToolsForDatasetType('shipping-logistics')

      // Verify basic structure
      const hasValidStructure = shippingConfig &&
                               shippingConfig.id &&
                               shippingConfig.scenarioId === 'shipping-logistics' &&
                               shippingConfig.tools &&
                               Array.isArray(shippingConfig.tools) &&
                               shippingConfig.source === 'scenario'

      logTest(
        'Tool Configuration Structure',
        hasValidStructure,
        hasValidStructure ? 'Tool configuration has correct structure' : 'Tool configuration structure is invalid',
        { config: shippingConfig }
      )

      if (shippingConfig && shippingConfig.tools) {
        // Test first tool format
        const firstTool = shippingConfig.tools[0]
        const hasValidToolFormat = firstTool &&
                                  firstTool.toolSpec &&
                                  firstTool.toolSpec.name &&
                                  firstTool.toolSpec.description &&
                                  firstTool.toolSpec.inputSchema &&
                                  firstTool.toolSpec.inputSchema.json

        logTest(
          'Individual Tool Format',
          hasValidToolFormat,
          hasValidToolFormat ? 'Tool format is correct' : 'Tool format is invalid',
          { tool: firstTool }
        )

        // Test tool validation
        const validation = toolConfigService.validateToolDefinition(shippingConfig)
        logTest(
          'Tool Configuration Validation',
          validation.isValid,
          validation.isValid ? 'Tool configuration passes validation' : `Validation failed: ${validation.error}`,
          validation
        )
      }

      // Test fraud-detection tool configuration
      const fraudConfig = toolConfigService.getToolsForDatasetType('fraud-detection-comprehensive')
      const fraudHasValidStructure = fraudConfig &&
                                    fraudConfig.tools &&
                                    fraudConfig.tools.length > 0 &&
                                    fraudConfig.scenarioId === 'fraud-detection-comprehensive'

      logTest(
        'Fraud Detection Tool Configuration',
        fraudHasValidStructure,
        fraudHasValidStructure ? 'Fraud detection tools correctly extracted' : 'Failed to extract fraud detection tools',
        { toolCount: fraudConfig?.tools?.length || 0 }
      )

    } catch (error) {
      logTest('Tool Configuration Extraction', false, 'Error during tool configuration extraction test', error.message)
    }
  }

  const testScenariosWithoutTools = async () => {
    try {
      // Create a mock scenario without tools for testing
      const mockScenarioWithoutTools = {
        id: 'no-tools-scenario',
        name: 'No Tools Scenario',
        description: 'A scenario without any tools defined',
        datasets: [],
        systemPrompts: [{ id: 'test', name: 'Test', content: 'Test prompt' }],
        userPrompts: [{ id: 'test', name: 'Test', content: 'Test prompt' }]
        // Note: no 'tools' property
      }

      // Temporarily add this scenario to the service for testing
      scenarioService.scenarios.set('no-tools-scenario', mockScenarioWithoutTools)
      scenarioService.scenarioMetadata.set('no-tools-scenario', {
        id: 'no-tools-scenario',
        name: 'No Tools Scenario',
        description: 'A scenario without any tools defined'
      })

      // Test hasToolsForDatasetType returns false
      const hasTools = toolConfigService.hasToolsForDatasetType('no-tools-scenario')
      logTest(
        'No Tools Detection',
        hasTools === false,
        hasTools === false ? 'Correctly identified scenario without tools' : 'Incorrectly identified scenario as having tools'
      )

      // Test getToolsForDatasetType returns null
      const toolConfig = toolConfigService.getToolsForDatasetType('no-tools-scenario')
      logTest(
        'No Tools Configuration',
        toolConfig === null,
        toolConfig === null ? 'Correctly returned null for scenario without tools' : 'Should return null for scenario without tools',
        { config: toolConfig }
      )

      // Test getToolNamesForDatasetType returns empty array
      const toolNames = toolConfigService.getToolNamesForDatasetType('no-tools-scenario')
      logTest(
        'No Tools Names',
        Array.isArray(toolNames) && toolNames.length === 0,
        Array.isArray(toolNames) && toolNames.length === 0 ? 'Correctly returned empty array for tool names' : 'Should return empty array for tool names',
        { names: toolNames }
      )

      // Clean up test scenarios
      scenarioService.scenarios.delete('no-tools-scenario')
      scenarioService.scenarioMetadata.delete('no-tools-scenario')

    } catch (error) {
      logTest('Scenarios Without Tools Handling', false, 'Error during scenarios without tools test', error.message)
    }
  }

  const testLegacyDatasetTypeMapping = async () => {
    try {
      // Test direct mapping
      const directMapping = toolConfigService.mapLegacyDatasetType('shipping-logistics')
      logTest(
        'Direct Mapping',
        directMapping === 'shipping-logistics',
        directMapping === 'shipping-logistics' ? 'Direct mapping works correctly' : 'Direct mapping failed',
        { input: 'shipping-logistics', output: directMapping }
      )

      // Test legacy mapping (if any exist)
      const legacyMappings = {
        'fraud-detection': 'fraud-detection',
        'shipping-logistics': 'shipping-logistics',
        'customer-support': 'customer-support'
      }

      for (const [legacy, expected] of Object.entries(legacyMappings)) {
        const mapped = toolConfigService.mapLegacyDatasetType(legacy)
        logTest(
          `Legacy Mapping: ${legacy}`,
          mapped === expected,
          mapped === expected ? `Legacy mapping ${legacy} -> ${expected} works` : `Legacy mapping failed for ${legacy}`,
          { legacy, expected, mapped }
        )
      }

    } catch (error) {
      logTest('Legacy Dataset Type Mapping', false, 'Error during legacy dataset type mapping test', error.message)
    }
  }

  const testErrorHandlingAndEdgeCases = async () => {
    try {
      // Test null/undefined input
      const nullResult = toolConfigService.getToolsForDatasetType(null)
      logTest(
        'Null Input Handling',
        nullResult === null,
        nullResult === null ? 'Null input handled correctly' : 'Null input not handled properly'
      )

      const undefinedResult = toolConfigService.getToolsForDatasetType(undefined)
      logTest(
        'Undefined Input Handling',
        undefinedResult === null,
        undefinedResult === null ? 'Undefined input handled correctly' : 'Undefined input not handled properly'
      )

      // Test empty string input
      const emptyStringResult = toolConfigService.getToolsForDatasetType('')
      logTest(
        'Empty String Input Handling',
        emptyStringResult === null,
        emptyStringResult === null ? 'Empty string input handled correctly' : 'Empty string input not handled properly'
      )

      // Test non-existent scenario
      const nonExistentResult = toolConfigService.getToolsForDatasetType('non-existent-scenario')
      logTest(
        'Non-existent Scenario Handling',
        nonExistentResult === null,
        nonExistentResult === null ? 'Non-existent scenario handled correctly' : 'Non-existent scenario not handled properly'
      )

      // Test service status and readiness
      const isReady = toolConfigService.isReady()
      logTest(
        'Service Readiness',
        isReady === true,
        isReady ? 'Service reports ready correctly' : 'Service readiness issue'
      )

      const status = toolConfigService.getStatus()
      const hasValidStatus = status &&
                            typeof status.initialized === 'boolean' &&
                            typeof status.ready === 'boolean' &&
                            typeof status.scenarioServiceReady === 'boolean'
      logTest(
        'Service Status',
        hasValidStatus,
        hasValidStatus ? 'Service status has correct structure' : 'Service status structure issue',
        status
      )

    } catch (error) {
      logTest('Error Handling and Edge Cases', false, 'Error during error handling and edge cases test', error.message)
    }
  }

  // Update summary when test results change
  useEffect(() => {
    const passed = testResults.filter(result => result.passed).length
    const failed = testResults.filter(result => !result.passed).length
    const total = testResults.length
    setSummary({ passed, failed, total })
  }, [testResults])

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Tool Configuration Test Runner</h2>
          <button
            onClick={runTests}
            disabled={isRunning}
            className={`px-6 py-2 rounded-md font-medium transition-colors duration-200 ${
              isRunning
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {isRunning ? 'Running Tests...' : 'Run Tests'}
          </button>
        </div>

        {/* Test Summary */}
        {summary.total > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Test Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-100 p-3 rounded">
                <div className="text-2xl font-bold text-green-600">{summary.passed}</div>
                <div className="text-sm text-green-700">Passed</div>
              </div>
              <div className="bg-red-100 p-3 rounded">
                <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
                <div className="text-sm text-red-700">Failed</div>
              </div>
              <div className="bg-blue-100 p-3 rounded">
                <div className="text-2xl font-bold text-blue-600">{summary.total}</div>
                <div className="text-sm text-blue-700">Total</div>
              </div>
            </div>
            <div className="mt-3 text-center">
              <div className="text-lg font-semibold">
                Success Rate: {summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        )}

        {/* Test Results */}
        <div className="space-y-3">
          {testResults.map((result, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border-l-4 ${
                result.passed
                  ? 'bg-green-50 border-green-400'
                  : 'bg-red-50 border-red-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`text-lg ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                    {result.passed ? '✅' : '❌'}
                  </span>
                  <span className="font-medium text-gray-900">{result.test}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(result.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className={`mt-1 text-sm ${result.passed ? 'text-green-700' : 'text-red-700'}`}>
                {result.message}
              </div>
              {result.details && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                    Show Details
                  </summary>
                  <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                    {typeof result.details === 'string' ? result.details : JSON.stringify(result.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>

        {isRunning && (
          <div className="mt-6 text-center">
            <div className="inline-flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
              <span className="text-gray-600">Running tests...</span>
            </div>
          </div>
        )}

        {testResults.length === 0 && !isRunning && (
          <div className="text-center py-8 text-gray-500">
            Click "Run Tests" to start testing tool configuration loading from scenarios.
          </div>
        )}
      </div>
    </div>
  )
}

export default ToolConfigTestRunner
