/**
 * Comprehensive UI State Recovery System
 * Handles UI errors, provides fallback strategies, and manages graceful degradation
 */

import { analyzeError, logError, ErrorTypes, ErrorSeverity } from './errorHandling.js';

/**
 * UI Error Recovery class with fallback strategies for different error types
 */
export class UIStateRecovery {
  constructor() {
    this.recoveryStrategies = new Map([
      ['gradient', this.recoverGradientIssue.bind(this)],
      ['wrapping', this.recoverWrappingIssue.bind(this)],
      ['state', this.recoverStateIssue.bind(this)],
      ['display', this.recoverDisplayIssue.bind(this)],
      ['css', this.recoverCSSIssue.bind(this)],
      ['component', this.recoverComponentIssue.bind(this)]
    ]);

    this.appliedFixes = new Set();
    this.errorLog = [];
    this.recoveryAttempts = new Map();
    this.fallbackStrategies = new Map();
    this.userNotifications = [];

    // Initialize fallback strategies
    this.initializeFallbackStrategies();

    // Set up periodic health checks
    this.setupHealthChecks();
  }

  /**
   * Initialize fallback strategies for different error types
   */
  initializeFallbackStrategies() {
    this.fallbackStrategies.set('gradient', {
      fallbackCSS: `
        .gradient-container.fallback {
          background: linear-gradient(135deg, #f0f9f0 0%, #e6f3d5 100%) !important;
          background-attachment: local !important;
          position: relative !important;
          overflow: hidden !important;
        }
        .gradient-overlay.fallback {
          display: none !important;
        }
      `,
      userMessage: 'Applied fallback styling for gradient display issues',
      retryLogic: this.retryGradientRender.bind(this)
    });

    this.fallbackStrategies.set('wrapping', {
      fallbackCSS: `
        .text-content.fallback {
          word-wrap: break-word !important;
          word-break: break-word !important;
          white-space: pre-wrap !important;
          overflow-wrap: anywhere !important;
          max-width: 100% !important;
          hyphens: auto !important;
        }
        .system-prompt-display.fallback {
          display: block !important;
          width: 100% !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: normal !important;
        }
      `,
      userMessage: 'Applied enhanced text wrapping to fix display issues',
      retryLogic: this.retryTextLayout.bind(this)
    });

    this.fallbackStrategies.set('state', {
      fallbackCSS: `
        .state-recovery {
          opacity: 1 !important;
          visibility: visible !important;
          display: block !important;
        }
      `,
      userMessage: 'Recovered component state and restored functionality',
      retryLogic: this.retryStateRecovery.bind(this)
    });

    this.fallbackStrategies.set('display', {
      fallbackCSS: `
        .display-recovery {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          position: relative !important;
        }
 `,
      userMessage: 'Fixed display issues and restored component visibility',
      retryLogic: this.retryDisplayRecovery.bind(this)
    });
  }

  /**
   * Handle UI error with comprehensive recovery strategy
   * @param {Object} error - UI error information
   * @returns {Promise<Object>} - Recovery result
   */
  async handleUIError(error) {
    const errorInfo = this.analyzeUIError(error);
    const recoveryKey = `${error.errorType}-${error.component}`;

    // Check if we've already attempted recovery for this specific error
    const previousAttempts = this.recoveryAttempts.get(recoveryKey) || 0;
    if (previousAttempts >= 3) {
      return this.handleMaxRetriesExceeded(errorInfo);
    }

    // Increment recovery attempts
    this.recoveryAttempts.set(recoveryKey, previousAttempts + 1);

    try {
      // Log the error
      this.logUIError(errorInfo);

      // Attempt recovery
      const recoveryResult = await this.attemptRecovery(errorInfo);

      if (recoveryResult.success) {
        // Reset retry count on successful recovery
        this.recoveryAttempts.delete(recoveryKey);

        // Show user-friendly success message
        this.showUserNotification({
          type: 'success',
          message: recoveryResult.userMessage,
          duration: 3000
        });

        return {
          success: true,
          strategy: recoveryResult.strategy,
          userMessage: recoveryResult.userMessage,
          appliedFixes: recoveryResult.appliedFixes
        };
      } else {
        // Try fallback strategy
        const fallbackResult = await this.applyFallbackStrategy(errorInfo);
        return fallbackResult;
      }
    } catch (recoveryError) {
      console.error('UI recovery failed:', recoveryError);
      return this.handleRecoveryFailure(errorInfo, recoveryError);
    }
  }

