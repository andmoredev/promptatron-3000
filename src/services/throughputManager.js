import { ServiceQuotasClient, GetServiceQuotaCommand } from "@aws-sdk/client-service-quotas";
import { handleError, retryWithBackoff, ErrorTypes } from '../utils/errorHandling.js';

/**
 * ThroughputManager handles AWS Bedrock rate limiting and concurrent request management
 * Integrates with AWS Service Quotas API to detect model limits and implements
 * exponential backoff and retry mechanisms for throttling
 */
export class ThroughputManager {
  constructor() {
    this.serviceQuotasClient = null;
    this.modelLimits = new Map();
    this.isInitialized = false;

    // Default conservative limits when AWS limits cannot be determined
    this.defaultLimits = {
      'anthropic.claude-3-5-sonnet': { requestsPerMinute: 50, tokensPerMinute: 40000 },
      'anthropic.claude-3-haiku': { requestsPerMinute: 100, tokensPerMinute: 25000 },
      'amazon.nova-pro': { requestsPerMinute: 30, tokensPerMinute: 30000 },
      'meta.llama3-1-70b': { requestsPerMinute: 20, tokensPerMinute: 20000 },
      default: { requestsPerMinute: 10, tokensPerMinute: 10000 }
    };

    // Active request tracking for rate limiting
    this.activeRequests = new Map(); // modelId -> { count, timestamps[] }
    this.requestQueue = new Map(); // modelId -> request[]
  }

  /**
   * Initialize the ThroughputManager with AWS credentials
   * @param {Object} awsConfig - AWS configuration object
   */
  async initialize(awsConfig) {
    try {
      if (!awsConfig) {
        throw new Error('AWS configuration is required');
      }

      this.serviceQuotasClient = new ServiceQuotasClient(awsConfig);
      this.isInitialized = true;

      console.log('ThroughputManager initialized successfully');
      return { success: true };
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'ThroughputManager',
        operation: 'initialize'
      });

