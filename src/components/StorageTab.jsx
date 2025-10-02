import React, { useState, useEffect } from 'react';
import { getStorageUsage, clearAllAppStorage, clearAllLocalStorage } from '../utils/formStateStorage';

/**
 * Storage Tab Component for Setti
 * Provides storage management within the settings interface
 */
const StorageTab = () => {
  const [storageInfo, setStorageInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadStorageInfo();
  }, []);

  const loadStorageInfo = () => {
    setIsLoading(true);
    try {
      const info = getStorageUsage();
      setStorageInfo(info);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearStorage = async () => {
    if (!confirm('This will clear all saved data including form state, history, and settings. Are you sure?')) {
      return;
    }

    try {
      console.log('Starting storage cleanup...');

      // Get storage info before clearing
      const beforeInfo = getStorageUsage();
      console.log('Storage before clearing:', beforeInfo);
      console.log('All localStorage keys before clearing:', Object.keys(localStorage));

      const clearedCount = clearAllAppStorage();
      console.log('clearAllAppStorage returned:', clearedCount);

      // Get storage info after clearing
      setTimeout(() => {
        const afterInfo = getStorageUsage();
        console.log('Storage after clearing:', afterInfo);
        console.log('All localStorage keys after clearing:', Object.keys(localStorage));

        const savedSpace = beforeInfo.totalSizeKB - afterInfo.totalSizeKB;

        if (clearedCount > 0 || savedSpace > 0) {
          alert(`Success! Cleared ${clearedCount} storage entries and freed ${savedSpace.toFixed(2)}KB of space. Please refresh the page to see the changes.`);
        } else {
          alert('No app-specific storage entries found to clear. You may need to manually clear browser data.');
        }

        loadStorageInfo();
      }, 100);

    } catch (error) {
      console.error('Storage clear error:', error);
      alert('Failed to clear storage: ' + error.message);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getUsageColor = (percentage) => {
    if (percentage < 50) return 'text-green-600';
    if (percentage < 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p>Loading storage information...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Browser Storage Management</h3>
        <p className="text-sm text-gray-600">
          Monitor and manage your browser's local storage usage. If you're experiencing save errors,
          your storage may be full and need cleanup.
        </p>
      </div>

      {storageInfo?.error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading storage information: {storageInfo.error}</p>
        </div>
      ) : (
        <>
          {/* Storage Overview */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3">Storage Overview</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-xl font-semibold text-gray-900">
                  {formatBytes(storageInfo?.totalSize || 0)}
                </div>
                <div className="text-xs text-gray-500">Total Used</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-gray-900">
                  {storageInfo?.itemCount || 0}
                </div>
                <div className="text-xs text-gray-500">Items</div>
              </div>
              <div className="text-center">
                <div className={`text-xl font-semibold ${getUsageColor(storageInfo?.estimatedQuotaUsage || 0)}`}>
                  {storageInfo?.estimatedQuotaUsage || 0}%
                </div>
                <div className="text-xs text-gray-500">Quota Used</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-gray-900">
                  ~5MB
                </div>
                <div className="text-xs text-gray-500">Quota Limit</div>
              </div>
            </div>

            {/* Usage Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                <span>Storage Usage</span>
                <span>{storageInfo?.estimatedQuotaUsage || 0}% of estimated quota</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    (storageInfo?.estimatedQuotaUsage || 0) < 50
                      ? 'bg-green-500'
                      : (storageInfo?.estimatedQuotaUsage || 0) < 80
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(storageInfo?.estimatedQuotaUsage || 0, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Warning if usage is high */}
          {(storageInfo?.estimatedQuotaUsage || 0) > 80 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">High Storage Usage</h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    Your browser storage is getting full. Consider clearing old data to prevent save errors.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Storage Items Details */}
          <div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center justify-between w-full text-left font-medium text-gray-900 mb-3 hover:text-primary-600"
            >
              <span>Storage Items Details</span>
              <svg
                className={`w-5 h-5 transform transition-transform ${showDetails ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showDetails && storageInfo?.items && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {Object.entries(storageInfo.items)
                    .sort(([,a], [,b]) => b.size - a.size)
                    .map(([key, info]) => (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {key.replace('promptatron_', '')}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{key}</div>
                        </div>
                        <div className="text-sm text-gray-600 ml-4">
                          {formatBytes(info.size)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <button
              onClick={loadStorageInfo}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>

            <button
              onClick={handleClearStorage}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear All Data
            </button>
          </div>

          {/* Help Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Storage Information</h3>
                <div className="mt-1 text-sm text-blue-700">
                  <ul className="list-disc list-inside space-y-1">
                    <li>Browser storage is limited to approximately 5-10MB per website</li>
                    <li>Large prompts and extensive history can consume storage quickly</li>
                    <li>If you see "QuotaExceededError" messages, clear old data to free up space</li>
                    <li>Clearing data will remove all saved settings, history, and form state</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default StorageTab;
