import { analyzeError, handleError } from '../utils/errorHandling.js';

/**
 * Service for tracking and managing tool execution workflows
 * Provides real-time workflow tracking and persistent storage
 */
export class WorkflowTrackingService {
  constructor() {
    this.isInitialized = false;
    this.activeWorkflows = new Map(); // In-memory active workflows
    this.dbName = 'WorkflowTrackingDB';
    this.dbVersion = 1;
    this.db = null;
    this.listeners = new Map(); // Event listeners for real-time updates
  }

  /**
   * Initialize the service and IndexedDB storage
   */
  async initialize() {
    try {
      await this.initializeStorage();
      this.isInitialized = true;
      return { success: true, message: 'Workflow tracking service initialized' };
    } catch (error) {
      this.isInitialized = false;
      throw new Error(`Failed to initialize workflow tracking service: ${error.message}`);
    }
  }

  /**
   * Initialize IndexedDB storage
   */
  async initializeStorage() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(new Error('Failed to open WorkflowTrackingDB'));

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create workflows object store
        if (!db.objectStoreNames.contains('workflows')) {
          const workflowStore = db.createObjectStore('workflows', { keyPath: 'executionId' });
          workflowStore.createIndex('status', 'status', { unique: false });
          workflowStore.createIndex('startTime', 'startTime', { unique: false });
          workflowStore.createIndex('modelId', 'modelId', { unique: false });
        }

