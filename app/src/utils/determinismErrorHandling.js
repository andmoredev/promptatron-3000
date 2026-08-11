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
  PAUSE_RESUME: 'pause_resume',
  THROTTLING: 'throttling',
  PARTIAL_FAILURE: 'partial_failure',
  NETWORK_INSTABILITY: 'network_instability'
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

  // Throttling errors (high priority)
  if (message.includes('throttl') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      code.includes('throttl') ||
      code === 'throttlingexception') {
    return DeterminismErrorTypes.THROTTLING
  }

  // Network instability (frequent disconnections)
  if (message.includes('network instability') ||
      message.includes('connection interrupted') ||
      message.includes('frequent disconnections')) {
    return DeterminismErrorTypes.NETWORK_INSTABILITY
  }

  // Partial failure (some requests succeeded)
  if (message.includes('partial') ||
      message.includes('incomplete') ||
      message.includes('some requests failed')) {
    return DeterminismErrorTypes.PARTIAL_FAILURE
  }

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
  const retryCount = context.retryCount || 0
  const hasPartialData = context.completedRequests > 0

  switch (errorType) {
    case DeterminismErrorTypes.THROTTLING:
      options.push({
        action: 'wait_and_retry',
        label: 'Wait and retry',
        description: 'Wait for rate limits to clear and retry with slower requests',
        priority: 'high',
        estimatedWait: '2-5 minutes'
      })
      options.push({
        action: 'continue_with_partial',
        label: 'Continue with partial data',
        description: hasPartialData ? `Analyze ${context.completedRequests} responses collected so far` : 'Not available - no data collected',
        priority: hasPartialData ? 'medium' : 'disabled',
        disabled: !hasPartialData
      })
      options.push({
        action: 'reduce_test_count',
        label: 'Reduce test count',
        description: 'Lower the number of test requests to avoid throttling',
        priority: 'medium'
      })
      break

    case DeterminismErrorTypes.NETWORK_INSTABILITY:
      options.push({
        action: 'pause_and_resume',
        label: 'Pause and resume later',
        description: 'Pause evaluation and resume when network is stable',
        priority: 'high'
      })
      options.push({
        action: 'continue_with_partial',
        label: 'Analyze partial results',
        description: hasPartialData ? `Continue with ${context.completedRequests} successful responses` : 'No responses collected yet',
        priority: hasPartialData ? 'medium' : 'disabled',
        disabled: !hasPartialData
      })
      break

    case DeterminismErrorTypes.PARTIAL_FAILURE:
      options.push({
        action: 'continue_with_partial',
        label: 'Continue with available data',
        description: `Analyze ${context.completedRequests} successful responses`,
        priority: 'high'
      })
      options.push({
        action: 'retry_failed_only',
        label: 'Retry failed requests only',
        description: 'Attempt to collect the remaining responses',
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
        action: 'retry_grader_simplified',
        label: 'Retry with simplified grading',
        description: 'Use a simpler grading prompt that may be more reliable',
        priority: 'medium'
      })
      options.push({
        action: 'manual_review',
        label: 'Manual review',
        description: 'Export responses for manual analysis',
        priority: 'low'
      })
      break

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
      if (hasPartialData) {
        options.push({
          action: 'continue_with_partial',
          label: 'Use partial results',
          description: `Analyze ${context.completedRequests} responses already collected`,
          priority: 'medium'
        })
      }
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
      if (hasPartialData) {
        options.push({
          action: 'continue_with_partial',
          label: 'Proceed with collected data',
          description: `Continue analysis with ${context.completedRequests} responses`,
          priority: 'medium'
        })
      }
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
      if (hasPartialData) {
        options.push({
          action: 'continue_with_partial',
          label: 'Analyze current progress',
          description: `Use ${context.completedRequests} responses collected so far`,
          priority: 'medium'
        })
      }
      break

    default:
      if (retryCount < 2) {
        options.push({
          action: 'retry_evaluation',
          label: 'Retry evaluation',
          description: 'Start the evaluation again from the beginning',
          priority: 'medium'
        })
      }
      if (hasPartialData) {
        options.push({
          action: 'continue_with_partial',
          label: 'Use available data',
          description: `Analyze ${context.completedRequests} responses collected`,
          priority: 'high'
        })
      }
      break
  }

  // Add user control options
  options.push({
    action: 'adjust_settings',
    label: 'Adjust settings',
    description: 'Modify evaluation settings (test count, retry attempts, etc.)',
    priority: 'low'
  })

  // Add common options
  options.push({
    action: 'cancel_evaluation',
    label: 'Cancel evaluation',
    description: 'Stop the evaluation and return to normal testing',
    priority: 'low'
  })

  return options
    .filter(option => !option.disabled)
    .sort((a, b) => {
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
    recommendations: [],
    canContinueWithPartial: false,
    partialDataQuality: null
  }

  if (!evaluationStatus) {
    health.status = 'unknown'
    health.issues.push('No evaluation status available')
    return health
  }

  const now = Date.now()
  const startTime = evaluationStatus.startTime
  const lastUpdate = evaluationStatus.lastUpdate || startTime
  const timeSinceStart = now - startTime
  const timeSinceUpdate = now - lastUpdate
  const completedRequests = evaluationStatus.completedRequests || 0
  const totalRequests = evaluationStatus.totalRequests || 10

  // Assess partial data quality
  if (completedRequests > 0) {
    health.canContinueWithPartial = true

    if (completedRequests >= 5) {
      health.partialDataQuality = 'good'
    } else if (completedRequests >= 3) {
      health.partialDataQuality = 'fair'
    } else {
      health.partialDataQuality = 'limited'
    }
  }

  // Check for stalled evaluation
  if (timeSinceUpdate > 60000 && evaluationStatus.status === 'running') {
    health.status = 'warning'
    health.issues.push('No progress updates for over 1 minute')

    if (health.canContinueWithPartial) {
      health.recommendations.push(`Consider continuing with ${completedRequests} responses collected`)
    }
    health.recommendations.push('Consider pausing and resuming the evaluation')
  }

  if (timeSinceStart > 300000 && evaluationStatus.progress < 50) {
    health.status = 'warning'
    health.issues.push('Evaluation taking longer than expected')
    health.recommendations.push('Check network connection and AWS service status')

    if (health.canContinueWithPartial && health.partialDataQuality !== 'limited') {
      health.recommendations.push(`Continue with partial analysis (${completedRequests} responses)`)
    }
  }

  // Check error rate
  const errorRate = evaluationStatus.errors?.length || 0

  if (completedRequests > 5 && errorRate / completedRequests > 0.3) {
    health.status = 'critical'
    health.issues.push('High error rate detected')
    health.recommendations.push('Consider reducing concurrency or checking AWS credentials')

    if (health.canContinueWithPartial) {
      health.recommendations.push('Continue with successful responses to avoid further errors')
    }
  }

  // Check throttling patterns
  const throttlingStats = evaluationStatus.throttlingStats
  if (throttlingStats && throttlingStats.throttledCount > 0) {
    const throttlingRate = throttlingStats.throttledCount / Math.max(completedRequests, 1)

    if (throttlingRate > 0.5) {
      health.status = 'critical'
      health.issues.push('Severe throttling detected')
      health.recommendations.push('Wait for rate limits to clear or reduce test count')

      if (health.canContinueWithPartial && completedRequests >= 3) {
        health.recommendations.push('Consider analyzing partial results to avoid further throttling')
      }
    } else if (throttlingRate > 0.2) {
      health.status = 'warning'
      health.issues.push('Moderate throttling detected')
      health.recommendations.push('Consider reducing request rate')
    }
  }

  // Check network connectivity
  if (!navigator.onLine) {
    health.status = 'critical'
    health.issues.push('No network connection')
    health.recommendations.push('Check internet connection and resume when available')

    if (health.canContinueWithPartial) {
      health.recommendations.push(`Analyze ${completedRequests} responses collected before disconnection`)
    }
  }

  return health
}

