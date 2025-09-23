/**
 * Service class for managing dataset-specific tool configurations
 * Handles tool definitions, validation, and retrieval for different dataset types
 * Supports dynamic loading from dataset manifests and hot-reloading for development
 */

import { analyzeError, handleError, ErrorTypes } from '../utils/errorHandling.js'

/**
 * Tool configuration service for managing dataset-specific tools
 */
export class ToolConfigService {
  constructor() {
    this.toolConfigurations = new Map()
    this.isInitialized = false
    this.initializationErrors = []
    this.validationCache = new Map()
    this.manifestCache = new Map()
    this.hotReloadEnabled = import.meta.env.DEV || false
    this.lastReloadTime = Date.now()
    this.watchedManifests = new Set()
    this.configurationSchema = this.createConfigurationSchema()
    this.initializeFallbackConfigurations()
  }

  /**
   * Create the configuration schema for validation
   * @returns {Object} JSON schema for tool configuration validation
   */
  createConfigurationSchema() {
    return {
      type: "object",
      required: ["id", "version", "tools"],
      properties: {
        id: {
          type: "string",
          minLength: 1,
          description: "Unique identifier for the tool configuration"
        },
        datasetType: {
          type: "string",
          minLength: 1,
          description: "Dataset type this configuration applies to"
        },
        version: {
          type: "string",
          pattern: "^\\d+\\.\\d+(\\.\\d+)?$",
          description: "Semantic version of the configuration"
        },
        description: {
          type: "string",
          description: "Optional description of the tool configuration"
        },
        tools: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["toolSpec"],
            properties: {
              toolSpec: {
                type: "object",
                required: ["name", "description", "inputSchema"],
                properties: {
                  name: {
                    type: "string",
                    pattern: "^[a-zA-Z][a-zA-Z0-9_]*$",
                    description: "Tool name (alphanumeric and underscore only)"
                  },
                  description: {
                    type: "string",
                    minLength: 10,
                    description: "Detailed description of what the tool does"
                  },
                  inputSchema: {
                    type: "object",
                    required: ["json"],
                    properties: {
                      json: {
                        type: "object",
                        required: ["type", "properties"],
                        properties: {
                          type: { const: "object" },
                          properties: { type: "object" },
                          required: { type: "array", items: { type: "string" } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Initialize fallback configurations synchronously (called from constructor)
   */
  initializeFallbackConfigurations() {
    this.initializationErrors = []

    try {
      // Add fallback fraud detection configuration
      const fraudDetectionConfig = {
        id: "fraud-detection-tools-fallback",
        datasetType: "fraud-detection",
        version: "1.0",
        description: "Default fraud detection tools (fallback configuration)",
        tools: [
          {
            toolSpec: {
              name: "freeze_account",
              description: "Put a freeze on a specific account and mark why it was frozen",
              inputSchema: {
                json: {
                  type: "object",
                  properties: {
                    account_id: {
                      type: "string",
                      description: "The account ID to freeze"
                    },
                    transaction_ids: {
                      type: "array",
                      items: { type: "string" },
                      description: "Array of transaction IDs that led to this decision"
                    },
                    reason: {
                      type: "string",
                      description: "Detailed reason for freezing the account"
                    }
                  },
                  required: ["account_id", "transaction_ids", "reason"]
                }
              }
            }
          }
        ],
        metadata: {
          source: 'fallback',
          created: new Date().toISOString()
        }
      }

      const validation = this.validateToolDefinition(fraudDetectionConfig)
      if (validation.isValid) {
        this.toolConfigurations.set("fraud-detection", fraudDetectionConfig)
      } else {
        this.initializationErrors.push({
          datasetType: "fraud-detection",
          error: validation.error,
          severity: 'high',
          timestamp: new Date().toISOString()
        })
        console.warn(`Failed to initialize fraud-detection fallback tools: ${validation.error}`)
      }

      // Tool configuration service initialized with fallback configurations

    } catch (error) {
      this.initializationErrors.push({
        datasetType: 'all',
        error: `Fallback initialization failed: ${error.message}`,
        severity: 'critical',
        timestamp: new Date().toISOString()
      })

      handleError(error, {
        context: 'tool_config_fallback_initialization',
        operation: 'initializeFallbackConfigurations'
      })
    }
  }

  /**
   * Initialize configurations from manifests (async, called after construction)
   */
  async initializeFromManifests() {
    try {
      // Load configurations from dataset manifests first
      await this.loadConfigurationsFromManifests()

      // Replace fallback configurations with manifest-loaded ones if available
      await this.replaceFallbackConfigurations()

      this.isInitialized = true

      if (this.initializationErrors.length > 0) {
        console.warn(`Tool configuration service initialized from manifests with ${this.initializationErrors.length} error(s)`)
      } else {
        // Tool configuration service successfully initialized from manifests
      }

      // Set up hot reloading in development
      if (this.hotReloadEnabled) {
        this.setupHotReloading()
      }

    } catch (error) {
      this.initializationErrors.push({
        datasetType: 'all',
        error: `Manifest initialization failed: ${error.message}`,
        severity: 'high',
        timestamp: new Date().toISOString()
      })

      handleError(error, {
        context: 'tool_config_manifest_initialization',
        operation: 'initializeFromManifests'
      })

      console.warn('Failed to initialize from manifests, using fallback configurations')
      // Keep fallback configurations and mark as initialized
      this.isInitialized = true
    }
  }

  /**
   * Load tool configurations from dataset manifests
   */
  async loadConfigurationsFromManifests() {
    try {
      // Load main dataset manifest to get available types
      const mainManifestResponse = await fetch('/datasets/manifest.json')
      if (!mainManifestResponse.ok) {
        throw new Error(`Failed to load main dataset manifest: ${mainManifestResponse.status}`)
      }

      const mainManifest = await mainManifestResponse.json()
      if (!mainManifest.types || !Array.isArray(mainManifest.types)) {
        throw new Error('Invalid main manifest format: expected "types" array')
      }

      // Load tool configurations from each dataset type manifest
      for (const datasetType of mainManifest.types) {
        try {
          await this.loadToolConfigurationFromManifest(datasetType)
        } catch (error) {
          this.initializationErrors.push({
            datasetType,
            error: `Failed to load configuration from manifest: ${error.message}`,
            severity: 'medium',
            timestamp: new Date().toISOString()
          })
          console.warn(`Failed to load tool configuration for ${datasetType}:`, error.message)
        }
      }

    } catch (error) {
      this.initializationErrors.push({
        datasetType: 'all',
        error: `Failed to load configurations from manifests: ${error.message}`,
        severity: 'high',
        timestamp: new Date().toISOString()
      })
      console.warn('Failed to load configurations from manifests:', error.message)
    }
  }

  /**
   * Load tool configuration from a specific dataset manifest
   * @param {string} datasetType - The dataset type to load configuration for
   */
  async loadToolConfigurationFromManifest(datasetType) {
    try {
      const manifestResponse = await fetch(`/datasets/${datasetType}/manifest.json`)
      if (!manifestResponse.ok) {
        // Not all datasets need to have tool configurations
        return null
      }

      const manifest = await manifestResponse.json()

      // Check if this manifest has tool configuration
      if (!manifest.toolConfiguration || !manifest.toolConfiguration.enabled) {
        return null
      }

      // Check if there's an external tool configuration file
      if (manifest.toolConfiguration.configFile) {
        return await this.loadExternalToolConfiguration(datasetType, manifest.toolConfiguration.configFile)
      }

      // Check if tools are defined inline in the manifest
      if (manifest.toolConfiguration.tools) {
        return this.loadInlineToolConfiguration(datasetType, manifest)
      }

      // Check if there's a reference to a tool configuration by ID
      if (manifest.toolConfiguration.configId) {
        return this.loadReferencedToolConfiguration(datasetType, manifest.toolConfiguration.configId)
      }

      return null

    } catch (error) {
      throw new Error(`Failed to load manifest for ${datasetType}: ${error.message}`)
    }
  }

  /**
   * Load tool configuration from an external file
   * @param {string} datasetType - The dataset type
   * @param {string} configFile - Path to the configuration file
   */
  async loadExternalToolConfiguration(datasetType, configFile) {
    try {
      const configPath = configFile.startsWith('/') ? configFile : `/datasets/${datasetType}/${configFile}`
      const configResponse = await fetch(configPath)

      if (!configResponse.ok) {
        throw new Error(`Failed to load external config file: ${configResponse.status}`)
      }

      const toolConfig = await configResponse.json()

      // Ensure the configuration has the correct dataset type
      if (!toolConfig.datasetType) {
        toolConfig.datasetType = datasetType
      }

      const validation = this.validateToolDefinition(toolConfig)
      if (validation.isValid) {
        this.toolConfigurations.set(datasetType, toolConfig)
        this.manifestCache.set(datasetType, {
          type: 'external',
          path: configPath,
          lastModified: Date.now()
        })
        return toolConfig
      } else {
        throw new Error(`Invalid external tool configuration: ${validation.error}`)
      }

    } catch (error) {
      throw new Error(`Failed to load external tool configuration: ${error.message}`)
    }
  }

  /**
   * Load tool configuration defined inline in the manifest
   * @param {string} datasetType - The dataset type
   * @param {Object} manifest - The dataset manifest
   */
  loadInlineToolConfiguration(datasetType, manifest) {
    try {
      const toolConfig = {
        id: `${datasetType}-tools`,
        datasetType: datasetType,
        version: manifest.toolConfiguration.version || "1.0",
        description: manifest.toolConfiguration.description || `Tools for ${datasetType} dataset`,
        tools: manifest.toolConfiguration.tools,
        metadata: {
          source: 'inline-manifest',
          created: new Date().toISOString()
        }
      }

      const validation = this.validateToolDefinition(toolConfig)
      if (validation.isValid) {
        this.toolConfigurations.set(datasetType, toolConfig)
        this.manifestCache.set(datasetType, {
          type: 'inline',
          lastModified: Date.now()
        })
        return toolConfig
      } else {
        throw new Error(`Invalid inline tool configuration: ${validation.error}`)
      }

    } catch (error) {
      throw new Error(`Failed to load inline tool configuration: ${error.message}`)
    }
  }

  /**
   * Load tool configuration by reference ID (for shared configurations)
   * @param {string} datasetType - The dataset type
   * @param {string} configId - The configuration ID to reference
   */
  async loadReferencedToolConfiguration(datasetType, configId) {
    try {
      // Try to load from a shared configurations directory
      const configResponse = await fetch(`/datasets/shared-tools/${configId}.json`)

      if (!configResponse.ok) {
        throw new Error(`Shared tool configuration not found: ${configId}`)
      }

      const toolConfig = await configResponse.json()

      // Create a copy for this dataset type
      const datasetSpecificConfig = {
        ...toolConfig,
        id: `${datasetType}-${configId}`,
        datasetType: datasetType,
        metadata: {
          ...toolConfig.metadata,
          source: 'shared-reference',
          originalId: configId,
          adaptedFor: datasetType
        }
      }

      const validation = this.validateToolDefinition(datasetSpecificConfig)
      if (validation.isValid) {
        this.toolConfigurations.set(datasetType, datasetSpecificConfig)
        this.manifestCache.set(datasetType, {
          type: 'reference',
          configId: configId,
          lastModified: Date.now()
        })
        return datasetSpecificConfig
      } else {
        throw new Error(`Invalid referenced tool configuration: ${validation.error}`)
      }

    } catch (error) {
      throw new Error(`Failed to load referenced tool configuration: ${error.message}`)
    }
  }

  /**
   * Replace fallback configurations with manifest-loaded ones if available
   */
  async replaceFallbackConfigurations() {
    // Check if we loaded better configurations from manifests
    // If so, we keep them; if not, we keep the fallback configurations

    const loadedTypes = Array.from(this.toolConfigurations.keys())
    // Tool configurations loaded successfully
  }

  /**
   * Set up hot reloading for development
   */
  setupHotReloading() {
    if (!this.hotReloadEnabled) return

    // Set up periodic checking for manifest changes
    this.hotReloadInterval = setInterval(async () => {
      try {
        await this.checkForConfigurationUpdates()
      } catch (error) {
        console.warn('Hot reload check failed:', error.message)
      }
    }, 2000) // Check every 2 seconds in development

    // Tool configuration hot reloading enabled
  }

  /**
   * Check for configuration updates and reload if necessary
   */
  async checkForConfigurationUpdates() {
    try {
      // Check main manifest for new dataset types
      const mainManifestResponse = await fetch('/datasets/manifest.json')
      if (mainManifestResponse.ok) {
        const mainManifest = await mainManifestResponse.json()

        if (mainManifest.types && Array.isArray(mainManifest.types)) {
          for (const datasetType of mainManifest.types) {
            // Check if this is a new dataset type
            if (!this.manifestCache.has(datasetType)) {
              await this.loadToolConfigurationFromManifest(datasetType)
            }
          }
        }
      }
    } catch (error) {
      // Silently fail hot reload checks to avoid spamming console
    }
  }

  /**
   * Reload tool configuration for a specific dataset type
   * @param {string} datasetType - The dataset type to reload
   * @returns {Promise<Object>} Reload result
   */
  async reloadConfigurationForDatasetType(datasetType) {
    try {
      if (!datasetType) {
        throw new Error('Dataset type is required')
      }

      const normalizedType = datasetType.toLowerCase().trim()

      // Clear existing configuration for this dataset type
      const hadPreviousConfig = this.toolConfigurations.has(normalizedType)
      if (hadPreviousConfig) {
        this.toolConfigurations.delete(normalizedType)
      }

      // Clear cache entry
      this.manifestCache.delete(normalizedType)

      // Remove any previous errors for this dataset type
      this.initializationErrors = this.initializationErrors.filter(
        err => err.datasetType !== normalizedType
      )

      // Reload configuration from manifest
      let reloadedConfig = null
      try {
        reloadedConfig = await this.loadToolConfigurationFromManifest(normalizedType)
      } catch (manifestError) {
        console.warn(`Failed to reload from manifest for ${normalizedType}, checking for fallback:`, manifestError.message)

        // If manifest loading fails, check if we have a fallback configuration
        if (normalizedType === 'fraud-detection') {
          // Reinitialize fallback for fraud-detection
          this.initializeFallbackConfigurations()
          reloadedConfig = this.toolConfigurations.get(normalizedType)
        }
      }

      const result = {
        success: !!reloadedConfig,
        datasetType: normalizedType,
        hadPreviousConfig: hadPreviousConfig,
        toolCount: reloadedConfig?.tools?.length || 0,
        source: reloadedConfig?.metadata?.source || 'none',
        timestamp: new Date().toISOString()
      }

      if (reloadedConfig) {
        // Successfully reloaded configuration
      } else {
        result.error = `No configuration available for dataset type: ${normalizedType}`
        console.warn(`No configuration found for ${normalizedType} after reload attempt`)
      }

      return result

    } catch (error) {
      const result = {
        success: false,
        datasetType: datasetType,
        error: error.message,
        timestamp: new Date().toISOString()
      }

      console.error(`Failed to reload configuration for ${datasetType}:`, error)
      return result
    }
  }

  /**
   * Reload tool configuration for a specific dataset type
   * @param {string} datasetType - The dataset type to reload
   * @returns {Promise<Object>} Reload result
   */
  async reloadConfigurationForDatasetType(datasetType) {
    try {
      if (!datasetType) {
        throw new Error('Dataset type is required')
      }

      const normalizedType = datasetType.toLowerCase().trim()
      // Reloading tool configuration

      // Check current state before reload
      const hadPreviousConfig = this.toolConfigurations.has(normalizedType)
      const previousConfig = hadPreviousConfig ? this.toolConfigurations.get(normalizedType) : null

      // Checking previous config state

      // Clear existing configuration for this dataset type
      if (hadPreviousConfig) {
        this.toolConfigurations.delete(normalizedType)
        // Cleared existing configuration
      }

      // Clear cache entry
      this.manifestCache.delete(normalizedType)

      // Remove any previous errors for this dataset type
      const errorsBefore = this.initializationErrors.length
      this.initializationErrors = this.initializationErrors.filter(
        err => err.datasetType !== normalizedType
      )
      const errorsAfter = this.initializationErrors.length
      if (errorsBefore !== errorsAfter) {
        // Cleared previous errors
      }

      // Reload configuration from manifest
      let reloadedConfig = null
      try {
        // Attempting to load configuration from manifest
        reloadedConfig = await this.loadToolConfigurationFromManifest(normalizedType)

        if (reloadedConfig) {
          // Successfully loaded from manifest
        }
      } catch (manifestError) {
        console.warn(`[ToolConfigService] Failed to reload from manifest for ${normalizedType}:`, manifestError.message)

        // If manifest loading fails, check if we have a fallback configuration
        if (normalizedType === 'fraud-detection') {
          // Attempting to reinitialize fallback configuration
          // Reinitialize fallback for fraud-detection
          this.initializeFallbackConfigurations()
          reloadedConfig = this.toolConfigurations.get(normalizedType)

          if (reloadedConfig) {
            // Successfully loaded fallback configuration
          }
        }
      }

      const result = {
        success: !!reloadedConfig,
        datasetType: normalizedType,
        hadPreviousConfig: hadPreviousConfig,
        toolCount: reloadedConfig?.tools?.length || 0,
        source: reloadedConfig?.metadata?.source || 'none',
        timestamp: new Date().toISOString()
      }

      if (reloadedConfig) {
        // Successfully reloaded configuration
      } else {
        result.error = `No configuration available for dataset type: ${normalizedType}`
        console.warn(`[ToolConfigService] ❌ No configuration found for ${normalizedType} after reload attempt`)
      }

      return result

    } catch (error) {
      const result = {
        success: false,
        datasetType: datasetType,
        error: error.message,
        timestamp: new Date().toISOString()
      }

      console.error(`[ToolConfigService] ❌ Failed to reload configuration for ${datasetType}:`, error)
      return result
    }
  }

  /**
   * Manually reload tool configurations (useful for development)
   * @returns {Promise<Object>} Reload result with statistics
   */
  async reloadConfigurations() {
    try {
      const startTime = Date.now()
      const previousCount = this.toolConfigurations.size

      // Clear current configurations (except fallbacks)
      const fallbackConfigs = new Map()
      for (const [key, config] of this.toolConfigurations.entries()) {
        if (config.metadata?.source === 'fallback') {
          fallbackConfigs.set(key, config)
        }
      }

      this.toolConfigurations.clear()
      this.manifestCache.clear()
      this.initializationErrors = []

      // Restore fallbacks
      for (const [key, config] of fallbackConfigs.entries()) {
        this.toolConfigurations.set(key, config)
      }

      // Reload from manifests
      await this.loadConfigurationsFromManifests()

      const reloadTime = Date.now() - startTime
      const newCount = this.toolConfigurations.size

      const result = {
        success: true,
        reloadTime,
        previousCount,
        newCount,
        added: Math.max(0, newCount - previousCount),
        errors: this.initializationErrors.length,
        timestamp: new Date().toISOString()
      }

      // Tool configurations reloaded
      this.lastReloadTime = Date.now()

      return result

    } catch (error) {
      const result = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }

      console.error('Failed to reload tool configurations:', error)
      return result
    }
  }

  /**
   * Get tool definitions for a specific dataset type with comprehensive error handling
   * @param {string} datasetType - The dataset type to get tools for
   * @returns {Object} Result object with configuration data and error information
   */
  getToolsForDatasetType(datasetType) {
    const result = {
      success: false,
      config: null,
      error: null,
      warnings: [],
      hasGracefulDegradation: false
    }

    try {
      // Input validation
      if (!datasetType || typeof datasetType !== 'string') {
        result.error = 'Dataset type must be a non-empty string'
        result.hasGracefulDegradation = true
        return result
      }

      const normalizedType = datasetType.toLowerCase().trim()
      if (normalizedType === '') {
        result.error = 'Dataset type cannot be empty'
        result.hasGracefulDegradation = true
        return result
      }

      // Check if service is initialized
      if (!this.isInitialized) {
        result.error = 'Tool configuration service not initialized'
        result.hasGracefulDegradation = true
        return result
      }

      // Check for initialization errors for this dataset type
      const initError = this.initializationErrors.find(err =>
        err.datasetType === normalizedType || err.datasetType === 'all'
      )
      if (initError) {
        result.warnings.push(`Configuration loaded with errors: ${initError.error}`)
      }

      // Get configuration
      const config = this.toolConfigurations.get(normalizedType)
      if (!config) {
        result.error = `No tool configuration found for dataset type: ${datasetType}`
        result.hasGracefulDegradation = true
        return result
      }

      // Validate configuration integrity
      const validation = this.validateToolDefinition(config)
      if (!validation.isValid) {
        result.error = `Tool configuration is invalid: ${validation.error}`
        result.warnings.push('Configuration validation failed - tools may not work correctly')
        result.hasGracefulDegradation = true
        return result
      }

      result.success = true
      result.config = config
      return result

    } catch (error) {
      const errorInfo = analyzeError(error, {
        operation: 'getToolsForDatasetType',
        datasetType: datasetType
      })

      result.error = `Failed to retrieve tool configuration: ${errorInfo.userMessage}`
      result.hasGracefulDegradation = true

      handleError(error, {
        context: 'tool_config_retrieval',
        datasetType: datasetType,
        operation: 'getToolsForDatasetType'
      })

      return result
    }
  }

  /**
   * Get tool configuration for a dataset type (simple version for backward compatibility)
   * @param {string} datasetType - The dataset type to get tools for
   * @returns {Object|null} Tool configuration object or null if not found
   */
  getToolsForDatasetTypeSimple(datasetType) {
    const result = this.getToolsForDatasetType(datasetType)
    return result.success ? result.config : null
  }

  /**
   * Get all available tool configurations
   * @returns {Array} Array of all tool configuration objects
   */
  getAllToolConfigurations() {
    return Array.from(this.toolConfigurations.values())
  }

  /**
   * Check if tools are available for a dataset type
   * @param {string} datasetType - The dataset type to check
   * @returns {boolean} True if tools are available
   */
  hasToolsForDatasetType(datasetType) {
    if (!datasetType || typeof datasetType !== 'string') {
      return false
    }

    const normalizedType = datasetType.toLowerCase().trim()
    return this.toolConfigurations.has(normalizedType)
  }

  /**
   * Ensure the service is initialized and try to initialize if not
   * @returns {Promise<boolean>} True if service is ready
   */
  async ensureInitialized() {
    if (this.isInitialized) {
      return true
    }

    try {
      // Tool configuration service not initialized, attempting initialization
      await this.initializeFromManifests()
      return this.isInitialized
    } catch (error) {
      console.error('Failed to initialize tool configuration service:', error)
      return false
    }
  }

  /**
   * Get tool names for a specific dataset type
   * @param {string} datasetType - The dataset type
   * @returns {Array} Array of tool names
   */
  getToolNamesForDatasetType(datasetType) {
    const config = this.getToolsForDatasetTypeSimple(datasetType)
    if (!config || !config.tools) {
      return []
    }

    return config.tools.map(tool => tool.toolSpec.name)
  }

  /**
   * Get a specific tool definition by name and dataset type
   * @param {string} datasetType - The dataset type
   * @param {string} toolName - The tool name
   * @returns {Object|null} Tool definition or null if not found
   */
  getToolDefinition(datasetType, toolName) {
    const config = this.getToolsForDatasetTypeSimple(datasetType)
    if (!config || !config.tools) {
      return null
    }

    const tool = config.tools.find(t => t.toolSpec.name === toolName)
    return tool ? tool.toolSpec : null
  }

  /**
   * Validate a tool definition structure with comprehensive error reporting
   * @param {Object} toolDef - The tool definition to validate
   * @returns {Object} Validation result with detailed error information
   */
  validateToolDefinition(toolDef) {
    const validation = {
      isValid: false,
      error: null,
      errors: [],
      warnings: [],
      details: {
        structureValid: false,
        propertiesValid: false,
        toolsValid: false,
        toolCount: 0,
        validToolCount: 0
      }
    }

    try {
      // Check if toolDef is an object
      if (!toolDef || typeof toolDef !== 'object') {
        validation.error = 'Tool definition must be an object'
        validation.errors.push('Invalid structure: Expected object, got ' + typeof toolDef)
        return validation
      }

      validation.details.structureValid = true

      // Check required top-level properties
      const requiredProps = ['id', 'version', 'tools']
      const missingProps = []

      for (const prop of requiredProps) {
        if (!toolDef.hasOwnProperty(prop)) {
          missingProps.push(prop)
        }
      }

      if (missingProps.length > 0) {
        validation.error = `Missing required properties: ${missingProps.join(', ')}`
        validation.errors.push(...missingProps.map(prop => `Missing property: ${prop}`))
        return validation
      }

      validation.details.propertiesValid = true
      validation.details.toolCount = toolDef.tools.length

      // Validate each tool in the array
      const toolErrors = []
      let validToolCount = 0

      for (let i = 0; i < toolDef.tools.length; i++) {
        const toolValidation = this.validateSingleTool(toolDef.tools[i], i)
        if (!toolValidation.isValid) {
          toolErrors.push(`Tool ${i + 1}: ${toolValidation.error}`)
        } else {
          validToolCount++
        }
      }

      validation.details.validToolCount = validToolCount

      if (toolErrors.length > 0) {
        validation.error = `Tool validation failed: ${toolErrors.join('; ')}`
        validation.errors.push(...toolErrors)

        // If some tools are valid, add warning instead of failing completely
        if (validToolCount > 0) {
          validation.warnings.push(`${toolErrors.length} tool(s) failed validation, ${validToolCount} tool(s) are valid`)
          validation.details.toolsValid = true
          validation.isValid = true
        }
        return validation
      }

      validation.details.toolsValid = true
      validation.isValid = true
      return validation

    } catch (error) {
      const errorInfo = analyzeError(error, {
        operation: 'validateToolDefinition',
        toolDefType: typeof toolDef
      })

      validation.error = `Validation process failed: ${errorInfo.userMessage}`
      validation.errors.push(`Unexpected error: ${error.message}`)

      handleError(error, {
        context: 'tool_definition_validation',
        operation: 'validateToolDefinition'
      })

      return validation
    }
  }

  /**
   * Validate a single tool definition
   * @param {Object} tool - The tool to validate
   * @param {number} index - The index of the tool in the array (for error messages)
   * @returns {Object} Validation result
   * @private
   */
  validateSingleTool(tool, index) {
    if (!tool || typeof tool !== 'object') {
      return {
        isValid: false,
        error: `Tool at index ${index} must be an object`
      }
    }

    // Check for toolSpec property
    if (!tool.hasOwnProperty('toolSpec')) {
      return {
        isValid: false,
        error: `Tool at index ${index} missing required property: toolSpec`
      }
    }

    const toolSpec = tool.toolSpec
    if (!toolSpec || typeof toolSpec !== 'object') {
      return {
        isValid: false,
        error: `toolSpec at index ${index} must be an object`
      }
    }

    // Validate required toolSpec properties
    const requiredToolSpecProps = ['name', 'description', 'inputSchema']
    for (const prop of requiredToolSpecProps) {
      if (!toolSpec.hasOwnProperty(prop)) {
        return {
          isValid: false,
          error: `Tool at index ${index} missing required toolSpec property: ${prop}`
        }
      }
    }

    // Validate tool name
    if (typeof toolSpec.name !== 'string' || toolSpec.name.trim() === '') {
      return {
        isValid: false,
        error: `Tool name at index ${index} must be a non-empty string`
      }
    }

    // Validate tool description
    if (typeof toolSpec.description !== 'string' || toolSpec.description.trim() === '') {
      return {
        isValid: false,
        error: `Tool description at index ${index} must be a non-empty string`
      }
    }

    return {
      isValid: true,
      error: null
    }
  }

  /**
   * Get comprehensive service status and configuration summary
   * @returns {Object} Detailed service status information
   */
  getStatus() {
    const status = {
      initialized: this.isInitialized,
      configurationCount: this.toolConfigurations.size,
      availableDatasetTypes: Array.from(this.toolConfigurations.keys()),
      totalTools: this.getAllToolConfigurations().reduce(
        (total, config) => total + (config.tools ? config.tools.length : 0),
        0
      ),
      initializationErrors: this.initializationErrors,
      hasErrors: this.initializationErrors.length > 0,
      health: 'healthy'
    }

    // Determine overall health status
    const criticalErrors = this.initializationErrors.filter(err => err.severity === 'critical')
    const highErrors = this.initializationErrors.filter(err => err.severity === 'high')

    if (criticalErrors.length > 0) {
      status.health = 'critical'
    } else if (highErrors.length > 0) {
      status.health = 'degraded'
    } else if (this.initializationErrors.length > 0) {
      status.health = 'warning'
    }

    return status
  }

  /**
   * Get detailed configuration information for debugging
   * @returns {Object} Detailed configuration information
   */
  getDetailedStatus() {
    const configurations = {}

    for (const [datasetType, config] of this.toolConfigurations.entries()) {
      const validation = this.validateToolDefinition(config)
      const cacheEntry = this.manifestCache.get(datasetType)

      configurations[datasetType] = {
        id: config.id,
        version: config.version,
        toolCount: config.tools ? config.tools.length : 0,
        toolNames: config.tools ? config.tools.map(t => t.toolSpec.name) : [],
        isValid: validation.isValid,
        validationErrors: validation.errors || [],
        validationWarnings: validation.warnings || [],
        source: config.metadata?.source || 'unknown',
        loadedFrom: cacheEntry?.type || 'unknown',
        lastModified: cacheEntry?.lastModified || null
      }
    }

    return {
      ...this.getStatus(),
      configurations,
      validationCacheSize: this.validationCache.size,
      manifestCacheSize: this.manifestCache.size,
      hotReloadEnabled: this.hotReloadEnabled,
      lastReloadTime: this.lastReloadTime
    }
  }

  /**
   * Clean up resources (useful for testing or shutdown)
   */
  cleanup() {
    if (this.hotReloadInterval) {
      clearInterval(this.hotReloadInterval)
      this.hotReloadInterval = null
    }

    this.toolConfigurations.clear()
    this.manifestCache.clear()
    this.validationCache.clear()
    this.watchedManifests.clear()
    this.isInitialized = false

    // Tool configuration service cleaned up
  }
}

// Create and export singleton instance
export const toolConfigService = new ToolConfigService()

// Initialize the service from manifests asynchronously
toolConfigService.initializeFromManifests().catch(error => {
  console.error('Failed to initialize tool configuration service from manifests:', error)
})
