import { useState, useEffect, useCallback } from 'react';
import { fileService } from '../services/fileService.js';

/**
 * Custom React hook for managing test history
 * Provides state management and operations for test history
 */
export function useHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Load history from storage
   */
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const historyData = await fileService.loadHistory();
      setHistory(historyData);
    } catch (err) {
      setError(`Failed to load history: ${err.message}`);
      console.error('Error loading history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Save a new test result to history
   */
  const saveTestResult = useCallback(async (testResult) => {
    setError(null);

    try {
      await fileService.saveTestResult(testResult);
      // Reload history to get the updated list
      await loadHistory();
      return true;
    } catch (err) {
      setError(`Failed to save test result: ${err.message}`);
      console.error('Error saving test result:', err);
      return false;
    }
  }, [loadHistory]);

  /**
   * Clear all history
   */
  const clearHistory = useCallback(async () => {
    setError(null);

    try {
      await fileService.clearHistory();
      setHistory([]);
      return true;
    } catch (err) {
      setError(`Failed to clear history: ${err.message}`);
      console.error('Error clearing history:', err);
      return false;
    }
  }, []);

  /**
   * Export history to file
   */
  const exportHistory = useCallback(async () => {
    setError(null);

    try {
      await fileService.exportHistory();
      return true;
    } catch (err) {
      setError(`Failed to export history: ${err.message}`);
      console.error('Error exporting history:', err);
      return false;
    }
  }, []);

  /**
   * Import history from file
   */
  const importHistory = useCallback(async (file) => {
    setError(null);

    try {
      const importedCount = await fileService.importHistory(file);
      // Reload history to show imported data
      await loadHistory();
      return importedCount;
    } catch (err) {
      setError(`Failed to import history: ${err.message}`);
      console.error('Error importing history:', err);
      return 0;
    }
  }, [loadHistory]);

  /**
   * Get storage information
   */
  const getStorageInfo = useCallback(() => {
    return fileService.getStorageInfo();
  }, []);

  /**
   * Filter history by search term
   */
  const filterHistory = useCallback((searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
      return history;
    }

    const term = searchTerm.toLowerCase().trim();
    return history.filter(record => {
      return (
        record.modelId?.toLowerCase().includes(term) ||
        record.prompt?.toLowerCase().includes(term) ||
        record.datasetType?.toLowerCase().includes(term) ||
        record.datasetOption?.toLowerCase().includes(term) ||
        record.response?.toLowerCase().includes(term)
      );
    });
  }, [history]);

  /**
   * Get history filtered by date range
   */
  const getHistoryByDateRange = useCallback((startDate, endDate) => {
    return history.filter(record => {
      const recordDate = new Date(record.timestamp);
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();

      return recordDate >= start && recordDate <= end;
    });
  }, [history]);

  /**
   * Get history grouped by model
   */
  const getHistoryByModel = useCallback(() => {
    const grouped = {};

    history.forEach(record => {
      const modelId = record.modelId;
      if (!grouped[modelId]) {
        grouped[modelId] = [];
      }
      grouped[modelId].push(record);
    });

    return grouped;
  }, [history]);

  /**
   * Get history statistics
   */
  const getHistoryStats = useCallback(() => {
    if (history.length === 0) {
      return {
        totalTests: 0,
        uniqueModels: 0,
        uniqueDatasets: 0,
        dateRange: null
      };
    }

    const uniqueModels = new Set(history.map(record => record.modelId)).size;
    const uniqueDatasets = new Set(
      history
        .filter(record => record.datasetType)
        .map(record => `${record.datasetType}/${record.datasetOption}`)
    ).size;

    const timestamps = history
      .map(record => new Date(record.timestamp))
      .sort((a, b) => a - b);

    return {
      totalTests: history.length,
      uniqueModels,
      uniqueDatasets,
      dateRange: {
        earliest: timestamps[0],
        latest: timestamps[timestamps.length - 1]
      }
    };
  }, [history]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    // State
    history,
    loading,
    error,

    // Actions
    loadHistory,
    saveTestResult,
    clearHistory,
    exportHistory,
    importHistory,

    // Utilities
    getStorageInfo,
    filterHistory,
    getHistoryByDateRange,
    getHistoryByModel,
    getHistoryStats
  };
}