/**
 * Determine if partial evaluation data is sufficient for analysis
 * @param {Array} responses - Collected responses
 * @param {number} originalTargetCount - Original target number of responses
 * @returns {Object} Analysis of partial data sufficiency
 */
export function assessPartialDataSufficiency(responses, originalTargetCount) {
  const responseCount = responses?.length || 0

  const assessment = {
    isSufficient: false,
    quality: 'insufficient',
    confidence: 'low',
    recommendations: [],
    minRecommendedCount: Math.max(3, Math.ceil(originalTargetCount * 0.3))
  }

  if (responseCount === 0) {
    assessment.recommendations.push('No responses collected - retry evaluation')
    return assessment
  }

  if (responseCount >= originalTargetCount * 0.8) {
    assessment.isSufficient = true
    assessment.quality = 'excellent'
    assessment.confidence = 'high'
    assessment.recommendations.push('Sufficient data for reliable determinism analysis')
  } else if (responseCount >= originalTargetCount * 0.6) {
    assessment.isSufficient = true
    assessment.quality = 'good'
    assessment.confidence = 'high'
    assessment.recommendations.push('Good data coverage for determinism analysis')
  } else if (responseCount >= originalTargetCount * 0.4) {
    assessment.isSufficient = true
    assessment.quality = 'fair'
    assessment.confidence = 'medium'
    assessment.recommendations.push('Fair data coverage - analysis will be less precise')
  } else if (responseCount >= 3) {
    assessment.isSufficient = true
    assessment.quality = 'limited'
    assessment.confidence = 'low'
    assessment.recommendations.push('Limited data - analysis will show basic patterns only')
  } else {
    assessment.recommendations.push(`Need at least ${assessment.minRecommendedCount} responses for meaningful analysis`)
  }

  // Check for response diversity
  const uniqueResponses = new Set(responses.map(r => r.text?.trim())).size
  const diversityRatio = uniqueResponses / responseCount

  if (diversityRatio > 0.8) {
    assessment.recommendations.push('High response diversity detected - good for determinism analysis')
  } else if (diversityRatio < 0.3) {
    assessment.recommendations.push('Low response diversity - may indicate high determinism')
  }

  return assessment
}

