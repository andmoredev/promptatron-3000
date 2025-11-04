/**
 * Base class for all meta-agents with common functionality
 * Follows the established service patterns in the codebase
 */

import { bedrockService } from './bedrockService.js';
import { handleError, retryWithBackoff } from '../utils/errorHandling.js';

export class BaseMetaAgent {
  constructor(type, config = {}) {
    this.type = type;
    this.config = {
      modelId: 'amazon.nova-pro-v1:0',
      maxTokens: 4000,
      temperature: 0.7,
      ...config
    };
    this.bedrockService = bedrockService;
  }

  /**
   * Abstract method - must be implemented by subclasses
   * @param {Object} baselineResult - The baseline LLM response to analyze
   * @returns {Promise<Object>} Meta-agent evaluation result
   */
  async evaluate(baselineResult) {
    throw new Error('evaluate() must be implemented by subclass');
  }

  /**
   * Common LLM invocation for meta-agent analysis with retry logic
   * Supports both text and image analysis contexts
   * @param {string} systemPrompt - System prompt for the meta-agent
   * @param {string} analysisPrompt - Analysis prompt with context
   * @param {Object} context - Context data for analysis
   * @param {Object} options - Additional options (imageData, analysisType)
   * @returns {Promise<Object>} LLM response
   */
  async invokeMetaAgent(systemPrompt, analysisPrompt, context, options = {}) {
    const retryOptions = {
      maxRetries: this.getConfig('maxRetries', 3),
      baseDelay: this.getConfig('retryBaseDelay', 1000),
      maxDelay: this.getConfig('retryMaxDelay', 10000),
      backoffFactor: this.getConfig('retryBackoffFactor', 2),
      onRetry: (error, attempt, delay) => {
        console.warn(`[${this.type}] Retry attempt ${attempt} after ${delay}ms due to:`, error.message);
      }
    };

    try {
      const result = await retryWithBackoff(async () => {
        if (!this.bedrockService.isReady()) {
          const initResult = await this.bedrockService.initialize();
          if (!initResult.success) {
            throw new Error(`Bedrock service not ready: ${initResult.message}`);
          }
        }

        // Handle image analysis context
        if (options.imageData && options.analysisType === 'image') {
          return await this.bedrockService.invokeModelWithImage(
            this.config.modelId,
            systemPrompt,
            analysisPrompt,
            options.imageData,
            JSON.stringify(context, null, 2)
          );
        } else {
          // Standard text analysis
          return await this.bedrockService.invokeModel(
            this.config.modelId,
            systemPrompt,
            analysisPrompt,
            JSON.stringify(context, null, 2)
          );
        }
      }, retryOptions);

      return result;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'BaseMetaAgent',
        operation: 'invokeMetaAgent',
        agentType: this.type,
        modelId: this.config.modelId,
        retryAttempts: retryOptions.maxRetries
      });

      throw new Error(`Meta-agent invocation failed after ${retryOptions.maxRetries} retries: ${errorInfo.userMessage}`);
    }
  }

  /**
   * Create fallback response for failed meta-agent evaluations
   * @param {Error} error - The error that caused the failure
   * @param {string} reason - Reason for the fallback
   * @returns {Object} Fallback meta-agent result
   */
  createFallbackResponse(error, reason = 'evaluation_failed') {
    const errorMessage = error?.message || 'Unknown error occurred';

    return this.formatResult(
      `Meta-agent evaluation could not be completed: ${errorMessage}. This response should be reviewed manually.`,
      'warning',
      0,
      {
        fallback: true,
        reason,
        originalError: errorMessage,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Determine if an error is retryable
   * @param {Error} error - The error to check
   * @returns {boolean} True if the error should be retried
   */
  isRetryableError(error) {
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorCode = error?.code?.toLowerCase() || '';

    // Network and temporary service errors are retryable
    const retryablePatterns = [
      'network',
      'timeout',
      'throttling',
      'rate limit',
      'service unavailable',
      'temporary',
      'connection',
      'enotfound',
      'econnreset'
    ];

    // Permanent errors that should not be retried
    const nonRetryablePatterns = [
      'credentials',
      'access denied',
      'unauthorized',
      'forbidden',
      'invalid model',
      'validation',
      'parse error'
    ];

    // Check for non-retryable errors first
    for (const pattern of nonRetryablePatterns) {
      if (errorMessage.includes(pattern) || errorCode.includes(pattern)) {
        return false;
      }
    }

    // Check for retryable errors
    for (const pattern of retryablePatterns) {
      if (errorMessage.includes(pattern) || errorCode.includes(pattern)) {
        return true;
      }
    }

    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Common result formatting for meta-agent responses
   * @param {string} analysis - Analysis text from the meta-agent
   * @param {string} recommendation - 'accept' | 'reject' | 'warning'
   * @param {number} confidence - Confidence score 0-100
   * @param {Object} details - Additional details specific to the meta-agent
   * @returns {Object} Formatted meta-agent result
   */
  formatResult(analysis, recommendation, confidence, details = {}) {
    return {
      agentType: this.type,
      recommendation: recommendation.toLowerCase(),
      confidence: Math.max(0, Math.min(100, confidence)),
      analysis,
      details,
      timestamp: new Date().toISOString(),
      modelId: this.config.modelId
    };
  }

  /**
   * Parse meta-agent response with fallback handling
   * @param {string} response - Raw response text from meta-agent
   * @returns {Object} Parsed response with fallback values
   */
  parseMetaAgentResponse(response) {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);

      // Validate required fields
      if (!parsed.recommendation) {
        throw new Error('Missing recommendation field');
      }

      return {
        recommendation: parsed.recommendation,
        confidence: parsed.confidence || 50,
        analysis: parsed.analysis || response,
        ...parsed
      };
    } catch (error) {
      console.warn(`[${this.type}] Failed to parse JSON response, using fallback:`, error);

      // Fallback parsing for non-JSON responses
      const lowerResponse = response.toLowerCase();
      let recommendation = 'warning';
      let confidence = 50;

      if (lowerResponse.includes('accept') || lowerResponse.includes('approve')) {
        recommendation = 'accept';
        confidence = 70;
      } else if (lowerResponse.includes('reject') || lowerResponse.includes('deny')) {
        recommendation = 'reject';
        confidence = 70;
      }

      return {
        recommendation,
        confidence,
        analysis: response,
        parseError: true,
        originalError: error.message
      };
    }
  }

  /**
   * Validate baseline result structure
   * @param {Object} baselineResult - The baseline result to validate
   * @returns {boolean} True if valid structure
   */
  validateBaselineResult(baselineResult) {
    if (!baselineResult || typeof baselineResult !== 'object') {
      return false;
    }

    // Check for required fields
    const requiredFields = ['response'];
    for (const field of requiredFields) {
      if (!baselineResult[field]) {
        console.warn(`[${this.type}] Missing required field in baseline result: ${field}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Get configuration value with fallback
   * @param {string} key - Configuration key
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} Configuration value
   */
  getConfig(key, defaultValue = null) {
    return this.config.hasOwnProperty(key) ? this.config[key] : defaultValue;
  }

  /**
   * Update configuration
   * @param {Object} updates - Configuration updates
   */
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get meta-agent status information
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      type: this.type,
      modelId: this.config.modelId,
      ready: this.bedrockService.isReady(),
      config: { ...this.config }
    };
  }
}