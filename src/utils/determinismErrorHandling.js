/**
 * Specialized error handling utilities for determinism evaluation
 * Extends the base error handling with evaluation-specific logic
 */

import { handleError, retryWithBackoff, ErrorTypes, ErrorSeverity } from './errorHandling.js'

/**
 * Determinism-specific error types
 */
export const DeterminismErrorTypes = {
  ...ErrorTypes,
  SERVICE_WORKER: 'service_worker',
  EVALUATION_TIMEOUT: 'evaluation_timeout',
  GRADER_FAILURE: 'grader_failure',
  BATCH_FAILURE: 'batch_failure',
  PAUSE_RESUME: 'pause_resume'
}

/**
 * Handle determinism evaluation errors with specialized recovery options
 * @param {Error|string} error - The error to handle
 * @param {Object} context - Additional context about the evaluation
 * @returns {Object} Enhanced error information with recovery options
 */
export function handleDeterminismError(error, context = {}) {
  const baseErrorInfo = handleError(error, context)

  // Enhance with determinism-specific information
  const enhancedErrorInfo = {
    ...baseErrorInfo,
    type: categorizeDeterminismError(error, baseErrorInfo.type),
    recoveryOptions: generateDeterminismRecoveryOptions(error, context),
    canRetry: canRetryDeterminismEvaluation(error, context),
    canPause: canPauseDeterminismEvaluation(error, context),
    fallbackAvailable: isFallbackModeAvailable(error, context)
  }

  return enhancedErrorInfo
}

/**
 * Categorize errors specific to determinism evaluation
 * @private
 */
function categorizeDeterminismError(error, baseType) {
  const message = error.message?.toLowerCase() || ''
  const code = error.code || error.name || ''

  // Service worker errors
  if (message.includes('service worker') ||
      message.includes('worker') ||
      code.includes('serviceworker')) {
    return DeterminismErrorTypes.SERVICE_WORKER
  }

  // Network errors (check before base type)
  if (message.includes('network') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('fetch')) {
    return DeterminismErrorTypes.NETWORK
  }

  // Evaluation timeout errors
  if (message.includes('evaluation') && message.includes('timeout')) {
    return DeterminismErrorTypes.EVALUATION_TIMEOUT
  }

  // Grader-specific errors
  if (message.includes('grader') ||
      message.includes('grade') ||
      message.includes('analysis')) {
    return DeterminismErrorTypes.GRADER_FAILURE
  }

  // Batch execution errors
  if (message.includes('batch') ||
      message.includes('concurrent') ||
      message.includes('multiple requests')) {
    return DeterminismErrorTypes.BATCH_FAILURE
  }

  // Pause/resume errors
  if (message.includes('pause') ||
      message.includes('resume')) {
    return DeterminismErrorTypes.PAUSE_RESUME
  }

  return baseType
}

/**
 * Generate recovery options specific to determinism evaluation
 * @private
 */
