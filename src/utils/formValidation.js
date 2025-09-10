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
  prompt: {
    required: true,
    minLength: 10,
    maxLength: 10000,
    messages: {
      required: 'Prompt is required',
      minLength: 'Prompt must be at least 10 characters long',
      maxLength: 'Prompt must be less than 10,000 characters'
    }
  },
  dataset: {
    required: true,
    messages: {
      typeRequired: 'Dataset type selection is required',
      optionRequired: 'Dataset file selection is required',
      contentRequired: 'Dataset content not loaded'
    }
  }
}

/**
 * Validate a single field based on its type and value
 * @param {string} fieldType - The type of field (model, prompt, dataset)
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
    case 'prompt':
      return validatePrompt(value, rules)
    case 'dataset':
      return validateDataset(value, rules)
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
 * Validate prompt text
 * @param {string} value - The prompt text
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validatePrompt(value, rules) {
  if (rules.required && (!value || value.trim() === '')) {
    return { isValid: false, error: rules.messages.required }
  }

  const trimmedValue = value ? value.trim() : ''

  if (rules.minLength && trimmedValue.length < rules.minLength) {
    return { isValid: false, error: rules.messages.minLength }
  }

  if (rules.maxLength && trimmedValue.length > rules.maxLength) {
    return { isValid: false, error: rules.messages.maxLength }
  }

  return { isValid: true, error: null }
}

/**
 * Validate dataset selection
 * @param {Object} value - The dataset object with type, option, and content
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validateDataset(value, rules) {
  if (!value || typeof value !== 'object') {
    return { isValid: false, error: rules.messages.typeRequired }
  }

  if (rules.required) {
    if (!value.type) {
      return { isValid: false, error: rules.messages.typeRequired }
    }

    if (!value.option) {
      return { isValid: false, error: rules.messages.optionRequired }
    }

    if (!value.content) {
      return { isValid: false, error: rules.messages.contentRequired }
    }
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

  // Validate prompt
  const promptResult = validateField('prompt', formData.prompt)
  results.prompt = promptResult
  if (!promptResult.isValid) {
    errors.prompt = promptResult.error
  }

  // Validate dataset
  const datasetResult = validateField('dataset', formData.selectedDataset)
  results.dataset = datasetResult
  if (!datasetResult.isValid) {
    errors.dataset = datasetResult.error
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    results
  }
}

/**
 * Real-time validation hook for React components
 * @param {Object} formData - Current form data
 * @param {Array} fieldsToValidate - Array of field names to validate
 * @returns {Object} Validation state and helper functions
 */
export function useFormValidation(formData, fieldsToValidate = ['model', 'prompt', 'dataset']) {
  const [validationErrors, setValidationErrors] = React.useState({})
  const [touched, setTouched] = React.useState({})

  React.useEffect(() => {
    const errors = {}

    fieldsToValidate.forEach(fieldType => {
      let value
      switch (fieldType) {
        case 'model':
          value = formData.selectedModel
          break
        case 'prompt':
          value = formData.prompt
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

    setValidationErrors(errors)
  }, [formData, fieldsToValidate])

  const markFieldAsTouched = (fieldName) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }))
  }

  const isFieldValid = (fieldName) => {
    return !validationErrors[fieldName]
  }

  const getFieldError = (fieldName) => {
    return touched[fieldName] ? validationErrors[fieldName] : null
  }

  const isFormValid = () => {
    return Object.keys(validationErrors).length === 0
  }

  return {
    validationErrors,
    touched,
    markFieldAsTouched,
    isFieldValid,
    getFieldError,
    isFormValid
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

  // Basic format validation for AWS Bedrock model IDs
  const modelIdPattern = /^[a-zA-Z0-9\-_.]+$/
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