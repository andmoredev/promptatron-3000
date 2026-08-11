/**
 * Gradient Error Recovery Utility
 * Handles gradient rendering issues and provides fallback mechanisms
 */

export class GradientErrorRecovery {
  constructor() {
    this.recoveryStrategies = new Map([
      ['gradient', this.recoverGradientIssue.bind(this)],
      ['wrapping', this.recoverWrappingIssue.bind(this)],
      ['display', this.recoverDisplayIssue.bind(this)]
    ]);

    this.appliedFixes = new Set();
    this.errorLog = [];
  }

  /**
   * Handle UI error with appropriate recovery strategy
   * @param {Object} error - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async handleUIError(error) {
    const strategy = this.recoveryStrategies.get(error.errorType);
    if (!strategy) {
      console.warn('No recovery strategy found for error type:', error.errorType);
      return false;
    }

    try {
      const success = await strategy(error);
      if (success) {
        this.logRecovery(error, 'success');
      } else {
        this.logRecovery(error, 'failed');
      }
      return success;
    } catch (recoveryError) {
      console.error('Recovery strategy failed:', recoveryError);
      this.logRecovery(error, 'error', recoveryError.message);
      return false;
    }
  }

  /**
   * Recover from gradient rendering issues
   * @param {Object} error - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async recoverGradientIssue(error) {
    const element = document.querySelector(`.${error.component}`);
    if (!element) {
      console.warn('Element not found for gradient recovery:', error.component);
      return false;
    }

    // Apply fallback CSS class
    element.classList.add('fallback');
    this.appliedFixes.add(`gradient-fallback-${error.component}`);

    // Force repaint
    element.style.display = 'none';
    element.offsetHeight; // Trigger reflow
    element.style.display = '';

    return true;
  }

  /**
   * Recover from text wrapping issues
   * @param {Object} error - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async recoverWrappingIssue(error) {
    const element = document.querySelector(`.${error.component}`);
    if (!element) {
      console.warn('Element not found for wrapping recovery:', error.component);
      return false;
    }

    // Apply enhanced text wrapping classes
    element.classList.add('system-prompt-display');
    this.appliedFixes.add(`wrapping-fix-${error.component}`);

    return true;
  }

  /**
   * Recover from display issues
   * @param {Object} error - Error information
   * @returns {Promise<boolean>} - Success status
   */
  async recoverDisplayIssue(error) {
    const element = document.querySelector(`.${error.component}`);
    if (!element) {
      console.warn('Element not found for display recovery:', error.component);
      return false;
    }

    // Reset display properties
    element.style.display = '';
    element.style.visibility = '';
    element.style.opacity = '';

    // Apply safe display classes
    element.classList.add('block', 'w-full');
    this.appliedFixes.add(`display-fix-${error.component}`);

    return true;
  }

  /**
   * Detect gradient rendering issues
   * @returns {Array} - Array of detected issues
   */
  detectGradientIssues() {
    const issues = [];

    // Check for elements with gradient backgrounds
    const gradientElements = document.querySelectorAll('[class*="bg-gradient"]');

    gradientElements.forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);

      // Check for potential white line issues
      if (computedStyle.backgroundAttachment === 'fixed' && rect.height > window.innerHeight) {
        issues.push({
          type: 'gradient-attachment',
          element: element,
          component: element.className.split(' ').find(cls => cls.includes('gradient')) || `gradient-element-${index}`,
          description: 'Fixed background attachment may cause white lines on long content'
        });
      }

      // Check for overflow issues
      if (computedStyle.overflow === 'visible' && element.scrollHeight > element.clientHeight) {
        issues.push({
          type: 'gradient-overflow',
          element: element,
          component: element.className.split(' ').find(cls => cls.includes('gradient')) || `gradient-element-${index}`,
          description: 'Gradient container overflow may cause rendering issues'
        });
      }
    });

    return issues;
  }

  /**
   * Apply preventive fixes to gradient elements
   */
  applyPreventiveFixes() {
    const gradientElements = document.querySelectorAll('[class*="bg-gradient"]');

    gradientElements.forEach((element) => {
      // Ensure proper containment
      if (!element.classList.contains('bg-gradient-container')) {
        element.classList.add('bg-gradient-container');
      }

      // Fix background attachment
      const computedStyle = window.getComputedStyle(element);
      if (computedStyle.backgroundAttachment === 'fixed') {
        element.style.backgroundAttachment = 'local';
      }
    });

    // Fix scroll indicators
    const scrollIndicators = document.querySelectorAll('.scroll-indicator-gradient');
    scrollIndicators.forEach((indicator) => {
      // Ensure proper z-index and positioning
      indicator.style.zIndex = '10';
      indicator.style.pointerEvents = 'none';
    });
  }

  /**
   * Log recovery attempt
   * @param {Object} error - Original error
   * @param {string} status - Recovery status
   * @param {string} details - Additional details
   */
  logRecovery(error, status, details = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      errorType: error.errorType,
      component: error.component,
      status: status,
      details: details
    };

    this.errorLog.push(logEntry);

    // Keep only last 50 entries
    if (this.errorLog.length > 50) {
      this.errorLog = this.errorLog.slice(-50);
    }

    // Gradient recovery applied
  }

  /**
   * Get recovery statistics
   * @returns {Object} - Recovery statistics
   */
  getRecoveryStats() {
    const total = this.errorLog.length;
    const successful = this.errorLog.filter(entry => entry.status === 'success').length;
    const failed = this.errorLog.filter(entry => entry.status === 'failed').length;
    const errors = this.errorLog.filter(entry => entry.status === 'error').length;

    return {
      total,
      successful,
      failed,
      errors,
      successRate: total > 0 ? (successful / total * 100).toFixed(1) : 0,
      appliedFixes: Array.from(this.appliedFixes)
    };
  }

  /**
   * Reset recovery state
   */
  reset() {
    this.appliedFixes.clear();
    this.errorLog = [];
  }
}

// Create singleton instance
export const gradientErrorRecovery = new GradientErrorRecovery();

// Auto-apply preventive fixes on DOM content loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    gradientErrorRecovery.applyPreventiveFixes();
  });

  // Also apply fixes when new content is added
  const observer = new MutationObserver(() => {
    gradientErrorRecovery.applyPreventiveFixes();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
