import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { analyzeError, handleError, ErrorTypes } from '../utils/errorHandling.js';
import { workflowTrackingService } from './workflowTrackingService.js';

/**
 * Service for orchestrating tool execution workflows with Bedrock models
 * Implements multi-turn conversation pattern: model requests tools -> execute locally -> send results back
 */
export class ToolExecutionService {
  constructor() {
    this.runtimeClient = null;
    this.activeExecutions = new Map(); // Track active executions
    this.executionHistory = new Map(); // Store execution history
    this.isInitialized = false;
  }

  /**
   * Initialize the service with AWS credentials
   * @param {Object} credentials - AWS credentials configuration
   */
  async initialize(credentials) {
    try {
      const region = credentials.region || 'us-east-1';

      const clientConfig = {
        region: region,
        ...(credentials.accessKeyId && {
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            ...(credentials.sessionToken && {
              sessionToken: credentials.sessionToken
            })
          }
        })
      };

      this.runtimeClient = new BedrockRuntimeClient(clientConfig);

      // Initialize workflow tracking service
      if (!workflowTrackingService.isInitialized) {
        await workflowTrackingService.initialize();
      }

      this.isInitialized = true;

      return { success: true, message: 'Tool execution service initialized' };
    } catch (error) {
      this.isInitialized = false;
      throw new Error(`Failed to initialize tool execution service: ${error.message}`);
    }
  }

  /**
   * Execute a complete tool workflow with multi-turn conversation
   * @param {string} modelId - The Bedrock model to use
   * @param {string} systemPrompt - System prompt for the model
   * @param {string} userPrompt - User prompt for the model
   * @param {string} content - Additional content/context
   * @param {Object} toolConfig - Tool configuration with available tools
   * @param {Object} options - Execution options (maxIterations, onStreamUpdate, etc.)
   * @returns {Promise<Object>} Complete execution result
   */
  async executeWorkflow(modelId, systemPrompt, userPrompt, content = '', toolConfig, options = {}) {
    const executionId = this.generateExecutionId();
    const maxIterations = options.maxIterations || 10;
    const onStreamUpdate = options.onStreamUpdate || (() => {});
    const startTime = Date.now();

    // Initialize execution state
    const executionState = {
      executionId,
      modelId,
      systemPrompt,
      userPrompt,
      content,
      toolConfig,
      options,
      status: 'executing',
      currentIteration: 0,
      maxIterations,
      startTime,
      endTime: null,
      totalDuration: null,
      messages: [], // Conversation history
      workflow: [], // Detailed workflow steps
      results: {
        finalResponse: null,
        toolExecutions: [],
        totalToolCalls: 0,
        iterationCount: 0
      },
      errors: [],
      cancelled: false
    };

    this.activeExecutions.set(executionId, executionState);

    // Initialize workflow tracking
    workflowTrackingService.createExecution(executionId, {
      modelId,
      maxIterations,
      toolConfig,
      startTime: executionState.startTime
    });

    try {
      // Build initial conversation with system prompt and user message
      const conversation = [];

      // Combine user prompt and content
      const fullUserPrompt = content ? `${userPrompt}\n\nData to analyze:\n${content}` : userPrompt;

      conversation.push({
        role: 'user',
        content: [{ text: fullUserPrompt }]
      });

      executionState.messages = [...conversation];

      // Execute multi-turn conversation
      let currentIteration = 0;
      let continueConversation = true;

      while (continueConversation && currentIteration < maxIterations) {
        if (executionState.cancelled) {
          throw new Error('Execution cancelled by user');
        }

        currentIteration++;
        executionState.currentIteration = currentIteration;

        // Add workflow step for iteration start
        this.addWorkflowStep(executionState, {
          type: 'iteration_start',
          iteration: currentIteration,
          timestamp: new Date().toISOString(),
          content: {
            iteration: currentIteration,
            maxIterations: maxIterations
          }
        });

        // Stream update: Starting iteration
        onStreamUpdate({
          type: 'iteration_start',
          content: `🔄 Starting iteration ${currentIteration}/${maxIterations}...`,
          iteration: currentIteration,
          maxIterations: maxIterations,
          timestamp: new Date().toISOString()
        });

        // Stream update: Sending request to model
        onStreamUpdate({
          type: 'model_request',
          content: `🤖 Sending request to ${modelId}...`,
          iteration: currentIteration,
          timestamp: new Date().toISOString()
        });

        // Send request to Bedrock
        const modelResponse = await this.sendConverseRequest(
          modelId,
          systemPrompt,
          executionState.messages,
          toolConfig
        );

        // Add workflow step for model response
        this.addWorkflowStep(executionState, {
          type: 'llm_response',
          iteration: currentIteration,
          timestamp: new Date().toISOString(),
          content: {
            stopReason: modelResponse.stopReason,
            usage: modelResponse.usage,
            hasToolUse: modelResponse.stopReason === 'tool_use'
          }
        });

        // Add assistant message to conversation
        executionState.messages.push({
          role: 'assistant',
          content: modelResponse.output.message.content
        });

        // Check stop reason
        if (modelResponse.stopReason === 'end_turn') {
          // Model finished - extract final response
          const finalText = this.extractTextFromContent(modelResponse.output.message.content);
          executionState.results.finalResponse = finalText;
          continueConversation = false;

          // Stream update: Model completed
          onStreamUpdate({
            type: 'completion',
            content: `✅ Model completed response\n\n${finalText}`,
            iteration: currentIteration,
            timestamp: new Date().toISOString(),
            finalResponse: finalText
          });

          this.addWorkflowStep(executionState, {
            type: 'completion',
            iteration: currentIteration,
            timestamp: new Date().toISOString(),
            content: {
              finalResponse: finalText,
              reason: 'Model completed response'
            }
          });

        } else if (modelResponse.stopReason === 'tool_use') {
          // Stream update: Model wants to use tools
          const toolRequests = this.extractToolRequestsFromContent(modelResponse.output.message.content);
          onStreamUpdate({
            type: 'tool_requests',
            content: `🔧 Model requested ${toolRequests.length} tool(s): ${toolRequests.map(t => t.name).join(', ')}`,
            iteration: currentIteration,
            timestamp: new Date().toISOString(),
            toolRequests: toolRequests
          });

          // Model wants to use tools - execute them
          const toolResults = await this.executeToolsFromResponse(
            modelResponse.output.message.content,
            toolConfig,
            executionState,
            onStreamUpdate
          );

          // Add tool result messages to conversation
          const toolResultContent = toolResults.map(result => ({
            toolResult: {
              toolUseId: result.toolUseId,
              content: result.success ? [{ text: JSON.stringify(result.result) }] : [{ text: `Error: ${result.error}` }],
              status: result.success ? 'success' : 'error'
            }
          }));

          executionState.messages.push({
            role: 'user',
            content: toolResultContent
          });

          // Update results
          executionState.results.toolExecutions.push(...toolResults);
          executionState.results.totalToolCalls += toolResults.length;

        } else {
          // Unexpected stop reason
          this.addWorkflowStep(executionState, {
            type: 'error',
            iteration: currentIteration,
            timestamp: new Date().toISOString(),
            content: {
              error: `Unexpected stop reason: ${modelResponse.stopReason}`,
              stopReason: modelResponse.stopReason
            }
          });
          continueConversation = false;
        }
      }

      // Check if we hit iteration limit
      if (currentIteration >= maxIterations && continueConversation) {
        this.addWorkflowStep(executionState, {
          type: 'iteration_limit_reached',
          iteration: currentIteration,
          timestamp: new Date().toISOString(),
          content: {
            maxIterations: maxIterations,
            reason: 'Maximum iteration limit reached'
          }
        });

        // Try to extract any partial response
        const lastMessage = executionState.messages[executionState.messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          const partialResponse = this.extractTextFromContent(lastMessage.content);
          if (partialResponse) {
            executionState.results.finalResponse = partialResponse + '\n\n[Response truncated due to iteration limit]';
          }
        }
      }

      // Finalize execution
      executionState.status = 'completed';
      executionState.endTime = Date.now();
      executionState.totalDuration = executionState.endTime - executionState.startTime;
      executionState.results.iterationCount = currentIteration;

      // Complete workflow tracking
      if (workflowTrackingService.isInitialized) {
        await workflowTrackingService.completeExecution(executionId, {
          status: executionState.status,
          results: executionState.results,
          errors: executionState.errors
        });
      }

      // Move to history
      this.executionHistory.set(executionId, executionState);
      this.activeExecutions.delete(executionId);

      return {
        success: true,
        executionId,
        results: executionState.results,
        workflow: executionState.workflow,
        metadata: {
          iterationCount: currentIteration,
          totalDuration: executionState.totalDuration,
          toolCallCount: executionState.results.totalToolCalls
        }
      };

    } catch (error) {
      // Handle execution error
      executionState.status = 'error';
      executionState.endTime = Date.now();
      executionState.totalDuration = executionState.endTime - executionState.startTime;
      executionState.errors.push({
        type: 'execution_error',
        message: error.message,
        timestamp: new Date().toISOString()
      });

      this.addWorkflowStep(executionState, {
        type: 'error',
        iteration: executionState.currentIteration,
        timestamp: new Date().toISOString(),
        content: {
          error: error.message,
          errorType: 'execution_error'
        }
      });

      // Complete workflow tracking with error
      if (workflowTrackingService.isInitialized) {
        try {
          await workflowTrackingService.completeExecution(executionId, {
            status: 'error',
            results: executionState.results,
            errors: executionState.errors
          });
        } catch (trackingError) {
          // Silently handle tracking errors
        }
      }

      // Move to history even on error
      this.executionHistory.set(executionId, executionState);
      this.activeExecutions.delete(executionId);

      throw new Error(`Tool execution workflow failed: ${error.message}`);
    }
  }

  /**
   * Send a converse request to Bedrock
   * @param {string} modelId - Model ID
   * @param {string} systemPrompt - System prompt
   * @param {Array} messages - Conversation messages
   * @param {Object} toolConfig - Tool configuration
   * @returns {Promise<Object>} Bedrock response
   */
  async sendConverseRequest(modelId, systemPrompt, messages, toolConfig) {
    if (!this.isInitialized || !this.runtimeClient) {
      throw new Error('Tool execution service not initialized');
    }

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

    // Add tool configuration
    if (toolConfig && toolConfig.tools && toolConfig.tools.length > 0) {
      converseParams.toolConfig = {
        tools: toolConfig.tools
      };
    }

    const command = new ConverseCommand(converseParams);
    return await this.runtimeClient.send(command);
  }

  /**
   * Execute tools from a Bedrock response
   * @param {Array} messageContent - Message content from Bedrock response
   * @param {Object} toolConfig - Tool configuration
   * @param {Object} executionState - Current execution state
   * @param {Function} onStreamUpdate - Callback for streaming updates
   * @returns {Promise<Array>} Tool execution results
   */
  async executeToolsFromResponse(messageContent, toolConfig, executionState, onStreamUpdate = () => {}) {
    const toolResults = [];

    if (!Array.isArray(messageContent)) {
      return toolResults;
    }

    for (const contentBlock of messageContent) {
      if (contentBlock.toolUse) {
        const toolUse = contentBlock.toolUse;

        this.addWorkflowStep(executionState, {
          type: 'tool_call',
          iteration: executionState.currentIteration,
          timestamp: new Date().toISOString(),
          content: {
            toolName: toolUse.name,
            toolUseId: toolUse.toolUseId,
            parameters: toolUse.input
          }
        });

        try {
          // Stream update: Executing tool
          onStreamUpdate({
            type: 'tool_execution',
            content: `⚙️ Executing ${toolUse.name}...`,
            iteration: executionState.currentIteration,
            timestamp: new Date().toISOString(),
            toolName: toolUse.name,
            toolUseId: toolUse.toolUseId
          });

          // Execute the tool
          const result = await this.executeTool(toolUse.name, toolUse.input, {
            executionId: executionState.executionId,
            toolConfig: toolConfig,
            datasetType: executionState.options.datasetType,
            scenarioId: executionState.options.datasetType // Use datasetType as scenarioId
          });

          toolResults.push({
            toolUseId: toolUse.toolUseId,
            toolName: toolUse.name,
            parameters: toolUse.input,
            result: result,
            success: true,
            timestamp: new Date().toISOString()
          });

          // Stream update: Tool completed successfully
          onStreamUpdate({
            type: 'tool_result',
            content: `✅ ${toolUse.name} completed successfully`,
            iteration: executionState.currentIteration,
            timestamp: new Date().toISOString(),
            toolName: toolUse.name,
            toolUseId: toolUse.toolUseId,
            success: true,
            result: result
          });

          this.addWorkflowStep(executionState, {
            type: 'tool_result',
            iteration: executionState.currentIteration,
            timestamp: new Date().toISOString(),
            content: {
              toolName: toolUse.name,
              toolUseId: toolUse.toolUseId,
              result: result,
              success: true
            }
          });

        } catch (error) {
          toolResults.push({
            toolUseId: toolUse.toolUseId,
            toolName: toolUse.name,
            parameters: toolUse.input,
            result: null,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          });

          // Stream update: Tool failed
          onStreamUpdate({
            type: 'tool_error',
            content: `❌ ${toolUse.name} failed: ${error.message}`,
            iteration: executionState.currentIteration,
            timestamp: new Date().toISOString(),
            toolName: toolUse.name,
            toolUseId: toolUse.toolUseId,
            success: false,
            error: error.message
          });

          this.addWorkflowStep(executionState, {
            type: 'tool_result',
            iteration: executionState.currentIteration,
            timestamp: new Date().toISOString(),
            content: {
              toolName: toolUse.name,
              toolUseId: toolUse.toolUseId,
              error: error.message,
              success: false
            }
          });
        }
      }
    }

    return toolResults;
  }

  /**
   * Execute a single tool
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} parameters - Tool parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Tool execution result
   */
  async executeTool(toolName, parameters, context) {
    try {
      const toolConfig = this.getToolConfig(toolName, context);

      if (toolConfig.handler) {
        return await this.executeHandler(toolConfig.handler, parameters, context);
      } else {
        throw new Error(`Tool "${toolName}" does not have a handler configuration. All tools must use handler-based execution.`);
      }

    } catch (error) {
      throw new Error(`Tool execution failed for ${toolName}: ${error.message}`);
    }
  }

  /**
   * Execute a handler-based tool
   * @param {string} handler - Handler string in format "filename.entryPoint"
   * @param {Object} parameters - Tool parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Tool execution result
   */
  async executeHandler(handler, parameters, context) {
    try {


      // Parse handler string (e.g., "tools/carrierStatus.getCarrierStatus")
      const [filePath, entryPoint] = handler.split('.');
      if (!filePath || !entryPoint) {
        throw new Error(`Invalid handler format: ${handler}. Expected format: "filename.entryPoint"`);
      }



      // Get scenario ID from context or toolConfig
      let scenarioId = context.scenarioId || context.datasetType;

      // If not in context, try to extract from toolConfig
      if (!scenarioId && context.toolConfig && context.toolConfig.scenarioId) {
        scenarioId = context.toolConfig.scenarioId;
      }

      // If still not found, try to extract from toolConfig.id (format: "scenario-id-tools")
      if (!scenarioId && context.toolConfig && context.toolConfig.id) {
        const match = context.toolConfig.id.match(/^(.+)-tools$/);
        if (match) {
          scenarioId = match[1];
        }
      }

      if (!scenarioId) {
        throw new Error('Scenario ID not found in context or toolConfig');
      }

      // Construct the full path to the handler file
      const handlerPath = `../scenarios/${scenarioId}/${filePath}.js`;

      // Dynamically import the handler module
      const handlerModule = await import(/* @vite-ignore */ handlerPath);

      // Get the specific function from the module
      const handlerFunction = handlerModule[entryPoint];
      if (!handlerFunction) {
        throw new Error(`Function '${entryPoint}' not found in ${handlerPath}`);
      }



      // Execute the handler function
      const result = await handlerFunction(parameters, context);

      return result;

    } catch (error) {
      console.error('[ToolExecutionService] Handler execution failed:', error);
      throw new Error(`Handler execution failed: ${error.message}`);
    }
  }









  /**
   * Get tool configuration for a specific tool
   * @param {string} toolName - Name of the tool
   * @param {Object} context - Execution context
   * @returns {Object} Tool configuration
   */
  getToolConfig(toolName, context) {
    const toolConfig = context.toolConfig;
    if (!toolConfig || !toolConfig.tools) {
      throw new Error('Tool configuration not available in context');
    }

    const tool = toolConfig.tools.find(t => t.toolSpec && t.toolSpec.name === toolName);
    if (!tool) {
      throw new Error(`Tool configuration not found for: ${toolName}`);
    }

    // Return the toolSpec with handler information
    return {
      ...tool.toolSpec,
      handler: tool.toolSpec.handler
    };
  }



  /**
   * Cancel an active execution
   * @param {string} executionId - Execution ID to cancel
   */
  async cancelExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      execution.cancelled = true;
      execution.status = 'cancelled';
      execution.endTime = Date.now();
      execution.totalDuration = execution.endTime - execution.startTime;

      this.addWorkflowStep(execution, {
        type: 'cancellation',
        iteration: execution.currentIteration,
        timestamp: new Date().toISOString(),
        content: {
          reason: 'Cancelled by user'
        }
      });

      // Cancel workflow tracking
      if (workflowTrackingService.isInitialized) {
        try {
          await workflowTrackingService.cancelExecution(executionId, 'Cancelled by user');
        } catch (trackingError) {
          // Silently handle tracking errors
        }
      }

      // Move to history
      this.executionHistory.set(executionId, execution);
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Get execution status
   * @param {string} executionId - Execution ID
   * @returns {Object} Execution status
   */
  getExecutionStatus(executionId) {
    const activeExecution = this.activeExecutions.get(executionId);
    if (activeExecution) {
      return {
        executionId,
        status: activeExecution.status,
        currentIteration: activeExecution.currentIteration,
        maxIterations: activeExecution.maxIterations,
        startTime: activeExecution.startTime,
        duration: Date.now() - activeExecution.startTime,
        toolCallCount: activeExecution.results.totalToolCalls,
        cancelled: activeExecution.cancelled
      };
    }

    const historicalExecution = this.executionHistory.get(executionId);
    if (historicalExecution) {
      return {
        executionId,
        status: historicalExecution.status,
        currentIteration: historicalExecution.currentIteration,
        maxIterations: historicalExecution.maxIterations,
        startTime: historicalExecution.startTime,
        endTime: historicalExecution.endTime,
        duration: historicalExecution.totalDuration,
        toolCallCount: historicalExecution.results.totalToolCalls,
        cancelled: historicalExecution.cancelled
      };
    }

    return null;
  }

  /**
   * Get workflow for an execution
   * @param {string} executionId - Execution ID
   * @returns {Array} Workflow steps
   */
  getWorkflow(executionId) {
    const execution = this.activeExecutions.get(executionId) || this.executionHistory.get(executionId);
    return execution ? execution.workflow : [];
  }

  /**
   * Add a workflow step to execution state
   * @param {Object} executionState - Execution state
   * @param {Object} step - Workflow step
   */
  addWorkflowStep(executionState, step) {
    const workflowStep = {
      id: this.generateStepId(),
      executionId: executionState.executionId,
      ...step,
      status: 'completed'
    };

    executionState.workflow.push(workflowStep);

    // Also add to workflow tracking service
    if (workflowTrackingService.isInitialized) {
      workflowTrackingService.addStep(executionState.executionId, workflowStep);
    }
  }

  /**
   * Extract text content from Bedrock message content
   * @param {Array} content - Message content array
   * @returns {string} Extracted text
   */
  extractTextFromContent(content) {
    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .filter(block => block.text)
      .map(block => block.text)
      .join('');
  }

  /**
   * Extract tool requests from Bedrock message content
   * @param {Array} content - Message content array
   * @returns {Array} Tool request summaries
   */
  extractToolRequestsFromContent(content) {
    if (!Array.isArray(content)) {
      return [];
    }

    return content
      .filter(block => block.toolUse)
      .map(block => ({
        name: block.toolUse.name,
        toolUseId: block.toolUse.toolUseId,
        parameterCount: Object.keys(block.toolUse.input || {}).length
      }));
  }

  /**
   * Generate unique execution ID
   * @returns {string} Execution ID
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique step ID
   * @returns {string} Step ID
   */
  generateStepId() {
    return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all active executions
   * @returns {Array} Active execution summaries
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values()).map(execution => ({
      executionId: execution.executionId,
      status: execution.status,
      currentIteration: execution.currentIteration,
      maxIterations: execution.maxIterations,
      startTime: execution.startTime,
      modelId: execution.modelId,
      toolCallCount: execution.results.totalToolCalls
    }));
  }

  /**
   * Clean up old execution history
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanupHistory(maxAge = 24 * 60 * 60 * 1000) { // Default 24 hours
    const cutoffTime = Date.now() - maxAge;

    for (const [executionId, execution] of this.executionHistory.entries()) {
      if (execution.endTime && execution.endTime < cutoffTime) {
        this.executionHistory.delete(executionId);
      }
    }
  }
}

// Export singleton instance
export const toolExecutionService = new ToolExecutionService();
