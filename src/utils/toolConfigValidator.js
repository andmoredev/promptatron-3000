/**
 * Utility for validating tool configurations
 * Can be used standalone or integrated with the tool configuration service
 */

/**
 * Validate a tooluration file
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result with detailed feedback
 */
export function validateToolConfiguration(config) {
  const result = {
    isValid: false,
    errors: [],
    warnings: [],
    suggestions: [],
    details: {
      hasRequiredFields: false,
      toolCount: 0,
      validToolCount: 0,
      schemaCompliant: false
    }
  }

  try {
    // Check if config is an object
    if (!config || typeof config !== 'object') {
      result.errors.push('Configuration must be a valid JSON object')
      return result
    }

    // Check required top-level fields
    // Note: datasetType is optional for shared configurations
    const requiredFields = ['id', 'version', 'tools']
    const missingFields = requiredFields.filter(field => !config.hasOwnProperty(field))

    if (missingFields.length > 0) {
      result.errors.push(`Missing required fields: ${missingFields.join(', ')}`)
    } else {
      result.details.hasRequiredFields = true
    }

    // Check for datasetType (warn if missing, but don't fail for shared configs)
    if (!config.datasetType) {
      result.warnings.push('Missing "datasetType" field - this is required for dataset-specific configurations but optional for shared configurations')
    }

    // Validate field types and formats
    if (config.id && typeof config.id !== 'string') {
      result.errors.push('Field "id" must be a string')
    }

    if (config.datasetType && typeof config.datasetType !== 'string') {
      result.errors.push('Field "datasetType" must be a string')
    }

    if (config.version) {
      if (typeof config.version !== 'string') {
        result.errors.push('Field "version" must be a string')
      } else if (!/^\d+\.\d+(\.\d+)?$/.test(config.version)) {
        result.errors.push('Field "version" must follow semantic versioning (e.g., "1.0" or "1.0.0")')
        result.suggestions.push('Use semantic versioning like "1.0.0" for better version tracking')
      }
    }

    // Validate tools array
    if (config.tools) {
      if (!Array.isArray(config.tools)) {
        result.errors.push('Field "tools" must be an array')
      } else {
        result.details.toolCount = config.tools.length

        if (config.tools.length === 0) {
          result.warnings.push('Tools array is empty - no tools will be available')
        }

        // Validate each tool
        let validToolCount = 0
        config.tools.forEach((tool, index) => {
          const toolValidation = validateSingleTool(tool, index)
          if (toolValidation.isValid) {
            validToolCount++
          } else {
            result.errors.push(...toolValidation.errors)
            result.warnings.push(...toolValidation.warnings)
          }
        })

        result.details.validToolCount = validToolCount
      }
    }

    // Check for recommended optional fields
    if (!config.description) {
      result.suggestions.push('Consider adding a "description" field to document the purpose of these tools')
    }

    if (!config.metadata) {
      result.suggestions.push('Consider adding "metadata" with author, created date, and tags for better documentation')
    }

    // Overall validation
    result.details.schemaCompliant = result.errors.length === 0
    result.isValid = result.errors.length === 0

    return result

  } catch (error) {
    result.errors.push(`Validation failed: ${error.message}`)
    return result
  }
}

/**
 * Validate a single tool specification
 * @param {Object} tool - Tool object to validate
 * @param {number} index - Index of the tool in the array
 * @returns {Object} Validation result for the tool
 */
function validateSingleTool(tool, index) {
  const result = {
    isValid: false,
    errors: [],
    warnings: []
  }

  if (!tool || typeof tool !== 'object') {
    result.errors.push(`Tool at index ${index} must be an object`)
    return result
  }

  // Check for toolSpec
  if (!tool.toolSpec) {
    result.errors.push(`Tool at index ${index} missing required field: toolSpec`)
    return result
  }

  const toolSpec = tool.toolSpec
  if (!toolSpec || typeof toolSpec !== 'object') {
    result.errors.push(`Tool at index ${index} toolSpec must be an object`)
    return result
  }

  // Validate required toolSpec fields
  const requiredFields = ['name', 'description', 'inputSchema']
  const missingFields = requiredFields.filter(field => !toolSpec.hasOwnProperty(field))

  if (missingFields.length > 0) {
    result.errors.push(`Tool at index ${index} missing required toolSpec fields: ${missingFields.join(', ')}`)
  }

  // Validate tool name
  if (toolSpec.name) {
    if (typeof toolSpec.name !== 'string') {
      result.errors.push(`Tool at index ${index} name must be a string`)
    } else {
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(toolSpec.name)) {
        result.errors.push(`Tool name "${toolSpec.name}" must start with a letter and contain only letters, numbers, and underscores`)
      }
      if (toolSpec.name.length > 50) {
        result.warnings.push(`Tool name "${toolSpec.name}" is quite long (${toolSpec.name.length} characters)`)
      }
    }
  }

  // Validate description
  if (toolSpec.description) {
    if (typeof toolSpec.description !== 'string') {
      result.errors.push(`Tool at index ${index} description must be a string`)
    } else {
      if (toolSpec.description.length < 10) {
        result.warnings.push(`Tool "${toolSpec.name}" description is very short (${toolSpec.description.length} characters)`)
      }
      if (toolSpec.description.length > 500) {
        result.warnings.push(`Tool "${toolSpec.name}" description is very long (${toolSpec.description.length} characters)`)
      }
    }
  }

  // Validate inputSchema
  if (toolSpec.inputSchema) {
    const schemaValidation = validateInputSchema(toolSpec.inputSchema, toolSpec.name, index)
    result.errors.push(...schemaValidation.errors)
    result.warnings.push(...schemaValidation.warnings)
  }

  result.isValid = result.errors.length === 0
  return result
}

