import { handleError } from '../utils/errorHandling.js';

/**
 * Service for persisting workflow data with efficient storage and retrieval
 * Handles large workflow datasets with IndexedDB and implements cleanup policies
 */
export class WorkflowDataPersistenceService {
  constructor() {
    this.isInitialized = false;
    this.dbName = 'WorkflowDataPersistenceDB';
    this.dbVersion = 1;
    this.db = null;
    this.maxWorkflowAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    this.maxWorkflowCount = 500; // Maximum number of workflows to keep
    this.cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.cleanupTimer = null;
  }

  /**
   * Initialize the service and IndexedDB storage
   */
  async initialize() {
    try {
      await this.initializeStorage();
      this.startCleanupTimer();
      this.isInitialized = true;
      return { success: true, message: 'Workflow data persistence service initialized' };
    } catch (error) {
      this.isInitialized = false;
      throw new Error(`Failed to initialize workflow data persistence service: ${error.message}`);
    }
  }

  /**
   * Initialize IndexedDB storage with optimized schema
   */
  async initializeStorage() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(new Error('Failed to open WorkflowDataPersistenceDB'));

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create workflow metadata store for efficient querying
        if (!db.objectStoreNames.contains('workflow_metadata')) {
          const metadataStore = db.createObjectStore('workflow_metadata', { keyPath: 'executionId' });
          metadataStore.createIndex('testId', 'testId', { unique: false });
          metadataStore.createIndex('status', 'status', { unique: false });
          metadataStore.createIndex('startTime', 'startTime', { unique: false });
          metadataStore.createIndex('modelId', 'modelId', { unique: false });
          metadataStore.createIndex('endTime', 'endTime', { unique: false });
        }

