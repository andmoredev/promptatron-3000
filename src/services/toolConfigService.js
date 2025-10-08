/**
 * Simplified tool configuration service that retrieves tool configurations from scenarios
 * Acts as an adapter to the scenarioService, maintaining API compatibility while dramatically reducing complexity
 */

/**
 * Tool configuration service for managing scenario-based tools
 */
export class ToolConfigService {
  constructor(scenarioService) {
    this.scenarioService = scenarioService
    this.isInitialized = true // Always ready since it's just an adapter
    this.lastError = null
  }

  /**
   * Map legacy dataset type names to scenario IDs for backward compatibility
   * @param {string} datasetType - Legacy dataset type or scenario ID
   * @returns {string} Scenario ID
   */
  mapLegacyDatasetType(datasetType) {
    const LEGACY_DATASET_TYPE_MAPPING = {
      'fraud-detection': 'fraud-detection',
      'shipping-logistics': 'shipping-logistics',
      'customer-support': 'customer-support'
    }

    return LEGACY_DATASET_TYPE_MAPPING[datasetType] || datasetType
  }

  /**
   * Extract tool configuration from scenario
   * @param {Object} scenario - Scenario object
   * @returns {Object|null} Tool configuration or null if no tools
   */
  extractToolConfiguration(scenario) {
    if (!scenario || !scenario.tools || !Array.isArray(scenario.tools)) {
      return null
    }

    return {
      id: `${scenario.id}-tools`,
      scenarioId: scenario.id,
      tools: scenario.tools.map(tool => ({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: tool.inputSchema
          },
          handler: tool.handler
        }
      })),
      source: 'scenario',
      loadedAt: new Date().toISOString()
    }
  }

  /**
   * Get tool definitions for a specific dataset type (scenario)
   * @param {string} datasetType - The dataset type (scenario ID) to get tools for
   * @returns {Object|null} Tool configuration object or null if not found
   */
  getToolsForDatasetType(datasetType) {
    try {
      // Input validation
      if (!datasetType || typeof datasetType !== 'string') {
        this.lastError = 'Dataset type must be a non-empty string'
        return null
      }

      const scenarioId = this.mapLegacyDatasetType(datasetType.toLowerCase().trim())

      if (!scenarioId) {
        this.lastError = 'Dataset type cannot be empty'
        return null
      }

      // Check if scenarioService is ready
      if (!this.scenarioService || !this.scenarioService.isReady()) {
        this.lastError = 'Scenario service is not initialized'
        return null
      }

      // Get scenario from scenarioService
      const scenario = this.scenarioService.getScenario(scenarioId)
      if (!scenario) {
        this.lastError = `Scenario "${scenarioId}" not found`
        return null
      }

      // Extract and return tool configuration
      const toolConfig = this.extractToolConfiguration(scenario)
      if (!toolConfig) {
        this.lastError = `Scenario "${scenarioId}" does not have any tools defined`
        return null
      }

      this.lastError = null
      return toolConfig

    } catch (error) {
      this.lastError = `Failed to retrieve tool configuration: ${error.message}`
      console.error('[ToolConfigService] Error getting tools for dataset type:', error)
      return null
    }
  }

  /**
   * Check if tools are available for a dataset type (scenario)
   * @param {string} datasetType - The dataset type (scenario ID) to check
   * @returns {boolean} True if tools are available
   */
  hasToolsForDatasetType(datasetType) {
    try {
      if (!datasetType || typeof datasetType !== 'string') {
        return false
      }

      const scenarioId = this.mapLegacyDatasetType(datasetType.toLowerCase().trim())

      if (!this.scenarioService || !this.scenarioService.isReady()) {
        return false
      }

      const scenario = this.scenarioService.getScenario(scenarioId)
      if (!scenario) {
        return false
      }

      return !!(scenario.tools && Array.isArray(scenario.tools) && scenario.tools.length > 0)

    } catch (error) {
      console.error('[ToolConfigService] Error checking tools for dataset type:', error)
      return false
    }
  }

  /**
   * Get tool names for a specific dataset type (scenario)
   * @param {string} datasetType - The dataset type (scenario ID)
   * @returns {string[]} Array of tool names
   */
  getToolNamesForDatasetType(datasetType) {
    try {
      const toolConfig = this.getToolsForDatasetType(datasetType)
      if (!toolConfig || !toolConfig.tools) {
        return []
      }

      return toolConfig.tools.map(tool => tool.toolSpec.name)

    } catch (error) {
      console.error('[ToolConfigService] Error getting tool names for dataset type:', error)
      return []
    }
  }

  /**
   * Validate tool definition with basic validation logic
   * @param {Object} toolConfig - Tool configuration to validate
   * @returns {Object} Validation result
   */
  validateToolDefinition(toolConfig) {
    const validation = {
      isValid: false,
      error: null,
      errors: [],
      warnings: []
    }

    try {
      // Basic structure validation
      if (!toolConfig || typeof toolConfig !== 'object') {
        validation.error = 'Tool configuration must be an object'
        return validation
      }

      if (!toolConfig.tools || !Array.isArray(toolConfig.tools)) {
        validation.error = 'Tool configuration must have a tools array'
        return validation
      }

      if (toolConfig.tools.length === 0) {
        validation.error = 'Tool configuration must have at least one tool'
        return validation
      }

      // Validate each tool
      for (let i = 0; i < toolConfig.tools.length; i++) {
        const tool = toolConfig.tools[i]

        if (!tool.toolSpec) {
          validation.errors.push(`Tool ${i}: Missing toolSpec`)
          continue
        }

        if (!tool.toolSpec.name || typeof tool.toolSpec.name !== 'string') {
          validation.errors.push(`Tool ${i}: Missing or invalid name`)
        }

        if (!tool.toolSpec.description || typeof tool.toolSpec.description !== 'string') {
          validation.errors.push(`Tool ${i}: Missing or invalid description`)
        }

        if (!tool.toolSpec.inputSchema || typeof tool.toolSpec.inputSchema !== 'object') {
          validation.errors.push(`Tool ${i}: Missing or invalid inputSchema`)
        }
      }

      if (validation.errors.length > 0) {
        validation.error = `Tool validation failed: ${validation.errors.join(', ')}`
        return validation
      }

      validation.isValid = true
      return validation

    } catch (error) {
      validation.error = `Validation error: ${error.message}`
      return validation
    }
  }

  /**
   * Check if the service is ready
   * @returns {boolean} True if service is ready
   */
  isReady() {
    return this.isInitialized && this.scenarioService && this.scenarioService.isReady()
  }

  /**
   * Get service status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      ready: this.isReady(),
      scenarioServiceReady: this.scenarioService ? this.scenarioService.isReady() : false,
      lastError: this.lastError
    }
  }

  /**
   * Get a specific tool definition by name and dataset type
   * @param {string} datasetType - The dataset type (scenario ID)
   * @param {string} toolName - The tool name
   * @returns {Object|null} Tool definition or null if not found
   */
  getToolDefinition(datasetType, toolName) {
    try {
      const toolConfig = this.getToolsForDatasetType(datasetType)
      if (!toolConfig || !toolConfig.tools) {
        return null
      }

      const tool = toolConfig.tools.find(t => t.toolSpec.name === toolName)
      return tool ? tool.toolSpec : null

    } catch (error) {
      console.error('[ToolConfigService] Error getting tool definition:', error)
      return null
    }
  }

  /**
   * Get all available tool configurations
   * @returns {Array} Array of all tool configuration objects
   */
  getAllToolConfigurations() {
    try {
      if (!this.scenarioService || !this.scenarioService.isReady()) {
        return []
      }

      const scenarios = this.scenarioService.getAvailableScenarios()
      const toolConfigurations = []

      for (const scenarioMetadata of scenarios) {
        const scenario = this.scenarioService.getScenario(scenarioMetadata.id)
        if (scenario) {
          const toolConfig = this.extractToolConfiguration(scenario)
          if (toolConfig) {
            toolConfigurations.push(toolConfig)
          }
        }
      }

      return toolConfigurations

    } catch (error) {
      console.error('[ToolConfigService] Error getting all tool configurations:', error)
      return []
    }
  }

  /**
   * Ensure the service is initialized (compatibility method)
   * @returns {Promise<boolean>} True if service is ready
   */
  async ensureInitialized() {
    return this.isReady()
  }

  /**
   * Get tool configuration for a dataset type (simple format for backward compatibility)
   * @param {string} datasetType - The dataset type or scenario ID
   * @returns {Object|null} Tool configuration in simple format
   */
  getToolsForDatasetTypeSimple(datasetType) {
    try {
      const toolConfig = this.getToolsForDatasetType(datasetType)
      return toolConfig // Already in the correct format
    } catch (error) {
      console.error('[ToolConfigService] Error getting simple tools for dataset type:', error)
      return null
    }
  }

  /**
   * Validate a single tool definition (backward compatibility method)
   * @param {Object} tool - Tool definition to validate
   * @param {number} toolCount - Total number of tools (for context)
   * @returns {Object} Validation result
   */
  validateSingleTool(tool, toolCount = 1) {
    try {
      if (!tool) {
        return {
          isValid: false,
          error: 'Tool definition is required',
          warnings: []
        }
      }

      if (!tool.name || typeof tool.name !== 'string') {
        return {
          isValid: false,
          error: 'Tool must have a valid name',
          warnings: []
        }
      }

      if (!tool.description || typeof tool.description !== 'string') {
        return {
          isValid: false,
          error: 'Tool must have a valid description',
          warnings: []
        }
      }

      if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
        return {
          isValid: false,
          error: 'Tool must have a valid inputSchema',
          warnings: []
        }
      }

      const warnings = []
      if (toolCount > 10) {
        warnings.push('Large number of tools may impact performance')
      }

      return {
        isValid: true,
        error: null,
        warnings
      }
    } catch (error) {
      console.error('[ToolConfigService] Error validating single tool:', error)
      return {
        isValid: false,
        error: `Validation error: ${error.message}`,
        warnings: []
      }
    }
  }

  /**
   * Reload configuration for a dataset type (backward compatibility method)
   * Since we're scenario-based now, this just refreshes the scenario
   * @param {string} datasetType - The dataset type or scenario ID
   * @returns {Promise<Object>} Reload result
   */
  async reloadConfigurationForDatasetType(datasetType) {
    try {
      if (!datasetType || typeof datasetType !== 'string') {
        return {
          success: false,
          error: 'Invalid dataset type provided',
          toolCount: 0
        }
      }

      // In the simplified service, we don't need to reload anything
      // since we get data directly from scenarioService
      const toolConfig = this.getToolsForDatasetType(datasetType)

      return {
        success: true,
        message: `Configuration refreshed for ${datasetType}`,
        toolCount: toolConfig && toolConfig.tools ? toolConfig.tools.length : 0,
        datasetType
      }
    } catch (error) {
      console.error('[ToolConfigService] Error reloading configuration:', error)
      return {
        success: false,
        error: error.message,
        toolCount: 0
      }
    }
  }
}

// Import scenarioService for dependency injection
import { scenarioService } from './scenarioService.js'

// Create and export singleton instance with scenarioService dependency
export const toolConfigService = new ToolConfigService(scenarioService)
