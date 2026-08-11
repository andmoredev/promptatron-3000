import { determinismStorageService } from './determinismStorageService.js'
import { workflowDataPersistenceService } from './workflowDataPersistenceService.js'

/**
 * Service class for local file operations
 * Handles reading and writing test history to JSON files
 */
export class FileService {
  constructor() {
    this.historyFile = 'history.json';
    this.isSupported = this.checkFileSystemSupport();
  }

  /**
   * Check if the browser supports the File System Access API
   * @returns {boolean} True if supported, false otherwise
   */
  checkFileSystemSupport() {
    return 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
  }

  /**
   * Generate a unique ID for test results
   * @returns {string} UUID-like string
   */
  generateId() {
    return 'test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Load test history from local storage or file
   * @returns {Promise<Array>} Array of test results
   */
  async loadHistory() {
    try {
      // Check if localStorage is available
      if (!this.isLocalStorageAvailable()) {
        console.warn('localStorage is not available, using in-memory storage');
        return this.getInMemoryHistory();
      }

      // Try to load from localStorage
      const localStorageHistory = localStorage.getItem('bedrock-test-history');
      if (localStorageHistory) {
        try {
          const parsed = JSON.parse(localStorageHistory);
          if (Array.isArray(parsed)) {
            // Validate each record
            const validRecords = parsed.filter(record => this.validateTestResult(record));
            if (validRecords.length !== parsed.length) {
              console.warn(`Filtered out ${parsed.length - validRecords.length} invalid records from history`);
              // Save the cleaned history back
              await this.saveCleanedHistory(validRecords);
            }

            // Enrich with determinism grades
            const enrichedRecords = await this.enrichWithDeterminismGrades(validRecords);
            return enrichedRecords;
          } else {
            console.warn('History data is not an array, resetting to empty array');
            localStorage.removeItem('bedrock-test-history');
            return [];
          }
        } catch (parseError) {
          console.error('Failed to parse history JSON, resetting:', parseError);
          localStorage.removeItem('bedrock-test-history');
          return [];
        }
      }

      // If no localStorage data, return empty array
      return [];
    } catch (error) {
      console.error('Failed to load history from localStorage:', error);
      // Fallback to in-memory storage
      return this.getInMemoryHistory();
    }
  }

  /**
   * Enrich test history records with determinism grades
   * @param {Array} records - Test history records
   * @returns {Promise<Array>} Records enriched with determinism grades
   */
  async enrichWithDeterminismGrades(records) {
    try {
      const enrichedRecords = []

      for (const record of records) {
        const enrichedRecord = { ...record }

        // Try to get determinism evaluation for this test
        if (record.id) {
          const evaluation = await this.getDeterminismEvaluation(record.id)
          if (evaluation && evaluation.grade) {
            enrichedRecord.determinismGrade = {
              grade: evaluation.grade.grade,
              score: evaluation.grade.score,
              reasoning: evaluation.grade.reasoning,
              variance: evaluation.grade.variance,
              timestamp: evaluation.timestamp,
              evaluationId: evaluation.evaluationId,
              fallbackAnalysis: evaluation.grade.fallbackAnalysis || false
            }
          }
        }

        enrichedRecords.push(enrichedRecord)
      }

      return enrichedRecords
    } catch (error) {
      console.error('Failed to enrich records with determinism grades:', error)
      // Return original records if enrichment fails
      return records
    }
  }

  /**
   * Check if localStorage is available and working
   * @returns {boolean} True if localStorage is available
   * @private
   */
  isLocalStorageAvailable() {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get in-memory history as fallback
   * @returns {Array} Array of test results
   * @private
   */
  getInMemoryHistory() {
    if (!this._inMemoryHistory) {
      this._inMemoryHistory = [];
    }
    return [...this._inMemoryHistory];
  }

  /**
   * Save cleaned history back to localStorage
   * @param {Array} cleanedHistory - The cleaned history array
   * @private
   */
  async saveCleanedHistory(cleanedHistory) {
    try {
      localStorage.setItem('bedrock-test-history', JSON.stringify(cleanedHistory));
    } catch (error) {
      console.error('Failed to save cleaned history:', error);
    }
  }

  /**
   * Save test result to history
   * @param {Object} testResult - The test result to save
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveTestResult(testResult) {
    try {
      // Validate test result structure
      if (!this.validateTestResult(testResult)) {
        const validationErrors = this.getValidationErrors(testResult);
        throw new Error(`Invalid test result structure: ${validationErrors.join(', ')}`);
      }

      // Add ID and timestamp if not present
      let newId = testResult.id || this.generateId();

      // Load existing history to check for ID conflicts
      const history = await this.loadHistory();

      // Ensure ID uniqueness
      const existingIds = new Set(history.map(item => item.id));
      let idCounter = 1;
      const originalId = newId;

      while (existingIds.has(newId)) {
        newId = `${originalId}-${idCounter}`;
        idCounter++;
      }

      // Silently handle ID conflicts without logging

      const enrichedResult = {
        id: newId,
        timestamp: testResult.timestamp || new Date().toISOString(),
        ...testResult
      };

      // Add new result to the beginning of the array (most recent first)
      history.unshift(enrichedResult);

      // Keep only the last 100 results to prevent excessive storage usage
      const trimmedHistory = history.slice(0, 100);

      // Try to save to localStorage
      if (this.isLocalStorageAvailable()) {
        try {
          const historyJson = JSON.stringify(trimmedHistory);

          // Check if we're approaching localStorage limits
          if (historyJson.length > 5 * 1024 * 1024) { // 5MB limit
            console.warn('History approaching localStorage size limits, trimming to 50 records');
            const furtherTrimmed = trimmedHistory.slice(0, 50);
            localStorage.setItem('bedrock-test-history', JSON.stringify(furtherTrimmed));
          } else {
            localStorage.setItem('bedrock-test-history', historyJson);
          }
        } catch (storageError) {
          if (storageError.name === 'QuotaExceededError') {
            console.warn('localStorage quota exceeded, trimming history and retrying');
            const trimmedForQuota = trimmedHistory.slice(0, 25);
            localStorage.setItem('bedrock-test-history', JSON.stringify(trimmedForQuota));
          } else {
            throw storageError;
          }
        }
      } else {
        // Fallback to in-memory storage
        console.warn('localStorage not available, using in-memory storage');
        this._inMemoryHistory = trimmedHistory;
      }

      return true;
    } catch (error) {
      console.error('Failed to save test result:', error);

      // Try fallback save to in-memory storage
      try {
        const enrichedResult = {
          id: testResult.id || this.generateId(),
          timestamp: testResult.timestamp || new Date().toISOString(),
          ...testResult
        };

        if (!this._inMemoryHistory) {
          this._inMemoryHistory = [];
        }
        this._inMemoryHistory.unshift(enrichedResult);
        this._inMemoryHistory = this._inMemoryHistory.slice(0, 100);

        console.warn('Saved to in-memory storage as fallback');
        return true;
      } catch (fallbackError) {
        console.error('Fallback save also failed:', fallbackError);
        throw new Error(`Failed to save test result: ${error.message}`);
      }
    }
  }

  /**
   * Save determinism evaluation result and associate it with test result
   * @param {string} testId - Test ID to associate evaluation with
   * @param {Object} evaluationResult - Determinism evaluation result
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveDeterminismEvaluation(testId, gradeResult) {
    try {
      console.log('Saving determinism evaluation - testId:', testId, 'gradeResult:', gradeResult);

      // Prepare evaluation data for storage
      // gradeResult is the direct result from the grader service
      const evaluationData = {
        evaluationId: `eval_${testId}_${Date.now()}`,
        testId,
        timestamp: gradeResult.timestamp || Date.now(),
        modelId: gradeResult.modelId,
        grade: gradeResult, // The entire gradeResult is the grade
        responses: gradeResult.responses || [],
        metadata: {
          evaluationDuration: gradeResult.evaluationDuration,
          concurrencyUsed: gradeResult.concurrencyUsed,
          throttleEvents: gradeResult.throttleEvents || 0,
          graderModel: gradeResult.graderModel,
          fallbackAnalysis: gradeResult.fallbackAnalysis || false
        },
        config: gradeResult.config || {
          modelId: gradeResult.modelId,
          systemPrompt: gradeResult.systemPrompt,
          userPrompt: gradeResult.userPrompt,
          datasetType: gradeResult.datasetType,
          datasetOption: gradeResult.datasetOption
        }
      }

      // Save to determinism storage
      const saved = await determinismStorageService.saveEvaluationResult(evaluationData)

      if (saved) {
        console.log('Determinism evaluation saved for test:', testId)
      }

      return saved
    } catch (error) {
      console.error('Failed to save determinism evaluation:', error)
      return false
    }
  }

  /**
   * Get determinism evaluation for a test
   * @param {string} testId - Test ID to get evaluation for
   * @returns {Promise<Object|null>} Evaluation result or null if not found
   */
  async getDeterminismEvaluation(testId) {
    try {
      return await determinismStorageService.getEvaluationByTestId(testId)
    } catch (error) {
      console.error('Failed to get determinism evaluation:', error)
      return null
    }
  }

  /**
   * Save tool execution workflow data associated with a test result
   * @param {string} testId - Test ID to associate workflow with
   * @param {Object} workflowData - Complete workflow data from workflowTrackingService
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveToolExecutionWorkflow(testId, workflowData) {
    try {
      if (!testId || !workflowData) {
        throw new Error('testId and workflowData are required');
      }

      // Initialize workflow data persistence service if needed
      if (!workflowDataPersistenceService.isInitialized) {
        await workflowDataPersistenceService.initialize();
      }

      // Try to save to IndexedDB first (preferred for large workflow data)
      const savedToIndexedDB = await workflowDataPersistenceService.storeWorkflowData(testId, workflowData);

      if (savedToIndexedDB) {
        return true;
      }

      // Fallback to localStorage for smaller workflows
      const workflowKey = `tool-workflow-${testId}`;
      const workflowToStore = {
        testId,
        executionId: workflowData.executionId,
        timestamp: new Date().toISOString(),
        workflow: workflowData
      };

      if (this.isLocalStorageAvailable()) {
        localStorage.setItem(workflowKey, JSON.stringify(workflowToStore));
      } else {
        // Final fallback to in-memory storage
        if (!this._inMemoryWorkflows) {
          this._inMemoryWorkflows = new Map();
        }
        this._inMemoryWorkflows.set(workflowKey, workflowToStore);
      }

      return true;
    } catch (error) {
      console.error('Failed to save tool execution workflow:', error);
      return false;
    }
  }

  /**
   * Get tool execution workflow data for a test
   * @param {string} testId - Test ID to get workflow for
   * @returns {Promise<Object|null>} Workflow data or null if not found
   */
  async getToolExecutionWorkflow(testId) {
    try {
      if (!testId) {
        return null;
      }

      // Try IndexedDB first (preferred for complete workflow data)
      if (workflowDataPersistenceService.isInitialized) {
        const workflowData = await workflowDataPersistenceService.getWorkflowDataByTestId(testId);
        if (workflowData) {
          return {
            testId,
            executionId: workflowData.executionId,
            timestamp: workflowData.startTime,
            workflow: workflowData
          };
        }
      }

      // Fallback to localStorage
      const workflowKey = `tool-workflow-${testId}`;

      if (this.isLocalStorageAvailable()) {
        const workflowData = localStorage.getItem(workflowKey);
        if (workflowData) {
          return JSON.parse(workflowData);
        }
      }

      // Final fallback to in-memory storage
      if (this._inMemoryWorkflows && this._inMemoryWorkflows.has(workflowKey)) {
        return this._inMemoryWorkflows.get(workflowKey);
      }

      return null;
    } catch (error) {
      console.error('Failed to get tool execution workflow:', error);
      return null;
    }
  }

  /**
   * Get all tool execution workflow data for indexing and querying
   * @returns {Promise<Array>} Array of workflow data with test associations
   */
  async getAllToolExecutionWorkflows() {
    try {
      const workflows = [];

      // Get workflows from IndexedDB first (preferred)
      if (workflowDataPersistenceService.isInitialized) {
        const metadata = await workflowDataPersistenceService.getWorkflowMetadata();
        for (const meta of metadata) {
          workflows.push({
            testId: meta.testId,
            executionId: meta.executionId,
            timestamp: meta.timestamp,
            workflow: {
              executionId: meta.executionId,
              status: meta.status,
              startTime: meta.startTime,
              endTime: meta.endTime,
              totalDuration: meta.totalDuration,
              currentIteration: meta.currentIteration,
              maxIterations: meta.maxIterations,
              modelId: meta.modelId,
              steps: [] // Steps available separately if needed
            }
          });
        }
      }

      // Add workflows from localStorage (for backward compatibility)
      if (this.isLocalStorageAvailable()) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('tool-workflow-')) {
            try {
              const workflowData = JSON.parse(localStorage.getItem(key));
              // Check if we already have this workflow from IndexedDB
              const existingWorkflow = workflows.find(w => w.executionId === workflowData.executionId);
              if (!existingWorkflow) {
                workflows.push(workflowData);
              }
            } catch (parseError) {
              console.warn(`Failed to parse workflow data for key ${key}:`, parseError);
            }
          }
        }
      }

      // Add in-memory workflows
      if (this._inMemoryWorkflows) {
        for (const [key, workflowData] of this._inMemoryWorkflows) {
          if (key.startsWith('tool-workflow-')) {
            const existingWorkflow = workflows.find(w => w.executionId === workflowData.executionId);
            if (!existingWorkflow) {
              workflows.push(workflowData);
            }
          }
        }
      }

      // Sort by timestamp (newest first)
      workflows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return workflows;
    } catch (error) {
      console.error('Failed to get all tool execution workflows:', error);
      return [];
    }
  }

  /**
   * Clean up old tool execution workflow data
   * @param {number} maxAge - Maximum age in milliseconds (default: 30 days)
   * @returns {Promise<number>} Number of workflows cleaned up
   */
  async cleanupToolExecutionWorkflows(maxAge = 30 * 24 * 60 * 60 * 1000) {
    try {
      let totalCleanedCount = 0;

      // Clean up IndexedDB workflows (preferred storage)
      if (workflowDataPersistenceService.isInitialized) {
        const indexedDBResults = await workflowDataPersistenceService.cleanupOldWorkflows();
        totalCleanedCount += indexedDBResults.deletedCount;
      }

      // Clean up localStorage workflows (legacy/fallback storage)
      const cutoffTime = Date.now() - maxAge;
      let localStorageCleanedCount = 0;

      if (this.isLocalStorageAvailable()) {
        const keysToDelete = [];

        // Find old workflow keys
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('tool-workflow-')) {
            try {
              const workflowData = JSON.parse(localStorage.getItem(key));
              const workflowTime = new Date(workflowData.timestamp).getTime();
              if (workflowTime < cutoffTime) {
                keysToDelete.push(key);
              }
            } catch (parseError) {
              // If we can't parse it, it's probably corrupted, so delete it
              keysToDelete.push(key);
            }
          }
        }

        // Delete old workflows
        keysToDelete.forEach(key => {
          localStorage.removeItem(key);
          localStorageCleanedCount++;
        });
      }

      // Clean up in-memory workflows
      if (this._inMemoryWorkflows) {
        const keysToDelete = [];
        for (const [key, workflowData] of this._inMemoryWorkflows) {
          if (key.startsWith('tool-workflow-')) {
            const workflowTime = new Date(workflowData.timestamp).getTime();
            if (workflowTime < cutoffTime) {
              keysToDelete.push(key);
            }
          }
        }

        keysToDelete.forEach(key => {
          this._inMemoryWorkflows.delete(key);
          localStorageCleanedCount++;
        });
      }

      totalCleanedCount += localStorageCleanedCount;

      if (totalCleanedCount > 0) {
        console.log(`Cleaned up ${totalCleanedCount} old tool execution workflows`);
      }

      return totalCleanedCount;
    } catch (error) {
      console.error('Failed to cleanup tool execution workflows:', error);
      return 0;
    }
  }

  /**
   * Get detailed workflow information including steps
   * @param {string} testId - Test ID to get detailed workflow for
   * @returns {Promise<Object|null>} Detailed workflow data or null if not found
   */
  async getDetailedToolExecutionWorkflow(testId) {
    try {
      if (!testId) {
        return null;
      }

      // Try to get from IndexedDB first (has detailed step information)
      if (workflowDataPersistenceService.isInitialized) {
        const workflowData = await workflowDataPersistenceService.getWorkflowDataByTestId(testId);
        if (workflowData) {
          return workflowData;
        }
      }

      // Fallback to basic workflow data from localStorage/memory
      const basicWorkflow = await this.getToolExecutionWorkflow(testId);
      return basicWorkflow ? basicWorkflow.workflow : null;
    } catch (error) {
      console.error('Failed to get detailed tool execution workflow:', error);
      return null;
    }
  }

  /**
   * Get workflow statistics for tool execution analysis
   * @param {Object} filters - Statistics filters
   * @returns {Promise<Object>} Workflow statistics
   */
  async getToolExecutionWorkflowStatistics(filters = {}) {
    try {
      // Get statistics from IndexedDB if available (more detailed)
      if (workflowDataPersistenceService.isInitialized) {
        return await workflowDataPersistenceService.getWorkflowStatistics(filters);
      }

      // Fallback to basic statistics from localStorage/memory
      const workflows = await this.getAllToolExecutionWorkflows();

      let filteredWorkflows = workflows;

      // Apply filters
      if (filters.status) {
        filteredWorkflows = filteredWorkflows.filter(w => w.workflow?.status === filters.status);
      }

      if (filters.modelId) {
        filteredWorkflows = filteredWorkflows.filter(w => w.workflow?.modelId === filters.modelId);
      }

      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        filteredWorkflows = filteredWorkflows.filter(w => new Date(w.timestamp) >= startDate);
      }

      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        filteredWorkflows = filteredWorkflows.filter(w => new Date(w.timestamp) <= endDate);
      }

      // Calculate basic statistics
      const stats = {
        totalWorkflows: filteredWorkflows.length,
        statusBreakdown: {},
        modelBreakdown: {},
        averageDuration: 0,
        averageIterations: 0,
        averageStepCount: 0,
        totalDataSize: 0,
        dateRange: null
      };

      if (filteredWorkflows.length > 0) {
        // Status breakdown
        filteredWorkflows.forEach(w => {
          const status = w.workflow?.status || 'unknown';
          stats.statusBreakdown[status] = (stats.statusBreakdown[status] || 0) + 1;
        });

        // Model breakdown
        filteredWorkflows.forEach(w => {
          const modelId = w.workflow?.modelId;
          if (modelId) {
            stats.modelBreakdown[modelId] = (stats.modelBreakdown[modelId] || 0) + 1;
          }
        });

        // Calculate averages
        const workflowsWithDuration = filteredWorkflows.filter(w => w.workflow?.totalDuration);
        if (workflowsWithDuration.length > 0) {
          stats.averageDuration = workflowsWithDuration.reduce((sum, w) => sum + w.workflow.totalDuration, 0) / workflowsWithDuration.length;
        }

        stats.averageIterations = filteredWorkflows.reduce((sum, w) => sum + (w.workflow?.currentIteration || 0), 0) / filteredWorkflows.length;
        stats.averageStepCount = filteredWorkflows.reduce((sum, w) => sum + (w.workflow?.steps?.length || 0), 0) / filteredWorkflows.length;

        // Date range
        const sortedByDate = filteredWorkflows.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        stats.dateRange = {
          earliest: sortedByDate[0].timestamp,
          latest: sortedByDate[sortedByDate.length - 1].timestamp
        };
      }

      return stats;
    } catch (error) {
      console.error('Failed to get tool execution workflow statistics:', error);
      return {
        totalWorkflows: 0,
        statusBreakdown: {},
        modelBreakdown: {},
        averageDuration: 0,
        averageIterations: 0,
        averageStepCount: 0,
        totalDataSize: 0,
        dateRange: null
      };
    }
  }

  /**
   * Get detailed validation errors for a test result
   * @param {Object} testResult - The test result to validate
   * @returns {Array} Array of validation error messages
   * @private
   */
  getValidationErrors(testResult) {
    const errors = [];

    if (!testResult || typeof testResult !== 'object') {
      errors.push('Test result must be an object');
      return errors;
    }

    // Required fields
    if (!testResult.modelId || typeof testResult.modelId !== 'string') {
      errors.push('modelId is required and must be a string');
    }

    // Check for dual prompt format (preferred) or legacy single prompt
    const hasSystemPrompt = testResult.systemPrompt && typeof testResult.systemPrompt === 'string';
    const hasUserPrompt = testResult.userPrompt && typeof testResult.userPrompt === 'string';
    const hasLegacyPrompt = testResult.prompt && typeof testResult.prompt === 'string';

    if (!hasSystemPrompt && !hasUserPrompt && !hasLegacyPrompt) {
      errors.push('either systemPrompt and userPrompt, or legacy prompt field is required');
    }

    // Optional but expected fields
    if (testResult.datasetType && typeof testResult.datasetType !== 'string') {
      errors.push('datasetType must be a string if provided');
    }

    if (testResult.datasetOption && typeof testResult.datasetOption !== 'string') {
      errors.push('datasetOption must be a string if provided');
    }

    if (testResult.response && typeof testResult.response !== 'string') {
      errors.push('response must be a string if provided');
    }

    if (testResult.timestamp && !this.isValidTimestamp(testResult.timestamp)) {
      errors.push('timestamp must be a valid ISO string if provided');
    }

    // Validate tool usage structure if present
    if (testResult.toolUsage !== null && testResult.toolUsage !== undefined) {
      if (typeof testResult.toolUsage !== 'object') {
        errors.push('toolUsage must be an object if provided');
      } else {
        if (testResult.toolUsage.hasToolUsage !== undefined && typeof testResult.toolUsage.hasToolUsage !== 'boolean') {
          errors.push('toolUsage.hasToolUsage must be a boolean if provided');
        }

        if (testResult.toolUsage.toolCallCount !== undefined && typeof testResult.toolUsage.toolCallCount !== 'number') {
          errors.push('toolUsage.toolCallCount must be a number if provided');
        }

        if (testResult.toolUsage.toolCalls !== undefined) {
          if (!Array.isArray(testResult.toolUsage.toolCalls)) {
            errors.push('toolUsage.toolCalls must be an array if provided');
          } else {
            testResult.toolUsage.toolCalls.forEach((call, index) => {
              if (!call.toolName || typeof call.toolName !== 'string') {
                errors.push(`toolUsage.toolCalls[${index}].toolName is required and must be a string`);
              }
              if (call.attempted !== undefined && typeof call.attempted !== 'boolean') {
                errors.push(`toolUsage.toolCalls[${index}].attempted must be a boolean if provided`);
              }
            });
          }
        }

        if (testResult.toolUsage.availableTools !== undefined && !Array.isArray(testResult.toolUsage.availableTools)) {
          errors.push('toolUsage.availableTools must be an array if provided');
        }
      }
    }

    // Validate tool execution structure if present
    if (testResult.toolExecution !== null && testResult.toolExecution !== undefined) {
      if (typeof testResult.toolExecution !== 'object') {
        errors.push('toolExecution must be an object if provided');
      } else {
        if (testResult.toolExecution.enabled !== undefined && typeof testResult.toolExecution.enabled !== 'boolean') {
          errors.push('toolExecution.enabled must be a boolean if provided');
        }

        if (testResult.toolExecution.executionId !== undefined && typeof testResult.toolExecution.executionId !== 'string') {
          errors.push('toolExecution.executionId must be a string if provided');
        }

        if (testResult.toolExecution.maxIterations !== undefined && typeof testResult.toolExecution.maxIterations !== 'number') {
          errors.push('toolExecution.maxIterations must be a number if provided');
        }

        if (testResult.toolExecution.actualIterations !== undefined && typeof testResult.toolExecution.actualIterations !== 'number') {
          errors.push('toolExecution.actualIterations must be a number if provided');
        }

        if (testResult.toolExecution.status !== undefined && typeof testResult.toolExecution.status !== 'string') {
          errors.push('toolExecution.status must be a string if provided');
        }

        if (testResult.toolExecution.totalDuration !== undefined && typeof testResult.toolExecution.totalDuration !== 'number') {
          errors.push('toolExecution.totalDuration must be a number if provided');
        }

        if (testResult.toolExecution.workflowSummary !== undefined && typeof testResult.toolExecution.workflowSummary !== 'object') {
          errors.push('toolExecution.workflowSummary must be an object if provided');
        }
      }
    }

    return errors;
  }

  /**
   * Clear all test history
   * @returns {Promise<boolean>} True if cleared successfully
   */
  async clearHistory() {
    try {
      // Clear localStorage if available
      if (this.isLocalStorageAvailable()) {
        localStorage.removeItem('bedrock-test-history');
      }

      // Clear in-memory storage
      this._inMemoryHistory = [];

      return true;
    } catch (error) {
      console.error('Failed to clear history:', error);

      // Try to clear in-memory storage as fallback
      try {
        this._inMemoryHistory = [];
        console.warn('Cleared in-memory storage as fallback');
        return true;
      } catch (fallbackError) {
        console.error('Fallback clear also failed:', fallbackError);
        throw new Error(`Failed to clear history: ${error.message}`);
      }
    }
  }

  /**
   * Export history to a downloadable JSON file
   * @returns {Promise<boolean>} True if exported successfully
   */
  async exportHistory() {
    try {
      const history = await this.loadHistory();

      if (history.length === 0) {
        throw new Error('No history to export');
      }

      // Include determinism evaluations and tool execution workflows in export
      const toolExecutionWorkflows = await this.getAllToolExecutionWorkflows();

      // Get detailed workflow data if available
      const detailedWorkflows = [];
      for (const workflow of toolExecutionWorkflows) {
        const detailedWorkflow = await this.getDetailedToolExecutionWorkflow(workflow.testId);
        if (detailedWorkflow) {
          detailedWorkflows.push({
            testId: workflow.testId,
            executionId: workflow.executionId,
            timestamp: workflow.timestamp,
            workflow: detailedWorkflow
          });
        } else {
          detailedWorkflows.push(workflow);
        }
      }

      const exportData = {
        version: '1.3', // Version to track export format
        exportDate: new Date().toISOString(),
        testHistory: history,
        determinismEvaluations: await determinismStorageService.getAllEvaluations(),
        toolExecutionWorkflows: detailedWorkflows
      }

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });

      // Create download link
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bedrock-test-history-${new Date().toISOString().split('T')[0]}.json`;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error('Failed to export history:', error);
      throw new Error(`Failed to export history: ${error.message}`);
    }
  }

  /**
   * Import history from a JSON file
   * @param {File} file - The JSON file to import
   * @returns {Promise<number>} Number of imported records
   */
  async importHistory(file) {
    try {
      if (!file || file.type !== 'application/json') {
        throw new Error('Please select a valid JSON file');
      }

      const text = await file.text();
      const importedData = JSON.parse(text);

      let importedHistory = []
      let importedEvaluations = []
      let importedWorkflows = []

      // Handle different format versions
      if (Array.isArray(importedData)) {
        // Old format - just test history
        importedHistory = importedData
      } else if (importedData.version && importedData.testHistory) {
        // New format - includes determinism evaluations and possibly workflows
        importedHistory = importedData.testHistory || []
        importedEvaluations = importedData.determinismEvaluations || []
        importedWorkflows = importedData.toolExecutionWorkflows || []
      } else {
        throw new Error('Invalid history file format')
      }

      // Validate test history records
      const validRecords = importedHistory.filter(record => this.validateTestResult(record));

      if (validRecords.length === 0 && importedEvaluations.length === 0 && importedWorkflows.length === 0) {
        throw new Error('No valid test results, evaluations, or workflows found in the file');
      }

      // Load existing history
      const existingHistory = await this.loadHistory();

      // Merge test histories, avoiding duplicates based on ID
      const existingIds = new Set(existingHistory.map(record => record.id));
      const newRecords = validRecords.filter(record => !existingIds.has(record.id));

      // Combine and sort by timestamp (most recent first)
      const mergedHistory = [...existingHistory, ...newRecords]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 100); // Keep only the last 100 records

      // Save merged history
      localStorage.setItem('bedrock-test-history', JSON.stringify(mergedHistory));

      // Import determinism evaluations
      let importedEvaluationCount = 0
      if (importedEvaluations.length > 0) {
        for (const evaluation of importedEvaluations) {
          try {
            const saved = await determinismStorageService.saveEvaluationResult(evaluation)
            if (saved) {
              importedEvaluationCount++
            }
          } catch (evalError) {
            console.warn('Failed to import evaluation:', evaluation.evaluationId, evalError.message)
          }
        }
      }

      // Import tool execution workflows
      let importedWorkflowCount = 0
      if (importedWorkflows.length > 0) {
        // Initialize workflow data persistence service if needed
        if (!workflowDataPersistenceService.isInitialized) {
          try {
            await workflowDataPersistenceService.initialize();
          } catch (initError) {
            console.warn('Failed to initialize workflow data persistence service:', initError.message);
          }
        }

        for (const workflowData of importedWorkflows) {
          try {
            if (workflowData.testId && workflowData.workflow) {
              const saved = await this.saveToolExecutionWorkflow(workflowData.testId, workflowData.workflow)
              if (saved) {
                importedWorkflowCount++
              }
            }
          } catch (workflowError) {
            console.warn('Failed to import workflow:', workflowData.testId, workflowError.message)
          }
        }
      }

      const totalImported = newRecords.length + importedEvaluationCount + importedWorkflowCount
      console.log(`Imported ${newRecords.length} test records, ${importedEvaluationCount} evaluations, and ${importedWorkflowCount} workflows`)

      return totalImported;
    } catch (error) {
      console.error('Failed to import history:', error);
      throw new Error(`Failed to import history: ${error.message}`);
    }
  }

  /**
   * Validate test result structure
   * @param {Object} testResult - The test result to validate
   * @returns {boolean} True if valid
   * @private
   */
  validateTestResult(testResult) {
    if (!testResult || typeof testResult !== 'object') {
      return false;
    }

    // Required fields - modelId is always required
    if (!testResult.modelId || typeof testResult.modelId !== 'string') {
      return false;
    }

    // Check for dual prompt format (preferred) or legacy single prompt
    const hasSystemPrompt = testResult.systemPrompt && typeof testResult.systemPrompt === 'string';
    const hasUserPrompt = testResult.userPrompt && typeof testResult.userPrompt === 'string';
    const hasLegacyPrompt = testResult.prompt && typeof testResult.prompt === 'string';

    if (!hasSystemPrompt && !hasUserPrompt && !hasLegacyPrompt) {
      return false;
    }

    // Optional but expected fields
    if (testResult.datasetType && typeof testResult.datasetType !== 'string') {
      return false;
    }

    if (testResult.datasetOption && typeof testResult.datasetOption !== 'string') {
      return false;
    }

    if (testResult.response && typeof testResult.response !== 'string') {
      return false;
    }

    if (testResult.timestamp && !this.isValidTimestamp(testResult.timestamp)) {
      return false;
    }

    // Validate tool usage structure if present
    if (testResult.toolUsage !== null && testResult.toolUsage !== undefined) {
      if (typeof testResult.toolUsage !== 'object') {
        return false;
      }

      // Basic structure validation for tool usage
      if (testResult.toolUsage.hasToolUsage !== undefined && typeof testResult.toolUsage.hasToolUsage !== 'boolean') {
        return false;
      }

      if (testResult.toolUsage.toolCalls !== undefined && !Array.isArray(testResult.toolUsage.toolCalls)) {
        return false;
      }
    }

    // Validate tool execution data if present
    if (testResult.toolExecution !== null && testResult.toolExecution !== undefined) {
      if (typeof testResult.toolExecution !== 'object') {
        return false;
      }

      // Validate tool execution structure
      if (testResult.toolExecution.enabled !== undefined && typeof testResult.toolExecution.enabled !== 'boolean') {
        return false;
      }

      if (testResult.toolExecution.executionId !== undefined && typeof testResult.toolExecution.executionId !== 'string') {
        return false;
      }

      if (testResult.toolExecution.maxIterations !== undefined && typeof testResult.toolExecution.maxIterations !== 'number') {
        return false;
      }

      if (testResult.toolExecution.actualIterations !== undefined && typeof testResult.toolExecution.actualIterations !== 'number') {
        return false;
      }

      if (testResult.toolExecution.status !== undefined && typeof testResult.toolExecution.status !== 'string') {
        return false;
      }

      if (testResult.toolExecution.totalDuration !== undefined && typeof testResult.toolExecution.totalDuration !== 'number') {
        return false;
      }

      if (testResult.toolExecution.workflowSummary !== undefined && typeof testResult.toolExecution.workflowSummary !== 'object') {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate timestamp format
   * @param {string} timestamp - The timestamp to validate
   * @returns {boolean} True if valid ISO timestamp
   * @private
   */
  isValidTimestamp(timestamp) {
    try {
      const date = new Date(timestamp);
      return date.toISOString() === timestamp;
    } catch {
      return false;
    }
  }

  /**
   * Get storage information
   * @returns {Promise<Object>} Storage status and usage information
   */
  async getStorageInfo() {
    try {
      const historyData = localStorage.getItem('bedrock-test-history');
      const historySize = historyData ? new Blob([historyData]).size : 0;

      // Get workflow storage information
      let workflowInfo = {
        workflowCount: 0,
        workflowSize: 0,
        workflowSizeFormatted: '0 B',
        indexedDBSupported: false,
        indexedDBInitialized: false
      };

      try {
        // Check IndexedDB workflow storage
        if (workflowDataPersistenceService.isInitialized) {
          const workflowStats = await workflowDataPersistenceService.getWorkflowStatistics();
          workflowInfo.workflowCount = workflowStats.totalWorkflows;
          workflowInfo.workflowSize = workflowStats.totalDataSize;
          workflowInfo.workflowSizeFormatted = this.formatBytes(workflowStats.totalDataSize);
          workflowInfo.indexedDBSupported = true;
          workflowInfo.indexedDBInitialized = true;
        } else {
          workflowInfo.indexedDBSupported = 'indexedDB' in window;
        }

        // Add localStorage workflow count for fallback storage
        let localStorageWorkflowCount = 0;
        if (this.isLocalStorageAvailable()) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('tool-workflow-')) {
              localStorageWorkflowCount++;
            }
          }
        }

        if (localStorageWorkflowCount > 0 && !workflowInfo.indexedDBInitialized) {
          workflowInfo.workflowCount = localStorageWorkflowCount;
        }
      } catch (workflowError) {
        console.warn('Failed to get workflow storage info:', workflowError);
      }

      return {
        supported: this.isSupported,
        storageType: 'localStorage + IndexedDB',
        historySize: historySize,
        historySizeFormatted: this.formatBytes(historySize),
        recordCount: historyData ? JSON.parse(historyData).length : 0,
        workflow: workflowInfo
      };
    } catch (error) {
      return {
        supported: this.isSupported,
        storageType: 'localStorage + IndexedDB',
        historySize: 0,
        historySizeFormatted: '0 B',
        recordCount: 0,
        workflow: {
          workflowCount: 0,
          workflowSize: 0,
          workflowSizeFormatted: '0 B',
          indexedDBSupported: false,
          indexedDBInitialized: false
        },
        error: error.message
      };
    }
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   * @private
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export a singleton instance
export const fileService = new FileService();