        // Create workflow data store for complete workflow information
        if (!db.objectStoreNames.contains('workflow_data')) {
          const dataStore = db.createObjectStore('workflow_data', { keyPath: 'executionId' });
          dataStore.createIndex('testId', 'testId', { unique: false });
          dataStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create workflow steps store for detailed step information
        if (!db.objectStoreNames.contains('workflow_steps_detailed')) {
          const stepsStore = db.createObjectStore('workflow_steps_detailed', { keyPath: 'id' });
          stepsStore.createIndex('executionId', 'executionId', { unique: false });
          stepsStore.createIndex('type', 'type', { unique: false });
          stepsStore.createIndex('timestamp', 'timestamp', { unique: false });
          stepsStore.createIndex('iteration', 'iteration', { unique: false });
          stepsStore.createIndex('status', 'status', { unique: false });
        }
      };
    });
  }

  /**
   * Store complete workflow data efficiently
   * @param {string} testId - Test ID associated with the workflow
   * @param {Object} workflowData - Complete workflow data from workflowTrackingService
   * @returns {Promise<boolean>} True if stored successfully
   */
  async storeWorkflowData(testId, workflowData) {
    if (!this.isInitialized) {
      throw new Error('Workflow data persistence service not initialized');
    }

    try {
      const timestamp = new Date().toISOString();

      // Store workflow metadata for efficient querying
      const metadata = {
        executionId: workflowData.executionId,
        testId: testId,
        status: workflowData.status,
        startTime: workflowData.startTime,
        endTime: workflowData.endTime,
        totalDuration: workflowData.totalDuration,
        currentIteration: workflowData.currentIteration,
        maxIterations: workflowData.maxIterations,
        modelId: workflowData.modelId,
        stepCount: workflowData.steps ? workflowData.steps.length : 0,
        timestamp: timestamp,
        dataSize: this.calculateDataSize(workflowData)
      };

      await this.saveToStore('workflow_metadata', metadata);

      // Store complete workflow data
      const completeData = {
        executionId: workflowData.executionId,
        testId: testId,
        timestamp: timestamp,
        workflow: workflowData,
        metadata: {
          storedAt: timestamp,
          version: '1.0',
          compressed: false // Future: implement compression for large workflows
        }
      };

      await this.saveToStore('workflow_data', completeData);

      // Store individual steps for detailed analysis
      if (workflowData.steps && workflowData.steps.length > 0) {
        for (const step of workflowData.steps) {
          const detailedStep = {
            ...step,
            testId: testId,
            storedAt: timestamp
          };
          await this.saveToStore('workflow_steps_detailed', detailedStep);
        }
      }

      return true;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'WorkflowDataPersistenceService',
        action: 'storeWorkflowData',
        testId,
        executionId: workflowData.executionId
      });
      console.error('Failed to store workflow data:', errorInfo.userMessage);
      return false;
    }
  }

  /**
   * Retrieve complete workflow data
   * @param {string} executionId - Execution ID
   * @returns {Promise<Object|null>} Complete workflow data or null if not found
   */
  async getWorkflowData(executionId) {
    if (!this.isInitialized) {
      throw new Error('Workflow data persistence service not initialized');
    }

    try {
      const workflowData = await this.getFromStore('workflow_data', executionId);
      return workflowData ? workflowData.workflow : null;
    } catch (error) {
      console.error('Failed to get workflow data:', error);
      return null;
    }
  }

  /**
   * Retrieve workflow data by test ID
   * @param {string} testId - Test ID
   * @returns {Promise<Object|null>} Workflow data or null if not found
   */
  async getWorkflowDataByTestId(testId) {
    if (!this.isInitialized) {
      throw new Error('Workflow data persistence service not initialized');
    }

    try {
      const workflowData = await this.queryStore('workflow_data', 'testId', testId);
      return workflowData.length > 0 ? workflowData[0].workflow : null;
    } catch (error) {
      console.error('Failed to get workflow data by test ID:', error);
      return null;
    }
  }

  /**
   * Get workflow metadata for efficient listing and filtering
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Array of workflow metadata
   */
  async getWorkflowMetadata(filters = {}) {
    if (!this.isInitialized) {
      throw new Error('Workflow data persistence service not initialized');
    }

    try {
      let metadata = await this.getAllFromStore('workflow_metadata');

      // Apply filters
      if (filters.status) {
        metadata = metadata.filter(m => m.status === filters.status);
      }

      if (filters.modelId) {
        metadata = metadata.filter(m => m.modelId === filters.modelId);
      }

      if (filters.testId) {
        metadata = metadata.filter(m => m.testId === filters.testId);
      }

      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        metadata = metadata.filter(m => new Date(m.startTime) >= startDate);
      }

      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        metadata = metadata.filter(m => new Date(m.startTime) <= endDate);
      }

      // Sort by start time (newest first)
      metadata.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

      // Apply pagination if specified
      if (filters.limit || filters.offset) {
        const start = filters.offset || 0;
        const end = start + (filters.limit || metadata.length);
        metadata = metadata.slice(start, end);
      }

      return metadata;
    } catch (error) {
      console.error('Failed to get workflow metadata:', error);
      return [];
    }
  }

  /**
   * Get workflow steps for detailed analysis
   * @param {string} executionId - Execution ID
   * @param {Object} filters - Step filters
   * @returns {Promise<Array>} Array of workflow steps
   */
  async getWorkflowSteps(executionId, filters = {}) {
    if (!this.isInitialized) {
      throw new Error('Workflow data persistence service not initialized');
    }

    try {
      let steps = await this.queryStore('workflow_steps_detailed', 'executionId', executionId);

      // Apply filters
      if (filters.type) {
        steps = steps.filter(s => s.type === filters.type);
      }

      if (filters.status) {
        steps = steps.filter(s => s.status === filters.status);
      }

      if (filters.iteration !== undefined) {
        steps = steps.filter(s => s.iteration === filters.iteration);
      }

      // Sort by timestamp
      steps.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      return steps;
    } catch (error) {
      console.error('Failed to get workflow steps:', error);
      return [];
    }
  }

  /**
   * Get workflow statistics
   * @param {Object} filters - Statistics filters
   * @returns {Promise<Object>} Workflow statistics
   */
  async getWorkflowStatistics(filters = {}) {
    if (!this.isInitialized) {
      throw new Error('Workflow data persistence service not initialized');
    }

    try {
      const metadata = await this.getWorkflowMetadata(filters);

      const stats = {
        totalWorkflows: metadata.length,
        statusBreakdown: {},
        modelBreakdown: {},
        averageDuration: 0,
        averageIterations: 0,
        averageStepCount: 0,
        totalDataSize: 0,
        dateRange: null
      };

      if (metadata.length > 0) {
        // Status breakdown
        metadata.forEach(m => {
          stats.statusBreakdown[m.status] = (stats.statusBreakdown[m.status] || 0) + 1;
        });

        // Model breakdown
        metadata.forEach(m => {
          if (m.modelId) {
            stats.modelBreakdown[m.modelId] = (stats.modelBreakdown[m.modelId] || 0) + 1;
          }
        });

        // Calculate averages
        const completedWorkflows = metadata.filter(m => m.totalDuration);
        if (completedWorkflows.length > 0) {
          stats.averageDuration = completedWorkflows.reduce((sum, m) => sum + m.totalDuration, 0) / completedWorkflows.length;
        }

        stats.averageIterations = metadata.reduce((sum, m) => sum + (m.currentIteration || 0), 0) / metadata.length;
        stats.averageStepCount = metadata.reduce((sum, m) => sum + (m.stepCount || 0), 0) / metadata.length;
        stats.totalDataSize = metadata.reduce((sum, m) => sum + (m.dataSize || 0), 0);

        // Date range
        const sortedByDate = metadata.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        stats.dateRange = {
          earliest: sortedByDate[0].startTime,
          latest: sortedByDate[sortedByDate.length - 1].startTime
        };
      }

      return stats;
    } catch (error) {
      console.error('Failed to get workflow statistics:', error);
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
   * Delete workflow data
   * @param {string} executionId - Execution ID
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteWorkflowData(executionId) {
    if (!this.isInitialized) {
      throw new Error('Workflow data persistence service not initialized');
    }

    try {
      // Delete from all stores
      await this.deleteFromStore('workflow_metadata', executionId);
      await this.deleteFromStore('workflow_data', executionId);

      // Delete associated steps
      const steps = await this.queryStore('workflow_steps_detailed', 'executionId', executionId);
      for (const step of steps) {
        await this.deleteFromStore('workflow_steps_detailed', step.id);
      }

      return true;
    } catch (error) {
      console.error('Failed to delete workflow data:', error);
      return false;
    }
  }

  /**
   * Clean up old workflow data based on retention policies
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupOldWorkflows() {
    if (!this.isInitialized) {
      throw new Error('Workflow data persistence service not initialized');
    }

    try {
      const cutoffTime = Date.now() - this.maxWorkflowAge;
      const allMetadata = await this.getAllFromStore('workflow_metadata');

      // Find workflows to delete based on age
      const workflowsToDeleteByAge = allMetadata.filter(m =>
        new Date(m.startTime).getTime() < cutoffTime
      );

      // Find workflows to delete based on count limit
      let workflowsToDeleteByCount = [];
      if (allMetadata.length > this.maxWorkflowCount) {
        const sortedByDate = allMetadata.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        const excessCount = allMetadata.length - this.maxWorkflowCount;
        workflowsToDeleteByCount = sortedByDate.slice(0, excessCount);
      }

      // Combine and deduplicate
      const allToDelete = new Map();
      [...workflowsToDeleteByAge, ...workflowsToDeleteByCount].forEach(m => {
        allToDelete.set(m.executionId, m);
      });

      // Delete workflows
      let deletedCount = 0;
      let failedCount = 0;

      for (const [executionId] of allToDelete) {
        const deleted = await this.deleteWorkflowData(executionId);
        if (deleted) {
          deletedCount++;
        } else {
          failedCount++;
        }
      }

      const results = {
        deletedCount,
        failedCount,
        remainingCount: allMetadata.length - deletedCount,
        deletedByAge: workflowsToDeleteByAge.length,
        deletedByCount: workflowsToDeleteByCount.length
      };

      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old workflows, ${results.remainingCount} remaining`);
      }

      return results;
    } catch (error) {
      console.error('Failed to cleanup old workflows:', error);
      return {
        deletedCount: 0,
        failedCount: 0,
        remainingCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Start automatic cleanup timer
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupOldWorkflows();
      } catch (error) {
        console.error('Automatic cleanup failed:', error);
      }
    }, this.cleanupInterval);
  }

  /**
   * Stop automatic cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Calculate approximate data size for storage tracking
   * @param {Object} data - Data to measure
   * @returns {number} Approximate size in bytes
   */
  calculateDataSize(data) {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Save data to IndexedDB store
   * @param {string} storeName - Store name
   * @param {Object} data - Data to save
   * @returns {Promise<void>}
   */
  async saveToStore(storeName, data) {
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
   * Get data from IndexedDB store
   * @param {string} storeName - Store name
   * @param {string} key - Key to retrieve
   * @returns {Promise<Object|null>}
   */
  async getFromStore(storeName, key) {
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
   * Get all data from IndexedDB store
   * @param {string} storeName - Store name
   * @returns {Promise<Array>}
   */
  async getAllFromStore(storeName) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error(`Failed to get all from ${storeName}`));
    });
  }

  /**
   * Query data from IndexedDB store using index
   * @param {string} storeName - Store name
   * @param {string} indexName - Index name
   * @param {string} value - Value to query
   * @returns {Promise<Array>}
   */
  async queryStore(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error(`Failed to query ${storeName} by ${indexName}`));
    });
  }

  /**
   * Delete data from IndexedDB store
   * @param {string} storeName - Store name
   * @param {string} key - Key to delete
   * @returns {Promise<void>}
   */
  async deleteFromStore(storeName, key) {
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
   * Get service status and storage information
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      databaseConnected: !!this.db,
      maxWorkflowAge: this.maxWorkflowAge,
      maxWorkflowCount: this.maxWorkflowCount,
      cleanupInterval: this.cleanupInterval,
      cleanupTimerActive: !!this.cleanupTimer
    };
  }

  /**
   * Destroy the service and cleanup resources
   */
  destroy() {
    try {
      this.stopCleanupTimer();

      if (this.db) {
        this.db.close();
        this.db = null;
      }

      this.isInitialized = false;
    } catch (error) {
      console.error('Error during service destruction:', error);
    }
  }
}

// Export singleton instance
export const workflowDataPersistenceService = new WorkflowDataPersistenceService();