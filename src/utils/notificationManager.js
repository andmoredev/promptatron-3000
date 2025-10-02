/**
 * Notification Manager
 * Centralized system for managing user notifications with queue, deduplication, and priority handling
 */

/**
 * Notification priorities
 */
export const NotificationPriority = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

/**
 * Notification categs for grouping and deduplication
 */
export const NotificationCategory = {
  TOKEN_ESTIMATION: 'token_estimation',
  COST_CALCULATION: 'cost_calculation',
  SERVICE_INITIALIZATION: 'service_initialization',
  PERFORMANCE: 'performance',
  PRICING_DATA: 'pricing_data',
  GENERAL: 'general'
};

/**
 * NotificationManager class for centralized notification handling
 */
export class NotificationManager {
  constructor() {
    this.notifications = new Map(); // Active notifications by ID
    this.queue = []; // Notification queue for display
    this.listeners = new Set(); // UI components listening for notifications
    this.maxNotifications = 5; // Maximum concurrent notifications
    this.deduplicationWindow = 30000; // 30 seconds for deduplication
    this.recentNotifications = new Map(); // For deduplication tracking
  }

  /**
   * Add a notification to the system
   * @param {Object} notification - Notification object
   * @returns {string} - Notification ID
   */
  addNotification(notification) {
    // Generate unique ID
    const id = this.generateNotificationId();

    // Enhance notification with metadata
    const enhancedNotification = {
      id,
      timestamp: Date.now(),
      priority: notification.priority || NotificationPriority.MEDIUM,
      category: notification.category || NotificationCategory.GENERAL,
      ...notification
    };

    // Check for duplicates
    if (this.isDuplicate(enhancedNotification)) {
      console.log('Duplicate notification suppressed:', enhancedNotification.message);
      return null;
    }

    // Add to active notifications
    this.notifications.set(id, enhancedNotification);

    // Add to queue for display
    this.addToQueue(enhancedNotification);

    // Track for deduplication
    this.trackForDeduplication(enhancedNotification);

    // Notify listeners
    this.notifyListeners();

    // Auto-remove if specified
    if (enhancedNotification.autoHide && typeof enhancedNotification.autoHide === 'number') {
      setTimeout(() => {
        this.removeNotification(id);
      }, enhancedNotification.autoHide);
    }

    return id;
  }

  /**
   * Remove a notification
   * @param {string} id - Notification ID
   */
  removeNotification(id) {
    if (this.notifications.has(id)) {
      this.notifications.delete(id);
      this.queue = this.queue.filter(n => n.id !== id);
      this.notifyListeners();
    }
  }

  /**
   * Clear all notifications
   */
  clearAll() {
    this.notifications.clear();
    this.queue = [];
    this.notifyListeners();
  }

  /**
   * Clear notifications by category
   * @param {string} category - Notification category
   */
  clearByCategory(category) {
    const toRemove = [];

    for (const [id, notification] of this.notifications.entries()) {
      if (notification.category === category) {
        toRemove.push(id);
      }
    }

    toRemove.forEach(id => this.removeNotification(id));
  }

  /**
   * Get all active notifications
   * @returns {Array} - Array of notifications
   */
  getNotifications() {
    return Array.from(this.queue);
  }

  /**
   * Get notifications by category
   * @param {string} category - Notification category
   * @returns {Array} - Filtered notifications
   */
  getNotificationsByCategory(category) {
    return this.queue.filter(n => n.category === category);
  }

  /**
   * Add a listener for notification changes
   * @param {Function} listener - Listener function
   * @returns {Function} - Unsubscribe function
   */
  addListener(listener) {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Check if a notification is a duplicate
   * @param {Object} notification - Notification to check
   * @returns {boolean} - True if duplicate
   * @private
   */
  isDuplicate(notification) {
    const key = this.getDeduplicationKey(notification);
    const recent = this.recentNotifications.get(key);

    if (!recent) return false;

    const timeDiff = notification.timestamp - recent.timestamp;
    return timeDiff < this.deduplicationWindow;
  }

  /**
   * Generate deduplication key for a notification
   * @param {Object} notification - Notification object
   * @returns {string} - Deduplication key
   * @private
   */
  getDeduplicationKey(notification) {
    // Create key based on category, type, and core message
    const messageHash = this.simpleHash(notification.message || '');
    return `${notification.category}_${notification.type}_${messageHash}`;
  }

  /**
   * Track notification for deduplication
   * @param {Object} notification - Notification to track
   * @private
   */
  trackForDeduplication(notification) {
    const key = this.getDeduplicationKey(notification);
    this.recentNotifications.set(key, {
      timestamp: notification.timestamp,
      id: notification.id
    });

    // Clean up old entries
    this.cleanupDeduplicationTracking();
  }

  /**
   * Clean up old deduplication tracking entries
   * @private
   */
  cleanupDeduplicationTracking() {
    const now = Date.now();
    const cutoff = now - this.deduplicationWindow;

    for (const [key, entry] of this.recentNotifications.entries()) {
      if (entry.timestamp < cutoff) {
        this.recentNotifications.delete(key);
      }
    }
  }

  /**
   * Add notification to display queue with priority handling
   * @param {Object} notification - Notification to queue
   * @private
   */
  addToQueue(notification) {
    // Add to queue
    this.queue.push(notification);

    // Sort by priority (highest first) and timestamp (newest first)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return b.timestamp - a.timestamp;
    });

