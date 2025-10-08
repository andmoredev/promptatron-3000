/**
 * Comprehensive form validation utilities for the Bedrock LLM Analyzer
 */

/**
 * Validation rules for different field types
 */
export const validationRules = {
  model: {
    required: true,
    message: 'Model selection is required'
  },
  systemPrompt: {
    required: false,
    minLength: 0,
    messages: {
      required: 'System prompt is required',
      minLength: 'System prompt cannot be empty'
    }
  },
  userPrompt: {
    required: true,
    minLength: 1,
    messages: {
      required: 'User prompt is required',
      minLength: 'User prompt cannot be empty'
    }
  },
  dataset: {
    required: false,
    messages: {
      typeRequired: 'Dataset selection is required',
      contentRequired: 'Dataset content not loaded'
    }
  },
  scenario: {
    required: false,
    message: 'Scenario selection is optional but recommended for guided workflows'
  }
}

/**
 * Validate a single field based on its type and value
 * @param {string} fieldType - The type of field (model, systemPrompt, userPrompt, dataset)
 * @param {any} value - The value to validate
 * @param {Object} options - Additional validation options
 * @returns {Object} Validation result with isValid and error message
 */
export function validateField(fieldType, value, options = {}) {
  const rules = validationRules[fieldType]
  if (!rules) {
    return { isValid: true, error: null }
  }

  switch (fieldType) {
    case 'model':
      return validateModel(value, rules)
    case 'systemPrompt':
      return validateSystemPrompt(value, rules)
    case 'userPrompt':
      return validateUserPrompt(value, rules)
    case 'dataset':
      return validateDataset(value, rules)
    case 'scenario':
      return validateScenario(value, rules)
    default:
      return { isValid: true, error: null }
  }
}

/**
 * Validate model selection
 * @param {string} value - The selected model ID
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validateModel(value, rules) {
  if (rules.required && (!value || value.trim() === '')) {
    return { isValid: false, error: rules.message }
  }
  return { isValid: true, error: null }
}


/**
 * Validate system prompt text
 * @param {string} value - The system prompt text
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validateSystemPrompt(value, rules) {
  // System prompt is now optional - empty is allowed
  if (rules.required && (!value || value.trim() === '')) {
    return { isValid: false, error: rules.messages.required }
  }

  const trimmedValue = value ? value.trim() : ''

  // Only validate length if there's content
  if (trimmedValue.length > 0) {
    if (rules.minLength && trimmedValue.length < rules.minLength) {
      return { isValid: false, error: rules.messages.minLength }
    }

    // Add warning for very long prompts
    if (trimmedValue.length > 10000) {
      return {
        isValid: true,
        error: null,
        warning: 'System prompt is very long and may affect performance'
      }
    }
  }

  return { isValid: true, error: null }
}

/**
 * Validate user prompt text
 * @param {string} value - The user prompt text
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validateUserPrompt(value, rules) {
  if (rules.required && (!value || value.trim() === '')) {
    return { isValid: false, error: rules.messages.required }
  }

  const trimmedValue = value ? value.trim() : ''

  if (rules.minLength && trimmedValue.length < rules.minLength) {
    return { isValid: false, error: rules.messages.minLength }
  }

  // Add warning for very long prompts
  if (trimmedValue.length > 10000) {
    return {
      isValid: true,
      error: null,
      warning: 'User prompt is very long and may affect performance'
    }
  }

  return { isValid: true, error: null }
}

/**
 * Validate dataset selection
 * @param {Object} value - The dataset object with id, name, and content
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validateDataset(value, rules) {
  if (!value || typeof value !== 'object') {
    return { isValid: false, error: rules.messages.typeRequired }
  }

  if (rules.required) {
    if (!value.id) {
      return { isValid: false, error: rules.messages.typeRequired }
    }

    if (!value.content) {
      return { isValid: false, error: rules.messages.contentRequired }
    }
  }

  return { isValid: true, error: null }
}

/**
 * Validate scenario selection
 * @param {string} value - The selected scenario ID
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validateScenario(value, rules) {
  if (rules.required && (!value || value.trim() === '')) {
    return { isValid: false, error: rules.message }
  }
  return { isValid: true, error: null }
}

/**
 * Validate all form fields at once
 * @param {Object} formData - Object containing all form field values
 * @returns {Object} Validation results for all fields
 */
