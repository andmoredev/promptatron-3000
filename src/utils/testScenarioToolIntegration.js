/**
 * Test utility for scenario tool integration
 * This can be used to manually test the scenario tool integration service
 */

import { scenarioService } from '../services/scenarioService.js'
import { scenarioToolIntegrationService } from '../services/scenarioToolIntegrationService.js'

/**
 * Test scenario tool integration functionality
 */
export async function testScenarioToolIntegration() {
  console.log('🧪 Testing Scenario Tool Integration...')

  try {
    // Initialize services
    console.log('1. Initializing services...')
    await scenarioService.initialize()
    await scenarioToolIntegrationService.initialize()

    // Get available scenarios
    console.log('2. Loading scenarios...')
    const scenarios = await scenarioService.getScenarioList()
    console.log(`Found ${scenarios.length} scenarios:`, scenarios.map(s => s.name))

    if (scenarios.length === 0) {
      console.log('❌ No scenarios found')
      return false
    }

    // Test tool configuration for first scenario
    const testScenario = scenarios[0]
    console.log(`3. Testing tool configuration for scenario: ${testScenario.name}`)

    const toolConfigResult = await scenarioToolIntegrationService.getToolConfigurationForScenario(testScenario.id)

    console.log('Tool configuration result:', {
      hasToolConfig: toolConfigResult.hasToolConfig,
      executionMode: toolConfigResult.executionMode,
      toolCount: toolConfigResult.toolCount,
      message: toolConfigResult.message,
      errors: toolConfigResult.errors,
      warnings: toolConfigResult.warnings
    })

    if (toolConfigResult.hasToolConfig) {
      console.log('Tool configuration:', {
        id: toolConfigResult.toolConfig.id,
        toolCount: toolConfigResult.toolConfig.tools.length,
        toolNames: toolConfigResult.toolConfig.tools.map(t => t.toolSpec.name)
      })
    }

    // Test tool configuration summary
    console.log('4. Testing tool configuration summary...')
    const summary = await scenarioToolIntegrationService.getToolConfigurationSummary(testScenario.id)
    console.log('Tool summary:', summary)

    // Test scenario supports tools
    console.log('5. Testing scenario supports tools...')
    const supportsTools = await scenarioToolIntegrationService.scenarioSupportsTools(testScenario.id)
    console.log(`Scenario supports tools: ${supportsTools}`)

    console.log('✅ Scenario tool integration test completed successfully')
    return true

  } catch (error) {
    console.error('❌ Scenario tool integration test failed:', error)
    return false
  }
}

// Expose test function globally in development
if (import.meta.env.DEV) {
  window.testScenarioToolIntegration = testScenarioToolIntegration
}
