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

      // Add original response
      evaluation.responses.push(testConfig.originalResponse);
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
          onProgress: (progress) => {
            this.updateEvaluationStatus(evaluationId, {
              completedRequests: progress.completed + 1,
              progress: 10 + (progress.progress * 0.7),
              currentPhase: 'Collecting additional responses...'
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

      // Add successful responses
      console.log('Batch result:', batchResult);
      if (batchResult.responses) {
        batchResult.responses.forEach(response => {
          if (response && response.text) {
            evaluation.responses.push(response.text);
          }
        });
      }
      console.log('Total responses collected:', evaluation.responses.length);

      // Phase 3: Grade responses
      this.updateEvaluationStatus(evaluationId, {
        currentPhase: 'Analyzing response consistency...',
        progress: 85
      });

      console.log('Starting grading for evaluation:', evaluationId, 'with', evaluation.responses.length, 'responses');
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
        result: gradeResult,
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
