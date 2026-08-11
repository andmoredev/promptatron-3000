/**
 * Service for managing determinism evaluations (main thread only)
 * Simplified version that runs entirely on the main thread with robust throttling management
 */

import { bedrockService } from './bedrockService.js';
import { graderService } from './graderService.js';
import { settingsService } from './settingsService.js';
import { handleError, retryWithBackoff } from '../utils/errorHandling.js';

export class DeterminismService {
  constructor() {
    this.activeEvaluations = new Map();
    this.statusCallbacks = new Map();
    this.throttlingTracker = new Map(); // Track throttling per evaluation
  }

  /**
   * Check if service workers are supported in this browser
   */
  get isSupported() {
    return true; // Always supported since we're using main thread
  }

  /**
   * Get current determinism settings from settings service
   */
  getSettings() {
    if (!settingsService.isInitialized) {
      return {
        testCount: 10,
        enableThrottlingAlerts: true,
        maxRetryAttempts: 3,
        showDetailedProgress: true,
        enabled: true
      };
    }
    return settingsService.getSection('determinism');
  }

  /**
   * Check if an error is a throttling error
   */
  isThrottlingError(error) {
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';

    return message.includes('throttl') ||
           message.includes('rate limit') ||
           message.includes('too many requests') ||
           code.includes('throttl') ||
           name.includes('throttl') ||
           code === 'throttlingexception';
  }

  /**
   * Initialize throttling tracker for an evaluation
   */
  initializeThrottlingTracker(evaluationId) {
    this.throttlingTracker.set(evaluationId, {
      throttledRequests: new Set(),
      throttlingEvents: [],
      totalThrottlingAttempts: 0,
      abandonedRequests: new Set()
    });
  }

  /**
   * Record a throttling event
   */
  recordThrottlingEvent(evaluationId, requestIndex, attempt, error) {
    const tracker = this.throttlingTracker.get(evaluationId);
    if (!tracker) return;

    tracker.throttlingEvents.push({
      requestIndex,
      attempt,
      timestamp: Date.now(),
      error: error.message
    });

    tracker.totalThrottlingAttempts++;
    tracker.throttledRequests.add(requestIndex);

    // Mark as abandoned if max attempts reached
    const settings = this.getSettings();
    if (attempt >= settings.maxRetryAttempts) {
      tracker.abandonedRequests.add(requestIndex);
    }
  }

