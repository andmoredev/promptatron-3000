/**
 * Image Generation Error Recovery Utilities
 * Specialized error handling and recovery for image generation operations
 */

import { ErrorTypes, handleError, retryWithBackoff } from './errorHandling.js';

/**
 * Image generation retry configuration
 */
export const ImageRetryConfig = {
  DEFAULT: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffFactor: 2
  },
  NETWORK_ISSUES: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 15000,
    backoffFactor: 1.5
  },
  RATE_LIMIT: {
    maxRetries: 3,
    baseDelay: 60000, // 1 minute
    maxDelay: 300000, // 5 minutes
    backoffFactor: 2
  },
  MODEL_UNAVAILABLE: {
    maxRetries: 2,
    baseDelay: 30000, // 30 seconds
    maxDelay: 120000, // 2 minutes
    backoffFactor: 2
  }
};

/**
 * Determine if an error is retryable
 * @param {Object} errorInfo - Analyzed error information
 * @returns {boolean} True if error should be retried
 */
export function isRetryableError(errorInfo) {
  const retryableTypes = [
    ErrorTypes.NETWORK,
    ErrorTypes.AWS_SERVICE,
    ErrorTypes.IMAGE_GENERATION,
    ErrorTypes.IMAGE_TIMEOUT,
    ErrorTypes.IMAGE_RATE_LIMIT,
    ErrorTypes.IMAGE_MODEL_UNAVAILABLE
  ];

  return retryableTypes.includes(errorInfo.type);
}

/**
 * Get retry configuration based on error type
 * @param {Object} errorInfo - Analyzed error information
 * @returns {Object} Retry configuration
 */
export function getRetryConfig(errorInfo) {
  switch (errorInfo.type) {
    case ErrorTypes.NETWORK:
      return ImageRetryConfig.NETWORK_ISSUES;

    case ErrorTypes.IMAGE_RATE_LIMIT:
      return ImageRetryConfig.RATE_LIMIT;

    case ErrorTypes.IMAGE_MODEL_UNAVAILABLE:
      return ImageRetryConfig.MODEL_UNAVAILABLE;

    case ErrorTypes.AWS_SERVICE:
    case ErrorTypes.IMAGE_GENERATION:
    case ErrorTypes.IMAGE_TIMEOUT:
    default:
      return ImageRetryConfig.DEFAULT;
  }
}

/**
 * Retry image generation with intelligent backoff
 * @param {Function} generateImageFn - Image generation function
 * @param {Object} context - Generation context (modelId, prompt, parameters)
 * @param {Function} onRetry - Callback for retry attempts
 * @returns {Promise<Object>} Image generation result
 */
export async function retryImageGeneration(generateImageFn, context, onRetry = null) {
  return await retryWithBackoff(
    generateImageFn,
    {
      ...ImageRetryConfig.DEFAULT,
      onRetry: (error, attempt, delay) => {
        const errorInfo = handleError(error, {
          component: 'ImageErrorRecovery',
          operation: 'retryImageGeneration',
          attempt,
          ...context
        });

        // Adjust retry config based on error type
        const retryConfig = getRetryConfig(errorInfo);

        console.log(`[ImageErrorRecovery] Retry attempt ${attempt} in ${delay}ms for ${errorInfo.type}`);

        if (onRetry) {
          onRetry(errorInfo, attempt, delay);
        }

        // If this is a non-retryable error, stop retrying
        if (!isRetryableError(errorInfo)) {
          throw error;
        }
      }
    }
  );
}

/**
 * Graceful degradation options for image generation failures
 */
export const DegradationOptions = {
  REDUCE_QUALITY: 'reduce_quality',
  REDUCE_DIMENSIONS: 'reduce_dimensions',
  SIMPLIFY_PROMPT: 'simplify_prompt',
  FALLBACK_MODEL: 'fallback_model',
  SINGLE_IMAGE: 'single_image'
};

/**
 * Apply graceful degradation to image generation parameters
 * @param {Object} originalParams - Original generation parameters
 * @param {string} degradationType - Type of degradation to apply
 * @returns {Object} Degraded parameters
 */