/**
 * Validate input schema for a tool
 * @param {Object} inputSchema - Input schema to validate
 * @param {string} toolName - Name of the tool (for error messages)
 * @param {number} toolIndex - Index of the tool (for error messages)
 * @returns {Object} Validation result for the schema
 */
function validateInputSchema(inputSchema, toolName, toolIndex) {
  const result = {
    errors: [],
    warnings: []
  }

  if (!inputSchema || typeof inputSchema !== 'object') {
    result.errors.push(`Tool "${toolName}" inputSchema must be an object`)
    return result
  }

  // Check for json property
  if (!inputSchema.json) {
    result.errors.push(`Tool "${toolName}" inputSchema missing required field: json`)
    return result
  }

  const jsonSchema = inputSchema.json
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    result.errors.push(`Tool "${toolName}" inputSchema.json must be an object`)
    return result
  }

  // Validate JSON schema structure
  if (jsonSchema.type !== 'object') {
    result.errors.push(`Tool "${toolName}" inputSchema.json.type must be "object"`)
  }

  if (!jsonSchema.properties) {
    result.errors.push(`Tool "${toolName}" inputSchema.json missing "properties" field`)
  } else if (typeof jsonSchema.properties !== 'object') {
    result.errors.push(`Tool "${toolName}" inputSchema.json.properties must be an object`)
  } else {
    // Validate properties
    const propertyCount = Object.keys(jsonSchema.properties).length
    if (propertyCount === 0) {
      result.warnings.push(`Tool "${toolName}" has no input properties defined`)
    }

    // Validate each property
    for (const [propName, propDef] of Object.entries(jsonSchema.properties)) {
      if (!propDef || typeof propDef !== 'object') {
        result.errors.push(`Tool "${toolName}" property "${propName}" must be an object`)
        continue
      }

      if (!propDef.type) {
        result.errors.push(`Tool "${toolName}" property "${propName}" missing type`)
      }

      if (!propDef.description) {
        result.warnings.push(`Tool "${toolName}" property "${propName}" missing description`)
      }

      // Validate array properties
      if (propDef.type === 'array' && !propDef.items) {
        result.errors.push(`Tool "${toolName}" array property "${propName}" missing items definition`)
      }

      // Check for enum validation
      if (propDef.enum && !Array.isArray(propDef.enum)) {
        result.errors.push(`Tool "${toolName}" property "${propName}" enum must be an array`)
      }
    }
  }

  // Check required fields
  if (jsonSchema.required) {
    if (!Array.isArray(jsonSchema.required)) {
      result.errors.push(`Tool "${toolName}" inputSchema.json.required must be an array`)
    } else {
      // Check that all required fields exist in properties
      const propertyNames = jsonSchema.properties ? Object.keys(jsonSchema.properties) : []
      const invalidRequired = jsonSchema.required.filter(field => !propertyNames.includes(field))

      if (invalidRequired.length > 0) {
        result.errors.push(`Tool "${toolName}" required fields not defined in properties: ${invalidRequired.join(', ')}`)
      }
    }
  }

  return result
}

/**
 * Generate a validation report in human-readable format
 * @param {Object} validationResult - Result from validateToolConfiguration
 * @returns {string} Formatted validation report
 */
export function generateValidationReport(validationResult) {
  const lines = []

  lines.push('=== Tool Configuration Validation Report ===')
  lines.push('')

  // Overall status
  if (validationResult.isValid) {
    lines.push('✅ Configuration is VALID')
  } else {
    lines.push('❌ Configuration has ERRORS')
  }

  lines.push('')

  // Details
  if (validationResult.details) {
    lines.push('📊 Configuration Details:')
    lines.push(`   • Required fields: ${validationResult.details.hasRequiredFields ? '✅' : '❌'}`)
    lines.push(`   • Schema compliant: ${validationResult.details.schemaCompliant ? '✅' : '❌'}`)
    lines.push(`   • Total tools: ${validationResult.details.toolCount}`)
    lines.push(`   • Valid tools: ${validationResult.details.validToolCount}`)
    lines.push('')
  }

  // Errors
  if (validationResult.errors.length > 0) {
    lines.push('🚨 Errors (must be fixed):')
    validationResult.errors.forEach(error => {
      lines.push(`   • ${error}`)
    })
    lines.push('')
  }

  // Warnings
  if (validationResult.warnings.length > 0) {
    lines.push('⚠️  Warnings (should be addressed):')
    validationResult.warnings.forEach(warning => {
      lines.push(`   • ${warning}`)
    })
    lines.push('')
  }

  // Suggestions
  if (validationResult.suggestions.length > 0) {
    lines.push('💡 Suggestions (recommended improvements):')
    validationResult.suggestions.forEach(suggestion => {
      lines.push(`   • ${suggestion}`)
    })
    lines.push('')
  }

  lines.push('=== End of Report ===')

  return lines.join('\n')
}

/**
 * Validate a tool configuration file from JSON string
 * @param {string} jsonString - JSON string to validate
 * @returns {Object} Validation result
 */
export function validateToolConfigurationFromJSON(jsonString) {
  try {
    const config = JSON.parse(jsonString)
    return validateToolConfiguration(config)
  } catch (error) {
    return {
      isValid: false,
      errors: [`Invalid JSON: ${error.message}`],
      warnings: [],
      suggestions: ['Ensure the file contains valid JSON syntax'],
      details: {
        hasRequiredFields: false,
        toolCount: 0,
        validToolCount: 0,
        schemaCompliant: false
      }
    }
  }
}

/**
 * Quick validation check for development
 * @param {Object} config - Configuration to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidToolConfiguration(config) {
  const result = validateToolConfiguration(config)
  return result.isValid
}