  /**
   * Get throttling statistics for an evaluation
   */
  getThrottlingStats(evaluationId) {
    const tracker = this.throttlingTracker.get(evaluationId);
    if (!tracker) {
      return {
        throttledCount: 0,
        abandonedCount: 0,
        throttlingEvents: [],
        hasThrottling: false
      };
    }

    return {
      throttledCount: tracker.throttledRequests.size,
      abandonedCount: tracker.abandonedRequests.size,
      throttlingEvents: tracker.throttlingEvents,
      hasThrottling: tracker.throttledRequests.size > 0,
      totalThrottlingAttempts: tracker.totalThrottlingAttempts
    };
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

      // Get current settings
      const settings = this.getSettings();

      // Check if determinism evaluation is enabled
      if (!settings.enabled) {
        throw new Error('Determinism evaluation is disabled in settings');
      }

      // Generate evaluation ID
      const evaluationId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Initialize throttling tracker
      this.initializeThrottlingTracker(evaluationId);

      // Create evaluation state with settings-driven configuration
      const evaluation = {
        id: evaluationId,
        status: 'running',
        progress: 0,
        currentPhase: 'Starting evaluation...',
        completedRequests: 0,
        totalRequests: settings.testCount,
        startTime: Date.now(),
        config: testConfig,
        responses: [],
        settings: { ...settings } // Store settings snapshot
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
   * Execute the evaluation process with enhanced throttling management
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

      const settings = evaluation.settings;

      // Phase 1: Initialize
      this.updateEvaluationStatus(evaluationId, {
        currentPhase: 'Preparing evaluation...',
        progress: 5
      });

      // Phase 2: Execute additional requests with enhanced throttling management
      this.updateEvaluationStatus(evaluationId, {
        currentPhase: 'Collecting additional responses...',
        progress: 10
      });

      // Add original response (ensure it has the proper structure for tool usage evaluation)
      const originalResponse = typeof testConfig.originalResponse === 'string'
        ? {
            text: testConfig.originalResponse,
            toolUsage: { hasToolUsage: false, toolCalls: [] },
            wasThrottled: false,
            retryCount: 0,
            timestamp: new Date().toISOString()
          }
        : {
            ...testConfig.originalResponse,
            wasThrottled: false,
            retryCount: 0,
            timestamp: new Date().toISOString()
          };

      evaluation.responses.push(originalResponse);
      evaluation.completedRequests = 1;

      // Calculate additional requests needed (total - 1 for original)
      const additionalRequests = settings.testCount - 1;

      // Execute requests with enhanced throttling management
      const batchResult = await this.executeBatchRequestsWithThrottling(
        evaluationId,
        testConfig,
        additionalRequests,
        settings
      );

      // Add successful responses (preserve full response objects for tool usage evaluation)
      console.log('Batch result:', batchResult);
      if (batchResult.responses) {
        batchResult.responses.forEach(response => {
          if (response && !response.wasAbandoned) {
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

      // Get throttling statistics
      const throttlingStats = this.getThrottlingStats(evaluationId);

      console.log('Total responses collected:', evaluation.responses.length);
      console.log('Throttling statistics:', throttlingStats);

      // Phase 3: Grade responses including tool usage evaluation (exclude throttled responses)
      this.updateEvaluationStatus(evaluationId, {
        currentPhase: 'Analyzing response consistency...',
        progress: 85
      });

      // Filter out throttled/abandoned responses for grading
      const responsesForGrading = evaluation.responses.filter(response => !response.wasAbandoned);

      console.log('Starting grading for evaluation:', evaluationId, 'with', responsesForGrading.length, 'responses (excluding', throttlingStats.abandonedCount, 'abandoned)');

      // Pass filtered response objects to grader for tool usage evaluation with graceful degradation
      const gradeResult = await graderService.gradeResponsesWithGracefulDegradation(
        responsesForGrading,
        testConfig,
        testConfig.customGraderPrompt,
        {
          allowPartialAnalysis: true,
          minResponsesForGrading: 2, // Allow analysis with as few as 2 responses
          preferFallbackForSmallSets: responsesForGrading.length <= 3 // Use fallback for very small sets
        }
      );
      console.log('Grading completed for evaluation:', evaluationId, gradeResult);

      // Phase 4: Complete with comprehensive results
      this.updateEvaluationStatus(evaluationId, {
        status: 'completed',
        currentPhase: 'Evaluation complete',
        progress: 100,
        result: {
          ...gradeResult,
          throttlingStats,
          allResponses: evaluation.responses, // Include all responses for display
          responsesUsedForGrading: responsesForGrading, // Responses actually used for analysis
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
          } : null,
          evaluationSettings: settings
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
   * Execute batch requests with enhanced throttling management
   */
  async executeBatchRequestsWithThrottling(evaluationId, testConfig, requestCount, settings) {
    const results = {
      responses: [],
      errors: [],
      completed: 0,
      failed: 0,
      totalRequests: requestCount,
      throttledCount: 0,
      abandonedCount: 0,
      toolUsageStats: {
        totalRequestsWithTools: 0,
        totalToolCalls: 0,
        uniqueToolsUsed: new Set(),
eDetectionErrors: 0,
        toolUsageDetectionSuccesses: 0
      }
    };

    // Execute requests one at a time with conservative approach
    for (let i = 0; i < requestCount; i++) {
      const requestIndex = i + 1; // 1-based for display

      try {
        // Check if evaluation was cancelled
        const evaluation = this.activeEvaluations.get(evaluationId);
        if (!evaluation || evaluation.status === 'cancelled') {
          console.log('Evaluation cancelled, stopping batch execution');
          break;
        }

        // Execute single request with retry and throttling management
        const response = await this.executeRequestWithThrottling(
          evaluationId,
          testConfig,
          requestIndex,
          settings
        );

        if (response.wasAbandoned) {
          // Request was abandoned due to persistent throttling
          results.abandonedCount++;
          results.failed++;

          // Still add to responses for display purposes (marked as abandoned)
          results.responses.push(response);

          // Update progress with throttling indication
          const completedRequests = results.completed + results.failed + 1;
          this.updateEvaluationStatus(evaluationId, {
            completedRequests: completedRequests,
            progress: 10 + (completedRequests / requestCount * 70),
            currentPhase: `Collecting responses... (${results.abandonedCount} throttled)`,
            throttlingVisible: results.abandonedCount > 0
          });

        } else {
          // Successful response
          results.responses.push(response);
          results.completed++;

          // Update tool usage statistics
          if (response.toolUsage && response.toolUsage.hasToolUsage) {
            results.toolUsageStats.totalRequestsWithTools++;
            results.toolUsageStats.totalToolCalls += response.toolUsage.toolCallCount || 0;

            if (response.toolUsage.toolCalls) {
              response.toolUsage.toolCalls.forEach(toolCall => {
                if (toolCall.toolName) {
                  results.toolUsageStats.uniqueToolsUsed.add(toolCall.toolName);
                }
              });
            }
          }

          // Track tool usage detection success/failure
          if (response.toolUsage && response.toolUsage.extractionSuccess !== false) {
            results.toolUsageStats.toolUsageDetectionSuccesses++;
          } else {
            results.toolUsageStats.toolUsageDetectionErrors++;
          }

          // Update progress
          const phaseMessage = results.toolUsageStats.totalRequestsWithTools > 0
            ? `Collecting responses... (${results.toolUsageStats.totalRequestsWithTools} with tool usage)`
            : results.abandonedCount > 0
              ? `Collecting responses... (${results.abandonedCount} throttled)`
              : 'Collecting additional responses...';

          const completedRequests = results.completed + results.failed + 1;
          this.updateEvaluationStatus(evaluationId, {
            completedRequests: completedRequests,
            progress: 10 + (completedRequests / requestCount * 70),
            currentPhase: phaseMessage,
            toolUsageProgress: {
              detectionRate: results.completed > 0
                ? (results.toolUsageStats.toolUsageDetectionSuccesses / results.completed) * 100
                : 0,
              requestsWithTools: results.toolUsageStats.totalRequestsWithTools,
              totalToolCalls: results.toolUsageStats.totalToolCalls,
              uniqueToolsUsed: Array.from(results.toolUsageStats.uniqueToolsUsed)
            },
            throttlingVisible: results.abandonedCount > 0
          });
        }

        // Add delay between requests (conservative approach: 2 seconds)
        if (i < requestCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`Request ${requestIndex} failed completely:`, error);
        results.errors.push({
          requestIndex,
          error: error.message
        });
        results.failed++;

        // Update progress
        const completedRequests = results.completed + results.failed + 1;
        this.updateEvaluationStatus(evaluationId, {
          completedRequests: completedRequests,
          progress: 10 + (completedRequests / requestCount * 70),
          currentPhase: `Collecting responses... (${results.failed} failed)`
        });
      }
    }

    // Convert Set to Array for final results
    results.toolUsageStats.uniqueToolsUsed = Array.from(results.toolUsageStats.uniqueToolsUsed);
    results.throttledCount = this.getThrottlingStats(evaluationId).throttledCount;

    return results;
  }

  /**
   * Execute a single request with throttling management and retry logic
   */
  async executeRequestWithThrottling(evaluationId, testConfig, requestIndex, settings) {
    const maxRetries = settings.maxRetryAttempts;
    const baseDelays = [5000, 10000, 20000]; // 5s, 10s, 20s as specified in requirements

    let lastError = null;
    let retryCount = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if evaluation was cancelled
        const evaluation = this.activeEvaluations.get(evaluationId);
        if (!evaluation || evaluation.status === 'cancelled') {
          throw new Error('Evaluation was cancelled');
        }

        // Show throttling status if this is a retry
        if (attempt > 1 && settings.enableThrottlingAlerts) {
          this.updateEvaluationStatus(evaluationId, {
            currentPhase: `Handling rate limits... (attempt ${attempt}/${maxRetries})`,
            throttlingInfo: {
              currentAttempt: attempt,
              maxAttempts: maxRetries,
              requestIndex,
              nextRetryIn: null
            }
          });
        }

        // Execute the request with timeout
        const requestPromise = bedrockService.invokeModel(
          testConfig.modelId,
          testConfig.systemPrompt,
          testConfig.userPrompt,
          testConfig.content,
          testConfig.toolConfig
        );

        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 60000); // 60 second timeout
        });

        const response = await Promise.race([requestPromise, timeoutPromise]);

        // Successful response - add metadata
        return {
          ...response,
          wasThrottled: attempt > 1,
          retryCount: attempt - 1,
          timestamp: new Date().toISOString(),
          requestIndex,
          wasAbandoned: false
        };

      } catch (error) {
        lastError = error;
        retryCount = attempt - 1;

        // Handle different error types
        if (error.message === 'Evaluation was cancelled') {
          throw error; // Don't retry cancelled evaluations
        }

        // Check if this is a throttling error
        if (this.isThrottlingError(error)) {
          // Record throttling event
          this.recordThrottlingEvent(evaluationId, requestIndex, attempt, error);

          // If this is the last attempt, abandon the request
          if (attempt === maxRetries) {
            console.warn(`Request ${requestIndex} abandoned after ${maxRetries} throttling attempts`);

            return {
              text: '',
              toolUsage: {
                hasToolUsage: false,
                toolCalls: [],
                toolCallCount: 0,
                availableTools: testConfig.toolConfig ? testConfig.toolConfig.tools.map(tool => tool.toolSpec.name) : []
              },
              wasThrottled: true,
              retryCount: maxRetries,
              timestamp: new Date().toISOString(),
              requestIndex,
              wasAbandoned: true,
              abandonReason: 'persistent_throttling',
              lastError: error.message
            };
          }

          // Calculate delay with exponential backoff (5s, 10s, 20s)
          const delayIndex = Math.min(attempt - 1, baseDelays.length - 1);
          const delay = baseDelays[delayIndex];

          console.log(`Request ${requestIndex} throttled (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`);

          // Show countdown if throttling alerts are enabled
          if (settings.enableThrottlingAlerts) {
            // Show countdown
            for (let countdown = Math.ceil(delay / 1000); countdown > 0; countdown--) {
              this.updateEvaluationStatus(evaluationId, {
                currentPhase: `Rate limited, retrying in ${countdown}s... (${attempt}/${maxRetries})`,
                throttlingInfo: {
                  currentAttempt: attempt,
                  maxAttempts: maxRetries,
                  requestIndex,
                  nextRetryIn: countdown * 1000
                }
              });

              // Check for cancellation during countdown
              const currentEvaluation = this.activeEvaluations.get(evaluationId);
              if (!currentEvaluation || currentEvaluation.status === 'cancelled') {
                throw new Error('Evaluation was cancelled');
              }

              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } else {
            // Wait without countdown
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } else if (error.message === 'Request timeout') {
          // Handle timeout errors
          if (attempt === maxRetries) {
            return {
              text: '',
              toolUsage: {
                hasToolUsage: false,
                toolCalls: [],
                toolCallCount: 0,
                availableTools: testConfig.toolConfig ? testConfig.toolConfig.tools.map(tool => tool.toolSpec.name) : []
              },
              wasThrottled: false,
              retryCount: maxRetries,
              timestamp: new Date().toISOString(),
              requestIndex,
              wasAbandoned: true,
              abandonReason: 'timeout',
              lastError: error.message
            };
          }

          // Retry timeout errors with increasing delay
          const delay = 5000 * attempt;
          console.log(`Request ${requestIndex} timed out (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));

        } else {
          // Non-retryable error - fail immediately
          console.error(`Request ${requestIndex} failed with non-retryable error:`, error);
          throw error;
        }
      }
    }

    // This should not be reached, but handle it gracefully
    throw lastError || new Error(`Request ${requestIndex} failed after ${maxRetries} attempts`);
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
   * Get evaluation status with throttling information
   */
  async getEvaluationStatus(evaluationId) {
    const evaluation = this.activeEvaluations.get(evaluationId);
    if (!evaluation) {
      return null;
    }

    // Add throttling statistics to status
    const throttlingStats = this.getThrottlingStats(evaluationId);

    return {
      ...evaluation,
      throttlingStats
    };
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

      // Clean up throttling tracker
      this.throttlingTracker.delete(evaluationId);
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
   * Complete evaluation with partial data
   */
  async completeWithPartialData(evaluationId, reason = 'user_requested') {
    try {
      const evaluation = this.activeEvaluations.get(evaluationId);
      if (!evaluation) {
        throw new Error('Evaluation not found');
      }

      // Import the assessment function
      const { assessPartialDataSufficiency } = await import('../utils/determinismErrorHandling.js');

      // Check if we have sufficient data
      const sufficiency = assessPartialDataSufficiency(evaluation.responses, evaluation.totalRequests);

      if (!sufficiency.isSufficient) {
        throw new Error(`Insufficient data for analysis: ${sufficiency.recommendations[0]}`);
      }

      // Update status to show we're completing with partial data
      this.updateEvaluationStatus(evaluationId, {
        currentPhase: `Completing analysis with ${evaluation.responses.length} responses...`,
        progress: 85
      });

      // Get throttling statistics
      const throttlingStats = this.getThrottlingStats(evaluationId);

      // Filter out throttled/abandoned responses for grading
      const responsesForGrading = evaluation.responses.filter(response => !response.wasAbandoned);

      console.log('Completing partial evaluation:', evaluationId, 'with', responsesForGrading.length, 'responses');

      // Grade the available responses with graceful degradation
      const graderService = (await import('./graderService.js')).graderService;
      const gradeResult = await graderService.gradeResponsesWithGracefulDegradation(
        responsesForGrading,
        evaluation.config,
        evaluation.config.customGraderPrompt,
        {
          allowPartialAnalysis: true,
          minResponsesForGrading: 1, // Allow analysis with even 1 response for partial completion
          preferFallbackForSmallSets: true // Always prefer statistical analysis for partial data
        }
      );

      // Complete with partial results
      this.updateEvaluationStatus(evaluationId, {
        status: 'completed',
        currentPhase: `Completed with partial data (${evaluation.responses.length} responses)`,
        progress: 100,
        result: {
          ...gradeResult,
          isPartialResult: true,
          partialReason: reason,
          dataQuality: sufficiency.quality,
          confidence: sufficiency.confidence,
          throttlingStats,
          allResponses: evaluation.responses,
          responsesUsedForGrading: responsesForGrading,
          evaluationSettings: evaluation.settings,
          completionNote: `Analysis completed with ${evaluation.responses.length} out of ${evaluation.totalRequests} planned responses.`
        },
        endTime: Date.now()
      });

      return true;
    } catch (error) {
      console.error('Failed to complete with partial data:', error);
      this.updateEvaluationStatus(evaluationId, {
        status: 'error',
        currentPhase: 'Failed to complete partial analysis',
        error: error.message
      });
      return false;
    }
  }

  /**
   * Retry evaluation with modified settings
   */
  async retryWithModifiedSettings(evaluationId, newSettings) {
    try {
      const evaluation = this.activeEvaluations.get(evaluationId);
      if (!evaluation) {
        throw new Error('Evaluation not found');
      }

      // Cancel current evaluation
      await this.cancelEvaluation(evaluationId);

      // Start new evaluation with modified settings
      const modifiedConfig = {
        ...evaluation.config,
        testCount: newSettings.testCount || evaluation.config.testCount,
        maxRetryAttempts: newSettings.maxRetryAttempts || evaluation.config.maxRetryAttempts,
        enableThrottlingAlerts: newSettings.enableThrottlingAlerts !== undefined
          ? newSettings.enableThrottlingAlerts
          : evaluation.config.enableThrottlingAlerts
      };

      return await this.startEvaluation(modifiedConfig);
    } catch (error) {
      console.error('Failed to retry with modified settings:', error);
      throw error;
    }
  }

  /**
   * Get recovery options for a failed evaluation
   */
  getRecoveryOptions(evaluationId) {
    const evaluation = this.activeEvaluations.get(evaluationId);
    if (!evaluation) {
      return [];
    }

    const options = [];
    const completedRequests = evaluation.completedRequests || 0;
    const hasPartialData = completedRequests > 0;

    // Always offer retry
    options.push({
      action: 'retry',
      label: 'Retry evaluation',
      description: 'Start the evaluation again from the beginning',
      priority: 'medium'
    });

    // Offer partial completion if we have data
    if (hasPartialData && completedRequests >= 3) {
      options.push({
        action: 'complete_partial',
        label: `Complete with ${completedRequests} responses`,
        description: 'Analyze the responses collected so far',
        priority: 'high'
      });
    }

    // Offer settings modification
    options.push({
      action: 'modify_settings',
      label: 'Retry with different settings',
      description: 'Adjust test count, retry attempts, or other settings',
      priority: 'medium'
    });

    // Offer export if we have data
    if (hasPartialData) {
      options.push({
        action: 'export_data',
        label: 'Export collected responses',
        description: 'Download responses for manual analysis',
        priority: 'low'
      });
    }

    return options;
  }

  /**
   * Export evaluation data for manual analysis
   */
  exportEvaluationData(evaluationId) {
    const evaluation = this.activeEvaluations.get(evaluationId);
    if (!evaluation) {
      throw new Error('Evaluation not found');
    }

    const exportData = {
      evaluationId,
      timestamp: new Date().toISOString(),
      config: evaluation.config,
      settings: evaluation.settings,
      status: evaluation.status,
      progress: evaluation.progress,
      completedRequests: evaluation.completedRequests,
      totalRequests: evaluation.totalRequests,
      responses: evaluation.responses,
      throttlingStats: this.getThrottlingStats(evaluationId),
      startTime: evaluation.startTime,
      endTime: evaluation.endTime
    };

    // Create and download file
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `determinism-evaluation-${evaluationId}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    return exportData;
  }

  /**
   * Check if evaluation can be recovered
   */
  canRecover(evaluationId) {
    const evaluation = this.activeEvaluations.get(evaluationId);
    if (!evaluation) {
      return false;
    }

    // Can recover if we have some completed requests or if it's a retryable error
    return evaluation.completedRequests > 0 || evaluation.status !== 'cancelled';
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.activeEvaluations.clear();
    this.statusCallbacks.clear();
    this.throttlingTracker.clear();
  }
}

// Export singleton instance
export const determinismService = new DeterminismService();