  /**
   * Analyze UI error and categorize it
   * @param {Object} error - Raw error information
   * @returns {Object} - Analyzed error information
   */
  analyzeUIError(error) {
    const baseError = analyzeError(error.errorMessage || error.message || 'Unknown UI error', {
      component: error.component,
      errorType: error.errorType,
      timestamp: new Date().toISOString()
    });

    return {
      ...baseError,
      uiSpecific: {
        component: error.component,
        errorType: error.errorType,
        element: error.element,
        computedStyle: error.computedStyle,
        domState: error.domState
      }
    };
  }

  /**
   * Attempt recovery using appropriate strategy
   * @param {Object} errorInfo - Analyzed error information
   * @returns {Promise<Object>} - Recovery result
   */
  async attemptRecovery(errorInfo) {
    const strategy = this.recoveryStrategies.get(errorInfo.uiSpecific.errorType);

    if (!strategy) {
      return {
        success: false,
        reason: 'No recovery strategy available',
        userMessage: 'Unable to automatically fix this issue'
      };
    }

    try {
      const result = await strategy(errorInfo);
      return {
        success: result,
        strategy: errorInfo.uiSpecific.errorType,
        userMessage: this.fallbackStrategies.get(errorInfo.uiSpecific.errorType)?.userMessage || 'Issue resolved',
        appliedFixes: Array.from(this.appliedFixes)
      };
    } catch (strategyError) {
      console.error('Recovery strategy failed:', strategyError);
      return {
        success: false,
        reason: strategyError.message,
        userMessage: 'Automatic recovery failed, trying fallback approach'
      };
    }
  }

  /**
   * Apply fallback strategy when primary recovery fails
   * @param {Object} errorInfo - Error information
   * @returns {Promise<Object>} - Fallback result
   */
  async applyFallbackStrategy(errorInfo) {
    const fallback = this.fallbackStrategies.get(errorInfo.uiSpecific.errorType);

    if (!fallback) {
      return this.handleNoFallbackAvailable(errorInfo);
    }

    try {
      // Apply fallback CSS
      if (fallback.fallbackCSS) {
        this.injectFallbackCSS(fallback.fallbackCSS, errorInfo.uiSpecific.errorType);
      }

      // Apply fallback classes to affected elements
      const elements = this.findAffectedElements(errorInfo.uiSpecific.component);
      elements.forEach(element => {
        element.classList.add('fallback', `${errorInfo.uiSpecific.errorType}-fallback`);
      });

      // Attempt retry logic if available
      let retrySuccess = false;
      if (fallback.retryLogic) {
        retrySuccess = await fallback.retryLogic(errorInfo);
      }

      this.appliedFixes.add(`fallback-${errorInfo.uiSpecific.errorType}-${errorInfo.uiSpecific.component}`);

      this.showUserNotification({
        type: 'warning',
        message: fallback.userMessage,
        duration: 5000
      });

      return {
        success: true,
        strategy: 'fallback',
        userMessage: fallback.userMessage,
        appliedFixes: Array.from(this.appliedFixes),
        retrySuccess
      };
    } catch (fallbackError) {
      console.error('Fallback strategy failed:', fallbackError);
      return this.handleFallbackFailure(errorInfo, fallbackError);
    }
  }

