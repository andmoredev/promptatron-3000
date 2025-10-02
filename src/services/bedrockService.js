import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { analyzeError, handleError, ErrorTypes } from '../utils/errorHandling.js';
import { handleServiceInitializationError, createFallbackUsageData, createFallbackCostData } from '../utils/tokenCostErrorHandling.js';
import { notificationManager } from '../utils/notificationManager.js';
import { tokenEstimationService } from './tokenEstimationService.js';
import { costCalculationService } from './costCalculationService.js';
import { settingsService } from './settingsService.js';

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

      // Initialize supporting services for token estimation and cost calculation
      await this.initializeSupportingServices();

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
   * Initialize supporting services for token estimation and cost calculation
   * @private
   */
  async initializeSupportingServices() {
    try {
      // Initialize token estimation service
      if (!tokenEstimationService.isReady()) {
        const tokenResult = await tokenEstimationService.initialize();
        if (!tokenResult.success) {
          console.warn('Token estimation service initialization failed:', tokenResult.message);
        }
      }

      // Initialize cost calculation service
      if (!costCalculationService.isReady()) {
        const costResult = await costCalculationService.initialize();
        if (!costResult.success) {
          console.warn('Cost calculation service initialization failed:', costResult.message);
        }
      }

      // Initialize settings service if not already initialized
      if (!settingsService.isInitialized) {
        const settingsResult = await settingsService.initialize();
        if (!settingsResult.success) {
          console.warn('Settings service initialization failed:', settingsResult.error);
        }
      }
    } catch (error) {
      console.warn('Supporting services initialization failed:', error.message);
      // Don't throw error - these services are optional enhancements
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
   * @param {Object} toolConfig - Optional tool configuration for tool use
   * @returns {Promise<Object>} The model response
   */
  async invokeModel(modelId, systemPrompt, userPrompt, content = '', toolConfig = null) {
    if (!this.isInitialized || !this.credentialsValid) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    // Track response time
    const startTime = performance.now();

    try {
      // If tool configuration is provided, use tool use detection or execution
      if (toolConfig && toolConfig.tools && toolConfig.tools.length > 0) {
        // Check if execution mode is specified in toolConfig
        const executionOptions = toolConfig.executionMode ? {
          executionMode: toolConfig.executionMode,
          maxIterations: toolConfig.maxIterations,
          onProgress: toolConfig.onProgress,
          onToolExecution: toolConfig.onToolExecution
        } : {};

        const result = await this.invokeModelWithTools(modelId, systemPrompt, userPrompt, content, toolConfig, executionOptions);
        const endTime = performance.now();
        result.responseTime = endTime - startTime;
        return result;
      }

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

      // Parse the Converse API response and add response time
      console.log('BedrockService: Raw API response:', response);
      const result = this.parseConverseResponse(response, modelId, systemPrompt, userPrompt, content);
      console.log('BedrockService: Parsed result from parseConverseResponse:', result);
      const endTime = performance.now();
      result.responseTime = endTime - startTime;
      console.log('BedrockService: Final result with responseTime:', result);

      return result;

    } catch (error) {
      throw new Error(`Failed to invoke model ${modelId}: ${error.message}`);
    }
  }

  /**
   * Execute a complete tool workflow with multi-turn conversation
   * Implements Bedrock's tool use pattern: model requests tools -> execute locally -> send results back
   * @param {string} modelId - The model ID to invoke
   * @param {string} systemPrompt - The system prompt to send to the model
   * @param {string} userPrompt - The user prompt to send to the model
   * @param {string} content - Additional content/context for the model
   * @param {Object} toolConfig - Tool configuration object
   * @param {Object} options - Execution options (maxIterations, onProgress, etc.)
   * @returns {Promise<Object>} Complete workflow execution result
   */
  async executeToolWorkflow(modelId, systemPrompt, userPrompt, content = '', toolConfig, options = {}) {
    console.log('BedrockService: executeToolWorkflow called');
    if (!this.isInitialized || !this.credentialsValid) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    const {
      maxIterations = 10,
      onProgress = null,
      onToolExecution = null,
      executionId = this.generateExecutionId()
    } = options;

    // Track workflow execution state
    const workflowState = {
      executionId,
      modelId,
      systemPrompt,
      userPrompt,
      content,
      toolConfig,
      currentIteration: 0,
      maxIterations,
      startTime: Date.now(),
      endTime: null,
      status: 'executing',
      messages: [], // Conversation history for Bedrock
      workflow: [], // Detailed workflow steps for UI
      toolExecutions: [],
      totalToolCalls: 0,
      finalResponse: null,
      errors: []
    };

    try {
      // Initialize conversation with user message
      const fullUserPrompt = content ? `${userPrompt}\n\nData to analyze:\n${content}` : userPrompt;

      workflowState.messages = [
        {
          role: 'user',
          content: [{ text: fullUserPrompt }]
        }
      ];

      // Add initial workflow step
      this.addWorkflowStep(workflowState, {
        type: 'llm_request',
        content: {
          messages: [...workflowState.messages],
          modelId,
          systemPrompt
        },
        metadata: {
          iteration: 0,
          isInitialRequest: true
        }
      });

      // Report initial progress
      if (onProgress) {
        onProgress({
          executionId,
          status: 'executing',
          currentIteration: 0,
          maxIterations,
          phase: 'initial_request',
          message: 'Sending initial request to model...'
        });
      }

      // Execute multi-turn conversation loop
      while (workflowState.currentIteration < maxIterations) {
        workflowState.currentIteration++;

        // Prepare Converse API request
        const converseParams = {
          modelId: modelId,
          messages: workflowState.messages,
          inferenceConfig: {
            maxTokens: 4000,
            temperature: 0.7
          },
          toolConfig: {
            tools: toolConfig.tools
          }
        };

        // Add system prompt if provided
        if (systemPrompt?.trim()) {
          converseParams.system = [{ text: systemPrompt }];
        }

        // Make request to Bedrock
        const command = new ConverseCommand(converseParams);
        const response = await this.runtimeClient.send(command);

        // Add LLM response to workflow
        this.addWorkflowStep(workflowState, {
          type: 'llm_response',
          content: {
            response: response.output?.message?.content,
            stopReason: response.stopReason,
            usage: response.usage
          },
          metadata: {
            iteration: workflowState.currentIteration,
            modelId
          }
        });

        // Parse response for tool use
        const messageContent = response.output?.message?.content || [];
        const toolUseData = this.parseToolUseFromMessageContent(messageContent);

        // Check stop reason and tool use
        if (response.stopReason === 'end_turn' || !toolUseData.hasToolUse) {
          // Conversation is complete
          // Parse the response to get enhanced usage data (with token estimation and cost calculation)
          console.log('BedrockService: Tool workflow parsing final response for usage data');
          const parsedResponse = this.parseConverseResponse(response, modelId, systemPrompt, userPrompt, content);
          console.log('BedrockService: Tool workflow parsed response:', parsedResponse);

          workflowState.finalResponse = {
            text: toolUseData.textContent || 'No text response',
            usage: parsedResponse.usage, // Use enhanced usage data instead of raw API data
            stopReason: response.stopReason,
            iterationCount: workflowState.currentIteration
          };

          console.log('BedrockService: Tool workflow final response:', workflowState.finalResponse);

          // Add completion step to workflow
          this.addWorkflowStep(workflowState, {
            type: 'completion',
            content: {
              finalResponse: workflowState.finalResponse,
              reason: response.stopReason === 'end_turn' ? 'natural_completion' : 'no_tool_use'
            },
            metadata: {
              iteration: workflowState.currentIteration,
              totalIterations: workflowState.currentIteration
            }
          });

          break;
        }

        if (response.stopReason === 'tool_use') {
          // Execute tools and continue conversation
          const toolResults = [];

          for (const toolUse of toolUseData.toolUses) {
            try {
              // Add tool call step to workflow
              this.addWorkflowStep(workflowState, {
                type: 'tool_call',
                content: {
                  toolName: toolUse.name,
                  toolUseId: toolUse.toolUseId,
                  parameters: toolUse.input
                },
                metadata: {
                  iteration: workflowState.currentIteration,
                  toolIndex: workflowState.totalToolCalls
                }
              });

              // Report tool execution progress
              if (onProgress) {
                onProgress({
                  executionId,
                  status: 'executing_tool',
                  currentIteration: workflowState.currentIteration,
                  maxIterations,
                  phase: 'tool_execution',
                  message: `Executing tool: ${toolUse.name}`,
                  currentTool: toolUse.name
                });
              }

              // Execute the tool locally
              const toolResult = await this.executeToolLocally(toolUse.name, toolUse.input, toolConfig);

              // Track tool execution
              workflowState.toolExecutions.push({
                toolName: toolUse.name,
                toolUseId: toolUse.toolUseId,
                input: toolUse.input,
                result: toolResult,
                timestamp: new Date().toISOString(),
                iteration: workflowState.currentIteration
              });

              workflowState.totalToolCalls++;

              // Add tool result step to workflow
              this.addWorkflowStep(workflowState, {
                type: 'tool_result',
                content: {
                  toolName: toolUse.name,
                  toolUseId: toolUse.toolUseId,
                  result: toolResult,
                  success: toolResult.success !== false
                },
                metadata: {
                  iteration: workflowState.currentIteration,
                  executionTime: toolResult.executionTime || 0
                }
              });

              // Prepare tool result for Bedrock (using correct format)
              toolResults.push({
                toolUseId: toolUse.toolUseId,
                content: [
                  {
                    text: JSON.stringify(toolResult)
                  }
                ]
              });

              // Notify about tool execution
              if (onToolExecution) {
                onToolExecution({
                  toolName: toolUse.name,
                  toolUseId: toolUse.toolUseId,
                  input: toolUse.input,
                  result: toolResult,
                  iteration: workflowState.currentIteration
                });
              }

            } catch (toolError) {
              // Handle tool execution error
              const errorResult = {
                success: false,
                error: toolError.message,
                timestamp: new Date().toISOString()
              };

              workflowState.errors.push({
                type: 'tool_execution_error',
                toolName: toolUse.name,
                toolUseId: toolUse.toolUseId,
                error: toolError.message,
                iteration: workflowState.currentIteration
              });

              // Add error step to workflow
              this.addWorkflowStep(workflowState, {
                type: 'error',
                content: {
                  errorType: 'tool_execution_error',
                  toolName: toolUse.name,
                  toolUseId: toolUse.toolUseId,
                  error: toolError.message
                },
                metadata: {
                  iteration: workflowState.currentIteration
                }
              });

              // Still send error result to Bedrock
              toolResults.push({
                toolUseId: toolUse.toolUseId,
                content: [
                  {
                    text: JSON.stringify(errorResult)
                  }
                ]
              });
            }
          }

          // Add tool results to conversation history
          workflowState.messages.push({
            role: 'assistant',
            content: messageContent // Include the original tool use content
          });

          workflowState.messages.push({
            role: 'user',
            content: toolResults.map(result => ({
              toolResult: result
            }))
          });

          // Report progress after tool execution
          if (onProgress) {
            onProgress({
              executionId,
              status: 'continuing_conversation',
              currentIteration: workflowState.currentIteration,
              maxIterations,
              phase: 'processing_results',
              message: `Processed ${toolResults.length} tool result(s), continuing conversation...`,
              toolsExecuted: toolResults.length
            });
          }

          // Continue to next iteration
          continue;
        }

        // Handle unexpected stop reason
        workflowState.errors.push({
          type: 'unexpected_stop_reason',
          stopReason: response.stopReason,
          iteration: workflowState.currentIteration
        });

        break;
      }

      // Check if we hit max iterations
      if (workflowState.currentIteration >= maxIterations && !workflowState.finalResponse) {
        console.log('BedrockService: Tool workflow hit max iterations, creating fallback response');
        workflowState.status = 'max_iterations_reached';

        // Try to get usage data from the last response if available
        let fallbackUsage = null;
        if (workflowState.messages.length > 0) {
          // Create a minimal response object to parse for usage data
          const lastMessage = workflowState.messages[workflowState.messages.length - 1];
          if (lastMessage && lastMessage.content) {
            try {
              const mockResponse = {
                output: {
                  message: {
                    content: [{ text: 'Maximum iterations reached without completion' }]
                  }
                },
                usage: null // No API usage data available
              };
              const parsedResponse = this.parseConverseResponse(mockResponse, modelId, systemPrompt, userPrompt, content);
              fallbackUsage = parsedResponse.usage;
            } catch (error) {
              console.warn('BedrockService: Failed to create fallback usage data:', error);
            }
          }
        }

        workflowState.finalResponse = {
          text: 'Maximum iterations reached without completion',
          usage: fallbackUsage,
          stopReason: 'max_iterations',
          iterationCount: workflowState.currentIteration
        };

        console.log('BedrockService: Max iterations fallback response:', workflowState.finalResponse);

        this.addWorkflowStep(workflowState, {
          type: 'max_iterations_reached',
          content: {
            maxIterations,
            finalIteration: workflowState.currentIteration
          },
          metadata: {
            iteration: workflowState.currentIteration
          }
        });
      }

      // Finalize workflow state
      workflowState.endTime = Date.now();
      workflowState.totalDuration = workflowState.endTime - workflowState.startTime;
      workflowState.status = workflowState.status === 'executing' ? 'completed' : workflowState.status;

      // Report final progress
      if (onProgress) {
        onProgress({
          executionId,
          status: workflowState.status,
          currentIteration: workflowState.currentIteration,
          maxIterations,
          phase: 'completed',
          message: `Workflow completed in ${workflowState.currentIteration} iteration(s)`,
          totalDuration: workflowState.totalDuration,
          toolsExecuted: workflowState.totalToolCalls
        });
      }

      // Return complete workflow result
      console.log('BedrockService: executeToolWorkflow returning result with usage:', workflowState.finalResponse?.usage);
      const finalResult = {
        executionId,
        text: workflowState.finalResponse?.text || '',
        usage: workflowState.finalResponse?.usage,
        workflow: workflowState.workflow,
        toolExecutions: workflowState.toolExecutions,
        iterationCount: workflowState.currentIteration,
        totalToolCalls: workflowState.totalToolCalls,
        totalDuration: workflowState.totalDuration,
        status: workflowState.status,
        errors: workflowState.errors,
        stopReason: workflowState.finalResponse?.stopReason || 'unknown'
      };
      console.log('BedrockService: Final workflow result:', finalResult);
      return finalResult;

    } catch (error) {
      // Handle workflow execution error
      workflowState.status = 'error';
      workflowState.endTime = Date.now();
      workflowState.totalDuration = workflowState.endTime - workflowState.startTime;

      workflowState.errors.push({
        type: 'workflow_execution_error',
        error: error.message,
        iteration: workflowState.currentIteration
      });

      this.addWorkflowStep(workflowState, {
        type: 'error',
        content: {
          errorType: 'workflow_execution_error',
          error: error.message
        },
        metadata: {
          iteration: workflowState.currentIteration
        }
      });

      if (onProgress) {
        onProgress({
          executionId,
          status: 'error',
          currentIteration: workflowState.currentIteration,
          maxIterations,
          phase: 'error',
          message: `Workflow failed: ${error.message}`,
          error: error.message
        });
      }

      throw new Error(`Tool workflow execution failed: ${error.message}`);
    }
  }

  /**
   * Execute a tool locally using the appropriate service
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} parameters - Tool parameters
   * @param {Object} toolConfig - Tool configuration
   * @returns {Promise<Object>} Tool execution result
   */
  async executeToolLocally(toolName, parameters, toolConfig) {
    try {
      // Find tool definition
      const toolDef = toolConfig.tools.find(tool => tool.toolSpec.name === toolName);
      if (!toolDef) {
        throw new Error(`Tool definition not found: ${toolName}`);
      }

      // For fraud detection tools, use fraudToolsService
      if (toolName.includes('fraud') || toolName.includes('account') || toolName.includes('transaction')) {
        // Import fraudToolsService dynamically to avoid circular dependencies
        const { fraudToolsService } = await import('./fraudToolsService.js');
        return await fraudToolsService.executeTool(toolName, parameters);
      }

      // For other tools, implement generic execution
      return {
        success: true,
        message: `Tool ${toolName} executed successfully`,
        result: parameters,
        timestamp: new Date().toISOString(),
        executionTime: Math.random() * 100 + 50 // Simulate execution time
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        executionTime: 0
      };
    }
  }

  /**
   * Add a workflow step to the execution state
   * @param {Object} workflowState - Current workflow state
   * @param {Object} step - Step to add
   */
  addWorkflowStep(workflowState, step) {
    const workflowStep = {
      id: `step_${workflowState.workflow.length + 1}`,
      executionId: workflowState.executionId,
      timestamp: new Date().toISOString(),
      duration: null,
      status: 'completed',
      ...step
    };

    workflowState.workflow.push(workflowStep);
  }

  /**
   * Generate a unique execution ID
   * @returns {string} Unique execution ID
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Invoke a foundation model with tool configuration using Converse API
   * Supports both tool detection (default) and actual tool execution modes
   * @param {string} modelId - The model ID to invoke
   * @param {string} systemPrompt - The system prompt to send to the model
   * @param {string} userPrompt - The user prompt to send to the model
   * @param {string} content - Additional content/context for the model
   * @param {Object} toolConfig - Tool configuration object
   * @param {Object} options - Execution options including mode
   * @returns {Promise<Object>} The model response with tool usage data
   */
  async invokeModelWithTools(modelId, systemPrompt, userPrompt, content = '', toolConfig, options = {}) {
    console.log('BedrockService: invokeModelWithTools called with:', { modelId, executionMode: options.executionMode });
    const {
      executionMode = 'detection', // 'detection' or 'execution'
      maxIterations = 10,
      onProgress = null,
      onToolExecution = null
    } = options;

    // If execution mode is requested, delegate to executeToolWorkflow
    if (executionMode === 'execution') {
      return await this.executeToolWorkflow(
        modelId,
        systemPrompt,
        userPrompt,
        content,
        toolConfig,
        {
          maxIterations,
          onProgress,
          onToolExecution
        }
      );
    }

    // Default behavior: tool detection mode (backward compatibility)
    if (!this.isInitialized || !this.credentialsValid) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    // Track response time
    const startTime = performance.now();

    try {
      // Combine user prompt and content if content exists
      const fullUserPrompt = content ? `${userPrompt}\n\nData to analyze:\n${content}` : userPrompt;

      // Prepare messages array for single-shot request
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

      // Prepare the Converse API command with tools
      const converseParams = {
        modelId: modelId,
        messages: messages,
        inferenceConfig: {
          maxTokens: 4000,
          temperature: 0.7
        },
        toolConfig: {
          tools: toolConfig.tools
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

      // Make single request
      const command = new ConverseCommand(converseParams);
      const response = await this.runtimeClient.send(command);

      // Extract tool usage attempts from the response
      const toolUsage = this.extractToolUsageAttempts(response, toolConfig);



      // Parse the basic response
      const basicResponse = this.parseConverseResponse(response, modelId, systemPrompt, fullUserPrompt, content);

      // Add response time and return combined response with tool usage data
      const endTime = performance.now();
      return {
        ...basicResponse,
        toolUsage: toolUsage,
        responseTime: endTime - startTime,
        executionMode: 'detection' // Indicate this was detection mode
      };

    } catch (error) {
      throw new Error(`Failed to invoke model with tools ${modelId}: ${error.message}`);
    }
  }



  /**
   * Parse tool use from message content
   * @param {Array} messageContent - The message content array from Bedrock response
   * @returns {Object} Parsed tool use data
   */
  parseToolUseFromMessageContent(messageContent) {
    const result = {
      hasToolUse: false,
      toolUses: [],
      textContent: ''
    };

    if (!messageContent || !Array.isArray(messageContent)) {

      return result;
    }



    for (const contentBlock of messageContent) {
      if (contentBlock.text) {
        result.textContent += contentBlock.text;
      } else if (contentBlock.toolUse) {
        result.hasToolUse = true;
        result.toolUses.push({
          name: contentBlock.toolUse.name,
          toolUseId: contentBlock.toolUse.toolUseId,
          input: contentBlock.toolUse.input
        });

      }
    }



    return result;
  }

  /**
   * Extract tool usage attempts from Bedrock response
   * Captures tool usage data without executing tools, for analysis and display
   * @param {Object} response - The complete Bedrock response object
   * @param {Object} toolConfig - Tool configuration that was available to the model
   * @returns {Object} Tool usage data structure
   */
  extractToolUsageAttempts(response, toolConfig = null) {
    const toolUsage = {
      hasToolUsage: false,
      toolCalls: [],
      toolCallCount: 0,
      availableTools: toolConfig ? toolConfig.tools.map(tool => tool.toolSpec.name) : [],
      extractionErrors: [],
      extractionWarnings: [],
      extractionTimestamp: new Date().toISOString(),
      extractionSuccess: false,
      gracefulDegradation: false
    };

    try {
      // Validate response structure with detailed error reporting
      if (!response) {
        toolUsage.extractionErrors.push({
          type: 'invalid_response',
          severity: 'high',
          message: 'Response object is null or undefined',
          userMessage: 'No response received from the model',
          timestamp: new Date().toISOString()
        });
        toolUsage.gracefulDegradation = true;
        return toolUsage;
      }

      if (!response.output) {
        toolUsage.extractionErrors.push({
          type: 'invalid_response_structure',
          severity: 'high',
          message: 'Response missing output property',
          userMessage: 'Model response has unexpected structure',
          timestamp: new Date().toISOString()
        });
        toolUsage.gracefulDegradation = true;
        return toolUsage;
      }

      if (!response.output.message) {
        toolUsage.extractionErrors.push({
          type: 'invalid_message_structure',
          severity: 'high',
          message: 'Response output missing message property',
          userMessage: 'Model response message is missing',
          timestamp: new Date().toISOString()
        });
        toolUsage.gracefulDegradation = true;
        return toolUsage;
      }

      const messageContent = response.output.message.content;
      if (!messageContent) {
        toolUsage.extractionWarnings.push({
          type: 'empty_content',
          message: 'Message content is empty',
          timestamp: new Date().toISOString()
        });
        toolUsage.extractionSuccess = true;
        return toolUsage;
      }

      if (!Array.isArray(messageContent)) {
        toolUsage.extractionErrors.push({
          type: 'invalid_content_structure',
          severity: 'medium',
          message: `Message content is not an array: ${typeof messageContent}`,
          userMessage: 'Model response content has unexpected format',
          timestamp: new Date().toISOString()
        });
        toolUsage.gracefulDegradation = true;
        return toolUsage;
      }

      // Parse tool use from message content with enhanced error handling
      let toolUseData;
      try {
        toolUseData = this.parseToolUseFromMessageContent(messageContent);
      } catch (parseError) {
        const errorInfo = analyzeError(parseError, {
          operation: 'parseToolUseFromMessageContent',
          contentLength: messageContent.length
        });

        toolUsage.extractionErrors.push({
          type: 'parsing_error',
          severity: 'high',
          message: `Failed to parse tool use from message content: ${parseError.message}`,
          userMessage: errorInfo.userMessage,
          originalError: parseError.message,
          timestamp: new Date().toISOString()
        });
        toolUsage.gracefulDegradation = true;
        return toolUsage;
      }

      // If no tool use detected, this is successful (model chose not to use tools)
      if (!toolUseData.hasToolUse || !toolUseData.toolUses.length) {
        toolUsage.extractionSuccess = true;
        return toolUsage;
      }

      // Process each tool use attempt with comprehensive error handling
      toolUsage.hasToolUsage = true;
      toolUsage.toolCallCount = toolUseData.toolUses.length;
      let successfulExtractions = 0;

      for (const [index, toolUse] of toolUseData.toolUses.entries()) {
        try {
          // Validate tool use structure
          const structureValidation = this.validateToolUseStructure(toolUse, index);
          if (!structureValidation.isValid) {
            toolUsage.extractionErrors.push({
              type: 'structure_validation_error',
              severity: 'medium',
              message: structureValidation.error,
              userMessage: `Tool call ${index + 1} has invalid structure`,
              toolIndex: index,
              toolUse: toolUse,
              timestamp: new Date().toISOString()
            });
            continue;
          }

          // Check if tool was available to the model
          const wasToolAvailable = toolUsage.availableTools.includes(toolUse.name);
          if (!wasToolAvailable && toolConfig) {
            toolUsage.extractionWarnings.push({
              type: 'unavailable_tool',
              message: `Model attempted to use unavailable tool: ${toolUse.name}`,
              userMessage: `Model tried to use "${toolUse.name}" which was not available`,
              toolName: toolUse.name,
              availableTools: toolUsage.availableTools,
              timestamp: new Date().toISOString()
            });
          }

          // Validate tool input parameters if tool configuration is available
          let parameterValidation = null;
          if (toolConfig && wasToolAvailable) {
            try {
              parameterValidation = this.validateToolParameters(toolUse.name, toolUse.input, toolConfig);
              if (parameterValidation && !parameterValidation.isValid) {
                toolUsage.extractionWarnings.push({
                  type: 'parameter_validation_warning',
                  message: `Invalid parameters for tool ${toolUse.name}: ${parameterValidation.errors.join(', ')}`,
                  userMessage: `Tool "${toolUse.name}" was called with invalid parameters`,
                  toolName: toolUse.name,
                  validationDetails: parameterValidation,
                  timestamp: new Date().toISOString()
                });
              }
            } catch (validationError) {
              toolUsage.extractionErrors.push({
                type: 'parameter_validation_error',
                severity: 'medium',
                message: `Failed to validate parameters for tool ${toolUse.name}: ${validationError.message}`,
                userMessage: `Could not validate parameters for tool "${toolUse.name}"`,
                toolName: toolUse.name,
                originalError: validationError.message,
                timestamp: new Date().toISOString()
              });
            }
          }

          // Create tool usage record
          const toolUsageRecord = {
            toolName: toolUse.name,
            toolUseId: toolUse.toolUseId,
            input: toolUse.input, // Raw input from model (matches Bedrock response structure)
            attempted: true, // Indicates this was attempted but not executed
            timestamp: new Date().toISOString(),
            wasToolAvailable: wasToolAvailable,
            parameterValidation: parameterValidation,
            extractionSuccess: true,
            index: index
          };

          toolUsage.toolCalls.push(toolUsageRecord);
          successfulExtractions++;

        } catch (toolProcessingError) {
          // Handle errors processing individual tool use
          const errorInfo = analyzeError(toolProcessingError, {
            operation: 'processToolUse',
            toolIndex: index,
            toolName: toolUse?.name
          });

          toolUsage.extractionErrors.push({
            type: 'tool_processing_error',
            severity: 'medium',
            message: `Error processing tool use ${index + 1}: ${toolProcessingError.message}`,
            userMessage: errorInfo.userMessage,
            toolIndex: index,
            toolUse: toolUse,
            originalError: toolProcessingError.message,
            timestamp: new Date().toISOString()
          });

          // Still add a partial record for failed tool processing
          toolUsage.toolCalls.push({
            toolName: toolUse?.name || 'unknown',
            toolUseId: toolUse?.toolUseId || `unknown_${index}`,
            input: toolUse?.input || {},
            attempted: true,
            timestamp: new Date().toISOString(),
            extractionSuccess: false,
            extractionError: toolProcessingError.message,
            index: index
          });
        }
      }

      // Determine overall extraction success
      toolUsage.extractionSuccess = successfulExtractions > 0 || toolUsage.extractionErrors.length === 0;
      if (successfulExtractions < toolUseData.toolUses.length) {
        toolUsage.gracefulDegradation = true;
      }

    } catch (overallError) {
      // Handle any unexpected errors in the extraction process
      const errorInfo = analyzeError(overallError, {
        operation: 'extractToolUsageAttempts'
      });

      toolUsage.extractionErrors.push({
        type: 'extraction_failure',
        severity: 'high',
        message: `Tool usage extraction failed: ${overallError.message}`,
        userMessage: errorInfo.userMessage,
        originalError: overallError.message,
        timestamp: new Date().toISOString()
      });
      toolUsage.gracefulDegradation = true;

      handleError(overallError, {
        context: 'tool_usage_extraction',
        operation: 'extractToolUsageAttempts'
      });
    }

    return toolUsage;
  }

  /**
   * Validate tool use structure
   * @param {Object} toolUse - Tool use object to validate
   * @param {number} index - Index of the tool use for error reporting
   * @returns {Object} Validation result
   */
  validateToolUseStructure(toolUse, index) {
    const validation = {
      isValid: false,
      error: null,
      warnings: []
    };

    try {
      if (!toolUse || typeof toolUse !== 'object') {
        validation.error = `Tool use ${index + 1} is not an object`;
        return validation;
      }

      if (!toolUse.name || typeof toolUse.name !== 'string') {
        validation.error = `Tool use ${index + 1} missing or invalid name`;
        return validation;
      }

      if (!toolUse.toolUseId || typeof toolUse.toolUseId !== 'string') {
        validation.error = `Tool use ${index + 1} missing or invalid toolUseId`;
        return validation;
      }

      if (toolUse.input === undefined) {
        validation.warnings.push(`Tool use ${index + 1} has no input parameters`);
      }

      validation.isValid = true;
      return validation;

    } catch (error) {
      validation.error = `Validation failed for tool use ${index + 1}: ${error.message}`;
      return validation;
    }
  }

  /**
   * Validate tool parameters against tool configuration schema
   * @param {string} toolName - Name of the tool
   * @param {Object} parameters - Parameters provided by the model
   * @param {Object} toolConfig - Tool configuration object
   * @returns {Object} Validation result
   */
  validateToolParameters(toolName, parameters, toolConfig) {
    const validation = {
      isValid: false,
      errors: [],
      warnings: [],
      missingRequired: [],
      unexpectedParameters: [],
      parameterTypes: {}
    };

    try {
      // Find the tool definition
      const toolDef = toolConfig.tools.find(tool => tool.toolSpec.name === toolName);
      if (!toolDef) {
        validation.errors.push(`Tool definition not found for: ${toolName}`);
        return validation;
      }

      const schema = toolDef.toolSpec.inputSchema;
      if (!schema || !schema.json) {
        validation.warnings.push(`No input schema defined for tool: ${toolName}`);
        validation.isValid = true; // Allow if no schema to validate against
        return validation;
      }

      const schemaProps = schema.json.properties || {};
      const requiredFields = schema.json.required || [];

      // Check for missing required parameters
      for (const requiredField of requiredFields) {
        if (!(requiredField in parameters)) {
          validation.missingRequired.push(requiredField);
          validation.errors.push(`Missing required parameter: ${requiredField}`);
        }
      }

      // Check for unexpected parameters
      for (const paramName in parameters) {
        if (!(paramName in schemaProps)) {
          validation.unexpectedParameters.push(paramName);
          validation.warnings.push(`Unexpected parameter: ${paramName}`);
        } else {
          // Validate parameter type
          const expectedType = schemaProps[paramName].type;
          const actualValue = parameters[paramName];
          const actualType = this.getParameterType(actualValue);

          validation.parameterTypes[paramName] = {
            expected: expectedType,
            actual: actualType,
            value: actualValue
          };

          if (!this.isValidParameterType(actualValue, expectedType)) {
            validation.errors.push(`Parameter ${paramName} has invalid type. Expected: ${expectedType}, Got: ${actualType}`);
          }
        }
      }

      // Set overall validation status
      validation.isValid = validation.errors.length === 0;

    } catch (validationError) {
      validation.errors.push(`Validation process failed: ${validationError.message}`);
    }

    return validation;
  }

  /**
   * Get the type of a parameter value
   * @param {*} value - The parameter value
   * @returns {string} The type string
   */
  getParameterType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Check if a parameter value matches the expected type
   * @param {*} value - The parameter value
   * @param {string} expectedType - The expected type from schema
   * @returns {boolean} True if type matches
   */
  isValidParameterType(value, expectedType) {
    const actualType = this.getParameterType(value);

    switch (expectedType) {
      case 'string':
        return actualType === 'string';
      case 'number':
        return actualType === 'number' && !isNaN(value);
      case 'integer':
        return actualType === 'number' && Number.isInteger(value);
      case 'boolean':
        return actualType === 'boolean';
      case 'array':
        return actualType === 'array';
      case 'object':
        return actualType === 'object' && value !== null && !Array.isArray(value);
      default:
        return true; // Allow unknown types
    }
  }

  /**
   * Format tool usage data for display in UI components
   * @param {Object} toolUsage - Tool usage data from response
   * @returns {Object} Formatted tool usage data for display
   */
  formatToolUsageForDisplay(toolUsage) {
    if (!toolUsage || !toolUsage.hasToolUsage) {
      return {
        hasToolUsage: false,
        displayMessage: 'No tools used',
        toolCalls: [],
        summary: {
          totalCalls: 0,
          uniqueTools: 0,
          hasErrors: false
        }
      };
    }

    const formattedToolCalls = toolUsage.toolCalls.map((toolCall, index) => {
      const formatted = {
        id: `tool-call-${index}`,
        toolName: toolCall.toolName,
        toolUseId: toolCall.toolUseId,
        timestamp: toolCall.timestamp,
        attempted: toolCall.attempted || true,
        extractionSuccess: toolCall.extractionSuccess !== false,
        parameters: this.formatToolParameters(toolCall.input),
        validation: toolCall.parameterValidation || null,
        wasToolAvailable: toolCall.wasToolAvailable !== false,
        displayStatus: this.getToolCallDisplayStatus(toolCall)
      };

      return formatted;
    });

    const uniqueTools = [...new Set(toolUsage.toolCalls.map(call => call.toolName))];
    const hasErrors = toolUsage.extractionErrors && toolUsage.extractionErrors.length > 0;
    const hasValidationErrors = toolUsage.toolCalls.some(call =>
      call.parameterValidation && !call.parameterValidation.isValid
    );

    return {
      hasToolUsage: true,
      displayMessage: `${toolUsage.toolCallCount} tool call${toolUsage.toolCallCount !== 1 ? 's' : ''} attempted`,
      toolCalls: formattedToolCalls,
      summary: {
        totalCalls: toolUsage.toolCallCount,
        uniqueTools: uniqueTools.length,
        toolNames: uniqueTools,
        hasErrors: hasErrors || hasValidationErrors,
        extractionErrors: toolUsage.extractionErrors || [],
        availableTools: toolUsage.availableTools || []
      }
    };
  }

  /**
   * Format tool parameters for display
   * @param {Object} parameters - Raw tool parameters
   * @returns {Array} Formatted parameter list for display
   */
  formatToolParameters(parameters) {
    if (!parameters || typeof parameters !== 'object') {
      return [];
    }

    return Object.entries(parameters).map(([key, value]) => ({
      name: key,
      value: value,
      displayValue: this.formatParameterValue(value),
      type: this.getParameterType(value)
    }));
  }

  /**
   * Format a parameter value for display
   * @param {*} value - The parameter value
   * @returns {string} Formatted display value
   */
  formatParameterValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      if (value.length <= 3) return JSON.stringify(value);
      return `[${value.slice(0, 3).map(v => JSON.stringify(v)).join(', ')}, ... (${value.length} items)]`;
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) return '{}';
      if (keys.length <= 2) return JSON.stringify(value);
      return `{${keys.slice(0, 2).join(', ')}, ... (${keys.length} keys)}`;
    }
    if (typeof value === 'string' && value.length > 100) {
      return `"${value.substring(0, 97)}..."`;
    }
    return JSON.stringify(value);
  }

  /**
   * Get display status for a tool call
   * @param {Object} toolCall - Tool call data
   * @returns {Object} Display status information
   */
  getToolCallDisplayStatus(toolCall) {
    const status = {
      type: 'attempted',
      message: 'Tool call attempted (not executed)',
      color: 'blue',
      icon: 'tool'
    };

    if (toolCall.extractionSuccess === false) {
      status.type = 'extraction_failed';
      status.message = 'Failed to extract tool call data';
      status.color = 'red';
      status.icon = 'error';
    } else if (toolCall.wasToolAvailable === false) {
      status.type = 'unavailable';
      status.message = 'Tool was not available to model';
      status.color = 'orange';
      status.icon = 'warning';
    } else if (toolCall.parameterValidation && !toolCall.parameterValidation.isValid) {
      status.type = 'invalid_parameters';
      status.message = 'Invalid parameters provided';
      status.color = 'orange';
      status.icon = 'warning';
    }

    return status;
  }

  /**
   * Simulate tool execution (no real execution)
   * @param {string} toolName - The name of the tool to simulate
   * @param {Object} toolInput - The input parameters for the tool
   * @returns {Object} Simulated tool execution result
   */
  simulateToolExecution(toolName, toolInput) {
    try {
      switch (toolName) {
        case 'freeze_account':
          return {
            success: true,
            message: `Account ${toolInput.account_id} has been frozen`,
            action_taken: 'account_frozen',
            affected_account: toolInput.account_id,
            affected_transactions: toolInput.transaction_ids,
            reason: toolInput.reason,
            timestamp: new Date().toISOString()
          };

        default:
          return {
            success: true,
            message: `Tool ${toolName} executed successfully`,
            tool_name: toolName,
            input_received: toolInput,
            timestamp: new Date().toISOString()
          };
      }
    } catch (error) {
      return {
        success: false,
        error: `Tool simulation failed: ${error.message}`,
        tool_name: toolName,
        input_received: toolInput,
        timestamp: new Date().toISOString()
      };
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
   * @param {Object} toolConfig - Optional tool configuration for tool use
   * @returns {Promise<Object>} The complete model response
   */
  async invokeModelStream(modelId, systemPrompt, userPrompt, content = '', onToken, onComplete, onError, toolConfig = null) {
    if (!this.isInitialized || !this.credentialsValid) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    // If tool configuration is provided, use tool use streaming
    if (toolConfig && toolConfig.tools && toolConfig.tools.length > 0) {
      // Check if execution mode is specified in toolConfig
      const streamingOptions = toolConfig.executionMode ? {
        executionMode: toolConfig.executionMode,
        maxIterations: toolConfig.maxIterations,
        onProgress: toolConfig.onProgress,
        onToolExecution: toolConfig.onToolExecution
      } : {};

      return await this.invokeModelStreamWithTools(modelId, systemPrompt, userPrompt, content, toolConfig, onToken, onComplete, onError, streamingOptions);
    }

    // Pre-flight model compatibility check
    const compatibilityCheck = await this.checkModelCompatibility(modelId);
    if (!compatibilityCheck.supportsStreaming) {
      console.warn(`Model ${modelId} doesn't support streaming: ${compatibilityCheck.reason}`);
      onError?.(new Error(`Streaming not supported: ${compatibilityCheck.reason}`));

      // Graceful fallback to non-streaming
      try {
        const result = await this.invokeModel(modelId, systemPrompt, userPrompt, content, toolConfig);
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
          onError?.(new Error(`Connection interrupted (attempt ${attempt}). Retrying in ${Math.round(delay / 1000)}s...`));
        }
      }
    );
  }

  /**
   * Invoke a foundation model with streaming and tool use support
   * Supports both tool detection and execution modes
   * @param {string} modelId - The model ID to invoke
   * @param {string} systemPrompt - The system prompt to send to the model
   * @param {string} userPrompt - The user prompt to send to the model
   * @param {string} content - Additional content/context for the model
   * @param {Object} toolConfig - Tool configuration object
   * @param {Function} onToken - Callback function called for each token received
   * @param {Function} onComplete - Callback function called when streaming completes
   * @param {Function} onError - Callback function called if streaming fails
   * @param {Object} options - Execution options including mode
   * @returns {Promise<Object>} The complete model response with tool usage data
   */
  async invokeModelStreamWithTools(modelId, systemPrompt, userPrompt, content = '', toolConfig, onToken, onComplete, onError, options = {}) {
    const { executionMode = 'detection' } = options;

    // If execution mode is requested, fall back to non-streaming execution
    // Streaming with tool execution is complex and requires special handling
    if (executionMode === 'execution') {
      console.warn('Streaming not supported with tool execution mode, falling back to non-streaming');
      onError?.(new Error('Streaming not supported with tool execution mode'));

      try {
        const result = await this.invokeModelWithTools(modelId, systemPrompt, userPrompt, content, toolConfig, options);
        onComplete?.(result);
        return result;
      } catch (fallbackError) {
        const finalError = new Error(`Tool execution fallback failed: ${fallbackError.message}`);
        onError?.(finalError);
        throw finalError;
      }
    }

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

      // Graceful fallback to non-streaming with tools
      try {
        const result = await this.invokeModelWithTools(modelId, systemPrompt, userPrompt, content, toolConfig, options);
        onComplete?.(result);
        return result;
      } catch (fallbackError) {
        const finalError = new Error(`Model doesn't support streaming and fallback failed: ${fallbackError.message}`);
        onError?.(finalError);
        throw finalError;
      }
    }

    try {
      // Combine user prompt and content if content exists
      const fullUserPrompt = content ? `${userPrompt}\n\nData to analyze:\n${content}` : userPrompt;

      // Prepare initial messages array
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

      // Process streaming tool use detection
      return await this.processStreamingToolUseConversation(
        modelId, messages, systemPrompt, toolConfig, onToken, onComplete, onError
      );

    } catch (error) {
      const streamingError = this.categorizeStreamingError(error);
      onError?.(new Error(streamingError.userMessage));
      throw new Error(streamingError.userMessage);
    }
  }

  /**
   * Process a single-shot streaming tool use request
   * @param {string} modelId - The model ID to invoke
   * @param {Array} messages - Initial messages array
   * @param {string} systemPrompt - The system prompt
   * @param {Object} toolConfig - Tool configuration object
   * @param {Function} onToken - Callback function called for each token received
   * @param {Function} onComplete - Callback function called when streaming completes
   * @param {Function} onError - Callback function called if streaming fails
   * @returns {Promise<Object>} The final model response with tool usage data
   */
  async processStreamingToolUseConversation(modelId, messages, systemPrompt, toolConfig, onToken, onComplete, onError) {
    // Initialize tool usage tracking
    const toolUsage = {
      hasToolUsage: false,
      toolCalls: [],
      toolCallCount: 0,
      availableTools: toolConfig.tools.map(tool => tool.toolSpec.name),
      extractionErrors: []
    };

    let fullText = '';

    // Prepare the ConverseStream API command with tools
    const converseParams = {
      modelId: modelId,
      messages: messages,
      inferenceConfig: {
        maxTokens: 4000,
        temperature: 0.7
      },
      toolConfig: {
        tools: toolConfig.tools
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

    // Process the streaming response with tool use detection
    let streamedText = '';
    let usage = null;
    let messageContent = [];
    let currentToolUse = null; // Track the current tool use being built
    let completedToolUses = []; // Track completed tool uses
    let toolUseDetected = false;

    try {
      for await (const event of response.stream) {
        if (event.messageStart) {
          // New message starting
          continue;
        } else if (event.contentBlockStart) {
          // Content block starting
          if (event.contentBlockStart.start?.toolUse) {
            toolUseDetected = true;
            currentToolUse = {
              toolUseId: event.contentBlockStart.start.toolUse.toolUseId,
              name: event.contentBlockStart.start.toolUse.name,
              input: {},
              inputString: '' // Accumulate input string chunks
            };

            // Notify UI about tool use detection
            onToken?.('', fullText, {
              toolUsageDetected: true,
              toolUseStarted: {
                name: currentToolUse.name,
                toolUseId: currentToolUse.toolUseId
              }
            });
          }
        } else if (event.contentBlockDelta) {
          if (event.contentBlockDelta.delta?.text) {
            // Text delta - stream it
            const textChunk = event.contentBlockDelta.delta.text;
            streamedText += textChunk;
            fullText += textChunk;
            onToken?.(textChunk, fullText, { toolUsageDetected: toolUseDetected });
          } else if (event.contentBlockDelta.delta?.toolUse && currentToolUse) {
            // Tool use input delta - accumulate the input string
            const deltaInput = event.contentBlockDelta.delta.toolUse.input;
            if (deltaInput) {
              currentToolUse.inputString += deltaInput;

              // Try to parse the accumulated string for UI progress updates
              try {
                const parsedInput = JSON.parse(currentToolUse.inputString.trim());
                currentToolUse.input = parsedInput;
              } catch (err) {
                // Not complete JSON yet, keep accumulating
                // Don't log this as it's expected during streaming
              }

              // Notify UI about tool use progress
              onToken?.('', fullText, {
                toolUsageDetected: true,
                toolUseProgress: {
                  name: currentToolUse.name,
                  toolUseId: currentToolUse.toolUseId,
                  currentInput: currentToolUse.input,
                  inputString: currentToolUse.inputString // For debugging
                }
              });
            }
          }
        } else if (event.contentBlockStop) {
          if (currentToolUse) {
            // Final parsing of the complete input string
            if (currentToolUse.inputString) {
              try {
                const finalInput = JSON.parse(currentToolUse.inputString.trim());
                currentToolUse.input = finalInput;
              } catch (err) {
                console.warn(`Failed to parse final tool input for ${currentToolUse.name}:`, err.message);
                console.warn('Input string was:', currentToolUse.inputString);
                currentToolUse.input = {};
              }
            }

            // Add the completed tool use to lists
            completedToolUses.push(currentToolUse);

            // Notify UI about completed tool use
            onToken?.('', fullText, {
              toolUsageDetected: true,
              toolUseCompleted: {
                name: currentToolUse.name,
                toolUseId: currentToolUse.toolUseId,
                input: currentToolUse.input
              }
            });

            currentToolUse = null;
          }
        } else if (event.messageStop) {
          // Message is complete
          break;
        } else if (event.metadata?.usage) {
          usage = {
            input_tokens: event.metadata.usage.inputTokens,
            output_tokens: event.metadata.usage.outputTokens,
            total_tokens: event.metadata.usage.totalTokens
          };
        }
      }

      // Handle any remaining current tool use (shouldn't happen but safety check)
      if (currentToolUse) {
        if (currentToolUse.inputString) {
          try {
            const finalInput = JSON.parse(currentToolUse.inputString.trim());
            currentToolUse.input = finalInput;
          } catch (err) {
            console.warn(`Failed to parse final tool input for ${currentToolUse.name}:`, err.message);
            console.warn('Input string was:', currentToolUse.inputString);
            currentToolUse.input = {};
          }
        }
        completedToolUses.push(currentToolUse);
      }

      // Reconstruct message content for tool use parsing
      if (streamedText.trim()) {
        messageContent.push({ text: streamedText });
      }

      // Add completed tool uses to message content
      for (const toolUse of completedToolUses) {
        messageContent.push({
          toolUse: {
            name: toolUse.name,
            toolUseId: toolUse.toolUseId,
            input: toolUse.input
          }
        });
      }

      // Create a mock response structure for tool usage extraction
      const mockResponse = {
        output: {
          message: {
            content: messageContent
          }
        }
      };

      // Extract tool usage attempts using the existing method
      const extractedToolUsage = this.extractToolUsageAttempts(mockResponse, toolConfig);

      // Use the extracted tool usage data
      const result = {
        text: fullText,
        usage: usage,
        toolUsage: extractedToolUsage
      };

      onComplete?.(result);
      return result;

    } catch (streamError) {
      // Handle streaming errors with tool usage context
      toolUsage.extractionErrors.push({
        type: 'streaming_error',
        message: `Streaming failed during tool use detection: ${streamError.message}`,
        timestamp: new Date().toISOString()
      });

      const errorResult = {
        text: fullText,
        usage: usage,
        toolUsage: toolUsage,
        streamingError: streamError.message
      };

      onError?.(streamError);
      return errorResult;
    }
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

      // Handle contentBlockStart event (may contain tool use)
      if (event.contentBlockStart) {
        if (event.contentBlockStart.start?.toolUse) {
          return {
            type: 'toolUseStart',
            toolUse: event.contentBlockStart.start.toolUse
          };
        }
        return {
          type: 'contentBlockStart',
          start: event.contentBlockStart.start
        };
      }

      // Handle contentBlockDelta event (contains tokens or tool use data)
      if (event.contentBlockDelta?.delta) {
        if (event.contentBlockDelta.delta.text) {
          return {
            type: 'token',
            text: event.contentBlockDelta.delta.text
          };
        }
        if (event.contentBlockDelta.delta.toolUse) {
          console.log(event.contentBlockDelta.delta);
          console.log(event.contentBlockDelta.delta.toolUse);
          return {
            type: 'toolUseDelta',
            toolUseDelta: {
              toolUseId: event.contentBlockDelta.delta.toolUse.toolUseId,
              input: event.contentBlockDelta.delta.toolUse.input
            }
          };
        }
      }

      // Handle contentBlockStop event (may signal end of tool use)
      if (event.contentBlockStop) {
        return {
          type: 'contentBlockStop',
          contentBlockIndex: event.contentBlockStop.contentBlockIndex
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
   * Parse the response from the Converse API with enhanced token and cost tracking
   * @param {Object} response - The raw Converse API response
   * @param {string} modelId - The model ID used for the request
   * @param {string} systemPrompt - The system prompt used (for token estimation)
   * @param {string} userPrompt - The user prompt used (for token estimation)
   * @param {string} content - Additional content used (for token estimation)
   * @private
   */
  parseConverseResponse(response, modelId = null, systemPrompt = '', userPrompt = '', content = '') {
    try {
      // Extract text from the Converse API response
      const text = response.output?.message?.content?.[0]?.text || 'No response generated';

      // Start with basic usage data from API if available
      let enhancedUsage = null;

      if (response.usage) {
        // API provided usage data - use as exact values
        console.log('BedrockService: Using API-provided usage data:', response.usage);
        enhancedUsage = {
          input_tokens: response.usage.inputTokens,
          output_tokens: response.usage.outputTokens,
          tool_tokens: response.usage.toolTokens || 0,
          total_tokens: response.usage.totalTokens,
          tokens_source: 'api',
          estimation_method: null
        };
      } else if (modelId && tokenEstimationService.isReady()) {
        // API didn't provide usage data - estimate tokens
        console.log('BedrockService: Attempting token estimation for model:', modelId);
        try {
          const inputEstimation = tokenEstimationService.estimateInputTokens(
            systemPrompt, userPrompt, content, modelId
          );
          const outputEstimation = tokenEstimationService.estimateOutputTokens(text, modelId);

          enhancedUsage = {
            input_tokens: inputEstimation.tokens || 0,
            output_tokens: outputEstimation.tokens || 0,
            tool_tokens: 0, // Tool tokens not estimated separately for now
            total_tokens: (inputEstimation.tokens || 0) + (outputEstimation.tokens || 0),
            tokens_source: 'estimated',
            estimation_method: inputEstimation.method || 'unknown'
          };

          // Add estimation metadata
          if (inputEstimation.error || outputEstimation.error) {
            enhancedUsage.estimation_error = inputEstimation.error || outputEstimation.error;
          }

          if (inputEstimation.fallbackStrategy || outputEstimation.fallbackStrategy) {
            enhancedUsage.fallback_strategy = inputEstimation.fallbackStrategy || outputEstimation.fallbackStrategy;
          }

          if (inputEstimation.confidence || outputEstimation.confidence) {
            enhancedUsage.confidence = inputEstimation.confidence || outputEstimation.confidence;
          }
        } catch (estimationError) {
          console.warn('Token estimation failed:', estimationError.message);

          // Create fallback usage data with error handling
          enhancedUsage = createFallbackUsageData({}, {
            tokens: null,
            error: estimationError.message,
            method: 'error-fallback',
            fallbackStrategy: 'graceful_degradation'
          });
        }
      } else {
        // No API usage data and token estimation not available
        console.log('BedrockService: No usage data from API and token estimation not ready', {
          modelId,
          tokenEstimationReady: tokenEstimationService.isReady()
        });
        enhancedUsage = {
          input_tokens: null,
          output_tokens: null,
          tool_tokens: null,
          total_tokens: null,
          tokens_source: 'unavailable',
          estimation_method: null
        };
      }

      // Add cost calculation if enabled and we have token data
      // Performance optimization: skip cost calculations entirely if disabled
      if (enhancedUsage && this.shouldCalculateCosts()) {
        try {
          if (costCalculationService.isReady() && modelId) {
            const costData = costCalculationService.calculateCost(enhancedUsage, modelId);

            if (costData && !costData.error) {
              enhancedUsage.cost = {
                input_cost: costData.inputCost,
                output_cost: costData.outputCost,
                tool_cost: costData.toolCost,
                total_cost: costData.totalCost,
                currency: costData.currency,
                pricing_date: costData.pricingDate,
                is_estimated: costData.isEstimated,
                provider: costData.provider,
                region: costData.region
              };

              // Add cost metadata for error states
              if (costData.show_cost_unavailable) {
                enhancedUsage.cost.show_cost_unavailable = true;
              }

              if (costData.show_stale_data_warning) {
                enhancedUsage.cost.show_stale_data_warning = true;
              }

              if (costData.fallbackStrategy) {
                enhancedUsage.cost.fallback_strategy = costData.fallbackStrategy;
              }
            } else {
              // Create fallback cost data with error information
              enhancedUsage.cost = createFallbackCostData({}, {
                error: costData?.error || 'Cost calculation failed',
                fallbackStrategy: 'disable_cost_display',
                showCostUnavailable: true
              });
            }
          } else {
            // Service not ready - create fallback cost data
            enhancedUsage.cost = createFallbackCostData({}, {
              error: 'Cost calculation service not available',
              fallbackStrategy: 'disable_cost_display',
              showCostUnavailable: true
            });
          }
        } catch (costError) {
          console.warn('Cost calculation failed:', costError.message);

          // Create fallback cost data for calculation errors
          enhancedUsage.cost = createFallbackCostData({}, {
            error: costError.message,
            fallbackStrategy: 'graceful_degradation',
            showCostUnavailable: true
          });
        }
      }

      console.log('BedrockService: Returning parsed response with usage:', enhancedUsage);
      return {
        text: text,
        usage: enhancedUsage
      };
    } catch (error) {
      // Enhanced error handling for response parsing
      const errorInfo = analyzeError(error, {
        component: 'BedrockService',
        action: 'parseConverseResponse',
        modelId,
        hasResponse: !!response
      });

      // Create minimal fallback response
      const fallbackUsage = createFallbackUsageData({}, {
        tokens: null,
        error: 'Response parsing failed',
        method: 'parse-error-fallback',
        fallbackStrategy: 'graceful_degradation'
      });

      console.error('Failed to parse Converse API response:', errorInfo.userMessage);

      return {
        text: text || 'Response parsing failed',
        usage: fallbackUsage,
        parseError: errorInfo.userMessage
      };
    }
  }

  /**
   * Check if cost calculations should be performed based on user settings
   * @returns {boolean} True if costs should be calculated
   * @private
   */
  shouldCalculateCosts() {
    try {
      // Skip cost calculations if settings service is not ready
      if (!settingsService.isInitialized) {
        return false;
      }

      const costSettings = settingsService.getSection('cost');
      return costSettings?.showCostEstimates === true;
    } catch (error) {
      console.warn('Failed to check cost settings:', error.message);
      return false;
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
      pauseOnNetworkError = false, // Whether to pause on network errors
      toolConfig = null // Tool configuration for tool use
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
      toolConfig,
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
            const response = await this.invokeModel(modelId, systemPrompt, userPrompt, content, toolConfig);

            // Reset consecutive network error count on success
            consecutiveNetworkErrors = 0;

            // Add metadata to response including tool usage information
            const enrichedResponse = {
              ...response,
              requestIndex,
              requestConfig,
              timestamp: Date.now(),
              attempt: attempt + 1,
              // Ensure tool usage data is preserved for determinism evaluation
              toolUsage: response.toolUsage || {
                hasToolUsage: false,
                toolCalls: [],
                toolCallCount: 0,
                availableTools: toolConfig ? toolConfig.tools.map(tool => tool.toolSpec.name) : []
              }
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
                networkErrors: networkErrorCount,
                toolUsageDetected: enrichedResponse.toolUsage.hasToolUsage
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
   * Get the current initialization status including supporting services
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      credentialsValid: this.credentialsValid,
      ready: this.isReady(),
      supportingServices: {
        tokenEstimation: {
          ready: tokenEstimationService.isReady(),
          status: tokenEstimationService.getStatus()
        },
        costCalculation: {
          ready: costCalculationService.isReady(),
          status: costCalculationService.getStatus()
        },
        settings: {
          initialized: settingsService.isInitialized,
          costDisplayEnabled: this.shouldCalculateCosts()
        }
      }
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

  /**
   * Execute multiple requests for determinism evaluation with enhanced throttling management
   *
   * ENHANCEMENTS FOR DETERMINISM EVALUATION:
   * - Configurable test counts from user settings
   * - Conservative execution strategy (single request at a time, 2s delays)
   * - Enhanced progress reporting with current phase and throttling status
   * - Comprehensive throttling management with exponential backoff (5s, 10s, 20s)
   * - Throttling abandonment after 3 consecutive attempts per request
   * - Separate tracking of throttled responses (excluded from analysis but preserved for display)
   * - Full response object preservation including tool usage data
   * - Visual feedback for throttling events with retry countdown
   *
   * @param {string} modelId - The model ID to invoke
   * @param {string} systemPrompt - The system prompt
   * @param {string} userPrompt - The user prompt
   * @param {string} content - Additional content/context
   * @param {number} requestCount - Number of additional requests to make (configurable from settings)
   * @param {Object} options - Execution options including settings, throttling callbacks
   * @returns {Promise<Object>} Batch execution results with full response objects and tool usage data
   */
  async executeBatchRequests(modelId, systemPrompt, userPrompt, content, requestCount, options = {}) {
    const {
      concurrency = 1, // Conservative: single request at a time
      retryAttempts = 3, // Configurable from settings
      retryDelay = 5000, // Start with 5s delay
      maxRetryDelay = 20000, // Cap at 20s for exponential backoff (5s, 10s, 20s)
      requestDelay = 2000, // 2s delay between requests
      onProgress = null,
      onError = null,
      onThrottling = null, // New: throttling status callback
      toolConfig = null,
      settings = null // Determinism settings from user preferences
    } = options;

    // Apply settings if provided
    const effectiveRetryAttempts = settings?.maxRetryAttempts || retryAttempts;
    const effectiveRequestCount = requestCount; // Already configured from settings

    const results = {
      responses: [],
      errors: [],
      throttledResponses: [], // Track throttled requests separately
      completed: 0,
      failed: 0,
      throttled: 0,
      totalRequests: effectiveRequestCount,
      currentPhase: 'collecting', // 'collecting' or 'evaluating'
      throttlingStatus: {
        isThrottling: false,
        throttleCount: 0,
        consecutiveThrottles: 0,
        lastThrottleTime: null,
        nextRetryTime: null
      },
      toolUsageStats: {
        totalRequestsWithTools: 0,
        totalToolCalls: 0,
        uniqueToolsUsed: new Set(),
        toolUsageDetectionErrors: 0,
        toolUsageDetectionSuccesses: 0
      }
    };

    // Execute requests with conservative strategy (single request at a time)
    for (let i = 0; i < effectiveRequestCount; i += concurrency) {
      const batch = [];
      const batchSize = Math.min(concurrency, effectiveRequestCount - i);

      // Create batch of concurrent requests (typically just 1)
      for (let j = 0; j < batchSize; j++) {
        const requestIndex = i + j;
        batch.push(this.executeRequestWithEnhancedRetry(
          modelId,
          systemPrompt,
          userPrompt,
          content,
          requestIndex,
          {
            retryAttempts: effectiveRetryAttempts,
            retryDelay,
            maxRetryDelay,
            toolConfig,
            onThrottling,
            settings
          },
          onError,
          results
        ));
      }

      // Execute batch and collect results
      const batchResults = await Promise.allSettled(batch);

      for (let j = 0; j < batchResults.length; j++) {
        const requestIndex = i + j;
        const result = batchResults[j];

        if (result.status === 'fulfilled') {
          const response = result.value;

          // Check if this was a throttled response
          if (response.wasThrottled) {
            results.throttledResponses.push(response);
            results.throttled++;

            // Update throttling status
            results.throttlingStatus.throttleCount++;
            results.throttlingStatus.lastThrottleTime = Date.now();

            // Don't include throttled responses in main analysis but preserve for display
            if (onThrottling) {
              onThrottling({
                type: 'throttled_response',
                requestIndex,
                throttleCount: results.throttlingStatus.throttleCount,
                message: 'Request was throttled after maximum retry attempts'
              });
            }
          } else {
            // Ensure tool usage data is properly structured for determinism evaluation
            if (!response.toolUsage) {
              response.toolUsage = {
                hasToolUsage: false,
                toolCalls: [],
                toolCallCount: 0,
                availableTools: toolConfig ? toolConfig.tools.map(tool => tool.toolSpec.name) : [],
                extractionSuccess: true,
                extractionErrors: [],
                extractionWarnings: []
              };
            }

            // Update tool usage statistics for progress reporting
            if (response.toolUsage.hasToolUsage) {
              results.toolUsageStats.totalRequestsWithTools++;
              results.toolUsageStats.totalToolCalls += response.toolUsage.toolCallCount || 0;

              // Track unique tools used across all requests
              if (response.toolUsage.toolCalls) {
                response.toolUsage.toolCalls.forEach(toolCall => {
                  if (toolCall.toolName) {
                    results.toolUsageStats.uniqueToolsUsed.add(toolCall.toolName);
                  }
                });
              }
            }

            // Track tool usage detection success/failure
            if (response.toolUsage.extractionSuccess !== false) {
              results.toolUsageStats.toolUsageDetectionSuccesses++;
            } else {
              results.toolUsageStats.toolUsageDetectionErrors++;
            }

            results.responses.push(response);
          }

          results.completed++;
        } else {
          // Handle failed requests
          const error = result.reason;
          const isThrottlingError = this.isRateLimitError(error);

          if (isThrottlingError) {
            results.throttled++;
            results.throttlingStatus.throttleCount++;
            results.throttlingStatus.lastThrottleTime = Date.now();

            if (onThrottling) {
              onThrottling({
                type: 'throttling_error',
                requestIndex,
                error: error.message,
                throttleCount: results.throttlingStatus.throttleCount,
                message: 'Request failed due to throttling'
              });
            }
          }

          results.errors.push({
            requestIndex,
            error: error,
            isThrottlingError,
            timestamp: new Date().toISOString()
          });
          results.failed++;

          if (onError) {
            onError(error, requestIndex);
          }
        }

        // Report enhanced progress with current phase and throttling status
        if (onProgress) {
          onProgress({
            completed: results.completed,
            failed: results.failed,
            throttled: results.throttled,
            total: effectiveRequestCount,
            progress: (results.completed + results.failed) / effectiveRequestCount,
            currentPhase: results.currentPhase,
            phaseMessage: results.currentPhase === 'collecting'
              ? 'Collecting additional responses...'
              : 'Evaluating determinism...',
            throttlingStatus: {
              ...results.throttlingStatus,
              isThrottling: results.throttlingStatus.throttleCount > 0,
              message: results.throttlingStatus.throttleCount > 0
                ? `Handling rate limits... (${results.throttlingStatus.throttleCount} throttled)`
                : null
            },
            toolUsageStats: {
              ...results.toolUsageStats,
              uniqueToolsUsed: Array.from(results.toolUsageStats.uniqueToolsUsed)
            },
            toolUsageDetectionRate: results.completed > 0
              ? (results.toolUsageStats.toolUsageDetectionSuccesses / results.completed) * 100
              : 0
          });
        }
      }

      // Add conservative delay between batches (2s minimum)
      if (i + concurrency < effectiveRequestCount) {
        const delayTime = Math.max(requestDelay, 2000); // Ensure minimum 2s delay
        await new Promise(resolve => setTimeout(resolve, delayTime));
      }
    }

    // Update phase to evaluating (will be used by caller)
    results.currentPhase = 'evaluating';

    // Convert Set to Array for final results
    results.toolUsageStats.uniqueToolsUsed = Array.from(results.toolUsageStats.uniqueToolsUsed);

    // Add comprehensive summary with throttling information
    results.summary = {
      total: effectiveRequestCount,
      successful: results.responses.length,
      failed: results.failed,
      throttled: results.throttled,
      successRate: results.responses.length > 0 ? (results.responses.length / effectiveRequestCount) * 100 : 0,
      throttleRate: results.throttled > 0 ? (results.throttled / effectiveRequestCount) * 100 : 0,
      analysisReady: results.responses.length >= 3, // Need minimum 3 responses for analysis
      throttlingImpact: results.throttled > 0 ? 'Some requests were throttled and excluded from analysis' : 'No throttling detected'
    };

    return results;
  }

  /**
   * Execute a single request with enhanced retry logic and throttling management
   * @param {string} modelId - The model ID
   * @param {string} systemPrompt - The system prompt
   * @param {string} userPrompt - The user prompt
   * @param {string} content - Additional content
   * @param {number} requestIndex - Request index for logging
   * @param {Object} retryOptions - Retry configuration with throttling support
   * @param {Function} onError - Error callback
   * @param {Object} batchResults - Batch results object for throttling tracking
   * @returns {Promise<Object>} The full response object with tool usage data
   */
  async executeRequestWithEnhancedRetry(modelId, systemPrompt, userPrompt, content, requestIndex, retryOptions, onError, batchResults) {
    const { retryAttempts, retryDelay, maxRetryDelay, toolConfig, onThrottling, settings } = retryOptions;
    let consecutiveThrottles = 0;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const response = await this.invokeModel(modelId, systemPrompt, userPrompt, content, toolConfig);

        // Reset consecutive throttles on success
        consecutiveThrottles = 0;
        batchResults.throttlingStatus.consecutiveThrottles = 0;

        // Ensure response has proper structure for determinism evaluation
        if (!response.toolUsage) {
          response.toolUsage = {
            hasToolUsage: false,
            toolCalls: [],
            toolCallCount: 0,
            availableTools: toolConfig ? toolConfig.tools.map(tool => tool.toolSpec.name) : [],
            extractionSuccess: true,
            extractionErrors: [],
            extractionWarnings: []
          };
        }

        // Add comprehensive metadata for batch processing tracking
        response.batchMetadata = {
          requestIndex,
          attempt,
          timestamp: new Date().toISOString(),
          toolConfigProvided: !!toolConfig,
          toolsAvailable: toolConfig ? toolConfig.tools.length : 0,
          wasThrottled: false,
          throttleAttempts: consecutiveThrottles
        };

        // Return the full response object to preserve all tool usage data for determinism evaluation
        return response;

      } catch (error) {
        const isThrottlingError = this.isRateLimitError(error);
        const isLastAttempt = attempt === retryAttempts;

        if (isThrottlingError) {
          consecutiveThrottles++;
          batchResults.throttlingStatus.consecutiveThrottles = consecutiveThrottles;
          batchResults.throttlingStatus.isThrottling = true;
          batchResults.throttlingStatus.lastThrottleTime = Date.now();

          // Notify about throttling with countdown
          if (onThrottling) {
            const nextRetryDelay = Math.min(retryDelay * Math.pow(2, attempt - 1), maxRetryDelay);
            batchResults.throttlingStatus.nextRetryTime = Date.now() + nextRetryDelay;

            onThrottling({
              type: 'throttling_detected',
              requestIndex,
              attempt,
              nextRetryIn: nextRetryDelay,
              consecutiveThrottles,
              message: `Rate limit hit on request ${requestIndex + 1}, attempt ${attempt}`,
              willRetry: !isLastAttempt
            });
          }

          // Abandon request after 3 consecutive throttling attempts
          if (consecutiveThrottles >= 3) {
            if (onThrottling) {
              onThrottling({
                type: 'throttling_abandoned',
                requestIndex,
                attempt,
                consecutiveThrottles,
                message: `Request ${requestIndex + 1} abandoned after ${consecutiveThrottles} throttling attempts`
              });
            }

            // Return a throttled response marker
            return {
              text: '',
              usage: null,
              toolUsage: {
                hasToolUsage: false,
                toolCalls: [],
                toolCallCount: 0,
                availableTools: toolConfig ? toolConfig.tools.map(tool => tool.toolSpec.name) : []
              },
              wasThrottled: true,
              throttleAttempts: consecutiveThrottles,
              batchMetadata: {
                requestIndex,
                attempt,
                timestamp: new Date().toISOString(),
                toolConfigProvided: !!toolConfig,
                toolsAvailable: toolConfig ? toolConfig.tools.length : 0,
                wasThrottled: true,
                throttleAttempts: consecutiveThrottles,
                abandonedDueToThrottling: true
              }
            };
          }
        }

        if (isLastAttempt) {
          throw error;
        }

        // Calculate delay with exponential backoff (5s, 10s, 20s)
        const delay = Math.min(retryDelay * Math.pow(2, attempt - 1), maxRetryDelay);

        if (onError) {
          onError(error, requestIndex, attempt);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Execute a single request with retry logic (legacy method for compatibility)
   * @param {string} modelId - The model ID
   * @param {string} systemPrompt - The system prompt
   * @param {string} userPrompt - The user prompt
   * @param {string} content - Additional content
   * @param {number} requestIndex - Request index for logging
   * @param {Object} retryOptions - Retry configuration
   * @param {Function} onError - Error callback
   * @returns {Promise<Object>} The full response object with tool usage data
   */
  async executeRequestWithRetry(modelId, systemPrompt, userPrompt, content, requestIndex, retryOptions, onError) {
    const { retryAttempts, retryDelay, maxRetryDelay, toolConfig } = retryOptions;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const response = await this.invokeModel(modelId, systemPrompt, userPrompt, content, toolConfig);

        // Ensure response has proper structure for determinism evaluation
        if (!response.toolUsage) {
          response.toolUsage = {
            hasToolUsage: false,
            toolCalls: [],
            toolCallCount: 0,
            availableTools: toolConfig ? toolConfig.tools.map(tool => tool.toolSpec.name) : [],
            extractionSuccess: true,
            extractionErrors: [],
            extractionWarnings: []
          };
        }

        // Add metadata for batch processing tracking
        response.batchMetadata = {
          requestIndex,
          attempt,
          timestamp: new Date().toISOString(),
          toolConfigProvided: !!toolConfig,
          toolsAvailable: toolConfig ? toolConfig.tools.length : 0
        };

        // Return the full response object to preserve all tool usage data for determinism evaluation
        return response;

      } catch (error) {
        const isLastAttempt = attempt === retryAttempts;

        if (isLastAttempt) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(retryDelay * Math.pow(2, attempt - 1), maxRetryDelay);

        if (onError) {
          onError(error, requestIndex, attempt);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

// Export a singleton instance
export const bedrockService = new BedrockService();