/**
 * Create a graceful degradation plan when evaluation fails
 * @param {Object} evaluationState - Current evaluation state
 * @param {Error} error - The error that occurred
 * @returns {Object} Degradation plan with options
 */
export function createGracefulDegradationPlan(evaluationState, error) {
  const plan = {
    preserveOriginalResult: true,
    partialAnalysisAvailable: false,
    fallbackOptions: [],
    userChoices: []
  }

  const completedRequests = evaluationState.completedRequests || 0
  const responses = evaluationState.responses || []

  // Always preserve the original test result
  plan.preserveOriginalResult = true
  plan.fallbackOptions.push({
    type: 'preserve_original',
    description: 'Original test result remains fully functional',
    impact: 'No impact on primary testing functionality'
  })

  // Check if partial analysis is possible
  if (completedRequests > 0 && responses.length > 0) {
    const sufficiency = assessPartialDataSufficiency(responses, evaluationState.totalRequests || 10)

    if (sufficiency.isSufficient) {
      plan.partialAnalysisAvailable = true
      plan.fallbackOptions.push({
        type: 'partial_analysis',
        description: `Analyze ${completedRequests} responses with ${sufficiency.confidence} confidence`,
        impact: sufficiency.quality === 'limited' ? 'Reduced analysis precision' : 'Minimal impact on analysis quality'
      })

      plan.userChoices.push({
        action: 'continue_with_partial',
        label: 'Continue with partial analysis',
        description: `Analyze ${completedRequests} responses (${sufficiency.quality} quality)`,
        recommended: sufficiency.quality !== 'limited'
      })
    }
  }

  // Add statistical fallback if grader fails
  const errorType = categorizeDeterminismError(error, '')
  if (errorType === DeterminismErrorTypes.GRADER_FAILURE && responses.length >= 3) {
    plan.fallbackOptions.push({
      type: 'statistical_analysis',
      description: 'Basic statistical analysis without LLM grader',
      impact: 'Simplified metrics but still useful insights'
    })

    plan.userChoices.push({
      action: 'use_statistical_analysis',
      label: 'Use statistical analysis',
      description: 'Perform basic determinism analysis without grader LLM',
      recommended: true
    })
  }

  // Add retry options based on error type
  if (errorType === DeterminismErrorTypes.THROTTLING) {
    plan.userChoices.push({
      action: 'retry_with_reduced_count',
      label: 'Retry with fewer requests',
      description: 'Reduce test count to avoid throttling',
      recommended: true
    })
  }

  // Always offer manual export
  if (responses.length > 0) {
    plan.userChoices.push({
      action: 'export_for_manual_analysis',
      label: 'Export responses for manual review',
      description: 'Download collected responses for external analysis',
      recommended: false
    })
  }

  return plan
}

