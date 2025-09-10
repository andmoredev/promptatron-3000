import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
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
   * Invoke a foundation model with streaming response using ConverseStream API
   * @param {string} modelId - The model ID to invoke
   * @param {string} systemPrompt - The system prompt to send to the model
   * @param {string} userPrompt - The user prompt to send to the model
   * @param {string} content - Additional content/context for the model
   * @param {Function} onToken - Callback function called for each token received
   * @param {Function} onComplete - Callback function called when streaming completes
   * @param {Function} onError - Callback function called if streaming fails
   * @returns {Promise<Object>} The complete model response
   */
  async invokeModelStream(modelId, systemPrompt, userPrompt, content = '', onToken, onComplete, onError) {
    if (!this.isInitialized || !this.credentialsValid) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    // Pre-flight model compatibility check
    const compatibilityCheck = await this.checkModelCompatibility(modelId);
    if (!compatibilityCheck.supportsStreaming) {
      console.warn(`Model ${modelId} doesn't support streaming: ${compatibilityCheck.reason}`);
      onError?.(new Error(`Streaming not supported: ${compatibilityCheck.reason}`));

      // Graceful fallback to non-streaming
      try {
        const result = await this.invokeModel(modelId, systemPrompt, userPrompt, content);
        onComplete?.(result);
        return result;
      } catch (fallbackError) {
        const finalError = new Error(`Model doesn't support streaming and fallback failed: ${fallbackError.message}`);
        onError?.(finalError);
        throw finalError;
      }
    }

    // Use retry logic for streaming with exponential backoff
    return await this.retryWithBackoff(
      async () => {
        return await this._performStreamingRequest(
          modelId, systemPrompt, userPrompt, content, onToken, onComplete, onError
        );
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        onRetry: (error, attempt, delay) => {
          console.warn(`Streaming attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
          onError?.(new Error(`Connection interrupted (attempt ${attempt}). Retrying in ${Math.round(delay/1000)}s...`));
        }
      }
    );
  }

  /**
   * Perform the actual streaming request (separated for retry logic)
   * @private
   */
  async _performStreamingRequest(modelId, systemPrompt, userPrompt, content, onToken, onComplete, onError) {
    try {
      // Combine user prompt and content if content exists
      const fullUserPrompt = content ? `${userPrompt}\n\nData to analyze:\n${content}` : userPrompt;

      // Prepare messages array for ConverseStream API
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

      // Prepare the ConverseStream API command
      const converseParams = {
        modelId: modelId,
        messages: messages,
        inferenceConfig: {
          maxTokens: 4000,
          temperature: 0.7
        }
      };

      // Add system prompt if provided
      if (systemPrompt?.trim()) {
        converseParams.system = [
          {
            text: systemPrompt
          }
        ];
      }

      const command = new ConverseStreamCommand(converseParams);
      const response = await this.runtimeClient.send(command);

      // Process the streaming response with timeout protection
      let fullText = '';
      let usage = null;
      let lastTokenTime = Date.now();
      const streamTimeout = 30000; // 30 seconds timeout for stream inactivity

      for await (const event of response.stream) {
        const parsedEvent = this.parseStreamEvent(event);
        lastTokenTime = Date.now();

        if (parsedEvent.type === 'token' && parsedEvent.text) {
          fullText += parsedEvent.text;
          onToken?.(parsedEvent.text, fullText);
        } else if (parsedEvent.type === 'metadata' && parsedEvent.usage) {
          usage = parsedEvent.usage;
        } else if (parsedEvent.type === 'error') {
          throw new Error(parsedEvent.error);
        }

        // Check for stream timeout
        if (Date.now() - lastTokenTime > streamTimeout) {
          throw new Error('Stream timeout: No tokens received for 30 seconds');
        }
      }

      const result = {
        text: fullText,
        usage: usage
      };

      onComplete?.(result);
      return result;

    } catch (error) {
      // Categorize and handle different types of streaming errors
      const streamingError = this.categorizeStreamingError(error);

      // For certain errors, attempt graceful fallback to non-streaming
      if (streamingError.shouldFallback) {
        console.warn(`Streaming failed (${streamingError.category}), attempting fallback:`, error.message);

        try {
          const result = await this.invokeModel(modelId, systemPrompt, userPrompt, content);
          onComplete?.(result);
          return result;
        } catch (fallbackError) {
          const finalError = new Error(`Streaming failed and fallback failed. Original: ${streamingError.userMessage}. Fallback: ${fallbackError.message}`);
          onError?.(finalError);
          throw finalError;
        }
      } else {
        // For non-fallback errors, throw immediately
        onError?.(new Error(streamingError.userMessage));
        throw new Error(streamingError.userMessage);
      }
    }
  }

  /**
   * Check if a model supports streaming
   * @param {string} modelId - The model ID to check
   * @returns {boolean} True if the model supports streaming
   */
  isStreamingSupported(modelId) {
    // Most modern Bedrock models support streaming, but we'll maintain a list
    // of known streaming-capable models for safety
    const streamingSupportedModels = [
      'amazon.nova-pro-v1:0',
      'amazon.nova-lite-v1:0',
      'amazon.nova-micro-v1:0',
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'anthropic.claude-3-5-sonnet-20240620-v1:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0',
      'anthropic.claude-3-haiku-20240307-v1:0',
      'anthropic.claude-3-sonnet-20240229-v1:0',
      'anthropic.claude-3-opus-20240229-v1:0',
      'meta.llama3-2-90b-instruct-v1:0',
      'meta.llama3-2-11b-instruct-v1:0',
      'meta.llama3-2-3b-instruct-v1:0',
      'meta.llama3-2-1b-instruct-v1:0',
      'meta.llama3-1-70b-instruct-v1:0',
      'meta.llama3-1-8b-instruct-v1:0'
    ];

    return streamingSupportedModels.includes(modelId);
  }

  /**
   * Comprehensive model compatibility check for streaming
   * @param {string} modelId - The model ID to check
   * @returns {Promise<Object>} Compatibility information
   */
  async checkModelCompatibility(modelId) {
    try {
      // First check our known streaming support list
      const basicStreamingSupport = this.isStreamingSupported(modelId);

      if (!basicStreamingSupport) {
        return {
          supportsStreaming: false,
          reason: 'Model not in known streaming-compatible list',
          recommendation: 'Will use standard (non-streaming) mode'
        };
      }

      // Check if we can get model details from AWS
      try {
        const models = await this.listFoundationModels();
        const modelInfo = models.find(model => model.id === modelId);

        if (!modelInfo) {
          return {
            supportsStreaming: false,
            reason: 'Model not found in available models list',
            recommendation: 'Please select a different model'
          };
        }

        if (modelInfo.responseStreamingSupported === false) {
          return {
            supportsStreaming: false,
            reason: 'Model metadata indicates streaming not supported',
            recommendation: 'Will use standard (non-streaming) mode'
          };
        }

        return {
          supportsStreaming: true,
          reason: 'Model supports streaming according to AWS metadata',
          modelInfo: modelInfo
        };

      } catch (metadataError) {
        // If we can't get metadata, fall back to our known list
        console.warn('Could not fetch model metadata, using known compatibility list:', metadataError.message);

        return {
          supportsStreaming: basicStreamingSupport,
          reason: basicStreamingSupport
            ? 'Model in known streaming-compatible list (metadata unavailable)'
            : 'Model not in known streaming-compatible list (metadata unavailable)',
          recommendation: basicStreamingSupport
            ? 'Proceeding with streaming based on known compatibility'
            : 'Will use standard (non-streaming) mode'
        };
      }

    } catch (error) {
      console.error('Model compatibility check failed:', error);
      return {
        supportsStreaming: false,
        reason: `Compatibility check failed: ${error.message}`,
        recommendation: 'Will use standard (non-streaming) mode as fallback'
      };
    }
  }

  /**
   * Retry operation with exponential backoff
   * @param {Function} operation - The operation to retry
   * @param {Object} options - Retry options
   * @returns {Promise} The result of the operation
   */
  async retryWithBackoff(operation, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      onRetry
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry on certain types of errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt === maxRetries) {
          throw new Error(`Operation failed after ${maxRetries} attempts. Last error: ${error.message}`);
        }

        // Calculate delay with exponential backoff and jitter
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
        const delay = Math.min(exponentialDelay + jitter, maxDelay);

        onRetry?.(error, attempt, delay);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check if an error should not be retried
   * @param {Error} error - The error to check
   * @returns {boolean} True if the error should not be retried
   * @private
   */
  isNonRetryableError(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.name || error.code || '';

    // Don't retry authentication/authorization errors
    if (errorCode === 'AccessDenied' ||
        errorCode === 'UnauthorizedOperation' ||
        errorCode === 'CredentialsProviderError' ||
        errorMessage.includes('credentials') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('access denied')) {
      return true;
    }

    // Don't retry validation errors
    if (errorCode === 'ValidationException' ||
        errorMessage.includes('validation') ||
        errorMessage.includes('invalid parameter')) {
      return true;
    }

    // Don't retry model not found errors
    if (errorMessage.includes('model not found') ||
        errorMessage.includes('model does not exist')) {
      return true;
    }

    return false;
  }

  /**
   * Categorize streaming errors and determine appropriate handling
   * @param {Error} error - The streaming error
   * @returns {Object} Error categorization and handling info
   * @private
   */
  categorizeStreamingError(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.name || error.code || '';

    // Network/connection errors - should fallback
    if (errorMessage.includes('network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('enotfound') ||
        errorCode === 'NetworkError') {
      return {
        category: 'network',
        shouldFallback: true,
        userMessage: 'Connection interrupted. Showing partial response and switching to standard mode.'
      };
    }

    // Rate limiting - should fallback after delay
    if (errorMessage.includes('throttl') ||
        errorMessage.includes('rate limit') ||
        errorCode === 'ThrottlingException') {
      return {
        category: 'rate_limit',
        shouldFallback: true,
        userMessage: 'Request rate limited. Switching to standard mode.'
      };
    }

    // Stream-specific errors - should fallback
    if (errorMessage.includes('stream') ||
        errorMessage.includes('event') ||
        errorMessage.includes('parse')) {
      return {
        category: 'stream_parsing',
        shouldFallback: true,
        userMessage: 'Streaming format error. Switching to standard mode.'
      };
    }

    // Model errors - should not fallback (same model will fail)
    if (errorMessage.includes('model') ||
        errorMessage.includes('inference') ||
        errorCode === 'ModelError') {
      return {
        category: 'model',
        shouldFallback: false,
        userMessage: `Model error: ${error.message}`
      };
    }

    // Authentication/authorization - should not fallback
    if (errorMessage.includes('credentials') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('access denied') ||
        errorCode === 'AccessDenied') {
      return {
        category: 'auth',
        shouldFallback: false,
        userMessage: `Authentication error: ${error.message}`
      };
    }

    // Unknown errors - should fallback as safety measure
    return {
      category: 'unknown',
      shouldFallback: true,
      userMessage: `Streaming failed: ${error.message}. Switching to standard mode.`
    };
  }

  /**
   * Parse streaming events from ConverseStream API
   * @param {Object} event - The streaming event
   * @returns {Object} Parsed event with type and data
   * @private
   */
  parseStreamEvent(event) {
    try {
      // Handle messageStart event
      if (event.messageStart) {
        return {
          type: 'messageStart',
          role: event.messageStart.role
        };
      }

      // Handle contentBlockDelta event (contains tokens)
      if (event.contentBlockDelta?.delta?.text) {
        return {
          type: 'token',
          text: event.contentBlockDelta.delta.text
        };
      }

      // Handle messageStop event
      if (event.messageStop) {
        return {
          type: 'complete',
          stopReason: event.messageStop.stopReason
        };
      }

      // Handle metadata event (contains usage information)
      if (event.metadata?.usage) {
        return {
          type: 'metadata',
          usage: {
            input_tokens: event.metadata.usage.inputTokens,
            output_tokens: event.metadata.usage.outputTokens,
            total_tokens: event.metadata.usage.totalTokens
          }
        };
      }

      // Handle any other event types
      return {
        type: 'unknown',
        event: event
      };

    } catch (error) {
      return {
        type: 'error',
        error: `Failed to parse stream event: ${error.message}`
      };
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

  /**
   * Get streaming error recovery suggestions
   * @param {Error} error - The streaming error
   * @param {Object} context - Additional context
   * @returns {Object} Recovery suggestions and actions
   */
  getStreamingErrorRecovery(error, context = {}) {
    const errorCategory = this.categorizeStreamingError(error);

    const recovery = {
      canRetry: false,
      shouldFallback: errorCategory.shouldFallback,
      userMessage: errorCategory.userMessage,
      technicalDetails: error.message,
      suggestedActions: [],
      nextSteps: []
    };

    switch (errorCategory.category) {
      case 'network':
        recovery.canRetry = true;
        recovery.suggestedActions = [
          'Check your internet connection',
          'Try again in a few moments',
          'Consider using a more stable connection'
        ];
        recovery.nextSteps = [
          'The system will automatically retry with exponential backoff',
          'If retries fail, it will switch to standard (non-streaming) mode',
          'Your partial response has been preserved'
        ];
        break;

      case 'rate_limit':
        recovery.canRetry = true;
        recovery.suggestedActions = [
          'Wait 30-60 seconds before trying again',
          'Consider using a smaller prompt or dataset',
          'Try during off-peak hours'
        ];
        recovery.nextSteps = [
          'The system will automatically retry after a delay',
          'Rate limits typically reset within a few minutes'
        ];
        break;

      case 'stream_parsing':
        recovery.canRetry = true;
        recovery.suggestedActions = [
          'This is usually a temporary issue',
          'Try refreshing the page',
          'Check if your browser is up to date'
        ];
        recovery.nextSteps = [
          'The system will fall back to standard mode',
          'Your request will still be processed normally'
        ];
        break;

      case 'model':
        recovery.canRetry = false;
        recovery.suggestedActions = [
          'Try selecting a different model',
          'Check if the model is available in your region',
          'Reduce the complexity of your prompt'
        ];
        recovery.nextSteps = [
          'Standard mode will be used instead of streaming',
          'Consider using a different model for better compatibility'
        ];
        break;

      case 'auth':
        recovery.canRetry = false;
        recovery.suggestedActions = [
          'Check your AWS credentials',
          'Verify Bedrock permissions',
          'Ensure your account has access to the selected model'
        ];
        recovery.nextSteps = [
          'Fix authentication issues before retrying',
          'Run local-setup.sh to reconfigure credentials'
        ];
        break;

      default:
        recovery.canRetry = true;
        recovery.suggestedActions = [
          'Try again - this may be a temporary issue',
          'Check your internet connection',
          'Consider refreshing the page'
        ];
        recovery.nextSteps = [
          'The system will attempt automatic recovery',
          'Standard mode will be used as fallback'
        ];
        break;
    }

    return recovery;
  }

  /**
   * Get user-friendly streaming status messages
   * @param {string} status - Current streaming status
   * @param {Object} progress - Streaming progress information
   * @returns {string} User-friendly status message
   */
  getStreamingStatusMessage(status, progress = {}) {
    switch (status) {
      case 'initializing':
        return 'Preparing to stream response...';

      case 'connecting':
        return 'Establishing streaming connection...';

      case 'streaming':
        const tokensPerSecond = progress.tokensPerSecond || 0;
        const tokensReceived = progress.tokensReceived || 0;

        if (tokensPerSecond > 0) {
          return `Streaming response (${tokensReceived} tokens, ${tokensPerSecond} tokens/sec)`;
        } else {
          return `Streaming response (${tokensReceived} tokens received)`;
        }

      case 'completing':
        return 'Finalizing response...';

      case 'completed':
        const totalTokens = progress.tokensReceived || 0;
        const duration = progress.duration || 0;
        return `Streaming completed (${totalTokens} tokens in ${duration}s)`;

      case 'interrupted':
        return 'Streaming interrupted - switching to standard mode';

      case 'timeout':
        return 'Streaming timed out - preserving partial response';

      case 'fallback':
        return 'Using standard mode (streaming not available)';

      default:
        return 'Processing request...';
    }
  }
}

// Export a singleton instance
export const bedrockService = new BedrockService();