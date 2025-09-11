/**
 * Service for storing determinism evaluation results using IndexedDB
 * Handles persistence of evaluation data and integration with test history
 */

/**
 * IndexedDB database configuration
 */
const DB_NAME = 'DeterminismEvaluationDB';
const DB_VERSION = 1;
const STORE_NAME = 'evaluations';

/**
 * DeterminismStorageService class for managing evaluation data persistence
 */
export class DeterminismStorageService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize IndexedDB database
   * @returns {Promise<boolean>} True if initialized successfully
   */
  async initialize() {
    if (this.isInitialized && this.db) {
      return true;
    }

    try {
      // Check if IndexedDB is supported
      if (!('indexedDB' in window)) {
        console.warn('IndexedDB not supported, falling back to localStorage');
        return false;
      }

      this.db = await this.openDatabase();
      this.isInitialized = true;
      return true;

    } catch (error) {
      console.error('Failed to initialize determinism storage:', error);
      return false;
    }
  }

  /**
   * Open IndexedDB database with proper schema
   * @returns {Promise<IDBDatabase>} Database instance
   */
  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create evaluations store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'evaluationId' });

          // Create indexes for efficient querying
          store.createIndex('testId', 'testId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('modelId', 'modelId', { unique: false });
          store.createIndex('grade', 'grade.grade', { unique: false });
        }
      };
    });
  }

  /**
   * Save evaluation result to IndexedDB
   * @param {Object} evaluationResult - Complete evaluation result
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveEvaluationResult(evaluationResult) {
    try {
      if (!await this.initialize()) {
        // Fallback to localStorage if IndexedDB not available
        return this.saveToLocalStorage(evaluationResult);
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      // Prepare evaluation data for storage
      const evaluationData = {
        evaluationId: evaluationResult.evaluationId,
        testId: evaluationResult.testId,
        timestamp: evaluationResult.timestamp || Date.now(),
        modelId: evaluationResult.modelId,
        grade: evaluationResult.grade,
        responses: evaluationResult.responses || [],
        metadata: {
          evaluationDuration: evaluationResult.evaluationDuration,
          concurrencyUsed: evaluationResult.concurrencyUsed,
          throttleEvents: evaluationResult.throttleEvents || 0,
          graderModel: evaluationResult.grade?.graderModel,
          fallbackAnalysis: evaluationResult.grade?.fallbackAnalysis || false
        },
        config: {
          modelId: evaluationResult.modelId,
          systemPrompt: evaluationResult.systemPrompt,
          userPrompt: evaluationResult.userPrompt,
          datasetType: evaluationResult.datasetType,
          datasetOption: evaluationResult.datasetOption
        }
      };

      await new Promise((resolve, reject) => {
        const request = store.put(evaluationData);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to save evaluation: ${request.error?.message}`));
      });

      console.log('Evaluation result saved to IndexedDB:', evaluationResult.evaluationId);
      return true;

    } catch (error) {
      console.error('Failed to save evaluation result:', error);
      // Fallback to localStorage
      return this.saveToLocalStorage(evaluationResult);
    }
  }

  /**
   * Get evaluation result by evaluation ID
   * @param {string} evaluationId - Evaluation ID to retrieve
   * @returns {Promise<Object|null>} Evaluation result or null if not found
   */
  async getEvaluationResult(evaluationId) {
    try {
      if (!await this.initialize()) {
        return this.getFromLocalStorage(evaluationId);
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(evaluationId);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          reject(new Error(`Failed to get evaluation: ${request.error?.message}`));
        };
      });

    } catch (error) {
      console.error('Failed to get evaluation result:', error);
      return this.getFromLocalStorage(evaluationId);
    }
  }

  /**
   * Get evaluation result by test ID
   * @param {string} testId - Test ID to find evaluation for
   * @returns {Promise<Object|null>} Evaluation result or null if not found
   */
  async getEvaluationByTestId(testId) {
    try {
      if (!await this.initialize()) {
        return this.getFromLocalStorageByTestId(testId);
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('testId');

      return new Promise((resolve, reject) => {
        const request = index.get(testId);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          reject(new Error(`Failed to get evaluation by test ID: ${request.error?.message}`));
        };
      });

    } catch (error) {
      console.error('Failed to get evaluation by test ID:', error);
      return this.getFromLocalStorageByTestId(testId);
    }
  }

  /**
   * Get all evaluation results with optional filtering
   * @param {Object} filters - Optional filters (modelId, grade, dateRange)
   * @returns {Promise<Array>} Array of evaluation results
   */
  async getAllEvaluations(filters = {}) {
    try {
      if (!await this.initialize()) {
        return this.getAllFromLocalStorage(filters);
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const evaluations = await new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result || []);
        };

        request.onerror = () => {
          reject(new Error(`Failed to get all evaluations: ${request.error?.message}`));
        };
      });

      // Apply filters
      return this.applyFilters(evaluations, filters);

    } catch (error) {
      console.error('Failed to get all evaluations:', error);
      return this.getAllFromLocalStorage(filters);
    }
  }

  /**
   * Delete evaluation result
   * @param {string} evaluationId - Evaluation ID to delete
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteEvaluation(evaluationId) {
    try {
      if (!await this.initialize()) {
        return this.deleteFromLocalStorage(evaluationId);
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      await new Promise((resolve, reject) => {
        const request = store.delete(evaluationId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to delete evaluation: ${request.error?.message}`));
      });

      return true;

    } catch (error) {
      console.error('Failed to delete evaluation:', error);
      return this.deleteFromLocalStorage(evaluationId);
    }
  }

  /**
   * Clear all evaluation results
   * @returns {Promise<boolean>} True if cleared successfully
   */
  async clearAllEvaluations() {
    try {
      if (!await this.initialize()) {
        return this.clearLocalStorage();
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to clear evaluations: ${request.error?.message}`));
      });

      return true;

    } catch (error) {
      console.error('Failed to clear evaluations:', error);
      return this.clearLocalStorage();
    }
  }

  /**
   * Apply filters to evaluation results
   * @param {Array} evaluations - Array of evaluations to filter
   * @param {Object} filters - Filter criteria
   * @returns {Array} Filtered evaluations
   */
  applyFilters(evaluations, filters) {
    let filtered = [...evaluations];

    if (filters.modelId) {
      filtered = filtered.filter(evaluation => evaluation.modelId === filters.modelId);
    }

    if (filters.grade) {
      filtered = filtered.filter(evaluation => evaluation.grade?.grade === filters.grade);
    }

    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      filtered = filtered.filter(evaluation => {
        const evaluationDate = new Date(evaluation.timestamp);
        return (!start || evaluationDate >= start) && (!end || evaluationDate <= end);
      });
    }

    // Sort by timestamp (most recent first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    return filtered;
  }

  // LocalStorage fallback methods

  /**
   * Save evaluation to localStorage as fallback
   * @param {Object} evaluationResult - Evaluation result to save
   * @returns {boolean} True if saved successfully
   */
  saveToLocalStorage(evaluationResult) {
    try {
      const key = `determinism_eval_${evaluationResult.evaluationId}`;
      const data = JSON.stringify(evaluationResult);
      localStorage.setItem(key, data);

      // Also maintain an index of evaluation IDs
      this.updateLocalStorageIndex(evaluationResult.evaluationId, 'add');

      return true;
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
      return false;
    }
  }

  /**
   * Get evaluation from localStorage
   * @param {string} evaluationId - Evaluation ID
   * @returns {Object|null} Evaluation result or null
   */
  getFromLocalStorage(evaluationId) {
    try {
      const key = `determinism_eval_${evaluationId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get from localStorage:', error);
      return null;
    }
  }

  /**
   * Get evaluation from localStorage by test ID
   * @param {string} testId - Test ID
   * @returns {Object|null} Evaluation result or null
   */
  getFromLocalStorageByTestId(testId) {
    try {
      const evaluationIds = this.getLocalStorageIndex();

      for (const evaluationId of evaluationIds) {
        const evaluationData = this.getFromLocalStorage(evaluationId);
        if (evaluationData && evaluationData.testId === testId) {
          return evaluationData;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to get from localStorage by test ID:', error);
      return null;
    }
  }

  /**
   * Get all evaluations from localStorage
   * @param {Object} filters - Filter criteria
   * @returns {Array} Array of evaluations
   */
  getAllFromLocalStorage(filters = {}) {
    try {
      const evaluationIds = this.getLocalStorageIndex();
      const evaluations = [];

      for (const evaluationId of evaluationIds) {
        const evaluationData = this.getFromLocalStorage(evaluationId);
        if (evaluationData) {
          evaluations.push(evaluationData);
        }
      }

      return this.applyFilters(evaluations, filters);
    } catch (error) {
      console.error('Failed to get all from localStorage:', error);
      return [];
    }
  }

  /**
   * Delete evaluation from localStorage
   * @param {string} evaluationId - Evaluation ID
   * @returns {boolean} True if deleted successfully
   */
  deleteFromLocalStorage(evaluationId) {
    try {
      const key = `determinism_eval_${evaluationId}`;
      localStorage.removeItem(key);
      this.updateLocalStorageIndex(evaluationId, 'remove');
      return true;
    } catch (error) {
      console.error('Failed to delete from localStorage:', error);
      return false;
    }
  }

  /**
   * Clear all evaluations from localStorage
   * @returns {boolean} True if cleared successfully
   */
  clearLocalStorage() {
    try {
      const evaluationIds = this.getLocalStorageIndex();

      for (const evaluationId of evaluationIds) {
        const key = `determinism_eval_${evaluationId}`;
        localStorage.removeItem(key);
      }

      localStorage.removeItem('determinism_eval_index');
      return true;
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
      return false;
    }
  }

  /**
   * Get localStorage index of evaluation IDs
   * @returns {Array} Array of evaluation IDs
   */
  getLocalStorageIndex() {
    try {
      const index = localStorage.getItem('determinism_eval_index');
      return index ? JSON.parse(index) : [];
    } catch (error) {
      console.error('Failed to get localStorage index:', error);
      return [];
    }
  }

  /**
   * Update localStorage index
   * @param {string} evaluationId - Evaluation ID
   * @param {string} operation - 'add' or 'remove'
   */
  updateLocalStorageIndex(evaluationId, operation) {
    try {
      let index = this.getLocalStorageIndex();

      if (operation === 'add' && !index.includes(evaluationId)) {
        index.push(evaluationId);
      } else if (operation === 'remove') {
        index = index.filter(id => id !== evaluationId);
      }

      localStorage.setItem('determinism_eval_index', JSON.stringify(index));
    } catch (error) {
      console.error('Failed to update localStorage index:', error);
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage usage information
   */
  async getStorageInfo() {
    try {
      const evaluations = await this.getAllEvaluations();
      const totalEvaluations = evaluations.length;

      let totalSize = 0;
      if (this.isInitialized) {
        // For IndexedDB, estimate size based on data
        totalSize = evaluations.reduce((size, evaluation) => {
          return size + JSON.stringify(evaluation).length;
        }, 0);
      } else {
        // For localStorage, calculate actual size
        const evaluationIds = this.getLocalStorageIndex();
        totalSize = evaluationIds.reduce((size, id) => {
          const key = `determinism_eval_${id}`;
          const data = localStorage.getItem(key);
          return size + (data ? data.length : 0);
        }, 0);
      }

      return {
        storageType: this.isInitialized ? 'IndexedDB' : 'localStorage',
        totalEvaluations,
        totalSize,
        totalSizeFormatted: this.formatBytes(totalSize),
        isSupported: this.isInitialized || ('localStorage' in window)
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return {
        storageType: 'unknown',
        totalEvaluations: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        isSupported: false,
        error: error.message
      };
    }
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Check if IndexedDB is supported and available
   * @returns {boolean} True if IndexedDB is supported
   */
  static isIndexedDBSupported() {
    return 'indexedDB' in window;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.isInitialized = false;
  }
}

// Export singleton instance
export const determinismStorageService = new DeterminismStorageService();
