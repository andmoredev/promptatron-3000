/**
 * Tool configuration data structures and utilities
 * Provides standardized structures for tool definitions and validation
 */

/**
 * Standard tool configuration structure template
 */
export const TOOL_CONFIG_TEMPLATE = {
  id: '',
  datasetType: '',
  version: '1.0',
  tools: []
}

/**
 * Standard tool specification template
 */
export const TOOL_SPEC_TEMPLATE = {
  toolSpec: {
    name: '',
    description: '',
    inputSchema: {
      json: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
}

/**
 * Common JSON schema property types for tool parameters
 */
export const SCHEMA_PROPERTY_TYPES = {
  STRING: {
    type: 'string',
    description: ''
  },
  STRING_ARRAY: {
    type: 'array',
    items: { type: 'string' },
    description: ''
  },
  NUMBER: {
    type: 'number',
    description: ''
  },
  BOOLEAN: {
    type: 'boolean',
    description: ''
  },
  OBJECT: {
    type: 'object',
    description: ''
  }
}

/**
 * Predefined tool configurations for known dataset types
 */
export const PREDEFINED_TOOL_CONFIGS = {
  'fraud-detection': {
    id: 'fraud-detection-tools',
    datasetType: 'fraud-detection',
    version: '1.0',
    tools: [
      {
        toolSpec: {
          name: 'freeze_account',
          description: 'Put a freeze on a specific account and mark why it was frozen',
          inputSchema: {
            json: {
              type: 'object',
              properties: {
                account_id: {
                  type: 'string',
                  description: 'The account ID to freeze'
                },
                transaction_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of transaction IDs that led to this decision'
                },
                reason: {
                  type: 'string',
                  description: 'Detailed reason for freezing the account'
                }
              },
              required: ['account_id', 'transaction_ids', 'reason']
            }
          }
        }
      }
    ]
  }
}

/**
 * Tool usage data structure for capturing model tool usage attempts
 */
export const TOOL_USAGE_TEMPLATE = {
  hasToolUsage: false,
  toolCalls: [],
  toolCallCount: 0,
  conversationIterations: 1,
  availableTools: []
}

/**
 * Individual tool call data structure
 */
export const TOOL_CALL_TEMPLATE = {
  toolName: '',
  toolUseId: '',
  input: {},
  iteration: 1,
  timestamp: '',
  simulatedResult: null
}

/**
 * Tool result data structure for simulated tool execution
 */
export const TOOL_RESULT_TEMPLATE = {
  success: false,
  message: '',
  data: null,
  timestamp: ''
}

/**
 * Create a new tool configuration from template
 * @param {string} id - Configuration ID
 * @param {string} datasetType - Dataset type
 * @param {string} version - Configuration version
 * @returns {Object} New tool configuration object
 */
export function createToolConfig(id, datasetType, version = '1.0') {
  return {
    ...TOOL_CONFIG_TEMPLATE,
    id,
    datasetType,
    version,
    tools: []
  }
}

/**
 * Create a new tool specification from template
 * @param {string} name - Tool name
 * @param {string} description - Tool description
 * @param {Object} properties - JSON schema properties
 * @param {Array} required - Required field names
 * @returns {Object} New tool specification object
 */
export function createToolSpec(name, description, properties = {}, required = []) {
  return {
    toolSpec: {
      name,
      description,
      inputSchema: {
        json: {
          type: 'object',
          properties,
          required
        }
      }
    }
  }
}

/**
 * Create a tool usage data structure
 * @param {Array} availableTools - Array of available tool names
 * @returns {Object} Tool usage data structure
 */
export function createToolUsage(availableTools = []) {
  return {
    ...TOOL_USAGE_TEMPLATE,
    availableTools: [...availableTools]
  }
}

/**
 * Create a tool call record
 * @param {string} toolName - Name of the tool called
 * @param {string} toolUseId - Unique ID for this tool use
 * @param {Object} input - Input parameters passed to the tool
 * @param {number} iteration - Conversation iteration number
 * @returns {Object} Tool call record
 */
export function createToolCall(toolName, toolUseId, input, iteration = 1) {
  return {
    ...TOOL_CALL_TEMPLATE,
    toolName,
    toolUseId,
    input: { ...input },
    iteration,
    timestamp: new Date().toISOString()
  }
}

/**
 * Create a tool result record
 * @param {boolean} success - Whether the tool execution was successful
 * @param {string} message - Result message
 * @param {any} data - Result data (optional)
 * @returns {Object} Tool result record
 */
export function createToolResult(success, message, data = null) {
  return {
    ...TOOL_RESULT_TEMPLATE,
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  }
}

/**
 * Validate tool configuration structure (basic structure check)
 * @param {Object} config - Tool configuration to validate
 * @returns {Object} Validation result
 */
export function validateToolConfigStructure(config) {
  if (!config || typeof config !== 'object') {
    return {
      isValid: false,
      error: 'Configuration must be an object'
    }
  }

  const requiredFields = ['id', 'datasetType', 'version', 'tools']
  for (const field of requiredFields) {
    if (!config.hasOwnProperty(field)) {
      return {
        isValid: false,
        error: `Missing required field: ${field}`
      }
    }
  }

  if (!Array.isArray(config.tools)) {
    return {
      isValid: false,
      error: 'Tools must be an array'
    }
  }

  return {
    isValid: true,
    error: null
  }
}

/**
 * Validate tool usage data structure
 * @param {Object} toolUsage - Tool usage data to validate
 * @returns {Object} Validation result
 */
export function validateToolUsageStructure(toolUsage) {
  if (!toolUsage || typeof toolUsage !== 'object') {
    return {
      isValid: false,
      error: 'Tool usage must be an object'
    }
  }

  const requiredFields = ['hasToolUsage', 'toolCalls', 'toolCallCount', 'conversationIterations', 'availableTools']
  for (const field of requiredFields) {
    if (!toolUsage.hasOwnProperty(field)) {
      return {
        isValid: false,
        error: `Missing required field: ${field}`
      }
    }
  }

  if (!Array.isArray(toolUsage.toolCalls)) {
    return {
      isValid: false,
      error: 'toolCalls must be an array'
    }
  }

  if (!Array.isArray(toolUsage.availableTools)) {
    return {
      isValid: false,
      error: 'availableTools must be an array'
    }
  }

  if (typeof toolUsage.hasToolUsage !== 'boolean') {
    return {
      isValid: false,
      error: 'hasToolUsage must be a boolean'
    }
  }

  if (typeof toolUsage.toolCallCount !== 'number') {
    return {
      isValid: false,
      error: 'toolCallCount must be a number'
    }
  }

  if (typeof toolUsage.conversationIterations !== 'number') {
    return {
      isValid: false,
      error: 'conversationIterations must be a number'
    }
  }

  return {
    isValid: true,
    error: null
  }
}

/**
 * Get tool configuration for a dataset type from predefined configs
 * @param {string} datasetType - The dataset type
 * @returns {Object|null} Tool configuration or null if not found
 */
export function getPredefinedToolConfig(datasetType) {
  if (!datasetType || typeof datasetType !== 'string') {
    return null
  }

  return PREDEFINED_TOOL_CONFIGS[datasetType.toLowerCase()] || null
}

/**
 * Get all available predefined dataset types that have tool configurations
 * @returns {Array} Array of dataset type names
 */
export function getAvailableDatasetTypes() {
  return Object.keys(PREDEFINED_TOOL_CONFIGS)
}

/**
 * Check if a dataset type has predefined tool configuration
 * @param {string} datasetType - The dataset type to check
 * @returns {boolean} True if predefined configuration exists
 */
export function hasPredefinedToolConfig(datasetType) {
  if (!datasetType || typeof datasetType !== 'string') {
    return false
  }

  return PREDEFINED_TOOL_CONFIGS.hasOwnProperty(datasetType.toLowerCase())
}