function generateDeterminismRecoveryOptions(error, context) {
  const errorType = categorizeDeterminismError(error, '')
  const options = []

  switch (errorType) {
    case DeterminismErrorTypes.SERVICE_WORKER:
      options.push({
        action: 'retry_with_fallback',
        label: 'Retry with fallback mode',
        description: 'Use main thread processing instead of service worker',
        priority: 'high'
      })
      options.push({
        action: 'refresh_page',
        label: 'Refresh page',
        description: 'Reload the page to reinitialize service worker',
        priority: 'medium'
      })
      break

    case DeterminismErrorTypes.NETWORK:
    case ErrorTypes.NETWORK:
      options.push({
        action: 'pause_evaluation',
        label: 'Pause evaluation',
        description: 'Pause until network connection is restored',
        priority: 'high'
      })
      options.push({
        action: 'retry_with_delay',
        label: 'Retry in 30 seconds',
        description: 'Wait for network to stabilize before retrying',
        priority: 'medium'
      })
      break

    case DeterminismErrorTypes.AWS_SERVICE:
    case ErrorTypes.AWS_SERVICE:
      options.push({
        action: 'reduce_concurrency',
        label: 'Reduce request rate',
        description: 'Lower concurrency to avoid rate limits',
        priority: 'high'
      })
      options.push({
        action: 'retry_with_backoff',
        label: 'Retry with exponential backoff',
        description: 'Wait progressively longer between retries',
        priority: 'medium'
      })
      break

    case DeterminismErrorTypes.GRADER_FAILURE:
      options.push({
        action: 'use_fallback_analysis',
        label: 'Use statistical analysis',
        description: 'Perform basic determinism analysis without LLM grader',
        priority: 'high'
      })
      options.push({
        action: 'retry_grader',
        label: 'Retry grading',
        description: 'Attempt grading again with simplified prompt',
        priority: 'medium'
      })
      break

    case DeterminismErrorTypes.BATCH_FAILURE:
      options.push({
        action: 'reduce_batch_size',
        label: 'Use smaller batches',
        description: 'Process requests in smaller groups',
        priority: 'high'
      })
      options.push({
        action: 'sequential_processing',
        label: 'Process sequentially',
        description: 'Execute requests one at a time',
        priority: 'medium'
      })
      break

    case DeterminismErrorTypes.EVALUATION_TIMEOUT:
      options.push({
        action: 'extend_timeout',
        label: 'Extend timeout',
        description: 'Allow more time for evaluation to complete',
        priority: 'high'
      })
      options.push({
        action: 'reduce_request_count',
        label: 'Reduce request count',
        description: 'Evaluate with fewer requests (e.g., 15 instead of 30)',
        priority: 'medium'
      })
      break

    default:
      options.push({
        action: 'retry_evaluation',
        label: 'Retry evaluation',
        description: 'Start the evaluation again from the beginning',
        priority: 'medium'
      })
      break
  }

  // Add common options
  options.push({
    action: 'cancel_evaluation',
    label: 'Cancel evaluation',
    description: 'Stop the evaluation and return to normal testing',
    priority: 'low'
  })

  return options.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })
}

/**
 * Check if evaluation can be retried
 * @private
 */
function canRetryDeterminismEvaluation(error, context) {
  const errorType = categorizeDeterminismError(error, '')
  const retryCount = context.retryCount || 0

  // Don't retry if we've already tried too many times
  if (retryCount >= 3) {
    return false
  }

  // Some errors should not be retried
  const nonRetryableErrors = [
    DeterminismErrorTypes.AWS_CREDENTIALS,
    DeterminismErrorTypes.AWS_PERMISSIONS,
    DeterminismErrorTypes.BROWSER_COMPATIBILITY
  ]

  return !nonRetryableErrors.includes(errorType)
}

/**
 * Check if evaluation can be paused
 * @private
 */
function canPauseDeterminismEvaluation(error, context) {
  const errorType = categorizeDeterminismError(error, '')
  const evaluationStatus = context.evaluationStatus

  // Can pause if evaluation is running and error is recoverable
  const pausableErrors = [
    DeterminismErrorTypes.NETWORK,
    ErrorTypes.NETWORK,
    DeterminismErrorTypes.AWS_SERVICE,
    ErrorTypes.AWS_SERVICE
  ]

  return (
    evaluationStatus === 'running' &&
    pausableErrors.includes(errorType)
  )
}

/**
 * Check if fallback mode is available
 * @private
 */
function isFallbackModeAvailable(error, context) {
  const errorType = categorizeDeterminismError(error, '')

  // Fallback mode is available for service worker issues
  const fallbackCompatibleErrors = [
    DeterminismErrorTypes.SERVICE_WORKER,
    DeterminismErrorTypes.EVALUATION_TIMEOUT
  ]

  return fallbackCompatibleErrors.includes(errorType)
}

/**
 * Execute determinism evaluation with comprehensive error handling
 * @param {Function} evaluationFn - Function that performs the evaluation
 * @param {Object} options - Execution options
 * @returns {Promise} Promise that resolves with evaluation result
 */
