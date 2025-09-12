/**
 * Service for managing determinism evaluations (main thread only)
 * Simplified version that runs entirely on the main thread
 */

import { bedrockService } from './bedrockService.js';
import { graderService } from './graderService.js';
import { handleError } from '../utils/errorHandling.js';

export class DeterminismService {
  constructor() {
    this.activeEvaluations = new Map();
    this.statusCallbacks = new Map();
  }

  /**
   * Check if service workers are supported in this browser
   */
  get isSupported() {
    return true; // Always supported since we're using main thread
  }

  /**
   * Start a new determinism evaluation (main thread only)
   */
  async startEvaluation(testConfig) {
    try {
      // Check if we have network connectivity
      if (!navigator.onLine) {
        throw new Error('No network connection available. Please check your internet connection and try again.');
      }

      // Generate evaluation ID
      const evaluationId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create evaluation state
      const evaluation = {
        id: evaluationId,
        status: 'running',
        progress: 0,
        currentPhase: 'Starting evaluation...',
        completedRequests: 0,
        totalRequests: 10,
        startTime: Date.now(),
        config: testConfig,
        responses: []
      };

      this.activeEvaluations.set(evaluationId, evaluation);

      // Start the evaluation process asynchronously
      this.executeEvaluation(evaluationId, testConfig).catch(error => {
        console.error('Evaluation failed:', error);
        this.updateEvaluationStatus(evaluationId, {
          status: 'error',
          currentPhase: 'Evaluation failed',
          error: error.message
        });
      });

      return evaluationId;

    } catch (error) {
      console.error('Determinism evaluation failed:', error);

      const errorInfo = handleError(error, {
        component: 'DeterminismService',
        operation: 'startEvaluation',
        testConfig: {
          modelId: testConfig.modelId,
          hasSystemPrompt: !!testConfig.systemPrompt,
          hasUserPrompt: !!testConfig.userPrompt
        }
      });

      throw new Error(errorInfo.userMessage);
    }
  }

  /**
   * Execute the evaluation process
   */
  async executeEvaluation(evaluationId, testConfig) {
    try {

      const evaluation = this.activeEvaluations.get(evaluationId);
      if (!evaluation) {
        console.error('Evaluation not found:', evaluationId);
        return;
      }

      // Prevent duplicate execution
      if (evaluation.status === 'completed' || evaluation.status === 'error') {
        console.log('Evaluation already completed:', evaluationId, evaluation.status);
        return;
      }

      // Phase 1: Initialize
      this.updateEvaluationStatus(evaluationId, {
        currentPhase: 'Preparing evaluation...',
        progress: 5
      });

      // Phase 2: Execute additional requests
      this.updateEvaluationStatus(evaluationId, {
        currentPhase: 'Collecting additional responses...',
        progress: 10
      });

      // Add original response (ensure it has the proper structure for tool usage evaluation)
      const originalResponse = typeof testConfig.originalResponse === 'string'
        ? { text: testConfig.originalResponse, toolUsage: { hasToolUsage: false, toolCalls: [] } }
        : testConfig.originalResponse;

      evaluation.responses.push(originalResponse);
      evaluation.completedRequests = 1;

      // Execute batch requests with very conservative settings
      const batchResult = await bedrockService.executeBatchRequests(
        testConfig.modelId,
        testConfig.systemPrompt,
        testConfig.userPrompt,
        testConfig.content,
        9,
        {
          concurrency: 1, // Single request at a time
          retryAttempts: 3,
          retryDelay: 5000,
          maxRetryDelay: 600000,
          requestDelay: 2000,
          toolConfig: testConfig.toolConfig,
          onProgress: (progress) => {
            // Enhanced progress reporting with tool use detection status
            const phaseMessage = progress.toolUsageStats && progress.toolUsageStats.totalRequestsWithTools > 0
              ? `Collecting responses... (${progress.toolUsageStats.totalRequestsWithTools} with tool usage)`
              : 'Collecting additional responses...';

            this.updateEvaluationStatus(evaluationId, {
              completedRequests: progress.completed + 1,
              progress: 10 + (progress.progress * 0.7),
              currentPhase: phaseMessage,
              toolUsageProgress: {
                detectionRate: progress.toolUsageDetectionRate || 0,
                requestsWithTools: progress.toolUsageStats?.totalRequestsWithTools || 0,
                totalToolCalls: progress.toolUsageStats?.totalToolCalls || 0,
                uniqueToolsUsed: progress.toolUsageStats?.uniqueToolsUsed || []
              }
            });
          },
          onError: (error, requestIndex) => {
            console.log(`Determinism evaluation request ${requestIndex + 1} failed:`, error.message);
            this.updateEvaluationStatus(evaluationId, {
              currentPhase: 'Handling rate limits...'
            });
          }
        }
      );

      // Add successful responses (preserve full response objects for tool usage evaluation)
      console.log('Batch result:', batchResult);
      if (batchResult.responses) {
        batchResult.responses.forEach(response => {
          if (response) {
            // Ensure tool usage data is properly structured for determinism evaluation
            if (!response.toolUsage) {
              response.toolUsage = {
                hasToolUsage: false,
                toolCalls: [],
                toolCallCount: 0,
                availableTools: testConfig.toolConfig ? testConfig.toolConfig.tools.map(tool => tool.toolSpec.name) : []
              };
            }

            // Store the full response object to preserve tool usage data
            evaluation.responses.push(response);
          }
        });
      }

      // Log tool usage statistics from batch processing
      if (batchResult.toolUsageStats) {
        console.log('Tool usage statistics:', {
          requestsWithTools: batchResult.toolUsageStats.totalRequestsWithTools,
          totalToolCalls: batchResult.toolUsageStats.totalToolCalls,
          uniqueToolsUsed: batchResult.toolUsageStats.uniqueToolsUsed,
          detectionSuccesses: batchResult.toolUsageStats.toolUsageDetectionSuccesses,
          detectionErrors: batchResult.toolUsageStats.toolUsageDetectionErrors
        });
      }

      console.log('Total responses collected:', evaluation.responses.length);

      // Phase 3: Grade responses including tool usage evaluation
      this.updateEvaluationStatus(evaluationId, {
        currentPhase: 'Analyzing response consistency...',
        progress: 85
      });

      console.log('Starting grading for evaluation:', evaluationId, 'with', evaluation.responses.length, 'responses');

      // Pass full response objects to grader for tool usage evaluation
      const gradeResult = await graderService.gradeResponses(
        evaluation.responses,
        testConfig,
        testConfig.customGraderPrompt
      );
      console.log('Grading completed for evaluation:', evaluationId, gradeResult);

      // Phase 4: Complete
      this.updateEvaluationStatus(evaluationId, {
        status: 'completed',
        currentPhase: 'Evaluation complete',
        progress: 100,
        result: {
          ...gradeResult,
          batchProcessingStats: batchResult.toolUsageStats ? {
            totalRequestsProcessed: batchResult.summary?.successful || evaluation.responses.length - 1,
            requestsWithToolUsage: batchResult.toolUsageStats.totalRequestsWithTools,
            totalToolCallsDetected: batchResult.toolUsageStats.totalToolCalls,
            uniqueToolsUsed: batchResult.toolUsageStats.uniqueToolsUsed,
            toolUsageDetectionRate: batchResult.toolUsageStats.toolUsageDetectionSuccesses > 0
              ? (batchResult.toolUsageStats.toolUsageDetectionSuccesses / (batchResult.toolUsageStats.toolUsageDetectionSuccesses + batchResult.toolUsageStats.toolUsageDetectionErrors)) * 100
              : 100,
            toolConfigurationProvided: !!testConfig.toolConfig,
            availableTools: testConfig.toolConfig ? testConfig.toolConfig.tools.map(tool => tool.toolSpec.name) : []
          } : null
        },
        endTime: Date.now()
      });

    } catch (error) {
      console.error('Evaluation execution failed:', error);
      this.updateEvaluationStatus(evaluationId, {
        status: 'error',
        currentPhase: 'Evaluation failed',
        error: error.message
      });
    }
  }