    // Limit queue size
    if (this.queue.length > this.maxNotifications) {
      // Remove lowest priority, oldest notifications
      const removed = this.queue.splice(this.maxNotifications);
      removed.forEach(n => this.notifications.delete(n.id));
    }
  }

  /**
   * Notify all listeners of changes
   * @private
   */
  notifyListeners() {
    const notifications = this.getNotifications();

    for (const listener of this.listeners) {
      try {
        listener(notifications);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    }
  }

  /**
   * Generate unique notification ID
   * @returns {string} - Unique ID
   * @private
   */
  generateNotificationId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Simple hash function for deduplication keys
   * @param {string} str - String to hash
   * @returns {string} - Hash string
   * @private
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Create token estimation error notification
   * @param {Object} errorInfo - Error information
   * @param {Object} fallbackResult - Fallback result
   * @returns {string} - Notification ID
   */
  notifyTokenEstimationError(errorInfo, fallbackResult) {
    return this.addNotification({
      type: 'warning',
      category: NotificationCategory.TOKEN_ESTIMATION,
      priority: NotificationPriority.MEDIUM,
      title: 'Token Estimation Issue',
      message: fallbackResult.userNotification?.message || 'Token estimation is using a fallback method',
      actions: fallbackResult.userNotification?.actions || ['Continue'],
      dismissible: true,
      autoHide: fallbackResult.userNotification?.autoHide || false,
      confidence: fallbackResult.confidence,
      errorId: errorInfo.id
    });
  }

  /**
   * Create cost calculation error notification
   * @param {Object} errorInfo - Error information
   * @param {Object} fallbackResult - Fallback result
   * @returns {string} - Notification ID
   */
  notifyCostCalculationError(errorInfo, fallbackResult) {
    return this.addNotification({
      type: 'info',
      category: NotificationCategory.COST_CALCULATION,
      priority: NotificationPriority.LOW,
      title: 'Cost Calculation Notice',
      message: fallbackResult.userNotification?.message || 'Cost information is temporarily unavailable',
      actions: fallbackResult.userNotification?.actions || ['Continue without cost info'],
      dismissible: true,
      autoHide: false,
      errorId: errorInfo.id
    });
  }

  /**
   * Create service initialization error notification
   * @param {string} serviceName - Name of the service
   * @param {Object} errorInfo - Error information
   * @param {Object} recoveryPlan - Recovery plan
   * @returns {string} - Notification ID
   */
  notifyServiceInitializationError(serviceName, errorInfo, recoveryPlan) {
    const priority = serviceName === 'TokenEstimationService' ? NotificationPriority.MEDIUM : NotificationPriority.LOW;

    return this.addNotification({
      type: recoveryPlan.canContinue ? 'warning' : 'error',
      category: NotificationCategory.SERVICE_INITIALIZATION,
      priority,
      title: `${serviceName} Unavailable`,
      message: recoveryPlan.userNotification?.message || `${serviceName} failed to initialize`,
      actions: recoveryPlan.userNotification?.actions || ['Continue with limited features', 'Refresh page'],
      dismissible: true,
      autoHide: false,
      serviceName,
      errorId: errorInfo.id
    });
  }

  /**
   * Create performance degradation notification
   * @param {string} serviceName - Name of the service
   * @param {Object} performanceIssues - Performance issues detected
   * @returns {string} - Notification ID
   */
  notifyPerformanceDegradation(serviceName, performanceIssues) {
    return this.addNotification({
      type: 'warning',
      category: NotificationCategory.PERFORMANCE,
      priority: NotificationPriority.LOW,
      title: 'Performance Notice',
      message: `${serviceName} is running slower than expected`,
      actions: ['Continue', 'Optimize settings'],
      dismissible: true,
      autoHide: 10000, // Auto-hide after 10 seconds
      serviceName,
      performanceData: performanceIssues
    });
  }

  /**
   * Create pricing data issue notification
   * @param {Object} pricingIssue - Pricing data issue information
   * @returns {string} - Notification ID
   */
  notifyPricingDataIssue(pricingIssue) {
    return this.addNotification({
      type: pricingIssue.severity === 'error' ? 'error' : 'warning',
      category: NotificationCategory.PRICING_DATA,
      priority: pricingIssue.severity === 'error' ? NotificationPriority.HIGH : NotificationPriority.MEDIUM,
      title: 'Pricing Data Issue',
      message: pricingIssue.message,
      actions: pricingIssue.actions || ['Continue', 'Check AWS pricing'],
      dismissible: true,
      autoHide: false,
      pricingIssue
    });
  }

  /**
   * Get notification statistics
   * @returns {Object} - Statistics object
   */
  getStatistics() {
    const stats = {
      total: this.notifications.size,
      byType: {},
      byCategory: {},
      byPriority: {},
      oldestTimestamp: null,
      newestTimestamp: null
    };

    for (const notification of this.notifications.values()) {
      // Count by type
      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;

      // Count by category
      stats.byCategory[notification.category] = (stats.byCategory[notification.category] || 0) + 1;

      // Count by priority
      stats.byPriority[notification.priority] = (stats.byPriority[notification.priority] || 0) + 1;

      // Track timestamps
      if (!stats.oldestTimestamp || notification.timestamp < stats.oldestTimestamp) {
        stats.oldestTimestamp = notification.timestamp;
      }
      if (!stats.newestTimestamp || notification.timestamp > stats.newestTimestamp) {
        stats.newestTimestamp = notification.timestamp;
      }
    }

    return stats;
  }

  /**
   * Export notifications for debugging
   * @returns {Object} - Export data
   */
  exportNotifications() {
    return {
      notifications: Array.from(this.notifications.values()),
      queue: this.queue,
      statistics: this.getStatistics(),
      exportedAt: new Date().toISOString()
    };
  }
}

// Create and export singleton instance
export const notificationManager = new NotificationManager();

// Export class for testing
export default NotificationManager;