/**
 * Generate user-friendly error messages for determinism evaluation
 * @param {Object} errorInfo - Error information
 * @returns {string} User-friendly message
 */
export function generateDeterminismErrorMessage(errorInfo) {
  const { type, originalMessage, context } = errorInfo
  const hasPartialData = context?.completedRequests > 0

  switch (type) {
    case DeterminismErrorTypes.THROTTLING:
      return hasPartialData
        ? `AWS rate limiting detected. ${context.completedRequests} responses collected successfully. You can continue with partial analysis or wait for rate limits to clear.`
        : 'AWS rate limiting detected before any responses were collected. Please wait a few minutes and try again with a lower test count.'

    case DeterminismErrorTypes.NETWORK_INSTABILITY:
      return hasPartialData
        ? `Network connection is unstable. ${context.completedRequests} responses were collected before the connection issues. You can analyze these results or wait for a stable connection.`
        : 'Network connection is unstable. Please check your internet connection and try again.'

    case DeterminismErrorTypes.PARTIAL_FAILURE:
      return `Evaluation completed with partial results. ${context.completedRequests} out of ${context.totalRequests} requests succeeded. The analysis will proceed with available data.`

    case DeterminismErrorTypes.SERVICE_WORKER:
      return 'Service worker unavailable. The evaluation will continue using fallback mode, which may be slower but equally accurate.'

    case DeterminismErrorTypes.NETWORK:
      return hasPartialData
        ? `Network connection lost after collecting ${context.completedRequests} responses. You can analyze the partial results or retry when your connection is restored.`
        : 'Network connection lost. The evaluation has been paused and will resume automatically when your connection is restored.'

    case DeterminismErrorTypes.GRADER_FAILURE:
      return hasPartialData
        ? `Grader LLM is unavailable, but ${context.completedRequests} responses were collected successfully. A statistical analysis will be performed instead.`
        : 'Grader LLM is unavailable. A statistical analysis will be performed instead to provide determinism insights.'

    case DeterminismErrorTypes.BATCH_FAILURE:
      return hasPartialData
        ? `Batch processing encountered issues after collecting ${context.completedRequests} responses. The evaluation will continue with reduced concurrency.`
        : 'Batch processing failed. The evaluation will continue with reduced concurrency to ensure completion.'

    case DeterminismErrorTypes.EVALUATION_TIMEOUT:
      return hasPartialData
        ? `Evaluation timed out after collecting ${context.completedRequests} responses. You can analyze the partial results or extend the timeout.`
        : 'Evaluation is taking longer than expected. You can extend the timeout or reduce the number of test requests.'

    case DeterminismErrorTypes.AWS_SERVICE:
      return hasPartialData
        ? `AWS Bedrock service issues detected after ${context.completedRequests} successful requests. You can proceed with partial analysis or retry.`
        : 'AWS Bedrock service is experiencing issues. The evaluation will retry with exponential backoff.'

    default:
      return hasPartialData
        ? `An error occurred during evaluation, but ${context.completedRequests} responses were collected successfully. You can proceed with partial analysis.`
        : originalMessage || 'An unexpected error occurred during determinism evaluation.'
  }
}
