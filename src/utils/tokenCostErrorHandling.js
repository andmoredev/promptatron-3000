/**
 * Enhanced error handling utilities specifically for token estimation and cost calculation
 * Provides graceful degradation, user notifications, and recovery mechanisms
 */

import { analyzeError, handleError, ErrorSeverity } from './errorHandling.js';

/**
 * Token and cost specific error types
 */
export const TokenCostErrorTypes = {
  TOKEN_ESTIMATION_FAILED: 'token_estimation_failed',
  TOKEN_ENCODER_UNAVAILABLE: 'token_encoder_unavailable',
  COST_CALCULATION_FAILED: 'cost_calculation_failed',
  PRICING_DATA_UNAVAILABLE: 'pricing_data_unavailable',
  PRICING_DATA_STALE: 'pricing_data_stale',
  SERVICE_INITIALIZATION_FAILED: 'service_initialization_failed',
  PERFORMANCE_DEGRADED: 'performance_degraded',
  MEMORY_LIMIT_EXCEEDED: 'memory_limit_exceeded'
};

/**
 * Fallback strategies for different error scenarios
 */
export const FallbackStrategies = {
  CHARACTER_BASED_ESTIMATION: 'character_based_estimation',
  DISABLE_COST_DISPLAY: 'disable_cost_display',
  USE_CACHED_DATA: 'use_cached_data',
  SIMPLIFIED_CALCULATION: 'simplified_calculation',
  GRACEFUL_DEGRADATION: 'graceful_degradation'
};

/**
 * Handle token estimation errors with graceful degradation
 * @param {Error} error - The token estimation error
 * @param {Object} context - Context information (modelId, text, etc.)
 * @returns {Object} - Fallback result with error information
 */
export function handleTokenEstimationError(error, context = {}) {
  const { modelId, text, estimationMethod } = context;

  // Analyze the error
  const errorInfo = analyzeError(error, {
    component: 'TokenEstimationService',
    action: 'estimateTokens',
    modelId,
    textLength: text?.length || 0,
    estimationMethod
  });

  // Determine fallback strategy
  let fallbackResult;
  let fallbackStrategy;

  if (error.message?.includes('encoder') || error.message?.includes('tiktoken')) {
    // Encoder unavailable - use character-based estimation
    fallbackStrategy = FallbackStrategies.CHARACTER_BASED_ESTIMATION;
    const estimatedTokens = Math.ceil((text?.length || 0) / 4); // 4 chars per token approximation

    fallbackResult = {
      tokens: estimatedTokens,
      isEstimated: true,
      method: 'character-fallback',
      error: 'Token encoder unavailable, using character-based estimation',
      fallbackStrategy,
      confidence: 'low'
    };
  } else if (error.message?.includes('memory') || error.message?.includes('quota')) {
    // Memory issues - use simplified estimation
    fallbackStrategy = FallbackStrategies.SIMPLIFIED_CALCULATION;
    const estimatedTokens = Math.ceil((text?.length || 0) / 3.5); // Slightly more conservative

    fallbackResult = {
      tokens: estimatedTokens,
      isEstimated: true,
      method: 'memory-constrained-fallback',
      error: 'Memory constraints, using simplified estimation',
      fallbackStrategy,
      confidence: 'medium'
    };
  } else {
    // Generic error - basic fallback
    fallbackStrategy = FallbackStrategies.GRACEFUL_DEGRADATION;
    const estimatedTokens = text ? Math.ceil(text.length / 4) : 0;

    fallbackResult = {
      tokens: estimatedTokens,
      isEstimated: true,
      method: 'error-fallback',
      error: error.message || 'Token estimation failed',
      fallbackStrategy,
      confidence: 'low'
    };
  }

  // Generate user notification
  const userNotification = generateTokenEstimationErrorNotification(errorInfo, fallbackResult);

  return {
    ...fallbackResult,
    errorInfo,
    userNotification,
    recoveryActions: generateTokenEstimationRecoveryActions(errorInfo, fallbackStrategy)
  };
}

/**
 * Handle cost calculation errors with graceful degradation
 * @param {Error} error - The cost calculation error
 * @param {Object} context - Context information (modelId, usage, etc.)
 * @returns {Object} - Fallback result with error information
 */
