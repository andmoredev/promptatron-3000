import { ConverseCommand, ConverseStreamCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { BedrockClientManager } from './bedrock/BedrockClient.js';
import { ModelManager } from './bedrock/ModelManager.js';
import { GuardrailManager } from './bedrock/GuardrailManager.js';

/**
 * Main Bedrock service that orchestrates all Bedrock operations
 */
export class BedrockService {
  constructor() {
    this.clientManager = new BedrockClientManager();
    this.modelManager = new ModelManager(this.clientManager);
    this.guardrailManager = new GuardrailManager();
  }

  // Delegate client management methods
  async initialize() {
    return await this.clientManager.initialize();
  }

  isReady() {
    return this.clientManager.isReady();
  }

  detectCredentialSources() {
    return this.clientManager.detectCredentialSources();
  }

  // Delegate model management methods
  async listFoundationModels() {
    return await this.modelManager.listFoundationModels();
  }

  /**
   * Get supported image generation models
   */
  async listImageGenerationModels() {
    const allModels = await this.listFoundationModels();
    return allModels.filter(model => this.isImageGenerationModel(model.id));
  }

  /**
   * Check if a model supports streaming
   */
  isStreamingSupported(modelId) {
    // Most Bedrock models support streaming, but we can be more specific
    const streamingSupportedModels = [
      'amazon.nova-pro-v1:0',
      'amazon.nova-lite-v1:0',
      'amazon.nova-micro-v1:0',
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0',
      'anthropic.claude-3-opus-20240229-v1:0',
      'anthropic.claude-3-sonnet-20240229-v1:0',
      'anthropic.claude-3-haiku-20240307-v1:0',
      'meta.llama3-2-90b-instruct-v1:0',
      'meta.llama3-2-11b-instruct-v1:0',
      'meta.llama3-2-3b-instruct-v1:0',
      'meta.llama3-2-1b-instruct-v1:0',
      'meta.llama3-1-70b-instruct-v1:0',
      'meta.llama3-1-8b-instruct-v1:0',
      'mistral.mistral-large-2407-v1:0',
      'mistral.mistral-small-2402-v1:0',
      'cohere.command-r-plus-v1:0',
      'cohere.command-r-v1:0'
    ];

    return streamingSupportedModels.includes(modelId);
  }

  /**
   * Invoke a model with streaming
   *
   * @param {string} modelId
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {string} content
   * @param {Function|null} onToken - called with (token, fullText, metadata)
   * @param {Function|null} onComplete - called with (finalResult)
   * @param {Function|null} onError - called with (error)
   * @param {Object|null} toolConfig - optional Bedrock toolConfig { tools: [...] }
   * @param {Object|null} guardrailConfig - optional guardrail configuration
   */
  async invokeModelStream(
    modelId,
    systemPrompt,
    userPrompt,
    content = '',
    onToken = null,
    onComplete = null,
    onError = null,
    toolConfig = null,
    guardrailConfig = null
  ) {
    if (!this.clientManager.isReady()) {
      const initResult = await this.clientManager.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    const startTime = performance.now();

    try {
      // Combine user prompt and content
      const fullUserPrompt = content ? `${userPrompt}\n\nData to analyze:\n${content}` : userPrompt;

      const messages = [
        {
          role: 'user',
          content: [{ text: fullUserPrompt }]
        }
      ];

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
        converseParams.system = [{ text: systemPrompt }];
      }

      // Add tool configuration if provided (enables tool-use detection in streaming)
      if (toolConfig && Array.isArray(toolConfig.tools) && toolConfig.tools.length > 0) {
        converseParams.toolConfig = {
          tools: toolConfig.tools
        };
      }

      // Add guardrail configuration if provided
      if (guardrailConfig) {
        const formattedConfig = this.guardrailManager.formatGuardrailConfigForAPI(guardrailConfig);
        converseParams.guardrailConfig = formattedConfig;
      }

      const command = new ConverseStreamCommand(converseParams);
      const response = await this.clientManager.runtimeClient.send(command);

      let fullText = '';
      let usage = null;
      let stopReason = null;
      let guardrailResults = null;
      let trace = null;

      // Process the streaming response
      for await (const chunk of response.stream) {
        if (chunk.contentBlockDelta?.delta?.text) {
          const token = chunk.contentBlockDelta.delta.text;
          fullText += token;

          // Call the token callback if provided
          if (onToken) {
            onToken(token, fullText, {
              // Add any metadata here if needed
            });
          }
        }

        // Basic tool-use detection signals (best-effort; schema varies by event)
        try {
          if (onToken) {
            const metadata = {};
            if (chunk.contentBlockStart?.start?.toolUse) {
              metadata.toolUsageDetected = true;
              metadata.toolUseStarted = {
                name: chunk.contentBlockStart.start.toolUse.name,
                toolUseId: chunk.contentBlockStart.start.toolUse.toolUseId
              };
              onToken('', fullText, metadata);
            }
            if (chunk.contentBlockDelta?.delta?.toolUse) {
              const tu = chunk.contentBlockDelta.delta.toolUse;
              metadata.toolUsageDetected = true;
              metadata.toolUseProgress = {
                toolUseId: tu.toolUseId,
                currentInput: tu.input ? JSON.stringify(tu.input) : undefined
              };
              onToken('', fullText, metadata);
            }
            if (chunk.contentBlockStop?.stop?.toolUse) {
              metadata.toolUsageDetected = true;
              metadata.toolUseCompleted = {
                toolUseId: chunk.contentBlockStop.stop.toolUse.toolUseId
              };
              onToken('', fullText, metadata);
            }
          }
        } catch (_) {
          // Best-effort metadata; ignore if structure not present
        }

        // Handle usage information
        if (chunk.metadata?.usage) {
          usage = {
            input_tokens: chunk.metadata.usage.inputTokens,
            output_tokens: chunk.metadata.usage.outputTokens,
            total_tokens: chunk.metadata.usage.totalTokens
          };
        }

        // Handle stop reason
        if (chunk.messageStop?.stopReason) {
          stopReason = chunk.messageStop.stopReason;
        }

        // Collect trace information (including guardrail traces)
        if (chunk.metadata?.trace) {
          trace = chunk.metadata.trace;
        }
      }

      // Parse guardrail results after streaming is complete
      if (trace || stopReason === 'guardrail_intervened') {
        guardrailResults = this.guardrailManager.parseGuardrailResults({
          trace: trace,
          stopReason: stopReason,
          output: {
            message: {
              content: [{ text: fullText }]
            }
          }
        });
      }

      // If no text was received but we have guardrail results, use guardrail output
      if (!fullText && guardrailResults?.outputText) {
        fullText = guardrailResults.outputText;
      }

      const result = {
        text: fullText || 'No response generated',
        usage,
        stopReason: stopReason || 'end_turn',
        guardrailResults,
        responseTime: performance.now() - startTime,
        isStreamed: true
      };

      // Notify completion if callback provided
      if (onComplete) {
        try { onComplete(result); } catch (_) {}
      }

      return result;

    } catch (error) {
      if (onError) {
        try { onError(error); } catch (_) {}
      }
      throw new Error(`Failed to stream model ${modelId}: ${error.message}`);
    }
  }

  /**
   * Invoke a foundation model with the given prompts and content
   */
  async invokeModel(modelId, systemPrompt, userPrompt, content = '', toolConfig = null, guardrailConfig = null) {
    if (!this.clientManager.isReady()) {
      const initResult = await this.clientManager.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    const startTime = performance.now();

    try {
      // Handle tool configuration if provided
      if (toolConfig && toolConfig.tools && toolConfig.tools.length > 0) {
        // For now, just return a simple response for tools
        return {
          text: 'Tool functionality not yet implemented in simplified service',
          usage: null,
          responseTime: performance.now() - startTime
        };
      }

      // Combine user prompt and content
      const fullUserPrompt = content ? `${userPrompt}\n\nData to analyze:\n${content}` : userPrompt;

      const messages = [
        {
          role: 'user',
          content: [{ text: fullUserPrompt }]
        }
      ];

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
        converseParams.system = [{ text: systemPrompt }];
      }

      // Add guardrail configuration if provided
      if (guardrailConfig) {
        const formattedConfig = this.guardrailManager.formatGuardrailConfigForAPI(guardrailConfig);
        converseParams.guardrailConfig = formattedConfig;
      }

      const command = new ConverseCommand(converseParams);
      const response = await this.clientManager.runtimeClient.send(command);

      // Parse response
      const result = this.parseConverseResponse(response);
      result.responseTime = performance.now() - startTime;

      return result;

    } catch (error) {
      throw new Error(`Failed to invoke model ${modelId}: ${error.message}`);
    }
  }

  /**
   * Parse Converse API response
   */
  parseConverseResponse(response) {
    console.log('[BedrockService] Parsing response:', {
      stopReason: response.stopReason,
      hasOutput: !!response.output,
      hasTrace: !!response.trace,
      messageContent: response.output?.message?.content
    });

    let text = response.output?.message?.content?.[0]?.text || 'No response generated';

    const usage = response.usage ? {
      input_tokens: response.usage.inputTokens,
      output_tokens: response.usage.outputTokens,
      total_tokens: response.usage.totalTokens
    } : null;

    // Parse guardrail results
    const guardrailResults = this.guardrailManager.parseGuardrailResults(response);
    console.log('[BedrockService] Parsed guardrail results:', guardrailResults);

    // If guardrail intervened and we have guardrail output text, use that
    if (response.stopReason === 'guardrail_intervened' && guardrailResults?.outputText) {
      console.log('[BedrockService] Using guardrail output text as response');
      text = guardrailResults.outputText;
    }

    const result = {
      text,
      usage,
      stopReason: response.stopReason,
      guardrailResults
    };

    console.log('[BedrockService] Final parsed result:', {
      ...result,
      textLength: result.text?.length,
      textPreview: result.text?.substring(0, 100)
    });
    return result;
  }

  // ===== IMAGE GENERATION METHODS =====

  /**
   * Check if a model supports image generation
   */
  isImageGenerationModel(modelId) {
    const imageModels = [
      'amazon.nova-canvas-v1:0'
    ];
    return imageModels.includes(modelId);
  }

  /**
   * Get supported image generation models
   */
  getSupportedImageModels() {
    return [
      {
        id: 'amazon.nova-canvas-v1:0',
        name: 'Amazon Nova Canvas',
        provider: 'Amazon',
        maxPromptLength: 1024,
        supportedDimensions: [
          { width: 512, height: 512 },
          { width: 768, height: 768 },
          { width: 1024, height: 1024 },
          { width: 1152, height: 896 },
          { width: 896, height: 1152 }
        ],
        supportedQualities: ['standard', 'premium'],
        supportsNegativePrompt: true
      }
    ];
  }

  /**
   * Validate image generation prompt based on model constraints
   */
  validateImagePrompt(modelId, prompt) {
    const modelInfo = this.getSupportedImageModels().find(m => m.id === modelId);
    if (!modelInfo) {
      return { valid: false, error: 'Unsupported image generation model' };
    }

    if (!prompt || !prompt.trim()) {
      return { valid: false, error: 'Prompt cannot be empty' };
    }

    if (prompt.length > modelInfo.maxPromptLength) {
      return {
        valid: false,
        error: `Prompt too long. Maximum ${modelInfo.maxPromptLength} characters for ${modelInfo.name}`
      };
    }

    return { valid: true };
  }

  /**
   * Generate image using Bedrock image generation models
   */
  async generateImage(modelId, prompt, parameters = {}) {
    if (!this.clientManager.isReady()) {
      const initResult = await this.clientManager.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    // Validate model supports image generation
    if (!this.isImageGenerationModel(modelId)) {
      throw new Error(`Model ${modelId} does not support image generation`);
    }

    // Validate prompt
    const validation = this.validateImagePrompt(modelId, prompt);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const startTime = performance.now();

    try {
      // Prepare model-specific request
      const requestBody = this.prepareImageGenerationRequest(modelId, prompt, parameters);

      const command = new InvokeModelCommand({
        modelId: modelId,
        body: JSON.stringify(requestBody),
        contentType: 'application/json',
        accept: 'application/json'
      });

      const response = await this.clientManager.runtimeClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      const endTime = performance.now();

      return this.parseImageGenerationResponse(modelId, responseBody, {
        prompt,
        parameters,
        generationTime: endTime - startTime
      });
    } catch (error) {
      throw new Error(`Image generation failed: ${error.message}`);
    }
  }

  /**
   * Prepare image generation request based on model type
   */
  prepareImageGenerationRequest(modelId, prompt, parameters) {
    const defaultParams = {
      width: 512,
      height: 512,
      quality: 'standard',
      numberOfImages: 1,
      seed: Math.floor(Math.random() * 858993460)
    };

    const mergedParams = { ...defaultParams, ...parameters };

    switch (modelId) {
      case 'amazon.nova-canvas-v1:0':
        return this.prepareNovaCanvasRequest(prompt, mergedParams);

      default:
        throw new Error(`Unsupported image generation model: ${modelId}`);
    }
  }

  /**
   * Prepare request for Amazon Nova Canvas
   */
  prepareNovaCanvasRequest(prompt, parameters) {
    const request = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: prompt
      },
      imageGenerationConfig: {
        seed: parameters.seed,
        quality: parameters.quality,
        width: parameters.width,
        height: parameters.height,
        numberOfImages: parameters.numberOfImages
      }
    };

    // Add negative prompt if provided
    if (parameters.negativePrompt) {
      request.textToImageParams.negativeText = parameters.negativePrompt;
    }

    return request;
  }



  /**
   * Parse image generation response based on model type
   */
  parseImageGenerationResponse(modelId, responseBody, metadata) {
    switch (modelId) {
      case 'amazon.nova-canvas-v1:0':
        return this.parseNovaCanvasResponse(responseBody, metadata);

      default:
        throw new Error(`Unsupported image generation model: ${modelId}`);
    }
  }

  /**
   * Parse Amazon Nova Canvas response
   */
  parseNovaCanvasResponse(responseBody, metadata) {
    return {
      imageData: responseBody.images[0], // Base64 encoded image
      seed: responseBody.seed,
      prompt: metadata.prompt,
      modelId: 'amazon.nova-canvas-v1:0',
      parameters: metadata.parameters,
      generationTime: metadata.generationTime,
      format: 'png'
    };
  }

  /**
   * Invoke model with image for meta-agent analysis
   * Uses Converse API with image input for image content analysis
   */
  async invokeModelWithImage(modelId, systemPrompt, userPrompt, imageData, context = '') {
    if (!this.clientManager.isReady()) {
      const initResult = await this.clientManager.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    const startTime = performance.now();

    try {
      // Prepare message with image content
      const messages = [
        {
          role: 'user',
          content: [
            {
              image: {
                format: 'png', // Assume PNG format for generated images
                source: {
                  bytes: this.base64ToUint8Array(imageData)
                }
              }
            },
            {
              text: context ? `${userPrompt}\n\nContext:\n${context}` : userPrompt
            }
          ]
        }
      ];

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
        converseParams.system = [{ text: systemPrompt }];
      }

      const command = new ConverseCommand(converseParams);
      const response = await this.clientManager.runtimeClient.send(command);

      // Parse response
      const result = this.parseConverseResponse(response);
      result.responseTime = performance.now() - startTime;

      return result;

    } catch (error) {
      throw new Error(`Failed to invoke model ${modelId} with image: ${error.message}`);
    }
  }

  /**
   * Convert base64 string to Uint8Array for Bedrock API
   */
  base64ToUint8Array(base64String) {
    // Remove data URL prefix if present
    const base64Data = base64String.replace(/^data:image\/[a-z]+;base64,/, '');

    // Convert base64 to binary string
    const binaryString = atob(base64Data);

    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }


}

// Export singleton instance
export const bedrockService = new BedrockService();