export async function executeWithDeterminismErrorHandling(evaluationFn, options = {}) {
  const {
    maxRetries = 3,
    onError = null,
    onRetry = null,
    onPause = null,
    context = {}
  } = options

  let retryCount = 0
  let lastError = null

  while (retryCount <= maxRetries) {
    try {
      return await evaluationFn()
    } catch (error) {
      lastError = error

      const errorInfo = handleDeterminismError(error, {
        ...context,
        retryCount,
        attempt: retryCount + 1
      })

      // Call error callback
      if (onError) {
        onError(errorInfo)
      }

      // Check if we should retry
      if (retryCount < maxRetries && errorInfo.canRetry) {
        retryCount++

        // Calculate retry delay
        const baseDelay = 1000
        const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), 30000)

        if (onRetry) {
          onRetry(errorInfo, retryCount, delay)
        }

        // Retrying determinism evaluation
        await new Promise(resolve => setTimeout(resolve, delay))
      } else if (errorInfo.canPause && onPause) {
        // Offer to pause instead of failing
        const shouldPause = await onPause(errorInfo)
        if (shouldPause) {
          throw new Error('Evaluation paused by user request')
        }
        break
      } else {
        break
      }
    }
  }

  // All retries exhausted
  const finalErrorInfo = handleDeterminismError(lastError, {
    ...context,
    retryCount,
    finalAttempt: true
  })

  throw new Error(finalErrorInfo.userMessage)
}

/**
 * Monitor evaluation health and detect issues early
 * @param {Object} evaluationStatus - Current evaluation status
 * @returns {Object} Health assessment
 */
export function assessEvaluationHealth(evaluationStatus) {
  const health = {
    status: 'healthy',
    issues: [],
    recommendations: []
  }

  if (!evaluationStatus) {
    health.status = 'unknown'
    health.issues.push('No evaluation status available')
    return health
  }

  // Check for stalled evaluation
  const now = Date.now()
  const startTime = evaluationStatus.startTime
  const lastUpdate = evaluationStatus.lastUpdate || startTime
  const timeSinceStart = now - startTime
  const timeSinceUpdate = now - lastUpdate

  if (timeSinceUpdate > 60000 && evaluationStatus.status === 'running') {
    health.status = 'warning'
    health.issues.push('No progress updates for over 1 minute')
    health.recommendations.push('Consider pausing and resuming the evaluation')
  }

  if (timeSinceStart > 300000 && evaluationStatus.progress < 50) {
    health.status = 'warning'
    health.issues.push('Evaluation taking longer than expected')
    health.recommendations.push('Check network connection and AWS service status')
  }

  // Check error rate
  const errorRate = evaluationStatus.errors?.length || 0
  const totalRequests = evaluationStatus.completedRequests || 0

  if (totalRequests > 5 && errorRate / totalRequests > 0.3) {
    health.status = 'critical'
    health.issues.push('High error rate detected')
    health.recommendations.push('Consider reducing concurrency or checking AWS credentials')
  }

  // Check network connectivity
  if (!navigator.onLine) {
    health.status = 'critical'
    health.issues.push('No network connection')
    health.recommendations.push('Check internet connection and resume when available')
  }

  return health
}

/**
 * Generate user-friendly error messages for determinism evaluation
 * @param {Object} errorInfo - Error information
 * @returns {string} User-friendly message
 */
export function generateDeterminismErrorMessage(errorInfo) {
  const { type, originalMessage } = errorInfo

  switch (type) {
    case DeterminismErrorTypes.SERVICE_WORKER:
      return 'Service worker unavailable. The evaluation will continue using fallback mode, which may be slower but equally accurate.'

    case DeterminismErrorTypes.NETWORK:
      return 'Network connection lost. The evaluation has been paused and will resume automatically when your connection is restored.'

    case DeterminismErrorTypes.GRADER_FAILURE:
      return 'Grader LLM is unavailable. A statistical analysis will be performed instead to provide determinism insights.'

    case DeterminismErrorTypes.BATCH_FAILURE:
      return 'Batch processing failed. The evaluation will continue with reduced concurrency to ensure completion.'

    case DeterminismErrorTypes.EVALUATION_TIMEOUT:
      return 'Evaluation is taking longer than expected. You can extend the timeout or reduce the number of test requests.'

    case DeterminismErrorTypes.AWS_SERVICE:
      return 'AWS Bedrock service is experiencing issues. The evaluation will retry with exponential backoff.'

    default:
      return originalMessage || 'An unexpected error occurred during determinism evaluation.'
  }
}