      return {
        success: false,
        message: errorInfo.userMessage,
        error: errorInfo
      };
    }
  }

  /**
   * Get throughput limits for a specific model from AWS Service Quotas API
   * @param {string} modelId - The Bedrock model ID
   * @returns {Promise<Object>} Model limits object
   */
  async getModelLimits(modelId) {
    // Check cache first
    if (this.modelLimits.has(modelId)) {
      return this.modelLimits.get(modelId);
    }

    try {
      const limits = await this.fetchModelLimitsFromAWS(modelId);
      this.modelLimits.set(modelId, limits);
      return limits;
    } catch (error) {
      console.warn(`Failed to fetch AWS limits for ${modelId}, using defaults:`, error.message);

      // Use default limits as fallback
      const defaultLimit = this.getDefaultLimits(modelId);
      this.modelLimits.set(modelId, defaultLimit);
      return defaultLimit;
    }
  }

  /**
   * Fetch model limits from AWS Service Quotas API
   * @private
   * @param {string} modelId - The Bedrock model ID
   * @returns {Promise<Object>} Model limits from AWS
   */
  async fetchModelLimitsFromAWS(modelId) {
    if (!this.isInitialized || !this.serviceQuotasClient) {
      throw new Error('ThroughputManager not initialized');
    }

    // Map model IDs to their corresponding service quota codes
    const quotaCodes = this.getServiceQuotaCodes(modelId);

    // If no quota codes are available, fall back to defaults
    if (!quotaCodes.requestsPerMinute && !quotaCodes.tokensPerMinute) {
      throw new Error(`No quota codes available for model ${modelId}`);
    }

    const limits = {};

    // Fetch requests per minute quota
    if (quotaCodes.requestsPerMinute) {
      const requestsCommand = new GetServiceQuotaCommand({
        ServiceCode: 'bedrock',
        QuotaCode: quotaCodes.requestsPerMinute
      });

      const requestsResponse = await retryWithBackoff(
        () => this.serviceQuotasClient.send(requestsCommand),
        { maxRetries: 2, baseDelay: 1000 }
      );

      limits.requestsPerMinute = requestsResponse.Quota?.Value || this.getDefaultLimits(modelId).requestsPerMinute;
    }

    // Fetch tokens per minute quota
    if (quotaCodes.tokensPerMinute) {
      const tokensCommand = new GetServiceQuotaCommand({
        ServiceCode: 'bedrock',
        QuotaCode: quotaCodes.tokensPerMinute
      });

      const tokensResponse = await retryWithBackoff(
        () => this.serviceQuotasClient.send(tokensCommand),
        { maxRetries: 2, baseDelay: 1000 }
      );

      limits.tokensPerMinute = tokensResponse.Quota?.Value || this.getDefaultLimits(modelId).tokensPerMinute;
    }

    return {
      requestsPerMinute: limits.requestsPerMinute || this.getDefaultLimits(modelId).requestsPerMinute,
      tokensPerMinute: limits.tokensPerMinute || this.getDefaultLimits(modelId).tokensPerMinute,
      source: 'aws-service-quotas'
    };
  }

  /**
   * Get service quota codes for a specific model
   * @private
   * @param {string} modelId - The Bedrock model ID
   * @returns {Object} Service quota codes
   */
  getServiceQuotaCodes(modelId) {
    // AWS Service Quotas codes for different Bedrock models
    // These codes may need to be updated based on AWS documentation
    const quotaCodeMap = {
      'anthropic.claude-3-5-sonnet': {
        requestsPerMinute: 'L-3E8C9F8B', // Example quota code
        tokensPerMinute: 'L-4E8C9F8C'
      },
      'anthropic.claude-3-haiku': {
        requestsPerMinute: 'L-5E8C9F8D',
        tokensPerMinute: 'L-6E8C9F8E'
      },
      'amazon.nova-pro': {
        requestsPerMinute: 'L-7E8C9F8F',
        tokensPerMinute: 'L-8E8C9F90'
      },
      'meta.llama3-1-70b': {
        requestsPerMinute: 'L-9E8C9F91',
        tokensPerMinute: 'L-AE8C9F92'
      }
    };

    return quotaCodeMap[modelId] || {};
  }

  /**
   * Get default limits for a model when AWS limits are unavailable
   * @private
   * @param {string} modelId - The Bedrock model ID
   * @returns {Object} Default limits
   */
  getDefaultLimits(modelId) {
    return {
      ...this.defaultLimits[modelId] || this.defaultLimits.default,
      source: 'default'
    };
  }

  /**
   * Execute multiple requests with concurrency control and rate limiting
   * @param {Array} requests - Array of request functions to execute
   * @param {string} modelId - The model ID for rate limiting
   * @param {Object} options - Execution options
   * @returns {Promise<Array>} Array of results
   */
  async executeConcurrentRequests(requests, modelId, options = {}) {
    const {
      maxConcurrency = null, // Will be calculated based on model limits
      onProgress = null,
      onThrottle = null
    } = options;

    if (!requests || requests.length === 0) {
      return [];
    }

    // Get model limits
    const limits = await this.getModelLimits(modelId);

    // Calculate safe concurrency level
    const concurrency = maxConcurrency || this.calculateSafeConcurrency(limits);

    console.log(`Executing ${requests.length} requests for ${modelId} with concurrency ${concurrency}`);
    console.log(`Model limits:`, limits);

    const results = [];
    const errors = [];
    let completed = 0;

    // Initialize request tracking for this model
    if (!this.activeRequests.has(modelId)) {
      this.activeRequests.set(modelId, { count: 0, timestamps: [] });
    }

    // Process requests in batches
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);

      // Execute batch with rate limiting
      const batchResults = await Promise.allSettled(
        batch.map(async (requestFn, batchIndex) => {
          const globalIndex = i + batchIndex;

          try {
            // Wait for rate limit clearance
            await this.waitForRateLimit(modelId, limits);

            // Track request start
            this.trackRequestStart(modelId);

            // Execute request with retry logic
            const result = await retryWithBackoff(
              requestFn,
              {
                maxRetries: 3,
                baseDelay: 1000,
                maxDelay: 16000,
                backoffFactor: 2,
                onRetry: (error, attempt, delay) => {
                  console.log(`Retrying request ${globalIndex + 1} (attempt ${attempt}) after ${delay}ms:`, error.message);

                  if (onThrottle && this.isThrottlingError(error)) {
                    onThrottle(error, attempt, delay);
                  }
                }
              }
            );

            // Track request completion
            this.trackRequestComplete(modelId);

            return result;
          } catch (error) {
            // Track request completion even on error
            this.trackRequestComplete(modelId);
            throw error;
          }
        })
      );

      // Process batch results
      batchResults.forEach((result, batchIndex) => {
        const globalIndex = i + batchIndex;

        if (result.status === 'fulfilled') {
          results[globalIndex] = result.value;
        } else {
          const errorInfo = handleError(result.reason, {
            component: 'ThroughputManager',
            operation: 'executeConcurrentRequests',
            requestIndex: globalIndex,
            modelId
          });

          results[globalIndex] = null;
          errors.push({ index: globalIndex, error: errorInfo });
        }

        completed++;

        if (onProgress) {
          onProgress(completed, requests.length, errors.length);
        }
      });

      // Add delay between batches to respect rate limits
      if (i + concurrency < requests.length) {
        const batchDelay = this.calculateBatchDelay(limits, concurrency);
        if (batchDelay > 0) {
          console.log(`Waiting ${batchDelay}ms between batches for rate limiting`);
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }
    }

    console.log(`Completed ${completed} requests with ${errors.length} errors`);

    return {
      results,
      errors,
      completed,
      total: requests.length,
      successRate: ((completed - errors.length) / requests.length) * 100
    };
  }

  /**
   * Calculate safe concurrency level based on model limits
   * @private
   * @param {Object} limits - Model limits
   * @returns {number} Safe concurrency level
   */
  calculateSafeConcurrency(limits) {
    // Use 70% of the rate limit to leave buffer for other operations
    const safeRequestsPerMinute = Math.floor(limits.requestsPerMinute * 0.7);

    // Assume each request takes about 2-5 seconds on average
    const avgRequestDurationSeconds = 3;
    const requestsPerSecond = safeRequestsPerMinute / 60;

    // Calculate concurrency that won't exceed rate limits
    const maxConcurrency = Math.max(1, Math.floor(requestsPerSecond * avgRequestDurationSeconds));

    // Cap at reasonable maximum to avoid overwhelming the system
    return Math.min(maxConcurrency, 10);
  }

  /**
   * Wait for rate limit clearance before making a request
   * @private
   * @param {string} modelId - Model ID
   * @param {Object} limits - Model limits
   */
  async waitForRateLimit(modelId, limits) {
    const tracking = this.activeRequests.get(modelId);
    if (!tracking) return;

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean up old timestamps
    tracking.timestamps = tracking.timestamps.filter(timestamp => timestamp > oneMinuteAgo);

    // Check if we're approaching the rate limit
    if (tracking.timestamps.length >= limits.requestsPerMinute * 0.9) {
      const oldestTimestamp = Math.min(...tracking.timestamps);
      const waitTime = oldestTimestamp + 60000 - now;

      if (waitTime > 0) {
        console.log(`Rate limit approached for ${modelId}, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Track the start of a request
   * @private
   * @param {string} modelId - Model ID
   */
  trackRequestStart(modelId) {
    if (!this.activeRequests.has(modelId)) {
      this.activeRequests.set(modelId, { count: 0, timestamps: [] });
    }

    const tracking = this.activeRequests.get(modelId);
    tracking.count++;
    tracking.timestamps.push(Date.now());
  }

  /**
   * Track the completion of a request
   * @private
   * @param {string} modelId - Model ID
   */
  trackRequestComplete(modelId) {
    const tracking = this.activeRequests.get(modelId);
    if (tracking && tracking.count > 0) {
      tracking.count--;
    }
  }

  /**
   * Calculate delay between batches to respect rate limits
   * @private
   * @param {Object} limits - Model limits
   * @param {number} batchSize - Size of each batch
   * @returns {number} Delay in milliseconds
   */
  calculateBatchDelay(limits, batchSize) {
    // Calculate minimum time between batches to stay within rate limits
    const requestsPerSecond = limits.requestsPerMinute / 60;
    const minTimeBetweenRequests = 1000 / requestsPerSecond; // ms

    return Math.max(0, minTimeBetweenRequests * batchSize - 1000); // Subtract 1s for request processing time
  }

  /**
   * Check if an error is a throttling error
   * @private
   * @param {Error} error - Error to check
   * @returns {boolean} True if it's a throttling error
   */
  isThrottlingError(error) {
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';

    return message.includes('throttl') ||
           message.includes('rate limit') ||
           message.includes('too many requests') ||
           code.includes('throttl') ||
           code === 'throttlingexception';
  }

  /**
   * Get current status of the throughput manager
   * @returns {Object} Status information
   */
  getStatus() {
    const activeModels = Array.from(this.activeRequests.entries()).map(([modelId, tracking]) => ({
      modelId,
      activeRequests: tracking.count,
      recentRequests: tracking.timestamps.length,
      limits: this.modelLimits.get(modelId)
    }));

    return {
      initialized: this.isInitialized,
      cachedLimits: this.modelLimits.size,
      activeModels,
      defaultLimitsAvailable: Object.keys(this.defaultLimits).length
    };
  }

  /**
   * Clear cached limits and reset tracking
   */
  reset() {
    this.modelLimits.clear();
    this.activeRequests.clear();
    this.requestQueue.clear();
    console.log('ThroughputManager reset completed');
  }
}

// Export singleton instance
export const throughputManager = new ThroughputManager();
