/**
 * Service for orchestrating meta-agent execution
 * Follows the established service patterns in the codebase
 */

import { handleError } from '../utils/errorHandling.js';

export class MetaAgentService {
  constructor() {
    this.activeEvaluations = new Map();
    this.statusCallbacks = new Map();
    this.scenarioAgents = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the meta-agent service
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        return {
          success: true,
          message: 'MetaAgentService already initialized'
        };
      }

      this.isInitialized = true;

      return {
        success: true,
        message: 'MetaAgentService initialized successfully'
      };
    } catch (error) {
      console.error('[MetaAgentService] Initialization failed:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Check if service is ready
   * @returns {boolean} True if initialized and ready
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Load meta-agents for a specific scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Map>} Map of loaded meta-agents
   */
  async loadScenarioMetaAgents(scenarioId) {
    try {
      if (this.scenarioAgents.has(scenarioId)) {
        return this.scenarioAgents.get(scenarioId);
      }

      const agents = new Map();
      const scenarioPath = `../scenarios/${scenarioId}/meta-agents`;

      try {
        // Dynamically import meta-agents from scenario folder
        const factChecker = await import(`${scenarioPath}/factChecker.js`);
        agents.set('factChecker', factChecker.default);
      } catch (error) {
        console.warn(`[MetaAgentService] Could not load factChecker for ${scenarioId}:`, error.message);
      }

      try {
        const errorContainment = await import(`${scenarioPath}/errorContainment.js`);
        agents.set('errorContainment', errorContainment.default);
      } catch (error) {
        console.warn(`[MetaAgentService] Could not load errorContainment for ${scenarioId}:`, error.message);
      }

      try {
        const qualityEnforcer = await import(`${scenarioPath}/qualityEnforcer.js`);
        agents.set('qualityEnforcer', qualityEnforcer.default);
      } catch (error) {
        console.warn(`[MetaAgentService] Could not load qualityEnforcer for ${scenarioId}:`, error.message);
      }

      this.scenarioAgents.set(scenarioId, agents);
      return agents;
    } catch (error) {
      console.warn(`[MetaAgentService] Failed to load meta-agents for scenario ${scenarioId}:`, error);
      return new Map(); // Return empty map if meta-agents not found
    }
  }

  /**
   * Start meta-agent evaluation of baseline response
   * @param {Object} baselineResult - The baseline LLM response
   * @param {string} scenarioId - The scenario ID
   * @param {Object} metaAgentConfig - Meta-agent configuration
   * @returns {Promise<string>} Evaluation ID
   */
  async startEvaluation(baselineResult, scenarioId, metaAgentConfig) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Generate evaluation ID
      const evaluationId = `meta_eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Load scenario meta-agents
      const agents = await this.loadScenarioMetaAgents(scenarioId);
      const enabledAgents = this.getEnabledAgents(agents, metaAgentConfig);

      if (enabledAgents.length === 0) {
        throw new Error(`No meta-agents available or enabled for scenario ${scenarioId}`);
      }

      // Create evaluation state
      const evaluation = {
        id: evaluationId,
        status: 'running',
        progress: 0,
        currentPhase: 'Starting meta-agent evaluation...',
        startTime: Date.now(),
        scenarioId,
        baselineResult,
        config: metaAgentConfig,
        agentResults: [],
        completedAgents: 0,
        totalAgents: enabledAgents.length
      };

      this.activeEvaluations.set(evaluationId, evaluation);

      // Set overall evaluation timeout
      const overallTimeout = metaAgentConfig.timeout || 120000; // 2 minutes default
      const clearTimeout = this.setEvaluationTimeout(evaluationId, overallTimeout);
      evaluation.clearTimeout = clearTimeout;

      // Start evaluation process asynchronously
      this.executeEvaluation(evaluationId, baselineResult, enabledAgents)
        .catch(error => {
          console.error('[MetaAgentService] Evaluation failed:', error);
          this.updateEvaluationStatus(evaluationId, {
            status: 'error',
            currentPhase: 'Meta-agent evaluation failed',
            error: error.message,
            endTime: Date.now()
          });
        })
        .finally(() => {
          // Clear timeout when evaluation completes
          if (evaluation.clearTimeout) {
            evaluation.clearTimeout();
          }
        });

      return evaluationId;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'MetaAgentService',
        operation: 'startEvaluation',
        scenarioId,
        baselineResultType: typeof baselineResult
      });

      throw new Error(errorInfo.userMessage);
    }
  }

  /**
   * Execute meta-agent evaluation with enhanced error handling
   * @param {string} evaluationId - The evaluation ID
   * @param {Object} baselineResult - The baseline result to analyze
   * @param {Array} enabledAgents - Array of enabled meta-agent instances
   * @returns {Promise<void>}
   */
  async executeEvaluation(evaluationId, baselineResult, enabledAgents) {
    try {
      const evaluation = this.activeEvaluations.get(evaluationId);
      if (!evaluation) {
        throw new Error('Evaluation not found');
      }

      // Check if evaluation was cancelled
      if (evaluation.status === 'cancelled') {
        return;
      }

      // Update status
      this.updateEvaluationStatus(evaluationId, {
        currentPhase: 'Running meta-agent analysis...',
        progress: 10
      });

      // Execute meta-agents with individual error handling
      const agentPromises = enabledAgents.map(async (agent, index) => {
        return this.executeAgentWithErrorHandling(agent, baselineResult, evaluationId, index, enabledAgents.length);
      });

      // Wait for all agents to complete (using allSettled to handle failures gracefully)
      const agentResults = await Promise.allSettled(agentPromises);

      // Process results and extract successful/failed agents
      const processedResults = agentResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          console.error(`[MetaAgentService] Agent ${enabledAgents[index].type} promise rejected:`, result.reason);

          // Create fallback response for rejected promises
          return enabledAgents[index].createFallbackResponse(
            result.reason,
            'promise_rejected'
          );
        }
      });

      // Check if evaluation was cancelled during execution
      const currentEvaluation = this.activeEvaluations.get(evaluationId);
      if (currentEvaluation?.status === 'cancelled') {
        return;
      }

      // Aggregate results
      const aggregatedResult = this.aggregateResults(processedResults);

      // Complete evaluation
      this.updateEvaluationStatus(evaluationId, {
        status: 'completed',
        currentPhase: 'Meta-agent evaluation complete',
        progress: 100,
        agentResults: processedResults,
        result: aggregatedResult,
        endTime: Date.now()
      });

    } catch (error) {
      console.error('[MetaAgentService] Evaluation execution failed:', error);
      this.updateEvaluationStatus(evaluationId, {
        status: 'error',
        currentPhase: 'Meta-agent evaluation failed',
        error: error.message,
        endTime: Date.now()
      });
    }
  }

  /**
   * Execute individual agent with comprehensive error handling
   * @param {Object} agent - The meta-agent instance
   * @param {Object} baselineResult - The baseline result to analyze
   * @param {string} evaluationId - The evaluation ID
   * @param {number} index - Agent index for progress tracking
   * @param {number} totalAgents - Total number of agents
   * @returns {Promise<Object>} Agent result or fallback response
   */
  async executeAgentWithErrorHandling(agent, baselineResult, evaluationId, index, totalAgents) {
    const evaluation = this.activeEvaluations.get(evaluationId);

    try {
      // Check for cancellation before starting
      if (evaluation?.status === 'cancelled') {
        throw new Error('Evaluation cancelled');
      }

      this.updateEvaluationStatus(evaluationId, {
        currentPhase: `Running ${agent.type} analysis...`,
        progress: 10 + (index / totalAgents * 70)
      });

      // Set timeout for individual agent execution
      const timeout = agent.getConfig('timeout', 30000); // 30 seconds default
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Agent ${agent.type} timed out after ${timeout}ms`)), timeout);
      });

      // Race between agent execution and timeout
      const result = await Promise.race([
        agent.evaluate(baselineResult),
        timeoutPromise
      ]);

      // Update completed count
      if (evaluation) {
        evaluation.completedAgents = (evaluation.completedAgents || 0) + 1;
        this.updateEvaluationStatus(evaluationId, {
          completedAgents: evaluation.completedAgents,
          progress: 10 + (evaluation.completedAgents / totalAgents * 70)
        });
      }

      return result;

    } catch (error) {
      console.error(`[MetaAgentService] Agent ${agent.type} failed:`, error);

      // Update completed count even for failed agents
      if (evaluation) {
        evaluation.completedAgents = (evaluation.completedAgents || 0) + 1;
        this.updateEvaluationStatus(evaluationId, {
          completedAgents: evaluation.completedAgents,
          progress: 10 + (evaluation.completedAgents / totalAgents * 70)
        });
      }

      // Determine failure reason
      let failureReason = 'evaluation_failed';
      if (error.message.includes('timed out')) {
        failureReason = 'timeout';
      } else if (error.message.includes('cancelled')) {
        failureReason = 'cancelled';
      } else if (error.message.includes('credentials') || error.message.includes('access denied')) {
        failureReason = 'authentication_failed';
      } else if (error.message.includes('network') || error.message.includes('connection')) {
        failureReason = 'network_error';
      }

      // Create fallback response
      return agent.createFallbackResponse(error, failureReason);
    }
  }

  /**
   * Get enabled agents based on configuration
   * @param {Map} agents - Available agents map
   * @param {Object} config - Meta-agent configuration
   * @returns {Array} Array of enabled agent instances
   */
  getEnabledAgents(agents, config) {
    const enabled = [];

    if (config.agents?.factChecker?.enabled && agents.has('factChecker')) {
      const AgentClass = agents.get('factChecker');
      enabled.push(new AgentClass(config.agents.factChecker.config || {}));
    }

    if (config.agents?.errorContainment?.enabled && agents.has('errorContainment')) {
      const AgentClass = agents.get('errorContainment');
      enabled.push(new AgentClass(config.agents.errorContainment.config || {}));
    }

    if (config.agents?.qualityEnforcer?.enabled && agents.has('qualityEnforcer')) {
      const AgentClass = agents.get('qualityEnforcer');
      enabled.push(new AgentClass(config.agents.qualityEnforcer.config || {}));
    }

    return enabled;
  }

  /**
   * Aggregate results from multiple meta-agents with enhanced failure handling
   * @param {Array} agentResults - Array of agent results
   * @returns {Object} Aggregated result
   */
  aggregateResults(agentResults) {
    const validResults = agentResults.filter(result => !result.failed && !result.details?.fallback);
    const fallbackResults = agentResults.filter(result => result.details?.fallback);
    const failedResults = agentResults.filter(result => result.failed);

    // Categorize failure reasons
    const failureReasons = {};
    [...fallbackResults, ...failedResults].forEach(result => {
      const reason = result.details?.reason || 'unknown';
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    });

    // If no valid results, provide degraded service information
    if (validResults.length === 0) {
      const totalFailed = fallbackResults.length + failedResults.length;
      let degradationMessage = 'All meta-agents failed to complete evaluation';

      if (failureReasons.timeout > 0) {
        degradationMessage = `${failureReasons.timeout} meta-agent(s) timed out during evaluation`;
      } else if (failureReasons.network_error > 0) {
        degradationMessage = `${failureReasons.network_error} meta-agent(s) failed due to network issues`;
      } else if (failureReasons.authentication_failed > 0) {
        degradationMessage = `${failureReasons.authentication_failed} meta-agent(s) failed due to authentication issues`;
      }

      return {
        overallRecommendation: 'warning',
        overallConfidence: 0,
        summary: degradationMessage,
        agentCount: agentResults.length,
        successfulAgents: 0,
        fallbackAgents: fallbackResults.length,
        failedAgents: failedResults.length,
        failureReasons,
        degraded: true,
        recommendations: {
          accept: 0,
          reject: 0,
          warning: totalFailed
        }
      };
    }

    // Calculate overall recommendation based on valid agent results
    const recommendations = validResults.map(r => r.recommendation);
    const rejectCount = recommendations.filter(r => r === 'reject').length;
    const acceptCount = recommendations.filter(r => r === 'accept').length;
    const warningCount = recommendations.filter(r => r === 'warning').length;

    let overallRecommendation = 'accept';
    if (rejectCount > 0) {
      overallRecommendation = 'reject';
    } else if (warningCount > acceptCount) {
      overallRecommendation = 'warning';
    }

    // Adjust recommendation if we have failures
    if (fallbackResults.length > 0 || failedResults.length > 0) {
      if (overallRecommendation === 'accept') {
        overallRecommendation = 'warning'; // Downgrade to warning if some agents failed
      }
    }

    // Calculate overall confidence as weighted average, adjusted for failures
    const totalConfidence = validResults.reduce((sum, result) => sum + result.confidence, 0);
    let overallConfidence = Math.round(totalConfidence / validResults.length);

    // Reduce confidence based on failure rate
    const failureRate = (fallbackResults.length + failedResults.length) / agentResults.length;
    overallConfidence = Math.round(overallConfidence * (1 - failureRate * 0.5)); // Reduce by up to 50%

    // Generate summary
    const summary = this.generateEvaluationSummary(validResults, overallRecommendation, fallbackResults.length + failedResults.length);

    return {
      overallRecommendation,
      overallConfidence,
      summary,
      agentCount: agentResults.length,
      successfulAgents: validResults.length,
      fallbackAgents: fallbackResults.length,
      failedAgents: failedResults.length,
      failureReasons,
      degraded: (fallbackResults.length + failedResults.length) > 0,
      recommendations: {
        accept: acceptCount,
        reject: rejectCount,
        warning: warningCount + fallbackResults.length
      }
    };
  }

  /**
   * Generate evaluation summary text with failure information
   * @param {Array} results - Valid agent results
   * @param {string} overallRecommendation - Overall recommendation
   * @param {number} failedCount - Number of failed agents
   * @returns {string} Summary text
   */
  generateEvaluationSummary(results, overallRecommendation, failedCount = 0) {
    const agentTypes = results.map(r => r.agentType).join(', ');
    const avgConfidence = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.confidence, 0) / results.length)
      : 0;

    let baseSummary = '';
    switch (overallRecommendation) {
      case 'accept':
        baseSummary = `Meta-agents (${agentTypes}) recommend accepting the response with ${avgConfidence}% confidence.`;
        break;
      case 'reject':
        baseSummary = `Meta-agents (${agentTypes}) recommend rejecting the response due to identified issues.`;
        break;
      case 'warning':
        baseSummary = `Meta-agents (${agentTypes}) identified potential concerns requiring review.`;
        break;
      default:
        baseSummary = `Meta-agent evaluation completed with ${results.length} agents.`;
        break;
    }

    // Add failure information if applicable
    if (failedCount > 0) {
      if (results.length === 0) {
        return `All ${failedCount} meta-agents failed to complete evaluation. Manual review recommended.`;
      } else {
        return `${baseSummary} Note: ${failedCount} meta-agent(s) failed and could not contribute to this assessment.`;
      }
    }

    return baseSummary;
  }

  /**
   * Update evaluation status and notify callbacks
   * @param {string} evaluationId - The evaluation ID
   * @param {Object} updates - Status updates
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
   * @param {string} evaluationId - The evaluation ID
   * @param {Object} status - Current status
   */
  notifyStatusCallbacks(evaluationId, status) {
    const callbacks = this.statusCallbacks.get(evaluationId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(status);
        } catch (error) {
          console.error('[MetaAgentService] Error in status callback:', error);
        }
      });
    }
  }

  /**
   * Subscribe to evaluation status updates
   * @param {string} evaluationId - The evaluation ID
   * @param {Function} callback - Status update callback
   * @returns {Function} Unsubscribe function
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
   * @param {string} evaluationId - The evaluation ID
   * @returns {Object|null} Evaluation status or null if not found
   */
  getEvaluationStatus(evaluationId) {
    return this.activeEvaluations.get(evaluationId) || null;
  }

  /**
   * Cancel evaluation with comprehensive cleanup
   * @param {string} evaluationId - The evaluation ID
   * @param {string} reason - Reason for cancellation
   * @returns {boolean} True if cancelled successfully
   */
  cancelEvaluation(evaluationId, reason = 'user_requested') {
    const evaluation = this.activeEvaluations.get(evaluationId);
    if (!evaluation) {
      return false;
    }

    if (evaluation.status === 'running') {
      evaluation.status = 'cancelled';
      evaluation.currentPhase = this.getCancellationMessage(reason);
      evaluation.cancellationReason = reason;
      evaluation.endTime = Date.now();

      // Calculate how long the evaluation ran before cancellation
      const duration = evaluation.endTime - evaluation.startTime;
      evaluation.duration = duration;

      this.notifyStatusCallbacks(evaluationId, evaluation);

      console.log(`[MetaAgentService] Evaluation ${evaluationId} cancelled after ${duration}ms. Reason: ${reason}`);
      return true;
    }

    return false;
  }

  /**
   * Get user-friendly cancellation message
   * @param {string} reason - Cancellation reason
   * @returns {string} User-friendly message
   */
  getCancellationMessage(reason) {
    switch (reason) {
      case 'user_requested':
        return 'Cancelled by user';
      case 'timeout':
        return 'Cancelled due to timeout';
      case 'error':
        return 'Cancelled due to error';
      case 'system_shutdown':
        return 'Cancelled due to system shutdown';
      default:
        return 'Evaluation cancelled';
    }
  }

  /**
   * Cancel all active evaluations
   * @param {string} reason - Reason for cancellation
   * @returns {number} Number of evaluations cancelled
   */
  cancelAllEvaluations(reason = 'system_shutdown') {
    let cancelledCount = 0;

    for (const [evaluationId, evaluation] of this.activeEvaluations.entries()) {
      if (evaluation.status === 'running') {
        if (this.cancelEvaluation(evaluationId, reason)) {
          cancelledCount++;
        }
      }
    }

    console.log(`[MetaAgentService] Cancelled ${cancelledCount} active evaluations. Reason: ${reason}`);
    return cancelledCount;
  }

  /**
   * Set timeout for evaluation with automatic cancellation
   * @param {string} evaluationId - The evaluation ID
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Function} Clear timeout function
   */
  setEvaluationTimeout(evaluationId, timeoutMs) {
    const timeoutId = setTimeout(() => {
      const evaluation = this.activeEvaluations.get(evaluationId);
      if (evaluation && evaluation.status === 'running') {
        console.warn(`[MetaAgentService] Evaluation ${evaluationId} timed out after ${timeoutMs}ms`);
        this.cancelEvaluation(evaluationId, 'timeout');
      }
    }, timeoutMs);

    // Return function to clear timeout
    return () => clearTimeout(timeoutId);
  }

  /**
   * Get service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      activeEvaluations: this.activeEvaluations.size,
      loadedScenarios: this.scenarioAgents.size
    };
  }

  /**
   * Remove completed or cancelled evaluation from active list
   * @param {string} evaluationId - The evaluation ID to remove
   * @returns {boolean} True if removed successfully
   */
  removeEvaluation(evaluationId) {
    const evaluation = this.activeEvaluations.get(evaluationId);
    if (evaluation) {
      // Clear any pending timeouts
      if (evaluation.clearTimeout) {
        evaluation.clearTimeout();
      }

      // Remove from active evaluations
      this.activeEvaluations.delete(evaluationId);

      // Clean up status callbacks
      this.statusCallbacks.delete(evaluationId);

      return true;
    }
    return false;
  }

  /**
   * Clean up old evaluations (completed, cancelled, or errored)
   * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
   * @returns {number} Number of evaluations cleaned up
   */
  cleanupOldEvaluations(maxAge = 3600000) {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [evaluationId, evaluation] of this.activeEvaluations.entries()) {
      const age = now - evaluation.startTime;
      const isOld = age > maxAge;
      const isFinished = ['completed', 'cancelled', 'error'].includes(evaluation.status);

      if (isOld || isFinished) {
        this.removeEvaluation(evaluationId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[MetaAgentService] Cleaned up ${cleanedCount} old evaluations`);
    }

    return cleanedCount;
  }

  /**
   * Clean up resources with comprehensive cleanup
   */
  cleanup() {
    // Cancel all running evaluations
    this.cancelAllEvaluations('system_shutdown');

    // Clear all timeouts
    for (const evaluation of this.activeEvaluations.values()) {
      if (evaluation.clearTimeout) {
        evaluation.clearTimeout();
      }
    }

    // Clear all data structures
    this.activeEvaluations.clear();
    this.statusCallbacks.clear();
    this.scenarioAgents.clear();

    console.log('[MetaAgentService] Service cleanup completed');
  }
}

// Export singleton instance
export const metaAgentService = new MetaAgentService();