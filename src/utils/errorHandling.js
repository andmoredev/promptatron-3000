/**
 * Comprehensive error handling utilities for the Bedrock LLM Analyzer
 */

/**
 * Error types for categorization
 */
export const ErrorTypes = {
  NETWORK: 'network',
  AWS_CREDENTIALS: 'aws_credentials',
  AWS_PERMISSIONS: 'aws_permissions',
  AWS_SERVICE: 'aws_service',
  STREAMING: 'streaming',
  STREAMING_TIMEOUT: 'streaming_timeout',
  STREAMING_INTERRUPTED: 'streaming_interrupted',
  MODEL_COMPATIBILITY: 'model_compatibility',
  VALIDATION: 'validation',
  FILE_SYSTEM: 'file_system',
  BROWSER_COMPATIBILITY: 'browser_compatibility',
  UNKNOWN: 'unknown'
}

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
}

/**
 * Analyze an error and return structured error information
 * @param {Error|string} error - The error to analyze
 * @param {Object} context - Additional context about where the error occurred
 * @returns {Object} Structured error information
 */
export function analyzeError(error, context = {}) {
  const errorMessage = typeof error === 'string' ? error : error?.message || 'Unknown error'
  const errorCode = error?.code || error?.name || 'UNKNOWN_ERROR'
  const errorStack = error?.stack

  // Determine error type and severity
  const { type, severity } = categorizeError(errorMessage, errorCode)

  // Generate user-friendly message
  const userMessage = generateUserFriendlyMessage(type, errorMessage, errorCode)

  // Generate suggested actions
  const suggestedActions = generateSuggestedActions(type, errorCode, context)

  return {
    type,
    severity,
    originalMessage: errorMessage,
    userMessage,
    errorCode,
    suggestedActions,
    context,
    timestamp: new Date().toISOString(),
    stack: errorStack,
    id: generateErrorId()
  }
}

/**
 * Categorize error by type and severity
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @returns {Object} Error type and severity
 */
function categorizeError(message, code) {
  const lowerMessage = message.toLowerCase()
  const lowerCode = code.toLowerCase()

  // Network errors
  if (lowerMessage.includes('network') ||
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('enotfound') ||
      lowerMessage.includes('timeout') ||
      lowerCode.includes('network')) {
    return { type: ErrorTypes.NETWORK, severity: ErrorSeverity.MEDIUM }
  }

  // AWS Credential errors
  if (lowerMessage.includes('credentials') ||
      lowerMessage.includes('access key') ||
      lowerMessage.includes('secret key') ||
      lowerCode.includes('credentials')) {
    return { type: ErrorTypes.AWS_CREDENTIALS, severity: ErrorSeverity.HIGH }
  }

  // AWS Permission errors
  if (lowerMessage.includes('access denied') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('forbidden') ||
      lowerCode.includes('accessdenied') ||
      lowerCode.includes('unauthorized')) {
    return { type: ErrorTypes.AWS_PERMISSIONS, severity: ErrorSeverity.HIGH }
  }

  // Streaming-specific errors
  if (lowerMessage.includes('stream timeout') ||
      lowerMessage.includes('no tokens received')) {
    return { type: ErrorTypes.STREAMING_TIMEOUT, severity: ErrorSeverity.MEDIUM }
  }

  if (lowerMessage.includes('connection interrupted') ||
      lowerMessage.includes('stream interrupted') ||
      lowerMessage.includes('streaming failed')) {
    return { type: ErrorTypes.STREAMING_INTERRUPTED, severity: ErrorSeverity.MEDIUM }
  }

  if (lowerMessage.includes('streaming not supported') ||
      lowerMessage.includes('model doesn\'t support streaming') ||
      lowerMessage.includes('model compatibility')) {
    return { type: ErrorTypes.MODEL_COMPATIBILITY, severity: ErrorSeverity.LOW }
  }

  if (lowerMessage.includes('stream') ||
      lowerMessage.includes('streaming') ||
      lowerMessage.includes('parse stream event')) {
    return { type: ErrorTypes.STREAMING, severity: ErrorSeverity.MEDIUM }
  }

  // AWS Service errors
  if (lowerMessage.includes('bedrock') ||
      lowerMessage.includes('throttling') ||
      lowerMessage.includes('service unavailable') ||
      lowerMessage.includes('model not ready') ||
      lowerCode.includes('throttling') ||
      lowerCode.includes('serviceunavailable')) {
    return { type: ErrorTypes.AWS_SERVICE, severity: ErrorSeverity.MEDIUM }
  }

  // Validation errors
  if (lowerMessage.includes('validation') ||
      lowerMessage.includes('invalid') ||
      lowerMessage.includes('required') ||
      lowerCode.includes('validation')) {
    return { type: ErrorTypes.VALIDATION, severity: ErrorSeverity.LOW }
  }

  // File system errors
  if (lowerMessage.includes('file') ||
      lowerMessage.includes('storage') ||
      lowerMessage.includes('quota') ||
      lowerMessage.includes('localstorage')) {
    return { type: ErrorTypes.FILE_SYSTEM, severity: ErrorSeverity.MEDIUM }
  }

  // Browser compatibility errors
  if (lowerMessage.includes('browser') ||
      lowerMessage.includes('compatibility') ||
      lowerMessage.includes('not supported')) {
    return { type: ErrorTypes.BROWSER_COMPATIBILITY, severity: ErrorSeverity.MEDIUM }
  }

  return { type: ErrorTypes.UNKNOWN, severity: ErrorSeverity.MEDIUM }
}