export function applyGracefulDegradation(originalParams, degradationType) {
  const degradedParams = { ...originalParams };

  switch (degradationType) {
    case DegradationOptions.REDUCE_QUALITY:
      if (degradedParams.quality === 'premium') {
        degradedParams.quality = 'standard';
      }
      break;

    case DegradationOptions.REDUCE_DIMENSIONS:
      // Reduce to smaller dimensions
      if (degradedParams.width > 512 || degradedParams.height > 512) {
        degradedParams.width = 512;
        degradedParams.height = 512;
      }
      break;

    case DegradationOptions.SINGLE_IMAGE:
      degradedParams.numberOfImages = 1;
      break;

    case DegradationOptions.SIMPLIFY_PROMPT:
      // This would need to be handled at the prompt level
      // Return a flag to indicate prompt simplification is needed
      degradedParams._simplifyPrompt = true;
      break;

    default:
      break;
  }

  return degradedParams;
}

/**
 * Get fallback model suggestions
 * @param {string} originalModelId - Original model that failed
 * @returns {Array<string>} Array of fallback model IDs
 */
export function getFallbackModels(originalModelId) {
  const fallbackMap = {
    'amazon.nova-canvas-v1:0': [], // No fallbacks for Nova Canvas currently
    'stability.stable-diffusion-xl-v1': ['amazon.nova-canvas-v1:0'],
    'stability.stable-diffusion-v2-1': ['amazon.nova-canvas-v1:0', 'stability.stable-diffusion-xl-v1']
  };

  return fallbackMap[originalModelId] || [];
}

/**
 * Create user-friendly error recovery options
 * @param {Object} errorInfo - Analyzed error information
 * @param {Object} context - Generation context
 * @returns {Array<Object>} Array of recovery options
 */
export function createRecoveryOptions(errorInfo, context) {
  const options = [];

  switch (errorInfo.type) {
    case ErrorTypes.IMAGE_TIMEOUT:
      options.push({
        id: 'reduce_dimensions',
        title: 'Try Smaller Image',
        description: 'Generate a smaller image (512×512) to reduce processing time',
        action: DegradationOptions.REDUCE_DIMENSIONS,
        automatic: false
      });
      options.push({
        id: 'simplify_prompt',
        title: 'Simplify Prompt',
        description: 'Use a shorter, simpler prompt to speed up generation',
        action: DegradationOptions.SIMPLIFY_PROMPT,
        automatic: false
      });
      break;

    case ErrorTypes.IMAGE_RATE_LIMIT:
      options.push({
        id: 'single_image',
        title: 'Generate Single Image',
        description: 'Generate only one image to reduce API usage',
        action: DegradationOptions.SINGLE_IMAGE,
        automatic: true
      });
      options.push({
        id: 'wait_and_retry',
        title: 'Wait and Retry',
        description: 'Wait 60 seconds and try again with original parameters',
        action: 'wait',
        automatic: false,
        delay: 60000
      });
      break;

    case ErrorTypes.IMAGE_MODEL_UNAVAILABLE:
      const fallbacks = getFallbackModels(context.modelId);
      if (fallbacks.length > 0) {
        options.push({
          id: 'fallback_model',
          title: 'Try Different Model',
          description: `Switch to ${fallbacks[0]} which may be available`,
          action: DegradationOptions.FALLBACK_MODEL,
          automatic: false,
          fallbackModel: fallbacks[0]
        });
      }
      break;

    case ErrorTypes.IMAGE_CONTENT_POLICY:
      options.push({
        id: 'modify_prompt',
        title: 'Modify Prompt',
        description: 'Edit your prompt to remove potentially inappropriate content',
        action: 'manual_edit',
        automatic: false
      });
      break;

    case ErrorTypes.IMAGE_PARAMETERS_INVALID:
      options.push({
        id: 'reset_parameters',
        title: 'Reset to Defaults',
        description: 'Use default parameters for the selected model',
        action: 'reset_defaults',
        automatic: true
      });
      break;

    default:
      // Generic retry option
      if (isRetryableError(errorInfo)) {
        options.push({
          id: 'retry',
          title: 'Try Again',
          description: 'Retry with the same parameters',
          action: 'retry',
          automatic: false
        });
      }
      break;
  }

  // Always add manual options
  options.push({
    id: 'edit_prompt',
    title: 'Edit Prompt',
    description: 'Modify your prompt and try again',
    action: 'manual_edit',
    automatic: false
  });

  return options;
}

/**
 * Execute recovery action
 * @param {Object} recoveryOption - Recovery option to execute
 * @param {Object} originalParams - Original generation parameters
 * @param {string} originalPrompt - Original prompt
 * @returns {Object} Modified parameters and prompt
 */