  /**
   * Recover from gradient rendering issues
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async recoverGradientIssue(errorInfo) {
    const elements = this.findAffectedElements(errorInfo.uiSpecific.component);

    if (elements.length === 0) {
      console.warn('No elements found for gradient recovery:', errorInfo.uiSpecific.component);
      return false;
    }

    let recoverySuccess = true;

    elements.forEach(element => {
      try {
        // Fix background attachment issues
        const computedStyle = window.getComputedStyle(element);
        if (computedStyle.backgroundAttachment === 'fixed') {
          element.style.backgroundAttachment = 'local';
        }

        // Ensure proper containment
        element.classList.add('bg-gradient-container');

        // Fix z-index issues
        if (element.classList.contains('gradient-overlay')) {
          element.style.zIndex = '2';
          element.style.pointerEvents = 'none';
        }

        // Force repaint
        element.style.display = 'none';
        element.offsetHeight; // Trigger reflow
        element.style.display = '';

        this.appliedFixes.add(`gradient-fix-${errorInfo.uiSpecific.component}`);
      } catch (elementError) {
        console.error('Failed to recover gradient for element:', elementError);
        recoverySuccess = false;
      }
    });

    return recoverySuccess;
  }

  /**
   * Recover from text wrapping issues
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async recoverWrappingIssue(errorInfo) {
    const elements = this.findAffectedElements(errorInfo.uiSpecific.component);

    if (elements.length === 0) {
      console.warn('No elements found for wrapping recovery:', errorInfo.uiSpecific.component);
      return false;
    }

    let recoverySuccess = true;

    elements.forEach(element => {
      try {
        // Apply enhanced text wrapping
        element.classList.add('system-prompt-display');

        // Ensure proper width constraints
        if (!element.style.maxWidth) {
          element.style.maxWidth = '100%';
        }

        // Fix overflow issues
        element.style.overflowWrap = 'anywhere';
        element.style.wordBreak = 'break-word';
        element.style.whiteSpace = 'pre-wrap';

        this.appliedFixes.add(`wrapping-fix-${errorInfo.uiSpecific.component}`);
      } catch (elementError) {
        console.error('Failed to recover text wrapping for element:', elementError);
        recoverySuccess = false;
      }
    });

    return recoverySuccess;
  }

  /**
   * Recover from component state issues
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async recoverStateIssue(errorInfo) {
    try {
      // Attempt to restore component state from localStorage
      const stateKey = `ui-state-${errorInfo.uiSpecific.component}`;
      const savedState = localStorage.getItem(stateKey);

      if (savedState) {
        try {
          const parsedState = JSON.parse(savedState);
          // Trigger a custom event to notify components of state recovery
          window.dispatchEvent(new CustomEvent('ui-state-recovery', {
            detail: {
              component: errorInfo.uiSpecific.component,
              state: parsedState
            }
          }));
        } catch (parseError) {
          console.warn('Failed to parse saved state:', parseError);
        }
      }

      // Apply state recovery CSS class
      const elements = this.findAffectedElements(errorInfo.uiSpecific.component);
      elements.forEach(element => {
        element.classList.add('state-recovery');
      });

      this.appliedFixes.add(`state-recovery-${errorInfo.uiSpecific.component}`);
      return true;
    } catch (stateError) {
      console.error('State recovery failed:', stateError);
      return false;
    }
  }

  /**
   * Recover from display issues
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async recoverDisplayIssue(errorInfo) {
    const elements = this.findAffectedElements(errorInfo.uiSpecific.component);

    if (elements.length === 0) {
      console.warn('No elements found for display recovery:', errorInfo.uiSpecific.component);
      return false;
    }

    let recoverySuccess = true;

    elements.forEach(element => {
      try {
        // Reset display properties
        element.style.display = '';
        element.style.visibility = '';
        element.style.opacity = '';

        // Apply safe display classes
        element.classList.add('display-recovery');

        // Ensure element is visible
        if (window.getComputedStyle(element).display === 'none') {
          element.style.display = 'block';
        }

        this.appliedFixes.add(`display-fix-${errorInfo.uiSpecific.component}`);
      } catch (elementError) {
        console.error('Failed to recover display for element:', elementError);
        recoverySuccess = false;
      }
    });

    return recoverySuccess;
  }

  /**
   * Recover from CSS issues
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async recoverCSSIssue(errorInfo) {
    try {
      // Remove potentially problematic CSS classes
      const elements = this.findAffectedElements(errorInfo.uiSpecific.component);

      elements.forEach(element => {
        // Remove classes that might cause issues
        const problematicClasses = ['animate-', 'transition-', 'transform-'];
        const classList = Array.from(element.classList);

        classList.forEach(className => {
          if (problematicClasses.some(prefix => className.startsWith(prefix))) {
            element.classList.remove(className);
          }
        });

        // Apply safe CSS reset
        element.style.animation = 'none';
        element.style.transition = 'none';
        element.style.transform = 'none';
      });

      this.appliedFixes.add(`css-recovery-${errorInfo.uiSpecific.component}`);
      return true;
    } catch (cssError) {
      console.error('CSS recovery failed:', cssError);
      return false;
    }
  }

  /**
   * Recover from component-level issues
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async recoverComponentIssue(errorInfo) {
    try {
      // Trigger component re-render by dispatching custom event
      window.dispatchEvent(new CustomEvent('component-recovery', {
        detail: {
          component: errorInfo.uiSpecific.component,
          errorType: errorInfo.uiSpecific.errorType
        }
      }));

      this.appliedFixes.add(`component-recovery-${errorInfo.uiSpecific.component}`);
      return true;
    } catch (componentError) {
      console.error('Component recovery failed:', componentError);
      return false;
    }
  }

  /**
   * Find elements affected by the error
   * @param {string} component - Component identifier
   * @returns {Array} - Array of DOM elements
   */
  findAffectedElements(component) {
    const selectors = [
      `.${component}`,
      `[data-component="${component}"]`,
      `[class*="${component}"]`,
      `#${component}`
    ];

    const elements = [];
    selectors.forEach(selector => {
      try {
        const found = document.querySelectorAll(selector);
        elements.push(...found);
      } catch (selectorError) {
        console.warn('Invalid selector:', selector);
      }
    });

    return [...new Set(elements)]; // Remove duplicates
  }

