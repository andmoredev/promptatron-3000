import { ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
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
}

// Export singleton instance
export const bedrockService = new BedrockService();
