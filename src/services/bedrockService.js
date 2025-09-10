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

    try {
      // Check if model supports streaming
      if (!this.isStreamingSupported(modelId)) {
        console.warn(`Model ${modelId} doesn't support streaming, falling back to non-streaming`);
        const result = await this.invokeModel(modelId, systemPrompt, userPrompt, content);
        onComplete?.(result);
        return result;
      }

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

      // Process the streaming response
      let fullText = '';
      let usage = null;

      for await (const event of response.stream) {
        const parsedEvent = this.parseStreamEvent(event);

        if (parsedEvent.type === 'token' && parsedEvent.text) {
          fullText += parsedEvent.text;
          onToken?.(parsedEvent.text, fullText);
        } else if (parsedEvent.type === 'metadata' && parsedEvent.usage) {
          usage = parsedEvent.usage;
        } else if (parsedEvent.type === 'error') {
          onError?.(new Error(parsedEvent.error));
          throw new Error(parsedEvent.error);
        }
      }

      const result = {
        text: fullText,
        usage: usage
      };

      onComplete?.(result);
      return result;

    } catch (error) {
      // Graceful fallback to non-streaming
      console.warn('Streaming failed, falling back to non-streaming:', error.message);
      try {
        const result = await this.invokeModel(modelId, systemPrompt, userPrompt, content);
        onComplete?.(result);
        return result;
      } catch (fallbackError) {
        const finalError = new Error(`Both streaming and fallback failed. Streaming error: ${error.message}. Fallback error: ${fallbackError.message}`);
        onError?.(finalError);
        throw finalError;
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
      if (event.contentBlockDelta && event.contentBlockDelta.delta && event.contentBlockDelta.delta.text) {
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
      if (event.metadata && event.metadata.usage) {
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
}

// Export a singleton instance
export const bedrockService = new BedrockService();