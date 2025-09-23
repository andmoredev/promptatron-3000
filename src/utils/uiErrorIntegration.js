/**
 * UI Error Integration Utility
 * Integrates UI state recovery with existing error handling systems
 */

import { uiStateRecovery } from './uiStateRecovery.js';
import { handleError, analyzeError, ErrorTypes } from './errorHandling.js';
import { gradientErrorRecovery } from './gradientErrorRecovery.js';

/**
 * Enhanced error handler that includes UI recovery
 * @param {Error|string} error - The error to handle
 * @param {Object} context - Additional context about where the error occurred
 * @param {Function} onError - Callback function to handle the error in UI
 * @returns {Object} - Enhanced error information with recovery status
 */
export async function handleUIError(error, context = {}, onError = null) {
  // Use existing error analysis
  const errorInfo = analyzeError(error, context);

  // Determine if this is a UI-related error that needs recovery
  const isUIError = isUIRelatedError(errorInfo, context);

  if (isUIError) {
    // Attempt UI recovery
    const recoveryResult = await attemptUIRecovery(errorInfo, context);

    // Enhance error info with recovery status
    errorInfo.uiRecovery = recoveryResult;

    // Recovery attempt initiated
  }

  // Use existing error handling for logging and reporting
  const baseErrorInfo = handleError(error, context, onError);

  return {
    ...baseErrorInfo,
    uiRecovery: errorInfo.uiRecovery || null
  };
}

/**
 * Determine if an error is UI-related and needs recovery
 * @param {Object} errorInfo - Analyzed error information
 * @param {Object} context - Error context
 * @returns {boolean} - Whether this is a UI error
 */
function isUIRelatedError(errorInfo, context) {
  // Check error type
  const uiErrorTypes = [
    ErrorTypes.BROWSER_COMPATIBILITY,
    ErrorTypes.FILE_SYSTEM,
    'gradient',
    'wrapping',
    'display',
    'css',
    'component'
  ];

  if (uiErrorTypes.includes(errorInfo.type)) {
    return true;
  }

  // Check error message for UI-related keywords
  const uiKeywords = [
    'gradient',
    'display',
    'render',
    'css',
    'style',
    'layout',
    'overflow',
    'wrap',
    'text',
    'component',
    'element',
    'dom'
  ];

  const errorMessage = (errorInfo.originalMessage || '').toLowerCase();
  if (uiKeywords.some(keyword => errorMessage.includes(keyword))) {
    return true;
  }

  // Check context for UI-related information
  if (context.component || context.element || context.errorType) {
    return true;
  }

  return false;
}

/**
 * Attempt UI recovery for the error
 * @param {Object} errorInfo - Analyzed error information
 * @param {Object} context - Error context
 * @returns {Promise<Object>} - Recoverylt
 */
async function attemptUIRecovery(errorInfo, context) {
  try {
    // Determine recovery strategy based on error type and context
    const recoveryStrategy = determineRecoveryStrategy(errorInfo, context);

    if (recoveryStrategy === 'gradient') {
      // Use existing gradient recovery system
      const gradientResult = await gradientErrorRecovery.handleUIError({
        errorType: 'gradient',
        component: context.component || 'unknown-component',
        errorMessage: errorInfo.originalMessage
      });

      return {
        success: gradientResult,
        strategy: 'gradient-recovery',
        system: 'gradientErrorRecovery'
      };
    } else {
      // Use comprehensive UI state recovery system
      const uiError = {
        errorType: recoveryStrategy,
        component: context.component || 'unknown-component',
        errorMessage: errorInfo.originalMessage,
        element: context.element,
        computedStyle: context.computedStyle,
        domState: context.domState
      };

      const recoveryResult = await uiStateRecovery.handleUIError(uiError);

      return {
        success: recoveryResult.success,
        strategy: recoveryResult.strategy || recoveryStrategy,
        system: 'uiStateRecovery',
        userMessage: recoveryResult.userMessage,
        appliedFixes: recoveryResult.appliedFixes
      };
    }
  } catch (recoveryError) {
    console.error('UI recovery attempt failed:', recoveryError);
    return {
      success: false,
      strategy: 'recovery-failed',
      error: recoveryError.message
    };
  }
}

/**
 * Determine the appropriate recovery strategy
 * @param {Object} errorInfo - Analyzed error information
 * @param {Object} context - Error context
 * @returns {string} - Recovery strategy name
 */
