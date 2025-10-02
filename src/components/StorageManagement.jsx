import React, { useState, useEffect } from 'react';
import { getStorageUsage, clearAllAppStorage } from '../utils/formStateStorage';

/**
 * Storage Management Component
 * Allows users to monitor and manage localStorage usage
 */
const StorageManagement = ({ onClose }) => {
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
      const clearedCount = clearAllAppStorage();
      alert(`Cleared ${clearedCount} storage entries. Please refresh the page.`);
      loadStorageInfo();
    } catch (error) {
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Loading storage information...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Storage Management</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {storageInfo?.error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">Error loading storage information: {storageInfo.error}</p>
          </div>
        ) : (
          <>
            {/* Storage Overview */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-gray-900 mb-3">Storage Overview</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-semibold text-gray-900">
                    {formatBytes(storageInfo?.totalSize || 0)}
                  </div>
                  <div className="text-sm text-gray-500">Total Used</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-gray-900">
                    {storageInfo?.itemCount || 0}
                  </div>
                  <div className="text-sm text-gray-500">Items</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-semibold ${getUsageColor(storageInfo?.estimatedQuotaUsage || 0)}`}>
                    {storageInfo?.estimatedQuotaUsage || 0}%
                  </div>
                  <div className="text-sm text-gray-500">Quota Used</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-gray-900">
                    ~5MB
                  </div>
                  <div className="text-sm text-gray-500">Quota Limit</div>
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
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
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
            <div className="mb-6">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center justify-between w-full text-left font-medium text-gray-900 mb-3"
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
                  <div className="space-y-2">
                    {Object.entries(storageInfo.items)
                      .sort(([,a], [,b]) => b.size - a.size)
                      .map(([key, info]) => (
                        <div key={key} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {key.replace('promptatron_', '')}
                            </div>
                            <div className="text-xs text-gray-500">{key}</div>
                          </div>
                          <div className="text-sm text-gray-600">
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
          </>
        )}
      </div>
    </div>
  );
};

export default StorageManagement;
