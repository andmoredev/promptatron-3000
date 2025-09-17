/**
 * Service for integrating tool configurations with dataset selection
 * Handles automatic tool configuration retrieval and graceful fallbacks
 */

import { toolConfigService } from './toolConfigService.js'
import { handleToolError, validateToolConfigurationWithFeedback, ToolErrorTypes } from '../utils/toolErrorHandling.js'

/**
 * Dataset Tool Integration Service
 * Manages the relationship between datasets and their associated tool configurations
 */
export class DatasetToolIntegrationService {
  constructor() {
    this.isInitialized = false
    this.datasetToolMappings = new Map()
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      this.isInitialized = true
      return { success: true, message: 'Dataset tool integration service initialized' }
    } catch (error) {
      this.isInitialized = false
      return { success: false, message: `Failed to initialize: ${error.message}` }
    }
  }

  /**
   * Load dataset manifest with tool configuration support
   * @param {string} datasetType - The dataset type to load manifest for
   * @returns {Promise<Object>} Enhanced manifest with tool configuration info
   */
  async loadDatasetManifest(datasetType) {
    try {
      const manifestResponse = await fetch(`/datasets/${datasetType}/manifest.json`)
      if (!manifestResponse.ok) {
        throw new Error(`Failed to load dataset manifest: ${manifestResponse.status}`)
      }

      const manifest = await manifestResponse.json()

      // Validate basic manifest structure
      if (!manifest.files || !Array.isArray(manifest.files)) {
        throw new Error(`Invalid manifest format: expected "files" array in /datasets/${datasetType}/manifest.json`)
      }

      // Enhance manifest with tool configuration information
      const enhancedManifest = {
        ...manifest,
        toolConfiguration: this.processToolConfiguration(manifest.toolConfiguration, datasetType)
      }

      return enhancedManifest
    } catch (error) {
      console.error(`Error loading dataset manifest for ${datasetType}:`, error)
      throw error
    }
  }

  /**
   * Process tool configuration from manifest
   * @param {Object} toolConfig - Tool configuration from manifest
   * @param {string} datasetType - The dataset type
   * @returns {Object} Processed tool configuration
   */
  processToolConfiguration(toolConfig, datasetType) {
    const defaultConfig = {
      enabled: false,
      datasetType: datasetType,
      hasTools: false,
      toolsAvailable: [],
      fallbackMode: true
    }

    // If no tool configuration in manifest, return default
    if (!toolConfig) {
      return defaultConfig
    }

    // Check if tools are enabled for this dataset type
    const enabled = toolConfig.enabled === true
    const configDatasetType = toolConfig.datasetType || datasetType

    // Get available tools from tool config service
    const hasToolsInService = toolConfigService.hasToolsForDatasetType(configDatasetType)
    const availableTools = hasToolsInService ? toolConfigService.getToolNamesForDatasetType(configDatasetType) : []

    return {
      enabled: enabled,
      datasetType: configDatasetType,
      hasTools: hasToolsInService && availableTools.length > 0,
      toolsAvailable: availableTools,
      fallbackMode: !enabled || !hasToolsInService,
      originalConfig: toolConfig
    }
  }

  /**
   * Get tool configuration for a selected dataset with comprehensive error handling
   * @param {Object} selectedDataset - The selected dataset object
   * @returns {Promise<Object>} Tool configuration result with detailed error information
   */
  async getToolConfigurationForDataset(selectedDataset) {
    const result = {
      hasToolConfig: false,
      toolConfig: null,
      fallbackMode: true,
      message: 'No tools configured for this dataset type',
      datasetType: selectedDataset?.type || null,
      errors: [],
      warnings: [],
      gracefulDegradation: false,
      validationResult: null
    }

    try {
      // Validate input
      if (!selectedDataset || !selectedDataset.type) {
        const errorInfo = handleToolError('No dataset type specified', {
          operation: 'getToolConfigurationForDataset',
          context: 'input_validation'
        })

        result.message = errorInfo.userMessage
        result.errors.push('Dataset type is required')
        result.gracefulDegradation = true
        return result
      }

      const datasetType = selectedDataset.type

      // Load dataset manifest to check tool configuration
      let manifest
      try {
        manifest = await this.loadDatasetManifest(datasetType)
      } catch (manifestError) {
        // If manifest loading fails, fall back gracefully
        const toolErrorInfo = handleToolError(manifestError, {
          operation: 'loadDatasetManifest',
          datasetType: datasetType,
          context: 'manifest_loading'
        })

        result.warnings.push(`Manifest unavailable: ${toolErrorInfo.userMessage}`)

        // Try to get tools directly from service with enhanced error handling
        const toolConfigResult = toolConfigService.getToolsForDatasetType(datasetType)

        if (toolConfigResult.success && toolConfigResult.config) {
          // Validate the configuration
          const validation = validateToolConfigurationWithFeedback(toolConfigResult.config, datasetType)
          result.validationResult = validation

          if (validation.canProceed) {
            result.hasToolConfig = true
            result.toolConfig = toolConfigResult.config
            result.fallbackMode = false
            result.message = `Tools loaded from service for ${datasetType} (manifest unavailable)`
            result.warnings.push(...validation.userMessages)
          } else {
            result.message = `Tool configuration validation failed for ${datasetType}`
            result.errors.push(...validation.errors)
            result.gracefulDegradation = true
          }
        } else {
          result.message = toolConfigResult.error || `No tools available for ${datasetType} and manifest unavailable`
          result.gracefulDegradation = true

          if (toolConfigResult.hasGracefulDegradation) {
            result.warnings.push('Analysis will proceed without tool capabilities')
          }
        }
        return result
      }

      const toolConfiguration = manifest.toolConfiguration

      // Check if tools are enabled and available
      if (!toolConfiguration.enabled) {
        result.message = `Tools are disabled for dataset type: ${datasetType}`
        result.warnings.push('Tool usage is disabled in the dataset configuration')
        result.gracefulDegradation = true
        return result
      }

      if (!toolConfiguration.hasTools) {
        result.message = `No tools configured for dataset type: ${datasetType}`
        result.warnings.push('This dataset type does not have associated tools')
        result.gracefulDegradation = true
        return result
      }

      // Get tool configuration from service with enhanced error handling
      const toolConfigResult = toolConfigService.getToolsForDatasetType(toolConfiguration.datasetType)

      if (!toolConfigResult.success) {
        const errorInfo = handleToolError(toolConfigResult.error, {
          operation: 'getToolsForDatasetType',
          datasetType: toolConfiguration.datasetType,
          context: 'service_retrieval'
        })

        result.message = errorInfo.userMessage
        result.errors.push(toolConfigResult.error)
        result.gracefulDegradation = errorInfo.gracefulDegradation
        return result
      }

      // Validate the retrieved configuration
      const validation = validateToolConfigurationWithFeedback(toolConfigResult.config, datasetType)
      result.validationResult = validation

      if (!validation.canProceed) {
        result.message = `Tool configuration validation failed for ${datasetType}`
        result.errors.push(...validation.errors)
        result.warnings.push(...validation.warnings)
        result.gracefulDegradation = true
        return result
      }

      // Success - tools are available
      result.hasToolConfig = true
      result.toolConfig = toolConfigResult.config
      result.fallbackMode = false
      result.message = `Tools loaded for dataset type: ${datasetType}`
      result.toolsAvailable = toolConfiguration.toolsAvailable
      result.manifestConfig = toolConfiguration

      // Add any validation warnings
      if (validation.warnings.length > 0) {
        result.warnings.push(...validation.userMessages.filter(msg => msg.includes('issues')))
      }

      return result

    } catch (error) {
      const errorInfo = handleToolError(error, {
        operation: 'getToolConfigurationForDataset',
        datasetType: selectedDataset?.type,
        context: 'general_error'
      })

      result.message = errorInfo.userMessage
      result.errors.push(errorInfo.originalMessage)
      result.gracefulDegradation = errorInfo.gracefulDegradation

      return result
    }
  }

  /**
   * Check if a dataset type supports tools
   * @param {string} datasetType - The dataset type to check
   * @returns {Promise<boolean>} True if tools are supported
   */
  async datasetSupportsTools(datasetType) {
    if (!datasetType) return false

    try {
      const toolConfigResult = await this.getToolConfigurationForDataset({ type: datasetType })
      return toolConfigResult.hasToolConfig && !toolConfigResult.fallbackMode
    } catch (error) {
      console.error(`Error checking tool support for ${datasetType}:`, error)
      return false
    }
  }

  /**
   * Get tool configuration summary for UI display
   * @param {Object} selectedDataset - The selected dataset object
   * @returns {Promise<Object>} Tool configuration summary for display
   */
  async getToolConfigurationSummary(selectedDataset) {
    const summary = {
      hasTools: false,
      toolCount: 0,
      toolNames: [],
      status: 'no-tools',
      message: 'No tools available',
      datasetType: selectedDataset?.type || null
    }

    try {
      const toolConfigResult = await this.getToolConfigurationForDataset(selectedDataset)

      summary.hasTools = toolConfigResult.hasToolConfig
      summary.status = toolConfigResult.fallbackMode ? 'fallback' : (toolConfigResult.hasToolConfig ? 'enabled' : 'disabled')
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
   * Validate tool configuration for a dataset
   * @param {string} datasetType - The dataset type
   * @returns {Promise<Object>} Validation result
   */
  async validateToolConfiguration(datasetType) {
    const validation = {
      isValid: false,
      errors: [],
      warnings: [],
      toolCount: 0,
      datasetType: datasetType
    }

    try {
      if (!datasetType) {
        validation.errors.push('Dataset type is required')
        return validation
      }

      // Check if tools are available in service
      const hasToolsInService = toolConfigService.hasToolsForDatasetType(datasetType)
      if (!hasToolsInService) {
        validation.warnings.push(`No tools configured in service for dataset type: ${datasetType}`)
      } else {
        const toolConfig = toolConfigService.getToolsForDatasetTypeSimple(datasetType)
        if (toolConfig && toolConfig.tools) {
          validation.toolCount = toolConfig.tools.length

          // Validate each tool
          for (const tool of toolConfig.tools) {
            const toolValidation = toolConfigService.validateSingleTool(tool, validation.toolCount)
            if (!toolValidation.isValid) {
              validation.errors.push(`Tool validation failed: ${toolValidation.error}`)
            }
          }
        }
      }

      // Try to load manifest
      try {
        const manifest = await this.loadDatasetManifest(datasetType)
        if (manifest.toolConfiguration && manifest.toolConfiguration.enabled && !hasToolsInService) {
          validation.errors.push('Tools are enabled in manifest but no tools found in service')
        }
      } catch (manifestError) {
        validation.warnings.push(`Could not load manifest: ${manifestError.message}`)
      }

      validation.isValid = validation.errors.length === 0

    } catch (error) {
      validation.errors.push(`Validation failed: ${error.message}`)
    }

    return validation
  }

  /**
   * Ensure tool configuration is loaded for a dataset type
   * This method checks if configuration exists and loads it if needed
   * @param {string} datasetType - The dataset type to ensure configuration for
   * @returns {Promise<boolean>} True if configuration is available
   */
  async ensureToolConfigurationLoaded(datasetType) {
    try {
      if (!datasetType) {
        return false
      }

      // Check if configuration already exists
      const hasConfig = toolConfigService.hasToolsForDatasetType(datasetType)

      if (hasConfig) {
        // Configuration exists, verify it's valid
        const configResult = toolConfigService.getToolsForDatasetType(datasetType)
        if (configResult.success) {
          return true
        }
      }

      // Configuration doesn't exist or is invalid, try to load it
      console.log(`Ensuring tool configuration is loaded for: ${datasetType}`)
      const reloadResult = await this.reloadToolConfigurationForDataset(datasetType)

      return reloadResult.success

    } catch (error) {
      console.error(`Failed to ensure tool configuration for ${datasetType}:`, error)
      return false
    }
  }

  /**
   * Reload tool configuration for a specific dataset type
   * This is useful when the page refreshes and we need to ensure tools are properly loaded
   * @param {string} datasetType - The dataset type to reload configuration for
   * @returns {Promise<Object>} Reload result
   */
  async reloadToolConfigurationForDataset(datasetType) {
    try {
      if (!datasetType) {
        throw new Error('Dataset type is required for reload')
      }

      console.log(`[DatasetToolIntegrationService] Reloading tool configuration for dataset type: ${datasetType}`)

      // Force reload the tool configuration from the toolConfigService
      const reloadResult = await toolConfigService.reloadConfigurationForDatasetType(datasetType)

      console.log(`[DatasetToolIntegrationService] Reload result for ${datasetType}:`, reloadResult)

      if (reloadResult.success) {
        console.log(`[DatasetToolIntegrationService] ✅ Successfully reloaded tool configuration for ${datasetType}`)
        return {
          success: true,
          message: `Tool configuration reloaded for ${datasetType}`,
          datasetType: datasetType,
          toolCount: reloadResult.toolCount || 0,
          source: reloadResult.source
        }
      } else {
        console.warn(`[DatasetToolIntegrationService] ⚠️ Failed to reload tool configuration for ${datasetType}:`, reloadResult.error)
        return {
          success: false,
          message: reloadResult.error || 'Unknown reload error',
          datasetType: datasetType,
          fallbackAvailable: true,
          error: reloadResult.error
        }
      }

    } catch (error) {
      console.error(`[DatasetToolIntegrationService] ❌ Error reloading tool configuration for ${datasetType}:`, error)
      return {
        success: false,
        message: `Reload failed: ${error.message}`,
        datasetType: datasetType,
        error: error.message
      }
    }
  }

  /**
   * Debug method to check current tool configuration state
   * @param {string} datasetType - Optional dataset type to check specifically
   * @returns {Object} Debug information
   */
  debugToolConfiguration(datasetType = null) {
    const debug = {
      timestamp: new Date().toISOString(),
      serviceInitialized: this.isInitialized,
      toolServiceStatus: toolConfigService.getStatus()
    }

    if (datasetType) {
      debug.specificDataset = {
        type: datasetType,
        hasConfig: toolConfigService.hasToolsForDatasetType(datasetType),
        configResult: toolConfigService.getToolsForDatasetType(datasetType)
      }
    }

    console.log('[DatasetToolIntegrationService] Debug info:', debug)
    return debug
  }

  /**
   * Get service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      toolServiceStatus: toolConfigService.getStatus(),
      mappingCount: this.datasetToolMappings.size
    }
  }
}

// Create and export singleton instance
export const datasetToolIntegrationService = new DatasetToolIntegrationService()

// Expose debug methods globally in development
if (import.meta.env.DEV) {
  window.debugToolConfig = (datasetType) => datasetToolIntegrationService.debugToolConfiguration(datasetType)
  window.reloadToolConfig = (datasetType) => datasetToolIntegrationService.reloadToolConfigurationForDataset(datasetType)
}