export function validateForm(formData) {
  const results = {}
  const errors = {}

  // Validate model
  const modelResult = validateField('model', formData.selectedModel)
  results.model = modelResult
  if (!modelResult.isValid) {
    errors.model = modelResult.error
  }

  // Validate system prompt
  const systemPromptResult = validateField('systemPrompt', formData.systemPrompt)
  results.systemPrompt = systemPromptResult
  if (!systemPromptResult.isValid) {
    errors.systemPrompt = systemPromptResult.error
  }

  // Validate user prompt
  const userPromptResult = validateField('userPrompt', formData.userPrompt)
  results.userPrompt = userPromptResult
  if (!userPromptResult.isValid) {
    errors.userPrompt = userPromptResult.error
  }

  // Scenario-aware dataset validation
  if (formData.selectedScenario && formData.scenarioConfig) {
    // Only validate dataset if scenario requires it
    if (formData.scenarioConfig.showDatasetSelector) {
      const datasetResult = validateField('dataset', formData.selectedDataset)
      results.dataset = datasetResult
      if (!datasetResult.isValid) {
        errors.dataset = datasetResult.error
      }
    }
  } else {
    // Fallback to standard dataset validation for non-scenario mode
    const datasetResult = validateField('dataset', formData.selectedDataset)
    results.dataset = datasetResult
    if (!datasetResult.isValid) {
      errors.dataset = datasetResult.error
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    results
  }
}

/**
 * Create validation helpers for form data
 * This utility function provides validation helpers that can be used
 * within React components or other contexts
 * @param {Object} formData - Current form data
 * @param {Array} fieldsToValidate - Array of field names to validate
 * @returns {Object} Validation utilities
 */
export function createFormValidationHelpers(formData, fieldsToValidate = ['model', 'systemPrompt', 'userPrompt', 'dataset']) {
  const validateCurrentForm = () => {
    const errors = {}

    fieldsToValidate.forEach(fieldType => {
      let value
      switch (fieldType) {
        case 'model':
          value = formData.selectedModel
          break
        case 'systemPrompt':
          value = formData.systemPrompt
          break
        case 'userPrompt':
          value = formData.userPrompt
          break
        case 'dataset':
          value = formData.selectedDataset
          break
        default:
          return
      }

      const result = validateField(fieldType, value)
      if (!result.isValid) {
        errors[fieldType] = result.error
      }
    })

    return errors
  }

  const isFieldValid = (fieldName) => {
    const errors = validateCurrentForm()
    return !errors[fieldName]
  }

  const getFieldError = (fieldName) => {
    const errors = validateCurrentForm()
    return errors[fieldName] || null
  }

  const isFormValid = () => {
    const errors = validateCurrentForm()
    return Object.keys(errors).length === 0
  }

  return {
    validateCurrentForm,
    isFieldValid,
    getFieldError,
    isFormValid,
    fieldsToValidate
  }
}

/**
 * Sanitize user input to prevent XSS and other security issues
 * @param {string} input - The input string to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return ''
  }

  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
}

/**
 * Validate AWS model ID format
 * @param {string} modelId - The model ID to validate
 * @returns {Object} Validation result
 */
export function validateModelId(modelId) {
  if (!modelId || typeof modelId !== 'string') {
    return { isValid: false, error: 'Model ID must be a string' }
  }

  // Basic format validation for AWS Bedrock model IDs (allow colons for version numbers)
  const modelIdPattern = /^[a-zA-Z0-9\-_.:]+$/
  if (!modelIdPattern.test(modelId)) {
    return { isValid: false, error: 'Invalid model ID format' }
  }

  // Check for known model prefixes
  const knownPrefixes = ['amazon.', 'anthropic.', 'meta.', 'cohere.', 'ai21.', 'stability.']
  const hasKnownPrefix = knownPrefixes.some(prefix => modelId.startsWith(prefix))

  if (!hasKnownPrefix) {
    return {
      isValid: true,
      warning: 'Model ID does not match known AWS Bedrock model patterns'
    }
  }

  return { isValid: true, error: null }
}

/**
 * Validate prompt configuration (both system and user prompts)
 * @param {string} systemPrompt - The system prompt text (optional)
 * @param {string} userPrompt - The user prompt text (required)
 * @returns {Object} Validation result with specific errors for each prompt type
 */
export function validateDualPrompts(systemPrompt, userPrompt) {
  const errors = {}
  let isValid = true

  // Validate system prompt (now optional)
  const systemResult = validateField('systemPrompt', systemPrompt)
  if (!systemResult.isValid) {
    errors.systemPrompt = systemResult.error
    isValid = false
  }

  // Validate user prompt (still required)
  const userResult = validateField('userPrompt', userPrompt)
  if (!userResult.isValid) {
    errors.userPrompt = userResult.error
    isValid = false
  }

  // Check combined length (optional warning)
  const systemLength = systemPrompt ? systemPrompt.trim().length : 0
  const userLength = userPrompt ? userPrompt.trim().length : 0
  const combinedLength = systemLength + userLength

  const warnings = {}
  if (combinedLength > 15000) {
    warnings.combinedLength = 'Combined prompt length is very long and may affect performance'
  }

  return {
    isValid,
    errors,
    warnings: Object.keys(warnings).length > 0 ? warnings : null
  }
}

/**
 * Validate dataset content format
 * @param {string} content - The dataset content to validate
 * @param {string} fileType - The file type (json, csv, etc.)
 * @returns {Object} Validation result
 */
export function validateDatasetContent(content, fileType) {
  if (!content || typeof content !== 'string') {
    return { isValid: false, error: 'Dataset content must be a string' }
  }

  if (content.trim().length === 0) {
    return { isValid: false, error: 'Dataset content cannot be empty' }
  }

  // Validate based on file type
  switch (fileType?.toLowerCase()) {
    case 'json':
      try {
        JSON.parse(content)
        return { isValid: true, error: null }
      } catch (e) {
        return { isValid: false, error: 'Invalid JSON format' }
      }

    case 'csv':
      // Basic CSV validation - check for at least one line with content
      const lines = content.split('\n').filter(line => line.trim().length > 0)
      if (lines.length === 0) {
        return { isValid: false, error: 'CSV file appears to be empty' }
      }
      return { isValid: true, error: null }

    default:
      // For unknown file types, just check that content exists
      return { isValid: true, error: null }
  }
}