export function handleCostCalculationError(error, context = {}) {
  const { modelId, usage, region } = context;

  // Analyze the error
  const errorInfo = analyzeError(error, {
    component: 'CostCalculationService',
    action: 'calculateCost',
    modelId,
    region,
    hasUsage: !!usage
  });

  // Determine fallback strategy
  let fallbackResult;
  let fallbackStrategy;

  if (error.message?.includes('pricing data') || error.message?.includes('not available')) {
    // Pricing data unavailable
    fallbackStrategy = FallbackStrategies.DISABLE_COST_DISPLAY;

    fallbackResult = {
      inputCost: null,
      outputCost: null,
      toolCost: null,
      totalCost: null,
      currency: 'USD',
      isEstimated: true,
      error: 'Pricing data unavailable for this model',
      fallbackStrategy,
      showCostUnavailable: true
    };
  } else if (error.message?.includes('stale') || error.message?.includes('outdated')) {
    // Stale pricing data - show with warning
    fallbackStrategy = FallbackStrategies.USE_CACHED_DATA;

    fallbackResult = {
      inputCost: null,
      outputCost: null,
      toolCost: null,
      totalCost: null,
      currency: 'USD',
      isEstimated: true,
      error: 'Pricing data may be outdated',
      fallbackStrategy,
      showStaleDataWarning: true
    };
  } else {
    // Generic error - disable cost display
    fallbackStrategy = FallbackStrategies.GRACEFUL_DEGRADATION;

    fallbackResult = {
      inputCost: null,
      outputCost: null,
      toolCost: null,
      totalCost: null,
      currency: 'USD',
      isEstimated: true,
      error: error.message || 'Cost calculation failed',
      fallbackStrategy,
      showCostUnavailable: true
    };
  }

  // Generate user notification
  const userNotification = generateCostCalculationErrorNotification(errorInfo, fallbackResult);

  return {
    ...fallbackResult,
    errorInfo,
    userNotification,
    recoveryActions: generateCostCalculationRecoveryActions(errorlbackStrategy)
  };
}

/**
 * Handle service initialization failures
 * @param {string} serviceName - Name of the service that failed
 * @param {Error} error - The initialization error
 * @param {Object} context - Additional context
 * @returns {Object} - Recovery plan and user notification
 */
export function handleServiceInitializationError(serviceName, error, context = {}) {
  const errorInfo = analyzeError(error, {
    component: serviceName,
    action: 'initialize',
    ...context
  });

  // Determine recovery strategy based on service and error type
  let recoveryPlan;
  let userNotification;

  if (serviceName === 'TokenEstimationService') {
    recoveryPlan = {
      strategy: 'fallback_estimation',
      actions: [
        'Use character-based token estimation',
        'Disable advanced token analysis features',
        'Continue with basic functionality'
      ],
      impact: 'Token counts will be less accurate but functionality remains available',
      canContinue: true
    };

    userNotification = {
      type: 'warning',
      title: 'Token Estimation Service Unavailable',
      message: 'Token counting will use simplified estimation methods. Accuracy may be reduced.',
      actions: ['Continue with basic estimation', 'Refresh page to retry'],
      dismissible: true,
      autoHide: false
    };
  } else if (serviceName === 'CostCalculationService') {
    recoveryPlan = {
      strategy: 'disable_cost_features',
      actions: [
        'Disable cost estimation display',
        'Hide cost-related UI elements',
        'Continue with token-only tracking'
      ],
      impact: 'Cost information will not be available, but all other features work normally',
      canContinue: true
    };

    userNotification = {
      type: 'info',
      title: 'Cost Calculation Unavailable',
      message: 'Cost estimates are temporarily unavailable. Token tracking continues to work normally.',
      actions: ['Continue without cost info', 'Refresh page to retry'],
      dismissible: true,
      autoHide: false
    };
  } else {
    // Generic service failure
    recoveryPlan = {
      strategy: 'graceful_degradation',
      actions: [
        'Disable affected features',
        'Continue with core functionality',
        'Show appropriate error messages'
      ],
      impact: 'Some features may be unavailable',
      canContinue: true
    };

    userNotification = {
      type: 'error',
      title: `${serviceName} Initialization Failed`,
      message: 'Some features may be unavailable. Core functionality continues to work.',
      actions: ['Continue with limited features', 'Refresh page to retry'],
      dismissible: true,
      autoHide: false
    };
  }

  return {
    errorInfo,
    recoveryPlan,
    userNotification,
    serviceName,
    canRecover: true
  };
}

/**
 * Generate user-friendly notification for token estimation errors
 * @param {Object} errorInfo - Analyzed error information
 * @param {Object} fallbackResult - Fallback estimation result
 * @returns {Object} - User notification object
 */
