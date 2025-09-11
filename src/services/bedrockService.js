import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";

/**
 * Service class for AWS Bedrock integration
 * Handles model discovery, credential validation, and model invocation
 */
export class BedrockService {
  constructor() {
    this.runtimeClient = null;
    this.managementClient = null;
    this.isInitialized = false;
    this.credentialsValid = false;
  }

  /**
   * Detect available credential sources and provide helpful feedback
   */
  detectCredentialSources() {
    const sources = [];

    // Check for VITE_ prefixed environment variables (from .env.local or build process)
    if (import.meta.env.VITE_AWS_ACCESS_KEY_ID) {
      sources.push({
        type: 'vite-env',
        description: 'Vite environment variables (VITE_AWS_*)',
        hasSessionToken: !!import.meta.env.VITE_AWS_SESSION_TOKEN,
        region: import.meta.env.VITE_AWS_REGION,
        source: '.env.local or build environment'
      });
    }

    return sources;
  }

  /**
   * Initialize the Bedrock client with AWS credentials
   * Attempts to detect credentials from various sources
   */
  async initialize() {
    try {
      // Check for available credential sources
      const credentialSources = this.detectCredentialSources();

      if (credentialSources.length === 0) {
        throw new Error('No AWS credentials found. Please run your local-setup.sh script or create a .env.local file with VITE_AWS_* variables.');
      }

      console.log('Available credential sources:', credentialSources);

      const region = import.meta.env.VITE_AWS_REGION || 'us-east-1';

      const clientConfig = {
        region: region,
        // In a browser environment, credentials need to be provided explicitly
        // or through Cognito Identity Pool. For development, we'll try to use
        // environment variables if available
        ...(import.meta.env.VITE_AWS_ACCESS_KEY_ID && {
          credentials: {
            accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
            secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
            ...(import.meta.env.VITE_AWS_SESSION_TOKEN && {
              sessionToken: import.meta.env.VITE_AWS_SESSION_TOKEN
            })
          }
        })
      };

      // Initialize both Bedrock clients
      this.runtimeClient = new BedrockRuntimeClient(clientConfig);
      this.managementClient = new BedrockClient(clientConfig);

      // Test credentials by attempting to list models
      await this.validateCredentials();

      this.isInitialized = true;
      this.credentialsValid = true;

      return { success: true, message: 'AWS Bedrock client initialized successfully' };
    } catch (error) {
      this.isInitialized = false;
      this.credentialsValid = false;

      return {
        success: false,
        message: this.getCredentialErrorMessage(error),
        error: error
      };
    }
  }

  /**
   * Validate AWS credentials by making a test API call
   */
  async validateCredentials() {
    if (!this.managementClient) {
      throw new Error('Bedrock client not initialized');
    }

    try {
      // Make a simple API call to test credentials
      const command = new ListFoundationModelsCommand({
        byOutputModality: 'TEXT'
      });

      await this.managementClient.send(command);
      this.credentialsValid = true;
      return true;
    } catch (error) {
      this.credentialsValid = false;
      throw error;
    }
  }

  /**
   * Get available foundation models from AWS Bedrock
   * @returns {Promise<Array>} Array of model objects with id and name
   */
  async listFoundationModels() {
    if (!this.isInitialized || !this.credentialsValid) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    try {
      const command = new ListFoundationModelsCommand({
        byOutputModality: 'TEXT', // Only get text-generating models
        byInferenceType: 'ON_DEMAND' // Only get on-demand models
      });

      const response = await this.managementClient.send(command);

      // Transform the response to a more user-friendly format
      const models = response.modelSummaries?.map(model => ({
        id: model.modelId,
        name: this.getModelDisplayName(model.modelId),
        provider: model.providerName,
        inputModalities: model.inputModalities,
        outputModalities: model.outputModalities,
        responseStreamingSupported: model.responseStreamingSupported
      })) || [];

      // Sort models by provider and name for better UX
      return models.sort((a, b) => {
        if (a.provider !== b.provider) {
          return a.provider.localeCompare(b.provider);
        }
        return a.name.localeCompare(b.name);
      });

    } catch (error) {
      throw new Error(`Failed to list foundation models: ${error.message}`);
    }
  }

