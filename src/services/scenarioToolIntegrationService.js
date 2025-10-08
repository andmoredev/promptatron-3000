/**
 * Service for integrating tool configurations with scenario selection
 * Handles scenario-based tool configuration retrieval, validation, and mode detection
 */

import { scenarioService } from './scenarioService.js'
import { analyzeError, handleError, ErrorTypes } from '../utils/errorHandling.js'

/**
 * Scenario Tool Integration Service
 * Manages the relationship between scenarios and their associated tool configurations
 */
export class ScenarioToolIntegrationService {
  constructor() {
    this.isInitialized = false
    this.toolConfigCache = new Map()
    this.validationCache = new Map()
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      this.isInitialized = true
      return { success: true, message: 'Scenario tool integration service initialized' }
    } catch (error) {
      this.isInitialized = false
      return { success: false, message: `Failed to initialize: ${error.message}` }
    }
  }

  /**
   * Get tool configuration for a selected scenario with comprehensive error handling
   * @param {string} scenarioId - The selected scenario ID
   * @returns {Promise<Object>} Tool configuration result with deor information
   */
  async getToolConfigurationForScenario(scenarioId) {
    const result = {
      hasToolConfig: false,
      toolConfig: null,
      executionMode: 'none',
      message: 'No tools configured for this scenario',
      scenarioId: scenarioId,
      errors: [],
      warnings: [],
      gracefulDegradation: false,
      validationResult: null
    }

    try {
      // Validate input
      if (!scenarioId || typeof scenarioId !== 'string') {
        const errorInfo = handleError('No scenario ID specified', {
          operation: 'getToolConfigurationForScenario',
          context: 'input_validation'
        })

        result.message = errorInfo.userMessage
        result.errors.push('Scenario ID is required')
        result.gracefulDegradation = true
        return result
      }

      // Ensure scenario service is initialized
      if (!scenarioService.isInitialized) {
        await scenarioService.initialize();
      }

      // Get scenario from service
      const scenario = await scenarioService.getScenario(scenarioId)

      if (!scenario) {
        result.message = `Scenario not found: ${scenarioId}`
        result.errors.push('Scenario does not exist')
        result.gracefulDegradation = true
        return result
      }

      // Check if scenario has tools
      if (!scenario.tools || !Array.isArray(scenario.tools) || scenario.tools.length === 0) {
        result.message = `No tools configured for scenario: ${scenario.name}`
        result.gracefulDegradation = true
        return result
      }

      // Convert scenario tools to tool configuration format
      const toolConfig = this.convertScenarioToolsToConfig(scenario)

      // Validate the tool configuration
      const validation = this.validateScenarioToolConfiguration(toolConfig, scenarioId)
      result.validationResult = validation

      if (!validation.canProceed) {
        result.message = `Tool configuration validation failed for scenario: ${scenario.name}`
        result.errors.push(...validation.errors)
        result.warnings.push(...validation.warnings)
        result.gracefulDegradation = true
        return result
      }

      // Determine execution mode
      const executionMode = this.determineToolExecutionMode(scenario.tools)

      // Success - tools are available
      result.hasToolConfig = true
      result.toolConfig = toolConfig
      result.executionMode = executionMode
      result.message = `Tools loaded for scenario: ${scenario.name}`
      result.toolCount = scenario.tools.length

      // Add any validation warnings
      if (validation.warnings.length > 0) {
        result.warnings.push(...validation.warnings)
      }

      // Cache the result
      this.toolConfigCache.set(scenarioId, {
        toolConfig,
        executionMode,
        timestamp: Date.now()
      })

      return result

    } catch (error) {
      const errorInfo = analyzeError(error, {
        operation: 'getToolConfigurationForScenario',
        scenarioId: scenarioId,
        context: 'general_error'
      })

      result.message = errorInfo.userMessage
      result.errors.push(errorInfo.originalMessage)
      result.gracefulDegradation = true

      return result
    }
  }

  /**
   * Convert scenario tools to the format expected by the tool execution system
   * @param {Object} scenario - The scenario object
   * @returns {Object} Tool configuration object
   */
  convertScenarioToolsToConfig(scenario) {
    return {
      id: `${scenario.id}-tools`,
      scenarioId: scenario.id,
      version: "1.0",
      description: `Tools for scenario: ${scenario.name}`,
      tools: scenario.tools.map(tool => ({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: tool.inputSchema
          },
          handler: tool.handler || null
        }
      })),
      metadata: {
        source: 'scenario',
        scenarioName: scenario.name,
        created: new Date().toISOString()
      }
    }
  }

  /**
   * Determine tool execution mode based on scenario tools
   * @param {Array} tools - Array of scenario tools
   * @returns {string} Execution mode ('detection', 'execution', or 'none')
   */
  determineToolExecutionMode(tools) {
    if (!tools || tools.length === 0) {
      return 'none'
    }

    // Check if any tools have handlers (execution mode)
    const hasExecutionCapability = tools.some(tool => tool.handler)

    return hasExecutionCapability ? 'execution' : 'detection'
  }

  /**
   * Validate scenario tool configuration
   * @param {Object} toolConfig - The tool configuration to validate
   * @param {string} scenarioId - The scenario ID
   * @returns {Object} Validation result
   */
  validateScenarioToolConfiguration(toolConfig, scenarioId) {
    const validation = {
      canProceed: false,
      errors: [],
      warnings: [],
      toolCount: 0,
      validToolCount: 0,
      scenarioId: scenarioId
    }

    try {
      if (!toolConfig || typeof toolConfig !== 'object') {
        validation.errors.push('Tool configuration must be an object')
        return validation
      }

      if (!toolConfig.tools || !Array.isArray(toolConfig.tools)) {
        validation.errors.push('Tool configuration must contain a tools array')
        return validation
      }

      validation.toolCount = toolConfig.tools.length

      if (validation.toolCount === 0) {
        validation.warnings.push('No tools defined in configuration')
        validation.canProceed = true
        return validation
      }

      // Validate each tool
      for (let i = 0; i < toolConfig.tools.length; i++) {
        const tool = toolConfig.tools[i]
        const toolValidation = this.validateSingleScenarioTool(tool, i)

        if (toolValidation.isValid) {
          validation.validToolCount++
        } else {
          validation.errors.push(`Tool ${i + 1}: ${toolValidation.error}`)
        }
      }

      // Check if we have at least some valid tools
      if (validation.validToolCount > 0) {
        validation.canProceed = true

        if (validation.validToolCount < validation.toolCount) {
          validation.warnings.push(
            `${validation.toolCount - validation.validToolCount} tools have validation issues`
          )
        }
      } else {
        validation.errors.push('No valid tools found in configuration')
      }

    } catch (error) {
      validation.errors.push(`Validation failed: ${error.message}`)
    }

    return validation
  }

  /**
   * Validate a single scenario tool
   * @param {Object} tool - The tool to validate
   * @param {number} index - Tool index for error reporting
   * @returns {Object} Validation result
   */
  validateSingleScenarioTool(tool, index) {
    const validation = {
      isValid: false,
      error: null,
      warnings: []
    }

    try {
      if (!tool || typeof tool !== 'object') {
        validation.error = 'Tool must be an object'
        return validation
      }

      if (!tool.toolSpec || typeof tool.toolSpec !== 'object') {
        validation.error = 'Tool must have a toolSpec object'
        return validation
      }

      const spec = tool.toolSpec

      // Validate tool name
      if (!spec.name || typeof spec.name !== 'string') {
        validation.error = 'Tool must have a name'
        return validation
      }

      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(spec.name)) {
        validation.error = 'Tool name must start with a letter and contain only letters, numbers, and underscores'
        return validation
      }

      // Validate description
      if (!spec.description || typeof spec.description !== 'string') {
        validation.error = 'Tool must have a description'
        return validation
      }

      if (spec.description.length < 10) {
        validation.error = 'Tool description must be at least 10 characters long'
        return validation
      }

      // Validate input schema
      if (!spec.inputSchema || typeof spec.inputSchema !== 'object') {
        validation.error = 'Tool must have an inputSchema object'
        return validation
      }

      // For scenario tools, inputSchema should be the JSON schema directly
      const schema = spec.inputSchema.json || spec.inputSchema

      if (!schema || typeof schema !== 'object') {
        validation.error = 'Tool inputSchema must contain a valid JSON schema'
        return validation
      }

      if (schema.type !== 'object') {
        validation.error = 'Tool inputSchema must be of type "object"'
        return validation
      }

      if (!schema.properties || typeof schema.properties !== 'object') {
        validation.error = 'Tool inputSchema must have properties'
        return validation
      }

      // Check for handler (optional)
      if (tool.handler && typeof tool.handler !== 'string') {
        validation.warnings.push('Tool handler should be a string if provided')
      }

      validation.isValid = true

    } catch (error) {
      validation.error = `Validation error: ${error.message}`
    }

    return validation
  }

  /**
   * Check if a scenario supports tools
   * @param {string} scenarioId - The scenario ID to check
   * @returns {Promise<boolean>} True if tools are supported
   */
  async scenarioSupportsTools(scenarioId) {
    if (!scenarioId) return false

    try {
      const toolConfigResult = await this.getToolConfigurationForScenario(scenarioId)
      return toolConfigResult.hasToolConfig && toolConfigResult.executionMode !== 'none'
    } catch (error) {
      console.error(`Error checking tool support for scenario ${scenarioId}:`, error)
      return false
    }
  }

  /**
   * Get tool configuration summary for UI display
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Object>} Tool configuration summary for display
   */
  async getToolConfigurationSummary(scenarioId) {
    const summary = {
      hasTools: false,
      toolCount: 0,
      toolNames: [],
      executionMode: 'none',
      status: 'no-tools',
      message: 'No tools available',
      scenarioId: scenarioId
    }

    try {
      const toolConfigResult = await this.getToolConfigurationForScenario(scenarioId)

      summary.hasTools = toolConfigResult.hasToolConfig
      summary.executionMode = toolConfigResult.executionMode
      summary.status = toolConfigResult.hasToolConfig ? 'enabled' : 'disabled'
      summary.message = toolConfigResult.message

      if (toolConfigResult.hasToolConfig && toolConfigResult.toolConfig) {
        const tools = toolConfigResult.toolConfig.tools || []
        summary.toolCount = tools.length
        summary.toolNames = tools.map(tool => tool.toolSpec.name)
      }

      return summary
    } catch (error) {
      console.error('Error getting tool configuration summary:', error)
      summary.status = 'error'
      summary.message = `Error: ${error.message}`
      return summary
    }
  }

  /**
   * Get cached tool configuration if available
   * @param {string} scenarioId - The scenario ID
   * @returns {Object|null} Cached configuration or null
   */
  getCachedToolConfiguration(scenarioId) {
    const cached = this.toolConfigCache.get(scenarioId)

    if (!cached) return null

    // Check if cache is still valid (5 minutes)
    const cacheAge = Date.now() - cached.timestamp
    if (cacheAge > 5 * 60 * 1000) {
      this.toolConfigCache.delete(scenarioId)
      return null
    }

    return cached
  }

  /**
   * Clear tool configuration cache
   * @param {string} scenarioId - Optional scenario ID to clear specific cache
   */
  clearCache(scenarioId = null) {
    if (scenarioId) {
      this.toolConfigCache.delete(scenarioId)
      this.validationCache.delete(scenarioId)
    } else {
      this.toolConfigCache.clear()
      this.validationCache.clear()
    }
  }

  /**
   * Get service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      cacheSize: this.toolConfigCache.size,
      validationCacheSize: this.validationCache.size
    }
  }

  /**
   * Debug method to check current tool configuration state
   * @param {string} scenarioId - Optional scenario ID to check specifically
   * @returns {Object} Debug information
   */
  debugToolConfiguration(scenarioId = null) {
    const debug = {
      timestamp: new Date().toISOString(),
      serviceInitialized: this.isInitialized,
      cacheStatus: {
        toolConfigCache: this.toolConfigCache.size,
        validationCache: this.validationCache.size
      }
    }

    if (scenarioId) {
      debug.specificScenario = {
        id: scenarioId,
        hasCachedConfig: this.toolConfigCache.has(scenarioId),
        cachedConfig: this.getCachedToolConfiguration(scenarioId)
      }
    }

    console.log('[ScenarioToolIntegrationService] Debug info:', debug)
    return debug
  }
}

// Create and export singleton instance
export const scenarioToolIntegrationService = new ScenarioToolIntegrationService()

// Expose debug methods globally in development
if (import.meta.env.DEV) {
  window.debugScenarioToolConfig = (scenarioId) => scenarioToolIntegrationService.debugToolConfiguration(scenarioId)
}