  /**
   * Update evaluation status and notify callbacks
   */
  updateEvaluationStatus(evaluationId, updates) {
    const evaluation = this.activeEvaluations.get(evaluationId);
    if (evaluation) {
      Object.assign(evaluation, updates);

      this.notifyStatusCallbacks(evaluationId, evaluation);
    }
  }

  /**
   * Notify status callbacks
   */
  notifyStatusCallbacks(evaluationId, status) {
    const callbacks = this.statusCallbacks.get(evaluationId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(status);
        } catch (error) {
          console.error('Error in status callback:', error);
        }
      });
    }
  }

  /**
   * Subscribe to status updates for an evaluation
   */
  onStatusUpdate(evaluationId, callback) {
    if (!this.statusCallbacks.has(evaluationId)) {
      this.statusCallbacks.set(evaluationId, []);
    }
    this.statusCallbacks.get(evaluationId).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.statusCallbacks.get(evaluationId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Get evaluation status
   */
  async getEvaluationStatus(evaluationId) {
    return this.activeEvaluations.get(evaluationId) || null;
  }

  /**
   * Cancel evaluation
   */
  async cancelEvaluation(evaluationId) {
    const evaluation = this.activeEvaluations.get(evaluationId);
    if (evaluation) {
      evaluation.status = 'cancelled';
      evaluation.currentPhase = 'Cancelled';
      this.notifyStatusCallbacks(evaluationId, evaluation);
    }
  }

  /**
   * Pause evaluation (not implemented for main thread)
   */
  async pauseEvaluation(evaluationId) {
    // Not implemented for main thread execution
    console.warn('Pause not supported in main thread mode');
  }

  /**
   * Resume evaluation (not implemented for main thread)
   */
  async resumeEvaluation(evaluationId) {
    // Not implemented for main thread execution
    console.warn('Resume not supported in main thread mode');
  }



  /**
   * Clean up resources
   */
  cleanup() {
    this.activeEvaluations.clear();
    this.statusCallbacks.clear();
  }
}

// Export singleton instance
export const determinismService = new DeterminismService();