  /**
   * Inject fallback CSS into the document
   * @param {string} css - CSS to inject
   * @param {string} errorType - Error type for identification
   */
  injectFallbackCSS(css, errorType) {
    const styleId = `fallback-css-${errorType}`;

    // Remove existing fallback CSS for this error type
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    // Inject new fallback CSS
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /**
   * Show user notification
   * @param {Object} notification - Notification details
   */
  showUserNotification(notification) {
    const notificationId = `ui-notification-${Date.now()}`;

    this.userNotifications.push({
      id: notificationId,
      ...notification,
      timestamp: new Date().toISOString()
    });

    // Dispatch custom event for UI components to handle
    window.dispatchEvent(new CustomEvent('ui-notification', {
      detail: {
        id: notificationId,
        ...notification
      }
    }));

    // Auto-remove notification after duration
    if (notification.duration) {
      setTimeout(() => {
        this.removeUserNotification(notificationId);
      }, notification.duration);
    }
  }

  /**
   * Remove user notification
   * @param {string} notificationId - Notification ID
   */
  removeUserNotification(notificationId) {
    this.userNotifications = this.userNotifications.filter(n => n.id !== notificationId);

    window.dispatchEvent(new CustomEvent('ui-notification-remove', {
      detail: { id: notificationId }
    }));
  }

  /**
   * Handle case when maximum retries are exceeded
   * @param {Object} errorInfo - Error information
   * @returns {Object} - Recovery result
   */
  handleMaxRetriesExceeded(errorInfo) {
    const message = `Maximum recovery attempts exceeded for ${errorInfo.uiSpecific.component}. Manual intervention may be required.`;

    this.showUserNotification({
      type: 'error',
      message: message,
      duration: 10000,
      actions: [
        { label: 'Refresh Page', action: () => window.location.reload() },
        { label: 'Reset Component', action: () => this.resetComponent(errorInfo.uiSpecific.component) }
      ]
    });

    return {
      success: false,
      strategy: 'max-retries-exceeded',
      userMessage: message,
      requiresManualIntervention: true
    };
  }

  /**
   * Handle case when no fallback is available
   * @param {Object} errorInfo - Error information
   * @returns {Object} - Recovery result
   */
  handleNoFallbackAvailable(errorInfo) {
    const message = `No fallback strategy available for ${errorInfo.uiSpecific.errorType} errors in ${errorInfo.uiSpecific.component}`;

    this.showUserNotification({
      type: 'warning',
      message: 'Unable to automatically fix this issue. Please try refreshing the page.',
      duration: 8000,
      actions: [
        { label: 'Refresh Page', action: () => window.location.reload() }
      ]
    });

    return {
      success: false,
      strategy: 'no-fallback',
      userMessage: message,
      requiresManualIntervention: true
    };
  }

  /**
   * Handle recovery failure
   * @param {Object} errorInfo - Error information
   * @param {Error} recoveryError - Recovery error
   * @returns {Object} - Recovery result
   */
  handleRecoveryFailure(errorInfo, recoveryError) {
    const message = `Recovery failed for ${errorInfo.uiSpecific.component}: ${recoveryError.message}`;

    this.showUserNotification({
      type: 'error',
      message: 'Automatic error recovery failed. Please try refreshing the page.',
      duration: 10000,
      actions: [
        { label: 'Refresh Page', action: () => window.location.reload() },
        { label: 'Report Issue', action: () => this.reportIssue(errorInfo, recoveryError) }
      ]
    });

    return {
      success: false,
      strategy: 'recovery-failed',
      userMessage: message,
      error: recoveryError.message,
      requiresManualIntervention: true
    };
  }

  /**
   * Handle fallback failure
   * @param {Object} errorInfo - Error information
   * @param {Error} fallbackError - Fallback error
   * @returns {Object} - Recovery result
   */
  handleFallbackFailure(errorInfo, fallbackError) {
    const message = `Both primary recovery and fallback failed for ${errorInfo.uiSpecific.component}`;

    this.showUserNotification({
      type: 'error',
      message: 'All automatic recovery attempts failed. Please refresh the page to continue.',
      duration: 15000,
      actions: [
        { label: 'Refresh Page', action: () => window.location.reload() },
        { label: 'Clear Cache', action: () => this.clearBrowserCache() }
      ]
    });

    return {
      success: false,
      strategy: 'complete-failure',
      userMessage: message,
      error: fallbackError.message,
      requiresManualIntervention: true,
      criticalFailure: true
    };
  }

  /**
   * Reset component to default state
   * @param {string} component - Component identifier
   */
  resetComponent(component) {
    const elements = this.findAffectedElements(component);

    elements.forEach(element => {
      // Remove all applied fixes
      element.classList.remove('fallback', 'state-recovery', 'display-recovery');
      element.removeAttribute('style');
    });

    // Clear component-specific fixes
    this.appliedFixes.forEach(fix => {
      if (fix.includes(component)) {
        this.appliedFixes.delete(fix);
      }
    });

    // Reset retry count
    const recoveryKeys = Array.from(this.recoveryAttempts.keys()).filter(key => key.includes(component));
    recoveryKeys.forEach(key => this.recoveryAttempts.delete(key));
  }

  /**
   * Clear browser cache and storage
   */
  clearBrowserCache() {
    try {
      localStorage.clear();
      sessionStorage.clear();

      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }

      window.location.reload();
    } catch (clearError) {
      console.error('Failed to clear cache:', clearError);
      window.location.reload();
    }
  }