function generateTokenEstimationErrorNotification(errorInfo, fallbackResult) {
  let message, actions, type;

  switch (fallbackResult.fallbackStrategy) {
    case FallbackStrategies.CHARACTER_BASED_ESTIMATION:
      type = 'warning';
      message = 'Token estimation is using a simplified method. Counts may be less accurate.';
      actions = ['Continue with current estimation', 'Refresh page to retry'];
      break;

    case FallbackStrategies.SIMPLIFIED_CALCULATION:
      type = 'info';
      message = 'Using memory-optimized token estimation. Accuracy is maintained.';
      actions = ['Continue with optimized estimation'];
      break;

    default:
      type = 'warning';
      message = 'Token estimation encountered an issue. Using basic approximation.';
      actions = ['Continue with approximation', 'Refresh page to retry'];
      break;
  }

  return {
    type,
    title: 'Token Estimation Notice',
    message,
    actions,
    dismissible: true,
    autoHide: type === 'info' ? 5000 : false,
    confidence: fallbackResult.confidence
  };
}

/**
 * Generate user-friendly notification for cost calculation errors
 * @param {Object} errorInfo - Analyzed error information
 * @param {Object} fallbackResult - Fallback calculation result
 * @returns {Object} - User notification object
 */
function generateCostCalculationErrorNotification(errorInfo, fallbackResult) {
  let message, actions, type;

  switch (fallbackResult.fallbackStrategy) {
    case FallbackStrategies.DISABLE_COST_DISPLAY:
      type = 'info';
      message = 'Cost information is temporarily unavailable for this model.';
      actions = ['Continue without cost info', 'Try a different model'];
      break;

    case FallbackStrategies.USE_CACHED_DATA:
      type = 'warning';
      message = 'Cost estimates may be based on outdated pricing data.';
      actions = ['Continue with estimates', 'Check AWS pricing page for latest rates'];
      break;

    default:
      type = 'warning';
      message = 'Cost calculation is temporarily unavailable.';
      actions = ['Continue without cost info', 'Refresh page to retry'];
      break;
  }

  return {
    type,
    title: 'Cost Calculation Notice',
    message,
    actions,
    dismissible: true,
    autoHide: false
  };
}

/**
 * Generate recovery actions for token estimation errors
 * @param {Object} errorInfo - Error information
 * @param {string} fallbackStrategy - Applied fallback strategy
 * @returns {Array} - Array of recovery actions
 */
function generateTokenEstimationRecoveryActions(errorInfo, fallbackStrategy) {
  const actions = [];

  switch (fallbackStrategy) {
    case FallbackStrategies.CHARACTER_BASED_ESTIMATION:
      actions.push({
        label: 'Refresh Page',
        action: 'refresh',
        description: 'Reload the page to retry token encoder initialization'
      });
      actions.push({
        label: 'Clear Browser Cache',
        action: 'clear_cache',
        description: 'Clear browser cache and reload to fix potential loading issues'
      });
      break;

    case FallbackStrategies.SIMPLIFIED_CALCULATION:
      actions.push({
        label: 'Free Memory',
        action: 'optimize_memory',
        description: 'Close other browser tabs to free up memory'
      });
      actions.push({
        label: 'Use Shorter Text',
        action: 'reduce_input',
        description: 'Try using shorter prompts or smaller datasets'
      });
      break;

    default:
      actions.push({
        label: 'Retry',
        action: 'retry',
        description: 'Try the operation again'
      });
      actions.push({
        label: 'Refresh Page',
        action: 'refresh',
        description: 'Reload the page to reset services'
      });
      break;
  }

  return actions;
}

/**
 * Generate recovery actions for cost calculation errors
 * @param {Object} errorInfo - Error information
 * @param {string} fallbackStrategy - Applied fallback strategy
 * @returns {Array} - Array of recovery actions
 */
function generateCostCalculationRecoveryActions(errorInfo, fallbackStrategy) {
  const actions = [];

  switch (fallbackStrategy) {
    case FallbackStrategies.DISABLE_COST_DISPLAY:
      actions.push({
        label: 'Try Different Model',
        action: 'change_model',
        description: 'Select a different model that may have pricing data available'
      });
      actions.push({
        label: 'Check AWS Pricing',
        action: 'external_link',
        url: 'https://aws.amazon.com/bedrock/pricing/',
        description: 'View current AWS Bedrock pricing information'
      });
      break;

    case FallbackStrategies.USE_CACHED_DATA:
      actions.push({
        label: 'Continue with Estimates',
        action: 'accept_stale',
        description: 'Use the available cost estimates with the understanding they may be outdated'
      });
      actions.push({
        label: 'Check Latest Pricing',
        action: 'external_link',
        url: 'https://aws.amazon.com/bedrock/pricing/',
        description: 'Verify current pricing on AWS website'
      });
      break;

    default:
      actions.push({
        label: 'Disable Cost Display',
        action: 'disable_costs',
        description: 'Turn off cost display in settings to continue without cost information'
      });
      actions.push({
        label: 'Refresh Page',
        action: 'refresh',
        description: 'Reload the page to retry cost calculation service'
      });
      break;
  }

  return actions;
}

