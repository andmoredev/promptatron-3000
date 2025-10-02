import { useState, useEffect, useCallback } from 'react';
import { notificationManager } from '../utils/notificationManager';

/**
 * Cuom hook for managing notifications in React components
 * Provides easy access to notification system with React integration
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Subscribe to notification manager updates
    const unsubscribe = notificationManager.addListener((updatedNotifications) => {
      setNotifications(updatedNotifications);
    });

    // Get initial notifications
    const initialNotifications = notificationManager.getNotifications();
    setNotifications(initialNotifications);

    return unsubscribe;
  }, []);

  // Convenience methods for adding different types of notifications
  const addNotification = useCallback((notification) => {
    return notificationManager.addNotification(notification);
  }, []);

  const removeNotification = useCallback((id) => {
    notificationManager.removeNotification(id);
  }, []);

  const clearAll = useCallback(() => {
    notificationManager.clearAll();
  }, []);

  const clearByCategory = useCallback((category) => {
    notificationManager.clearByCategory(category);
  }, []);

  // Convenience methods for specific notification types
  const notifyError = useCallback((message, options = {}) => {
    return addNotification({
      type: 'error',
      message,
      dismissible: true,
      ...options
    });
  }, [addNotification]);

  const notifyWarning = useCallback((message, options = {}) => {
    return addNotification({
      type: 'warning',
      message,
      dismissible: true,
      ...options
    });
  }, [addNotification]);

  const notifyInfo = useCallback((message, options = {}) => {
    return addNotification({
      type: 'info',
      message,
      dismissible: true,
      autoHide: 5000,
      ...options
    });
  }, [addNotification]);

  const notifySuccess = useCallback((message, options = {}) => {
    return addNotification({
      type: 'success',
      message,
      dismissible: true,
      autoHide: 3000,
      ...options
    });
  }, [addNotification]);

  // Service-specific notification methods
  const notifyTokenEstimationIssue = useCallback((error, fallbackResult) => {
    return notificationManager.notifyTokenEstimationError(error, fallbackResult);
  }, []);

  const notifyCostCalculationIssue = useCallback((error, fallbackResult) => {
    return notificationManager.notifyCostCalculationError(error, fallbackResult);
  }, []);

  const notifyServiceInitializationIssue = useCallback((serviceName, error, recoveryPlan) => {
    return notificationManager.notifyServiceInitializationError(serviceName, error, recoveryPlan);
  }, []);

  const notifyPerformanceIssue = useCallback((serviceName, performanceIssues) => {
    return notificationManager.notifyPerformanceDegradation(serviceName, performanceIssues);
  }, []);

  const notifyPricingDataIssue = useCallback((pricingIssue) => {
    return notificationManager.notifyPricingDataIssue(pricingIssue);
  }, []);

  return {
    // State
    notifications,
    hasNotifications: notifications.length > 0,
    notificationCount: notifications.length,

    // Basic operations
    addNotification,
    removeNotification,
    clearAll,
    clearByCategory,

    // Convenience methods
    notifyError,
    notifyWarning,
    notifyInfo,
    notifySuccess,

    // Service-specific methods
    notifyTokenEstimationIssue,
    notifyCostCalculationIssue,
    notifyServiceInitializationIssue,
    notifyPerformanceIssue,
    notifyPricingDataIssue,

    // Utility methods
    getNotificationsByCategory: notificationManager.getNotificationsByCategory.bind(notificationManager),
    getStatistics: notificationManager.getStatistics.bind(notificationManager)
  };
}

/**
 * Hook for managing a single notification with automatic cleanup
 * Useful for component-specific notifications that should be removed when component unmounts
 */
export function useNotification(notification, dependencies = []) {
  const [notificationId, setNotificationId] = useState(null);

  useEffect(() => {
    if (notification) {
      const id = notificationManager.addNotification(notification);
      setNotificationId(id);

      return () => {
        if (id) {
          notificationManager.removeNotification(id);
        }
      };
    }
  }, dependencies);

  const dismiss = useCallback(() => {
    if (notificationId) {
      notificationManager.removeNotification(notificationId);
      setNotificationId(null);
    }
  }, [notificationId]);

  return {
    notificationId,
    dismiss,
    isActive: !!notificationId
  };
}

/**
 * Hook for handling notification actions with custom handlers
 * Provides a way to handle notification actions in components
 */
export function useNotificationActions() {
  const handleAction = useCallback((notification, action) => {
    // Emit custom events for different action types
    const eventDetail = { notification, action };

    switch (action.action) {
      case 'refresh':
        window.location.reload();
        break;

      case 'clear_cache':
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
        break;

      case 'retry':
        window.dispatchEvent(new CustomEvent('notification-retry', { detail: eventDetail }));
        break;

      case 'disable_costs':
        window.dispatchEvent(new CustomEvent('disable-cost-display', { detail: eventDetail }));
        break;

      case 'change_model':
        window.dispatchEvent(new CustomEvent('suggest-model-change', { detail: eventDetail }));
        break;

      case 'external_link':
        if (action.url) {
          window.open(action.url, '_blank', 'noopener,noreferrer');
        }
        break;

      case 'optimize_memory':
        window.dispatchEvent(new CustomEvent('show-memory-tips', { detail: eventDetail }));
        break;

      default:
        window.dispatchEvent(new CustomEvent('notification-action', { detail: eventDetail }));
        break;
    }
  }, []);

  // Set up event listeners for notification actions
  useEffect(() => {
    const handleRetry = (event) => {
      console.log('Retry action requested:', event.detail);
      // Components can listen for this event to handle retries
    };

    const handleDisableCosts = (event) => {
      console.log('Disable costs requested:', event.detail);
      // Components can listen for this event to disable cost display
    };

    const handleModelChange = (event) => {
      console.log('Model change suggested:', event.detail);
      // Components can listen for this event to suggest model changes
    };

    const handleMemoryTips = (event) => {
      console.log('Memory optimization tips requested:', event.detail);
      // Components can listen for this event to show memory tips
    };

    window.addEventListener('notification-retry', handleRetry);
    window.addEventListener('disable-cost-display', handleDisableCosts);
    window.addEventListener('suggest-model-change', handleModelChange);
    window.addEventListener('show-memory-tips', handleMemoryTips);

    return () => {
      window.removeEventListener('notification-retry', handleRetry);
      window.removeEventListener('disable-cost-display', handleDisableCosts);
      window.removeEventListener('suggest-model-change', handleModelChange);
      window.removeEventListener('show-memory-tips', handleMemoryTips);
    };
  }, []);

  return {
    handleAction
  };
}

export default useNotifications;