  /**
   * Report issue to console and local storage
   * @param {Object} errorInfo - Error information
   * @param {Error} recoveryError - Recovery error
   */
  reportIssue(errorInfo, recoveryError) {
    const report = {
      timestamp: new Date().toISOString(),
      errorInfo,
      recoveryError: recoveryError.message,
      userAgent: navigator.userAgent,
      url: window.location.href,
      appliedFixes: Array.from(this.appliedFixes),
      recoveryAttempts: Object.fromEntries(this.recoveryAttempts)
    };

    try {
      const existingReports = JSON.parse(localStorage.getItem('ui-error-reports') || '[]');
      existingReports.unshift(report);
      localStorage.setItem('ui-error-reports', JSON.stringify(existingReports.slice(0, 10)));
    } catch (storageError) {
      console.warn('Failed to store error report:', storageError);
    }

    console.error('UI Error Report:', report);
  }

  /**
   * Log UI error
   * @param {Object} errorInfo - Error information
   */
  logUIError(errorInfo) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      component: errorInfo.uiSpecific.component,
      errorType: errorInfo.uiSpecific.errorType,
      severity: errorInfo.severity,
      message: errorInfo.userMessage
    };

    this.errorLog.push(logEntry);

    // Keep only last 100 entries
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-100);
    }

    // Use existing error logging utility
    logError(errorInfo);
  }

  /**
   * Set up periodic health checks
   */
  setupHealthChecks() {
    // Check for UI issues every 10 seconds
    setInterval(() => {
      this.performHealthCheck();
    }, 10000);
  }

  /**
   * Perform health check on UI components
   */
  performHealthCheck() {
    try {
      // Check for gradient issues
      const gradientElements = document.querySelectorAll('[class*="bg-gradient"]');
      gradientElements.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);

        if (computedStyle.backgroundAttachment === 'fixed' && rect.height > window.innerHeight) {
          this.handleUIError({
            errorType: 'gradient',
            component: `gradient-element-${index}`,
            errorMessage: 'Gradient background attachment issue detected',
            element: element
          });
        }
      });

      // Check for text overflow issues
      const textElements = document.querySelectorAll('.system-prompt-display, .test-results-prompt');
      textElements.forEach((element, index) => {
        if (element.scrollWidth > element.clientWidth) {
          this.handleUIError({
            errorType: 'wrapping',
            component: `text-element-${index}`,
            errorMessage: 'Text overflow detected',
            element: element
          });
        }
      });

    } catch (healthCheckError) {
      console.warn('Health check failed:', healthCheckError);
    }
  }

  /**
   * Retry gradient rendering
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async retryGradientRender(errorInfo) {
    try {
      const elements = this.findAffectedElements(errorInfo.uiSpecific.component);

      elements.forEach(element => {
        // Force re-render by toggling display
        element.style.display = 'none';
        requestAnimationFrame(() => {
          element.style.display = '';
        });
      });

      return true;
    } catch (retryError) {
      console.error('Gradient retry failed:', retryError);
      return false;
    }
  }

  /**
   * Retry text layout
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async retryTextLayout(errorInfo) {
    try {
      const elements = this.findAffectedElements(errorInfo.uiSpecific.component);

      elements.forEach(element => {
        // Force text reflow
        const originalWidth = element.style.width;
        element.style.width = '0px';
        element.offsetWidth; // Trigger reflow
        element.style.width = originalWidth || '';
      });

      return true;
    } catch (retryError) {
      console.error('Text layout retry failed:', retryError);
      return false;
    }
  }

  /**
   * Retry state recovery
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async retryStateRecovery(errorInfo) {
    try {
      // Trigger React re-render by dispatching state change event
      window.dispatchEvent(new CustomEvent('force-rerender', {
        detail: { component: errorInfo.uiSpecific.component }
      }));

      return true;
    } catch (retryError) {
      console.error('State recovery retry failed:', retryError);
      return false;
    }
  }

  /**
   * Retry display recovery
   * @param {Object} errorInfo - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async retryDisplayRecovery(errorInfo) {
    try {
      const elements = this.findAffectedElements(errorInfo.uiSpecific.component);

      elements.forEach(element => {
        // Force repaint
        element.style.opacity = '0';
        requestAnimationFrame(() => {
          element.style.opacity = '';
        });
      });

      return true;
    } catch (retryError) {
      console.error('Display recovery retry failed:', retryError);
      return false;
    }
  }

  /**
   * Get recovery statistics
   * @returns {Object} - Recovery statistics
   */
  getRecoveryStats() {
    const total = this.errorLog.length;
    const byType = {};
    const bySeverity = {};

    this.errorLog.forEach(entry => {
      byType[entry.errorType] = (byType[entry.errorType] || 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
    });

    return {
      total,
      byType,
      bySeverity,
      appliedFixes: Array.from(this.appliedFixes),
      activeNotifications: this.userNotifications.length,
      recoveryAttempts: Object.fromEntries(this.recoveryAttempts)
    };
  }

  /**
   * Reset recovery system
   */
  reset() {
    this.appliedFixes.clear();
    this.errorLog = [];
    this.recoveryAttempts.clear();
    this.userNotifications = [];

    // Remove all injected fallback CSS
    document.querySelectorAll('[id^="fallback-css-"]').forEach(style => {
      style.remove();
    });

    // Remove all recovery classes
    document.querySelectorAll('.fallback, .state-recovery, .display-recovery').forEach(element => {
      element.classList.remove('fallback', 'state-recovery', 'display-recovery');
    });
  }
}

// Create singleton instance
export const uiStateRecovery = new UIStateRecovery();

// Auto-initialize on DOM content loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('UI State Recovery system initialized');
  });
}