/**
 * Generate user-friendly error message
 * @param {string} type - Error type
 * @param {string} originalMessage - Original error message
 * @param {string} errorCode - Error code
 * @returns {string} User-friendly message
 */
function generateUserFriendlyMessage(type, originalMessage, errorCode) {
  switch (type) {
    case ErrorTypes.NETWORK:
      return 'Network connection issue. Please check your internet connection and try again.'

    case ErrorTypes.AWS_CREDENTIALS:
      return 'AWS credentials are missing or invalid. Please configure your AWS credentials.'

    case ErrorTypes.AWS_PERMISSIONS:
      return 'Access denied. Your AWS credentials do not have the required permissions for Amazon Bedrock.'

    case ErrorTypes.STREAMING_TIMEOUT:
      return 'Streaming response timed out. The partial response has been preserved and the system will use standard mode for future requests.'

    case ErrorTypes.STREAMING_INTERRUPTED:
      return 'Streaming was interrupted due to connection issues. The partial response has been preserved and the system switched to standard mode.'

    case ErrorTypes.MODEL_COMPATIBILITY:
      return 'The selected model does not support streaming. The system will use standard (non-streaming) mode instead.'

    case ErrorTypes.STREAMING:
      return 'Streaming encountered an issue. The system has switched to standard mode to complete your request.'

    case ErrorTypes.AWS_SERVICE:
      if (originalMessage.includes('throttling')) {
        return 'Request rate limit exceeded. Please wait a moment and try again.'
      }
      if (originalMessage.includes('model not ready')) {
        return 'The selected model is currently unavailable. Please try a different model.'
      }
      return 'AWS Bedrock service issue. Please try again in a few moments.'

    case ErrorTypes.VALIDATION:
      return `Input validation failed: ${originalMessage}`

    case ErrorTypes.FILE_SYSTEM:
      if (originalMessage.includes('quota')) {
        return 'Browser storage is full. Please clear some data or use a different browser.'
      }
      return 'File system access issue. Some features may not work properly.'

    case ErrorTypes.BROWSER_COMPATIBILITY:
      return 'Your browser does not support some required features. Please use a modern browser.'

    default:
      return originalMessage || 'An unexpected error occurred. Please try again.'
  }
}

/**
 * Generate suggested actions based on error type
 * @param {string} type - Error type
 * @param {string} errorCode - Error code
 * @param {Object} context - Error context
 * @returns {Array} Array of suggested actions
 */