        // Create workflow steps object store
        if (!db.objectStoreNames.contains('workflow_steps')) {
          const stepStore = db.createObjectStore('workflow_steps', { keyPath: 'id' });
          stepStore.createIndex('executionId', 'executionId', { unique: false });
          stepStore.createIndex('type', 'type', { unique: false });
          stepStore.createIndex('timestamp', 'timestamp', { unique: false });
          stepStore.createIndex('iteration', 'iteration', { unique: false });
        }
      };
    });
  }

  /**
   * Create a new workflow execution
   * @param {string} executionId - Unique execution identifier
   * @param {Object} metadata - Workflow metadata
   */
  createExecution(executionId, metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('Workflow tracking service not initialized');
    }

    const workflow = {
      executionId,
      status: 'active',
      startTime: new Date().toISOString(),
      endTime: null,
      totalDuration: null,
      currentIteration: 0,
      maxIterations: metadata.maxIterations || 10,
      modelId: metadata.modelId || null,
      toolConfig: metadata.toolConfig || null,
      steps: [],
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString()
      }
    };

    this.activeWorkflows.set(executionId, workflow);
    this.notifyListeners(executionId, 'workflow_created', workflow);
  }

  /**
   * Add a step to a workflow
   * @param {string} executionId - Execution identifier
   * @param {Object} step - Workflow step data
   */
  addStep(executionId, step) {
    if (!this.isInitialized) {
      throw new Error('Workflow tracking service not initialized');
    }

    const workflow = this.activeWorkflows.get(executionId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${executionId}`);
    }

    // Ensure step has required fields
    const workflowStep = {
      id: step.id || this.generateStepId(),
      executionId,
      type: step.type,
      timestamp: step.timestamp || new Date().toISOString(),
      iteration: step.iteration || workflow.currentIteration,
      duration: step.duration || null,
      content: step.content || {},
      metadata: step.metadata || {},
      status: step.status || 'completed'
    };

    // Add to workflow
    workflow.steps.push(workflowStep);

    // Update current iteration if this is an iteration step
    if (step.type === 'iteration_start' && step.iteration) {
      workflow.currentIteration = step.iteration;
    }

    // Notify listeners
    this.notifyListeners(executionId, 'step_added', workflowStep);

    return workflowStep;
  }

  /**
   * Update an existing workflow step
   * @param {string} executionId - Execution identifier
   * @param {string} stepId - Step identifier
   * @param {Object} updates - Updates to apply
   */
  updateStep(executionId, stepId, updates) {
    if (!this.isInitialized) {
      throw new Error('Workflow tracking service not initialized');
    }

    const workflow = this.activeWorkflows.get(executionId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${executionId}`);
    }

    const stepIndex = workflow.steps.findIndex(step => step.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step not found: ${stepId}`);
    }

    // Apply updates
    const step = workflow.steps[stepIndex];
    Object.assign(step, updates);
    step.updatedAt = new Date().toISOString();

    // Notify listeners
    this.notifyListeners(executionId, 'step_updated', step);

    return step;
  }

  /**
   * Complete a workflow execution
   * @param {string} executionId - Execution identifier
   * @param {Object} finalData - Final execution data
   */
  async completeExecution(executionId, finalData = {}) {
    if (!this.isInitialized) {
      throw new Error('Workflow tracking service not initialized');
    }

    const workflow = this.activeWorkflows.get(executionId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${executionId}`);
    }

    // Update workflow status
    workflow.status = finalData.status || 'completed';
    workflow.endTime = new Date().toISOString();
    workflow.totalDuration = new Date(workflow.endTime).getTime() - new Date(workflow.startTime).getTime();
    workflow.results = finalData.results || {};
    workflow.errors = finalData.errors || [];

    // Save to persistent storage
    await this.saveWorkflow(executionId);

    // Remove from active workflows
    this.activeWorkflows.delete(executionId);

    // Notify listeners
    this.notifyListeners(executionId, 'workflow_completed', workflow);

    return workflow;
  }

  /**
   * Cancel a workflow execution
   * @param {string} executionId - Execution identifier
   * @param {string} reason - Cancellation reason
   */
  async cancelExecution(executionId, reason = 'Cancelled by user') {
    if (!this.isInitialized) {
      throw new Error('Workflow tracking service not initialized');
    }

    const workflow = this.activeWorkflows.get(executionId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${executionId}`);
    }

    // Add cancellation step
    this.addStep(executionId, {
      type: 'cancellation',
      timestamp: new Date().toISOString(),
      content: { reason },
      status: 'completed'
    });

    // Complete with cancelled status
    await this.completeExecution(executionId, {
      status: 'cancelled',
      results: { cancelled: true, reason }
    });
  }

  /**
   * Get current workflow state
   * @param {string} executionId - Execution identifier
   * @returns {Object|null} Workflow data
   */
  getWorkflow(executionId) {
    // Check active workflows first
    const activeWorkflow = this.activeWorkflows.get(executionId);
    if (activeWorkflow) {
      return { ...activeWorkflow }; // Return copy to prevent mutation
    }

    // If not active, it might be completed - would need to load from storage
    return null;
  }

  /**
   * Get workflow steps for an execution
   * @param {string} executionId - Execution identifier
   * @returns {Array} Array of workflow steps
   */
  getWorkflowSteps(executionId) {
    const workflow = this.getWorkflow(executionId);
    return workflow ? workflow.steps : [];
  }

  /**
   * Save workflow to persistent storage
   * @param {string} executionId - Execution identifier
   */
  async saveWorkflow(executionId) {
    const workflow = this.activeWorkflows.get(executionId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${executionId}`);
    }

    try {
      // Save workflow metadata
      await this.saveToStorage('workflows', {
        executionId: workflow.executionId,
        status: workflow.status,
        startTime: workflow.startTime,
        endTime: workflow.endTime,
        totalDuration: workflow.totalDuration,
        currentIteration: workflow.currentIteration,
        maxIterations: workflow.maxIterations,
        modelId: workflow.modelId,
        stepCount: workflow.steps.length,
        metadata: workflow.metadata,
        results: workflow.results || {},
        errors: workflow.errors || []
      });

      // Save individual steps
      for (const step of workflow.steps) {
        await this.saveToStorage('workflow_steps', step);
      }

    } catch (error) {
      throw new Error(`Failed to save workflow ${executionId}: ${error.message}`);
    }
  }

  /**
   * Load workflow from persistent storage
   * @param {string} executionId - Execution identifier
   * @returns {Promise<Object|null>} Workflow data
   */
  async loadWorkflow(executionId) {
    try {
      // Load workflow metadata
      const workflowData = await this.getFromStorage('workflows', executionId);
      if (!workflowData) {
        return null;
      }

      // Load workflow steps
      const steps = await this.getStepsFromStorage(executionId);

      return {
        ...workflowData,
        steps: steps
      };

    } catch (error) {
      throw new Error(`Failed to load workflow ${executionId}: ${error.message}`);
    }
  }  /**

  * Get workflow steps from storage
   * @param {string} executionId - Execution identifier
   * @returns {Promise<Array>} Array of workflow steps
   */
  async getStepsFromStorage(executionId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(['workflow_steps'], 'readonly');
      const store = transaction.objectStore('workflow_steps');
      const index = store.index('executionId');
      const request = index.getAll(executionId);

      request.onsuccess = () => {
        const steps = request.result || [];
        // Sort by timestamp to maintain order
        steps.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        resolve(steps);
      };

      request.onerror = () => reject(new Error('Failed to load workflow steps'));
    });
  }

  /**
   * Get workflow history with filtering and pagination
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated workflow history
   */
  async getWorkflowHistory(options = {}) {
    const {
      limit = 50,
      offset = 0,
      status = null,
      modelId = null,
      startDate = null,
      endDate = null
    } = options;

    try {
      const workflows = await this.queryWorkflows({
        status,
        modelId,
        startDate,
        endDate,
        limit,
        offset
      });

      return {
        workflows,
        total: workflows.length,
        hasMore: workflows.length === limit
      };

    } catch (error) {
      throw new Error(`Failed to get workflow history: ${error.message}`);
    }
  }

  /**
   * Query workflows from storage
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Array of workflows
   */
  async queryWorkflows(filters) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(['workflows'], 'readonly');
      const store = transaction.objectStore('workflows');
      const request = store.getAll();

      request.onsuccess = () => {
        let workflows = request.result || [];

        // Apply filters
        if (filters.status) {
          workflows = workflows.filter(w => w.status === filters.status);
        }

        if (filters.modelId) {
          workflows = workflows.filter(w => w.modelId === filters.modelId);
        }

        if (filters.startDate) {
          const startDate = new Date(filters.startDate);
          workflows = workflows.filter(w => new Date(w.startTime) >= startDate);
        }

        if (filters.endDate) {
          const endDate = new Date(filters.endDate);
          workflows = workflows.filter(w => new Date(w.startTime) <= endDate);
        }

        // Sort by start time (newest first)
        workflows.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

        // Apply pagination
        if (filters.offset || filters.limit) {
          const start = filters.offset || 0;
          const end = start + (filters.limit || workflows.length);
          workflows = workflows.slice(start, end);
        }

        resolve(workflows);
      };

      request.onerror = () => reject(new Error('Failed to query workflows'));
    });
  }

  /**
   * Get workflow statistics
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} Workflow statistics
   */
  async getWorkflowStatistics(options = {}) {
    const {
      startDate = null,
      endDate = null,
      modelId = null
    } = options;

    try {
      const workflows = await this.queryWorkflows({
        startDate,
        endDate,
        modelId
      });

      const stats = {
        totalWorkflows: workflows.length,
        completedWorkflows: workflows.filter(w => w.status === 'completed').length,
        cancelledWorkflows: workflows.filter(w => w.status === 'cancelled').length,
        errorWorkflows: workflows.filter(w => w.status === 'error').length,
        averageDuration: 0,
        totalToolCalls: 0,
        averageIterations: 0,
        modelBreakdown: {},
        statusBreakdown: {}
      };

      if (workflows.length > 0) {
        // Calculate averages
        const completedWorkflows = workflows.filter(w => w.totalDuration);
        if (completedWorkflows.length > 0) {
          stats.averageDuration = completedWorkflows.reduce((sum, w) => sum + w.totalDuration, 0) / completedWorkflows.length;
        }

        stats.averageIterations = workflows.reduce((sum, w) => sum + (w.currentIteration || 0), 0) / workflows.length;

        // Count tool calls (would need to load steps for accurate count)
        stats.totalToolCalls = workflows.reduce((sum, w) => sum + (w.stepCount || 0), 0);

        // Model breakdown
        workflows.forEach(w => {
          if (w.modelId) {
            stats.modelBreakdown[w.modelId] = (stats.modelBreakdown[w.modelId] || 0) + 1;
          }
        });

        // Status breakdown
        workflows.forEach(w => {
          stats.statusBreakdown[w.status] = (stats.statusBreakdown[w.status] || 0) + 1;
        });
      }

      return stats;

    } catch (error) {
      throw new Error(`Failed to get workflow statistics: ${error.message}`);
    }
  }

  /**
   * Add event listener for workflow updates
   * @param {string} executionId - Execution identifier (or 'all' for all workflows)
   * @param {Function} callback - Callback function
   * @returns {string} Listener ID for removal
   */
  addListener(executionId, callback) {
    const listenerId = this.generateListenerId();

    if (!this.listeners.has(executionId)) {
      this.listeners.set(executionId, new Map());
    }

    this.listeners.get(executionId).set(listenerId, callback);

    return listenerId;
  }

  /**
   * Remove event listener
   * @param {string} executionId - Execution identifier
   * @param {string} listenerId - Listener identifier
   */
  removeListener(executionId, listenerId) {
    const executionListeners = this.listeners.get(executionId);
    if (executionListeners) {
      executionListeners.delete(listenerId);
      if (executionListeners.size === 0) {
        this.listeners.delete(executionId);
      }
    }
  }

  /**
   * Notify listeners of workflow events
   * @param {string} executionId - Execution identifier
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   */
  notifyListeners(executionId, eventType, data) {
    // Notify specific execution listeners
    const executionListeners = this.listeners.get(executionId);
    if (executionListeners) {
      executionListeners.forEach(callback => {
        try {
          callback(eventType, data, executionId);
        } catch (error) {
          console.error('Error in workflow listener:', error);
        }
      });
    }

    // Notify global listeners
    const globalListeners = this.listeners.get('all');
    if (globalListeners) {
      globalListeners.forEach(callback => {
        try {
          callback(eventType, data, executionId);
        } catch (error) {
          console.error('Error in global workflow listener:', error);
        }
      });
    }
  }

  /**
   * Clean up old workflow data
   * @param {number} maxAge - Maximum age in milliseconds
   * @param {number} maxCount - Maximum number of workflows to keep
   */
  async cleanupWorkflows(maxAge = 7 * 24 * 60 * 60 * 1000, maxCount = 1000) {
    try {
      const cutoffTime = new Date(Date.now() - maxAge);

      // Get all workflows
      const allWorkflows = await this.queryWorkflows({});

      // Filter workflows to delete
      const workflowsToDelete = allWorkflows
        .filter(w => new Date(w.startTime) < cutoffTime)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      // Keep only the oldest ones if we exceed maxCount
      if (allWorkflows.length > maxCount) {
        const excessCount = allWorkflows.length - maxCount;
        const oldestWorkflows = allWorkflows
          .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
          .slice(0, excessCount);

        workflowsToDelete.push(...oldestWorkflows);
      }

      // Remove duplicates
      const uniqueWorkflowsToDelete = Array.from(
        new Set(workflowsToDelete.map(w => w.executionId))
      ).map(id => workflowsToDelete.find(w => w.executionId === id));

      // Delete workflows and their steps
      for (const workflow of uniqueWorkflowsToDelete) {
        await this.deleteWorkflow(workflow.executionId);
      }

      return {
        deletedCount: uniqueWorkflowsToDelete.length,
        remainingCount: allWorkflows.length - uniqueWorkflowsToDelete.length
      };

    } catch (error) {
      throw new Error(`Failed to cleanup workflows: ${error.message}`);
    }
  }

  /**
   * Delete a workflow and its steps
   * @param {string} executionId - Execution identifier
   */
  async deleteWorkflow(executionId) {
    try {
      // Delete workflow metadata
      await this.deleteFromStorage('workflows', executionId);

      // Delete workflow steps
      const steps = await this.getStepsFromStorage(executionId);
      for (const step of steps) {
        await this.deleteFromStorage('workflow_steps', step.id);
      }

    } catch (error) {
      throw new Error(`Failed to delete workflow ${executionId}: ${error.message}`);
    }
  }

  /**
   * Save data to IndexedDB
   * @param {string} storeName - Object store name
   * @param {Object} data - Data to save
   * @returns {Promise<void>}
   */
  async saveToStorage(storeName, data) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to save to ${storeName}`));
    });
  }

  /**
   * Get data from IndexedDB
   * @param {string} storeName - Object store name
   * @param {string} key - Key to retrieve
   * @returns {Promise<Object|null>}
   */
  async getFromStorage(storeName, key) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error(`Failed to get from ${storeName}`));
    });
  }

  /**
   * Delete data from IndexedDB
   * @param {string} storeName - Object store name
   * @param {string} key - Key to delete
   * @returns {Promise<void>}
   */
  async deleteFromStorage(storeName, key) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to delete from ${storeName}`));
    });
  }

  /**
   * Generate unique step ID
   * @returns {string} Step ID
   */
  generateStepId() {
    return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique listener ID
   * @returns {string} Listener ID
   */
  generateListenerId() {
    return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      activeWorkflows: this.activeWorkflows.size,
      totalListeners: Array.from(this.listeners.values()).reduce((sum, listeners) => sum + listeners.size, 0),
      databaseConnected: !!this.db
    };
  }
}

// Export singleton instance
export const workflowTrackingService = new WorkflowTrackingService();