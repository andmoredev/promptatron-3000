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
      // First try to load from localStorage as fallback
      const localStorageHistory = localStorage.getItem('bedrock-test-history');
      if (localStorageHistory) {
        const parsed = JSON.parse(localStorageHistory);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }

      // If no localStorage data, return empty array
      return [];
    } catch (error) {
      console.warn('Failed to load history from localStorage:', error);
      return [];
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
        throw new Error('Invalid test result structure');
      }

      // Add ID and timestamp if not present
      const enrichedResult = {
        id: testResult.id || this.generateId(),
        timestamp: testResult.timestamp || new Date().toISOString(),
        ...testResult
      };

      // Load existing history
      const history = await this.loadHistory();

      // Add new result to the beginning of the array (most recent first)
      history.unshift(enrichedResult);

      // Keep only the last 100 results to prevent excessive storage usage
      const trimmedHistory = history.slice(0, 100);

      // Save to localStorage
      localStorage.setItem('bedrock-test-history', JSON.stringify(trimmedHistory));

      return true;
    } catch (error) {
      console.error('Failed to save test result:', error);
      throw new Error(`Failed to save test result: ${error.message}`);
    }
  }

  /**
   * Clear all test history
   * @returns {Promise<boolean>} True if cleared successfully
   */
  async clearHistory() {
    try {
      localStorage.removeItem('bedrock-test-history');
      return true;
    } catch (error) {
      console.error('Failed to clear history:', error);
      throw new Error(`Failed to clear history: ${error.message}`);
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

      const dataStr = JSON.stringify(history, null, 2);
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
      const importedHistory = JSON.parse(text);

      if (!Array.isArray(importedHistory)) {
        throw new Error('Invalid history file format - expected an array');
      }

      // Validate each record
      const validRecords = importedHistory.filter(record => this.validateTestResult(record));

      if (validRecords.length === 0) {
        throw new Error('No valid test results found in the file');
      }

      // Load existing history
      const existingHistory = await this.loadHistory();

      // Merge histories, avoiding duplicates based on ID
      const existingIds = new Set(existingHistory.map(record => record.id));
      const newRecords = validRecords.filter(record => !existingIds.has(record.id));

      // Combine and sort by timestamp (most recent first)
      const mergedHistory = [...existingHistory, ...newRecords]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 100); // Keep only the last 100 records

      // Save merged history
      localStorage.setItem('bedrock-test-history', JSON.stringify(mergedHistory));

      return newRecords.length;
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

    // Required fields
    const requiredFields = ['modelId', 'prompt'];
    for (const field of requiredFields) {
      if (!testResult[field] || typeof testResult[field] !== 'string') {
        return false;
      }
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
   * @returns {Object} Storage status and usage information
   */
  getStorageInfo() {
    try {
      const historyData = localStorage.getItem('bedrock-test-history');
      const historySize = historyData ? new Blob([historyData]).size : 0;

      return {
        supported: this.isSupported,
        storageType: 'localStorage',
        historySize: historySize,
        historySizeFormatted: this.formatBytes(historySize),
        recordCount: historyData ? JSON.parse(historyData).length : 0
      };
    } catch (error) {
      return {
        supported: this.isSupported,
        storageType: 'localStorage',
        historySize: 0,
        historySizeFormatted: '0 B',
        recordCount: 0,
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