/**
 * Create fallback usage data when token estimation fails
 * @param {Object} originalUsage - Original usage data (may be incomplete)
 * @param {Object} fallbackTokens - Fallback token estimation result
 * @returns {Object} - Enhanced usage data with fallback information
 */
export function createFallbackUsageData(originalUsage = {}, fallbackTokens = {}) {
  return {
    // Use original values if available, otherwise use fallback
    input_tokens: originalUsage.input_tokens || fallbackTokens.tokens || null,
    output_tokens: originalUsage.output_tokens || null,
    tool_tokens: originalUsage.tool_tokens || null,
    total_tokens: originalUsage.total_tokens || fallbackTokens.tokens || null,

    // Token metadata
    tokens_source: 'estimated',
    estimation_method: fallbackTokens.method || 'fallback',
    estimation_error: fallbackTokens.error || null,
    fallback_strategy: fallbackTokens.fallbackStrategy || null,
    confidence: fallbackTokens.confidence || 'low',

    // Preserve original cost data if it exists
    cost: originalUsage.cost || null
  };
}

/**
 * Create fallback cost data when cost calculation fails
 * @param {Object} originalCost - Original cost data (may be incomplete)
 * @param {Object} fallbackCost - Fallback cost calculation result
 * @returns {Object} - Enhanced cost data with fallback information
 */
export function createFallbackCostData(originalCost = {}, fallbackCost = {}) {
  return {
    input_cost: originalCost.input_cost || fallbackCost.inputCost || null,
    output_cost: originalCost.output_cost || fallbackCost.outputCost || null,
    tool_cost: originalCost.tool_cost || fallbackCost.toolCost || null,
    total_cost: originalCost.total_cost || fallbackCost.totalCost || null,
    currency: originalCost.currency || fallbackCost.currency || 'USD',

    // Cost metadata
    is_estimated: true,
    pricing_date: originalCost.pricing_date || null,
    calculation_error: fallbackCost.error || null,
    fallback_strategy: fallbackCost.fallbackStrategy || null,
    show_cost_unavailable: fallbackCost.showCostUnavailable || false,
    show_stale_data_warning: fallbackCost.showStaleDataWarning || false
  };
}

/**
 * Check if error recovery is possible
 * @param {Object} errorInfo - Error information
 * @param {string} serviceName - Name of the affected service
 * @returns {Object} - Recovery assessment
 */
export function assessErrorRecovery(errorInfo, serviceName) {
  const isRecoverable = !errorInfo.originalMessage?.includes('fatal') &&
                       !errorInfo.originalMessage?.includes('critical') &&
                       errorInfo.severity !== ErrorSeverity.CRITICAL;

  const recoveryMethods = [];

  if (isRecoverable) {
    // Add service-specific recovery methods
    if (serviceName === 'TokenEstimationService') {
      recoveryMethods.push('character_based_fallback', 'simplified_estimation');
    } else if (serviceName === 'CostCalculationService') {
      recoveryMethods.push('disable_cost_display', 'use_cached_pricing');
    }

    // Add general recovery methods
    recoveryMethods.push('retry_operation', 'refresh_page', 'clear_cache');
  }

  return {
    isRecoverable,
    recoveryMethods,
    canContinue: true, // Most errors allow continued operation with degraded functionality
    recommendedAction: isRecoverable ? 'apply_fallback' : 'refresh_page',
    userImpact: isRecoverable ? 'reduced_accuracy' : 'feature_unavailable'
  };
}

/**
 * Generate comprehensive error report for debugging
 * @param {Object} errorInfo - Error information
 * @param {Object} fallbackResult - Applied fallback result
 * @param {Object} context - Additional context
 * @returns {Object} - Comprehensive error report
 */
export function generateErrorReport(errorInfo, fallbackResult, context = {}) {
  return {
    timestamp: new Date().toISOString(),
    errorId: errorInfo.id,
    service: context.serviceName || 'unknown',
    errorType: errorInfo.type,
    severity: errorInfo.severity,
    originalError: errorInfo.originalMessage,
    userMessage: errorInfo.userMessage,
    fallbackApplied: !!fallbackResult,
    fallbackStrategy: fallbackResult?.fallbackStrategy || null,
    recoveryActions: fallbackResult?.recoveryActions || [],
    context: {
      ...errorInfo.context,
      ...context
    },
    userAgent: navigator.userAgent,
    url: window.location.href,
    canRecover: fallbackResult?.canRecover !== false
  };
}