function determineRecoveryStrategy(errorInfo, context) {
  // Check explicit error type from context
  if (context.errorType) {
    return context.errorType;
  }

  // Analyze error message for strategy hints
  const errorMessage = (errorInfo.originalMessage || '').toLowerCase();

  if (errorMessage.includes('gradient') || errorMessage.includes('background')) {
    return 'gradient';
  }

  if (errorMessage.includes('wrap') || errorMessage.includes('overflow') || errorMessage.includes('text')) {
    return 'wrapping';
  }

  if (errorMessage.includes('display') || errorMessage.includes('visible') || errorMessage.includes('hidden')) {
    return 'display';
  }

  if (errorMessage.includes('css') || errorMessage.includes('style')) {
    return 'css';
  }

  if (errorMessage.includes('component') || errorMessage.includes('render')) {
    return 'component';
  }

  if (errorMessage.includes('state')) {
    return 'state';
  }

  // Default to component recovery
  return 'component';
}

/**
 * Proactively check for and fix common UI issues
 * @param {string} component - Component name to check
 * @returns {Promise<Array>} - Array of issues found and fixed
 */
export async function proactiveUICheck(component = null) {
  const issues = [];

  try {
    // Check for gradient issues
    const gradientIssues = gradientErrorRecovery.detectGradientIssues();
    for (const issue of gradientIssues) {
      const recoveryResult = await gradientErrorRecovery.handleUIError({
        errorType: 'gradient',
        component: issue.component,
        errorMessage: issue.description
      });

      issues.push({
        type: 'gradient',
        component: issue.component,
        description: issue.description,
        fixed: recoveryResult
      });
    }

    // Check for text overflow issues
    const textElements = component
      ? document.querySelectorAll(`.${component} .system-prompt-display, .${component} .test-results-prompt`)
      : document.querySelectorAll('.system-prompt-display, .test-results-prompt');

    for (const element of textElements) {
      if (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) {
        const recoveryResult = await uiStateRecovery.handleUIError({
          errorType: 'wrapping',
          component: component || element.className.split(' ')[0] || 'text-element',
          errorMessage: 'Text overflow detected',
          element: element
        });

        issues.push({
          type: 'wrapping',
          component: component || 'text-element',
          description: 'Text overflow detected',
          fixed: recoveryResult.success
        });
      }
    }

    // Check for display issues
    const hiddenElements = component
      ? document.querySelectorAll(`.${component} [style*="display: none"], .${component} [style*="visibility: hidden"]`)
      : document.querySelectorAll('[style*="display: none"], [style*="visibility: hidden"]');

    for (const element of hiddenElements) {
      // Skip intentionally hidden elements (those with specific hide classes)
      if (element.classList.contains('hidden') || element.classList.contains('sr-only')) {
        continue;
      }

      const recoveryResult = await uiStateRecovery.handleUIError({
        errorType: 'display',
        component: component || element.className.split(' ')[0] || 'hidden-element',
        errorMessage: 'Element unexpectedly hidden',
        element: element
      });

      issues.push({
        type: 'display',
        component: component || 'hidden-element',
        description: 'Element unexpectedly hidden',
        fixed: recoveryResult.success
      });
    }

  } catch (checkError) {
    console.error('Proactive UI check failed:', checkError);
    issues.push({
      type: 'check-error',
      component: component || 'unknown',
      description: `Proactive check failed: ${checkError.message}`,
      fixed: false
    });
  }

  return issues;
}

/**
 * Initialize UI error monitoring
 * Sets up global error handlers and periodic checks
 */
export function initializeUIErrorMonitoring() {
  // Global error handler for unhandled UI errors
  window.addEventListener('error', async (event) => {
    if (event.error && event.error.name === 'UIError') {
      await handleUIError(event.error, {
        component: 'global',
        source: event.filename,
        line: event.lineno,
        column: event.colno
      });
    }
  });

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', async (event) => {
    if (event.reason && typeof event.reason === 'object' && event.reason.uiError) {
      await handleUIError(event.reason, {
        component: 'global',
        type: 'promise-rejection'
      });
    }
  });

  // Periodic proactive checks
  setInterval(async () => {
    try {
      const issues = await proactiveUICheck();
      if (issues.length > 0) {
        // Proactive UI check found and fixed issues
      }
    } catch (monitorError) {
      console.warn('UI monitoring check failed:', monitorError);
    }
  }, 30000); // Check every 30 seconds

  // UI error monitoring initialized
}

/**
 * Create a UI error with recovery context
 * @param {string} message - Error message
 * @param {Object} context - UI context
 * @returns {Error} - Enhanced error object
 */
export function createUIError(message, context = {}) {
  const error = new Error(message);
  error.name = 'UIError';
  error.uiError = true;
  error.context = context;
  return error;
}

/**
 * Wrap a function with UI error recovery
 * @param {Function} fn - Function to wrap
 * @param {Object} context - UI context
 * @returns {Function} - Wrapped function
 */
export function withUIErrorRecovery(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const recoveryResult = await handleUIError(error, context);

      if (recoveryResult.uiRecovery && recoveryResult.uiRecovery.success) {
        // Retry the function after successful recovery
        try {
          return await fn(...args);
        } catch (retryError) {
          // If retry fails, throw the original error
          throw error;
        }
      } else {
        throw error;
      }
    }
  };
}