  /**
   * Invoke a foundation model with the given system prompt, user prompt and content using Converse API
   * @param {string} modelId - The model ID to invoke
   * @param {string} systemPrompt - The system prompt to send to the model
   * @param {string} userPrompt - The user prompt to send to the model
   * @param {string} content - Additional content/context for the model
   * @returns {Promise<Object>} The model response
   */
  async invokeModel(modelId, systemPrompt, userPrompt, content = '') {
    if (!this.isInitialized || !this.credentialsValid) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    try {
      // Combine user prompt and content if content exists
      const fullUserPrompt = content ? `${userPrompt}\n\nData to analyze:\n${content}` : userPrompt;

      // Prepare messages array for Converse API
      const messages = [
        {
          role: 'user',
          content: [
            {
              text: fullUserPrompt
            }
          ]
        }
      ];

      // Prepare the Converse API command
      const converseParams = {
        modelId: modelId,
        messages: messages,
        inferenceConfig: {
          maxTokens: 4000,
          temperature: 0.7
        }
      };

      // Add system prompt if provided using Converse API's native system message handling
      if (systemPrompt?.trim()) {
        converseParams.system = [
          {
            text: systemPrompt
          }
        ];
      }

      const command = new ConverseCommand(converseParams);
      const response = await this.runtimeClient.send(command);

      // Parse the Converse API response
      return this.parseConverseResponse(response);

    } catch (error) {
      throw new Error(`Failed to invoke model ${modelId}: ${error.message}`);
    }
  }

  /**
   * Parse the response from the Converse API
   * @private
   */
  parseConverseResponse(response) {
    try {
      // Extract text from the Converse API response
      const text = response.output?.message?.content?.[0]?.text || 'No response generated';

      // Extract usage information if available
      const usage = response.usage ? {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        total_tokens: response.usage.totalTokens
      } : null;

      return {
        text: text,
        usage: usage
      };
    } catch (error) {
      throw new Error(`Failed to parse Converse API response: ${error.message}`);
    }
  }

  /**
   * Get a user-friendly display name for a model ID
   * @private
   */
  getModelDisplayName(modelId) {
    const modelNames = {
      'amazon.nova-pro-v1:0': 'Amazon Nova Pro',
      'amazon.nova-lite-v1:0': 'Amazon Nova Lite',
      'amazon.nova-micro-v1:0': 'Amazon Nova Micro',
      'anthropic.claude-3-5-sonnet-20241022-v2:0': 'Claude 3.5 Sonnet (v2)',
      'anthropic.claude-3-5-sonnet-20240620-v1:0': 'Claude 3.5 Sonnet (v1)',
      'anthropic.claude-3-5-haiku-20241022-v1:0': 'Claude 3.5 Haiku',
      'anthropic.claude-3-haiku-20240307-v1:0': 'Claude 3 Haiku',
      'anthropic.claude-3-sonnet-20240229-v1:0': 'Claude 3 Sonnet',
      'anthropic.claude-3-opus-20240229-v1:0': 'Claude 3 Opus',
      'meta.llama3-2-90b-instruct-v1:0': 'Llama 3.2 90B Instruct',
      'meta.llama3-2-11b-instruct-v1:0': 'Llama 3.2 11B Instruct',
      'meta.llama3-2-3b-instruct-v1:0': 'Llama 3.2 3B Instruct',
      'meta.llama3-2-1b-instruct-v1:0': 'Llama 3.2 1B Instruct',
      'meta.llama3-1-70b-instruct-v1:0': 'Llama 3.1 70B Instruct',
      'meta.llama3-1-8b-instruct-v1:0': 'Llama 3.1 8B Instruct'
    };

    return modelNames[modelId] || modelId;
  }