function generateSuggestedActions(type, errorCode, context) {
  const actions = []

  switch (type) {
    case ErrorTypes.NETWORK:
      actions.push('Check your internet connection')
      actions.push('Try refreshing the page')
      actions.push('Disable VPN if you are using one')
      actions.push('Try again in a few minutes')
      break

    case ErrorTypes.AWS_CREDENTIALS:
      actions.push('Run the local-setup.sh script to configure AWS SSO')
      actions.push('Create a .env.local file with VITE_AWS_* variables')
      actions.push('Check that your AWS credentials are valid')
      actions.push('Ensure you have configured the correct AWS region')
      break

    case ErrorTypes.AWS_PERMISSIONS:
      actions.push('Verify your AWS account has access to Amazon Bedrock')
      actions.push('Check your IAM permissions for Bedrock services')
      actions.push('Ensure Bedrock is enabled in your AWS account')
      actions.push('Try using a different AWS region (us-east-1 or us-west-2)')
      break

    case ErrorTypes.STREAMING_TIMEOUT:
      actions.push('Check your internet connection stability')
      actions.push('Try using a shorter prompt to reduce response time')
      actions.push('The system will automatically use standard mode for future requests')
      actions.push('Refresh the page if issues persist')
      break

    case ErrorTypes.STREAMING_INTERRUPTED:
      actions.push('Check your network connection')
      actions.push('Try again - the system will automatically retry')
      actions.push('Consider using a more stable internet connection')
      actions.push('The partial response has been preserved')
      break

    case ErrorTypes.MODEL_COMPATIBILITY:
      actions.push('This is expected behavior - not all models support streaming')
      actions.push('The system will automatically use standard mode')
      actions.push('Try selecting a different model if you prefer streaming')
      actions.push('No action needed - your request will still be processed')
      break

    case ErrorTypes.STREAMING:
      actions.push('Try refreshing the page and running the test again')
      actions.push('Check your internet connection')
      actions.push('The system will automatically fall back to standard mode')
      actions.push('Contact support if this issue persists')
      break

    case ErrorTypes.AWS_SERVICE:
      actions.push('Wait a few minutes and try again')
      actions.push('Try selecting a different model')
      actions.push('Check AWS service status page')
      actions.push('Reduce the size of your prompt or dataset')
      break

    case ErrorTypes.VALIDATION:
      actions.push('Check that all required fields are filled')
      actions.push('Verify your input meets the specified requirements')
      actions.push('Try using a shorter prompt or smaller dataset')
      break

    case ErrorTypes.FILE_SYSTEM:
      actions.push('Clear browser cache and cookies')
      actions.push('Free up browser storage space')
      actions.push('Try using a different browser')
      actions.push('Use incognito/private browsing mode')
      break

    case ErrorTypes.BROWSER_COMPATIBILITY:
      actions.push('Update your browser to the latest version')
      actions.push('Try using Chrome, Firefox, Safari, or Edge')
      actions.push('Enable JavaScript if it is disabled')
      actions.push('Disable browser extensions that might interfere')
      break

    default:
      actions.push('Try refreshing the page')
      actions.push('Clear browser cache and cookies')
      actions.push('Try using a different browser')
      actions.push('Check browser console for additional details')
      break
  }

  return actions
}

/**
 * Generate unique error ID
 * @returns {string} Unique error ID
 */
function generateErrorId() {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Log error to console with structured format
 * @param {Object} errorInfo - Structured error information
 */
export function logError(errorInfo) {
  console.group(`🚨 Error [${errorInfo.severity.toUpperCase()}] - ${errorInfo.type}`)
  console.error('Message:', errorInfo.userMessage)
  console.error('Original:', errorInfo.originalMessage)
  console.error('Code:', errorInfo.errorCode)
  console.error('ID:', errorInfo.id)
  console.error('Timestamp:', errorInfo.timestamp)

  if (errorInfo.context && Object.keys(errorInfo.context).length > 0) {
    console.error('Context:', errorInfo.context)
  }

  if (errorInfo.stack) {
    console.error('Stack:', errorInfo.stack)
  }

  // Suggested actions available in error info

  console.groupEnd()
}

/**
 * Create error report for external logging service
 * @param {Object} errorInfo - Structured error information
 * @returns {Object} Error report object
 */
export function createErrorReport(errorInfo) {
  return {
    id: errorInfo.id,
    type: errorInfo.type,
    severity: errorInfo.severity,
    message: errorInfo.originalMessage,
    userMessage: errorInfo.userMessage,
    errorCode: errorInfo.errorCode,
    timestamp: errorInfo.timestamp,
    context: errorInfo.context,
    userAgent: navigator.userAgent,
    url: window.location.href,
    stack: errorInfo.stack
  }
}

/**
 * Handle error with comprehensive logging and user notification
 * @param {Error|string} error - The error to handle
 * @param {Object} context - Additional context
 * @param {Function} onError - Callback function to handle the error in UI
 */
export function handleError(error, context = {}, onError = null) {
  const errorInfo = analyzeError(error, context)

  // Log error to console
  logError(errorInfo)

  // Store error report locally for debugging
  try {
    const errorReport = createErrorReport(errorInfo)
    const existingReports = JSON.parse(localStorage.getItem('error-reports') || '[]')
    existingReports.unshift(errorReport)
    localStorage.setItem('error-reports', JSON.stringify(existingReports.slice(0, 20)))
  } catch (storageError) {
    console.warn('Failed to store error report:', storageError)
  }

  // Call error handler if provided
  if (onError && typeof onError === 'function') {
    onError(errorInfo)
  }

  return errorInfo
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Promise that resolves with the function result
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    onRetry = null
  } = options

  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxRetries) {
        break
      }

      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay)

      if (onRetry) {
        onRetry(error, attempt + 1, delay)
      }

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