export function executeRecoveryAction(recoveryOption, originalParams, originalPrompt) {
  const result = {
    parameters: { ...originalParams },
    prompt: originalPrompt,
    modelId: originalParams.modelId || null
  };

  switch (recoveryOption.action) {
    case DegradationOptions.REDUCE_QUALITY:
    case DegradationOptions.REDUCE_DIMENSIONS:
    case DegradationOptions.SINGLE_IMAGE:
      result.parameters = applyGracefulDegradation(originalParams, recoveryOption.action);
      break;

    case DegradationOptions.FALLBACK_MODEL:
      if (recoveryOption.fallbackModel) {
        result.modelId = recoveryOption.fallbackModel;
      }
      break;

    case DegradationOptions.SIMPLIFY_PROMPT:
      // Provide guidance for prompt simplification
      result.promptSuggestion = simplifyPrompt(originalPrompt);
      break;

    case 'reset_defaults':
      // This would need model-specific defaults
      result.parameters = {
        width: 512,
        height: 512,
        quality: 'standard',
        numberOfImages: 1
      };
      break;

    default:
      // No changes for manual actions
      break;
  }

  return result;
}

/**
 * Simplify a prompt by removing complex elements
 * @param {string} prompt - Original prompt
 * @returns {string} Simplified prompt
 */
function simplifyPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return prompt;
  }

  // Remove complex style instructions
  let simplified = prompt
    .replace(/\b(highly detailed|ultra realistic|photorealistic|8k|4k|hdr)\b/gi, '')
    .replace(/\b(cinematic lighting|dramatic lighting|studio lighting)\b/gi, '')
    .replace(/\b(trending on artstation|award winning|masterpiece)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If still too long, take first sentence or first 100 characters
  if (simplified.length > 100) {
    const firstSentence = simplified.split('.')[0];
    if (firstSentence.length > 0 && firstSentence.length < simplified.length) {
      simplified = firstSentence;
    } else {
      simplified = simplified.substring(0, 100).trim();
    }
  }

  return simplified;
}

/**
 * Track error patterns for learning
 */
class ErrorPatternTracker {
  constructor() {
    this.patterns = new Map();
  }

  recordError(errorInfo, context) {
    const key = `${errorInfo.type}_${context.modelId || 'unknown'}`;
    const existing = this.patterns.get(key) || { count: 0, lastSeen: null };

    this.patterns.set(key, {
      count: existing.count + 1,
      lastSeen: new Date().toISOString(),
      errorType: errorInfo.type,
      modelId: context.modelId,
      severity: errorInfo.severity
    });
  }

  getFrequentErrors(limit = 5) {
    return Array.from(this.patterns.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, limit)
      .map(([key, data]) => ({ key, ...data }));
  }

  shouldSuggestFallback(errorType, modelId) {
    const key = `${errorType}_${modelId}`;
    const pattern = this.patterns.get(key);

    // Suggest fallback if we've seen this error 3+ times in the last hour
    if (pattern && pattern.count >= 3) {
      const lastSeen = new Date(pattern.lastSeen);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return lastSeen > oneHourAgo;
    }

    return false;
  }
}

// Export singleton instance
export const errorPatternTracker = new ErrorPatternTracker();

/**
 * Enhanced error handler specifically for image generation
 * @param {Error} error - The error to handle
 * @param {Object} context - Generation context
 * @param {Function} onRecoveryOptions - Callback with recovery options
 * @returns {Object} Enhanced error information with recovery options
 */
export function handleImageGenerationError(error, context, onRecoveryOptions = null) {
  const errorInfo = handleError(error, {
    component: 'ImageGeneration',
    ...context
  });

  // Track error pattern
  errorPatternTracker.recordError(errorInfo, context);

  // Create recovery options
  const recoveryOptions = createRecoveryOptions(errorInfo, context);

  // Enhanced error info with recovery
  const enhancedErrorInfo = {
    ...errorInfo,
    recoveryOptions,
    isRetryable: isRetryableError(errorInfo),
    retryConfig: getRetryConfig(errorInfo),
    fallbackModels: getFallbackModels(context.modelId),
    shouldSuggestFallback: errorPatternTracker.shouldSuggestFallback(errorInfo.type, context.modelId)
  };

  // Call recovery options callback
  if (onRecoveryOptions && typeof onRecoveryOptions === 'function') {
    onRecoveryOptions(enhancedErrorInfo);
  }

  return enhancedErrorInfo;
}