  /**
   * Get a user-friendly error message for credential issues
   * @private
   */
  getCredentialErrorMessage(error) {
    const errorCode = error.name || error.code;
    const errorMessage = error.message || '';

    if (errorCode === 'CredentialsProviderError' || errorMessage.includes('credentials')) {
      return 'AWS credentials not found. Please run your local-setup.sh script to set up SSO credentials, or create a .env.local file with VITE_AWS_* variables.';
    }

    if (errorCode === 'UnauthorizedOperation' || errorCode === 'AccessDenied') {
      return 'Access denied. Please ensure your AWS credentials have permission to access Amazon Bedrock and that Bedrock is enabled in your account.';
    }

    if (errorCode === 'ValidationException' && errorMessage.includes('region')) {
      return 'Invalid AWS region. Please ensure Bedrock is available in your configured region (try us-east-1 or us-west-2).';
    }

    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('network')) {
      return 'Network error. Please check your internet connection and try again.';
    }

    if (errorMessage.includes('CORS')) {
      return 'CORS error. This browser-based application may need to be served from a local server to access AWS APIs properly.';
    }

    return `AWS Bedrock initialization failed: ${errorMessage}`;
  }

  /**
   * Execute multiple identical requests with the same configuration
   * Used for determinism evaluation - runs the same prompt multiple times
   * @param {string} modelId - The model ID to invoke
   * @param {string} systemPrompt - The system prompt to send to the model
   * @param {string} userPrompt - The user prompt to send to the model
   * @param {string} content - Additional content/context for the model
   * @param {number} count - Number of requests to execute (default: 29)
   * @param {Object} options - Additional options for batch execution
   * @returns {Promise<Array>} Array of response objects
   */
  async executeBatchRequests(modelId, systemPrompt, userPrompt, content = '', count = 29, options = {}) {
    if (!this.isInitialized || !this.credentialsValid) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    const {
      concurrency = 5, // Default concurrency limit
      onProgress = null, // Progress callback function
      onError = null, // Error callback function
      retryAttempts = 2, // Number of retry attempts per request (reduced to avoid hammering)
      retryDelay = 1000, // Base delay between retries (ms)
      maxRetryDelay = 30000, // Maximum delay between retries
      requestDelay = 0, // Delay between individual requests (ms)
      onNetworkError = null, // Network error callback
      pauseOnNetworkError = false // Whether to pause on network errors
    } = options;

    const responses = [];
    const errors = [];
    let completed = 0;
    let networkErrorCount = 0;
    let consecutiveNetworkErrors = 0;

    // Create request configuration for deduplication
    const requestConfig = {
      modelId,
      systemPrompt,
      userPrompt,
      content,
      timestamp: Date.now()
    };

    // Execute requests in batches to respect concurrency limits
    const batches = [];
    for (let i = 0; i < count; i += concurrency) {
      const batchSize = Math.min(concurrency, count - i);
      const batch = Array.from({ length: batchSize }, (_, index) => i + index);
      batches.push(batch);
    }

    for (const batch of batches) {
      // Check for too many consecutive network errors
      if (consecutiveNetworkErrors >= 3) {
        const error = new Error('Too many consecutive network errors. Please check your connection and try again.');
        if (onNetworkError) {
          onNetworkError(error, networkErrorCount);
        }
        throw error;
      }

      const batchPromises = batch.map(async (requestIndex) => {
        // Add delay between requests if specified
        if (requestDelay > 0 && requestIndex > 0) {
          await new Promise(resolve => setTimeout(resolve, requestDelay));
        }

        let lastError = null;

        // Retry logic for individual requests
        for (let attempt = 0; attempt <= retryAttempts; attempt++) {
          try {
            const response = await this.invokeModel(modelId, systemPrompt, userPrompt, content);

            // Reset consecutive network error count on success
            consecutiveNetworkErrors = 0;

            // Add metadata to response
            const enrichedResponse = {
              ...response,
              requestIndex,
              requestConfig,
              timestamp: Date.now(),
              attempt: attempt + 1
            };

            responses[requestIndex] = enrichedResponse;
            completed++;

            // Call progress callback if provided
            if (onProgress) {
              onProgress({
                completed,
                total: count,
                progress: (completed / count) * 100,
                currentBatch: batch,
                requestIndex,
                networkErrors: networkErrorCount
              });
            }

            return enrichedResponse;
          } catch (error) {
            lastError = error;

            // Check if this is a network error
            const isNetworkErr = this.isNetworkError(error);
            if (isNetworkErr) {
              networkErrorCount++;
              consecutiveNetworkErrors++;

              if (onNetworkError) {
                onNetworkError(error, networkErrorCount);
              }

              // If configured to pause on network errors and we have multiple failures
              if (pauseOnNetworkError && consecutiveNetworkErrors >= 2) {
                throw new Error('Network connectivity issues detected. Evaluation paused.');
              }
            } else {
              // Reset consecutive network errors for non-network errors
              consecutiveNetworkErrors = 0;
            }

            // If this isn't the last attempt, wait before retrying
            if (attempt < retryAttempts) {
              let delay = retryDelay * Math.pow(2, attempt); // Exponential backoff

              // Special handling for rate limiting errors - use much longer delays
              if (this.isRateLimitError(error)) {
                const baseRateLimitDelay = 30000; // Start with 30 seconds
                delay = baseRateLimitDelay * Math.pow(2, attempt); // 30s, 60s, 120s
                console.log(`Rate limit hit on request ${requestIndex + 1}, waiting ${delay}ms before retry ${attempt + 2}`);
              } else if (isNetworkErr) {
                // Increase delay for network errors
                delay = Math.min(delay * 2, maxRetryDelay);
              } else {
                // Cap the delay for other errors
                delay = Math.min(delay, maxRetryDelay);
              }

              // Final cap on delay
              delay = Math.min(delay, 300000); // Max 5 minutes

              if (!this.isRateLimitError(error)) {
                console.log(`Retrying request ${requestIndex + 1} (attempt ${attempt + 2}) after ${delay}ms`);
              }
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }

        // If we get here, all retry attempts failed
        const errorInfo = {
          requestIndex,
          error: lastError,
          requestConfig,
          timestamp: Date.now(),
          isNetworkError: this.isNetworkError(lastError),
          isThrottlingError: this.isRateLimitError(lastError)
        };

        errors.push(errorInfo);

        if (onError) {
          onError(errorInfo);
        }

        // Return null for failed requests to maintain array indexing
        return null;
      });

      // Wait for current batch to complete before starting next batch
      await Promise.all(batchPromises);

      // Add delay between batches if we've had network errors
      if (networkErrorCount > 0 && batch !== batches[batches.length - 1]) {
        const batchDelay = Math.min(1000 + (networkErrorCount * 500), 5000);
        console.log(`Adding ${batchDelay}ms delay between batches due to network errors`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    // Filter out null responses (failed requests) and return results
    const successfulResponses = responses.filter(response => response !== null);

    // Check if we have too few successful responses
    const successRate = (successfulResponses.length / count) * 100;
    if (successRate < 50) {
      console.warn(`Low success rate: ${successRate.toFixed(1)}% (${successfulResponses.length}/${count})`);
    }

    return {
      responses: successfulResponses,
      errors,
      summary: {
        total: count,
        successful: successfulResponses.length,
        failed: errors.length,
        successRate,
        networkErrors: networkErrorCount,
        requestConfig
      }
    };
  }

  /**
   * Check if an error is network-related
   * @private
   */
  isNetworkError(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || error.name || '';

    return (
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection') ||
      errorCode === 'NetworkError' ||
      errorCode === 'TimeoutError'
    );
  }

  /**
   * Execute a single request with retry logic and error handling
   * Used internally by batch execution but can also be used standalone
   * @param {Object} config - Request configuration
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Response object with metadata
   */
  async executeRequestWithRetry(config, options = {}) {
    const {
      retryAttempts = 3,
      retryDelay = 1000,
      requestIndex = 0
    } = options;

    const { modelId, systemPrompt, userPrompt, content } = config;
    let lastError = null;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        const response = await this.invokeModel(modelId, systemPrompt, userPrompt, content);

        return {
          ...response,
          requestIndex,
          requestConfig: config,
          timestamp: Date.now(),
          attempt: attempt + 1,
          success: true
        };
      } catch (error) {
        lastError = error;

        // Check if this is a rate limiting error
        if (this.isRateLimitError(error) && attempt < retryAttempts) {
          // Use much longer delays for rate limit errors to avoid hammering
          const baseRateLimitDelay = 30000; // Start with 30 seconds
          const delay = baseRateLimitDelay * Math.pow(2, attempt); // 30s, 60s, 120s
          console.log(`Rate limit hit, waiting ${delay}ms before retry ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (attempt < retryAttempts) {
          // Use linear backoff for other errors
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // All attempts failed
    throw new Error(`Request failed after ${retryAttempts + 1} attempts: ${lastError.message}`);
  }

  /**
   * Check if an error is related to rate limiting
   * @private
   */
  isRateLimitError(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || error.name || '';

    return (
      errorCode === 'ThrottlingException' ||
      errorCode === 'TooManyRequestsException' ||
      errorMessage.includes('throttl') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests')
    );
  }

  /**
   * Deduplicate requests based on configuration
   * Returns cached response if identical request was made recently
   * @param {Object} requestConfig - Request configuration to check
   * @param {number} cacheTimeMs - Cache validity time in milliseconds (default: 5 minutes)
   * @returns {Object|null} Cached response or null if not found/expired
   */
  deduplicateRequest(requestConfig, cacheTimeMs = 5 * 60 * 1000) {
    // Simple in-memory cache for request deduplication
    if (!this.requestCache) {
      this.requestCache = new Map();
    }

    const requestKey = this.generateRequestKey(requestConfig);
    const cached = this.requestCache.get(requestKey);

    if (cached && (Date.now() - cached.timestamp) < cacheTimeMs) {
      return {
        ...cached.response,
        fromCache: true,
        cacheAge: Date.now() - cached.timestamp
      };
    }

    return null;
  }

  /**
   * Cache a request response for deduplication
   * @param {Object} requestConfig - Request configuration
   * @param {Object} response - Response to cache
   */
  cacheRequest(requestConfig, response) {
    if (!this.requestCache) {
      this.requestCache = new Map();
    }

    const requestKey = this.generateRequestKey(requestConfig);
    this.requestCache.set(requestKey, {
      response: { ...response },
      timestamp: Date.now()
    });

    // Clean up old cache entries (keep last 100 entries)
    if (this.requestCache.size > 100) {
      const entries = Array.from(this.requestCache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);

      this.requestCache.clear();
      entries.slice(0, 100).forEach(([key, value]) => {
        this.requestCache.set(key, value);
      });
    }
  }

  /**
   * Generate a unique key for request configuration
   * @private
   */
  generateRequestKey(config) {
    const { modelId, systemPrompt, userPrompt, content } = config;
    const keyData = JSON.stringify({
      modelId,
      systemPrompt: systemPrompt?.trim() || '',
      userPrompt: userPrompt?.trim() || '',
      content: content?.trim() || ''
    });

    // Simple hash function for the key
    let hash = 0;
    for (let i = 0; i < keyData.length; i++) {
      const char = keyData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `req_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Clear the request cache
   */
  clearRequestCache() {
    if (this.requestCache) {
      this.requestCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    if (!this.requestCache) {
      return { size: 0, entries: [] };
    }

    const entries = Array.from(this.requestCache.entries()).map(([key, value]) => ({
      key,
      timestamp: value.timestamp,
      age: Date.now() - value.timestamp
    }));

    return {
      size: this.requestCache.size,
      entries: entries.sort((a, b) => b.timestamp - a.timestamp)
    };
  }

  /**
   * Check if the service is properly initialized and credentials are valid
   */
  isReady() {
    return this.isInitialized && this.credentialsValid;
  }

  /**
   * Get the current initialization status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      credentialsValid: this.credentialsValid,
      ready: this.isReady()
    };
  }
}

// Export a singleton instance
export const bedrockService = new BedrockService();
