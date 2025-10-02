/**
 * Storage monitoring utility
 * Monitors localStorage usage and provides warnings when quota is exceeded
 */

import { getStorageUsage } from './formStateStorage.js';
import { notificationManager } from './notificationManager.js';

/**
 * Storage monitor class
 */
class StorageMonitor {
  constructor() {
    this.lastCheckTime = 0;
    this.checkInterval = 30000; // Check every 30 seconds
    this.warningThreshold = 80; // Warn at 80% usage
    this.criticalThreshold = 95; // Critical at 95% usage
    this.hasShownWarning = false;
    this.hasShownCritical = false;
  }

  /**
   * Check storage usage and show notifications if needed
   */
  checkStorageUsage() {
    const now = Date.now();

    // Don't check too frequently
    if (now - this.lastCheckTime < this.checkInterval) {
      return;
    }

    this.lastCheckTime = now;

    try {
      const storageInfo = getStorageUsage();
      const usagePercent = storageInfo.estimatedQuotaUsage || 0;

      if (usagePercent >= this.criticalThreshold && !this.hasShownCritical) {
        this.showCriticalWarning(storageInfo);
        this.hasShownCritical = true;
        this.hasShownWarning = true; // Also mark warning as shown
      } else if (usagePercent >= this.warningThreshold && !this.hasShownWarning) {
        this.showWarning(storageInfo);
        this.hasShownWarning = true;
      }

      // Reset flags if usage drops significantly
      if (usagePercent < this.warningThreshold - 10) {
        this.hasShownWarning = false;
        this.hasShownCritical = false;
      }

    } catch (error) {
      console.warn('Failed to check storage usage:', error);
    }
  }

  /**
   * Show storage warning notification
   * @param {Object} storageInfo - Storage usage information
   */
  showWarning(storageInfo) {
    notificationManager.show({
      type: 'warning',
      category: 'storage',
      title: 'Storage Usage High',
      message: `Your browser storage is ${storageInfo.estimatedQuotaUsage}% full (${storageInfo.totalSizeKB}KB used). Consider clearing old data to prevent save errors.`,
      actions: [
        {
          label: 'Open Storage Settings',
          action: 'open_storage_settings'
        },
        {
          label: 'Dismiss',
          action: 'dismiss'
        }
      ],
      autoHide: false,
      priority: 'medium'
    });
  }

  /**
   * Show critical storage warning
   * @param {Object} storageInfo - Storage usage information
   */
  showCriticalWarning(storageInfo) {
    notificationManager.show({
      type: 'error',
      category: 'storage',
      title: 'Storage Almost Full',
      message: `Critical: Your browser storage is ${storageInfo.estimatedQuotaUsage}% full! Save operations may fail. Clear data immediately.`,
      actions: [
        {
          label: 'Clear Data Now',
          action: 'clear_storage_now'
        },
        {
          label: 'Open Storage Settings',
          action: 'open_storage_settings'
        }
      ],
      autoHide: false,
      priority: 'high'
    });
  }

  /**
   * Handle quota exceeded errors
   * @param {Error} error - The quota exceeded error
   */
  handleQuotaExceededError(error) {
    console.error('Storage quota exceeded:', error);

    notificationManager.show({
      type: 'error',
      category: 'storage',
      title: 'Storage Full - Save Failed',
      message: 'Your browser storage is full and data could not be saved. Clear old data to continue.',
      actions: [
        {
          label: 'Clear Data Now',
          action: 'clear_storage_now'
        },
        {
          label: 'Open Storage Settings',
          action: 'open_storage_settings'
        }
      ],
      autoHide: false,
      priority: 'critical'
    });
  }

  /**
   * Start monitoring storage usage
   */
  startMonitoring() {
    // Initial check
    this.checkStorageUsage();

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.checkStorageUsage();
    }, this.checkInterval);

    // Monitor for storage events
    window.addEventListener('storage', () => {
      // Reset check time to trigger immediate check
      this.lastCheckTime = 0;
      this.checkStorageUsage();
    });
  }

  /**
   * Stop monitoring storage usage
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Reset warning flags (useful after cleanup)
   */
  resetWarnings() {
    this.hasShownWarning = false;
    this.hasShownCritical = false;
    this.lastCheckTime = 0; // Force immediate recheck
  }

  /**
   * Get current storage status
   * @returns {Object} Storage status information
   */
  getStatus() {
    try {
      const storageInfo = getStorageUsage();
      const usagePercent = storageInfo.estimatedQuotaUsage || 0;

      return {
        usagePercent,
        status: usagePercent >= this.criticalThreshold ? 'critical' :
                usagePercent >= this.warningThreshold ? 'warning' : 'ok',
        totalSize: storageInfo.totalSize,
        totalSizeKB: storageInfo.totalSizeKB,
        itemCount: storageInfo.itemCount,
        hasShownWarning: this.hasShownWarning,
        hasShownCritical: this.hasShownCritical
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const storageMonitor = new StorageMonitor();

/**
 * Enhanced save form state function with storage monitoring
 * @param {Function} originalSaveFunction - Original save function
 * @returns {Function} Enhanced save function
 */
export const withStorageMonitoring = (originalSaveFunction) => {
  return (...args) => {
    try {
      const result = originalSaveFunction(...args);

      // Check storage after successful save
      storageMonitor.checkStorageUsage();

      return result;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        storageMonitor.handleQuotaExceededError(error);
      }
      throw error;
    }
  };
};
