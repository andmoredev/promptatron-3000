import { useEffect, useCallback, useRef } from 'react';
import { uiStateRecovery } from '../utils/uiStateRecovery.js';

/**
 * React hook for UI error recovery integration
 * Provides error handling and recovery capabilities to React components
 */
export const useUIErrorRecovery = (componentName, options = {}) => {
  const {
    enableAutoRecovery = true,
    enableStateBackup = true,
    recoveryStrategies = [],
    onRecoveryAttempt = null,
    onRecoverySuccess = null,
    onRecoveryFailure = null
  } = options;

  const componentRef = useRef(null);
  const stateBackupRef = useRef(null);
  const recoveryAttemptsRef = useRef(0);

  /**
   * Handle UI error with recovery
   */
  const handleUIError = useCallback(async (error, context = {}) => {
    const errorInfo = {
      errorType: error.type || 'component',
      component: componentName,
      errorMessage: error.message || 'Unknown component error',
      element: componentRef.current,
      ...context
    };

    if (onRecoveryAttempt) {
      onRecoveryAttempt(errorInfo);
    }

    try {
      const recoveryResult = await uiStateRecovery.handleUIError(errorInfo);

      if (recoveryResult.success) {
        recoveryAttemptsRef.current = 0; // Reset on success
        if (onRecoverySuccess) {
          onRecoverySuccess(recoveryResult);
        }
        return recoveryResult;
      } else {
        recoveryAttemptsRef.current += 1;
        if (onRecoveryFailure) {
          onRecoveryFailure(recoveryResult);
        }
        return recoveryResult;
      }
    } catch (recoveryError) {
      console.error('UI error recovery failed:', recoveryError);
      if (onRecoveryFailure) {
        onRecoveryFailure({ success: false, error: recoveryError.message });
      }
      return { success: false, error: recoveryError.message };
    }
  }, [componentName, onRecoveryAttempt, onRecoverySuccess, onRecoveryFailure]);

  /**
   * Backup component state
   */
  const backupState = useCallback((state) => {
    if (!enableStateBackup) return;

    try {
      const stateKey = `ui-state-${componentName}`;
      const stateData = {
        timestamp: new Date().toISOString(),
        state: state,
        componentName: componentName
      };

      localStorage.setItem(stateKey, JSON.stringify(stateData));
      stateBackupRef.current = stateData;
    } catch (backupError) {
      console.warn('Failed to backup component state:', backupError);
    }
  }, [componentName, enableStateBackup]);

  /**
   * Restore component state from backup
   */
  const restoreState = useCallback(() => {
    if (!enableStateBackup) return null;

    try {
      const stateKey = `ui-state-${componentName}`;
      const savedState = localStorage.getItem(stateKey);

      if (savedState) {
        const stateData = JSON.parse(savedState);
        return stateData.state;
      }
    } catch (restoreError) {
      console.warn('Failed to restore component state:', restoreError);
    }

    return null;
  }, [componentName, enableStateBackup]);

  /**
   * Clear component state backup
   */
  const clearStateBackup = useCallback(() => {
    try {
      const stateKey = `ui-state-${componentName}`;
      localStorage.removeItem(stateKey);
      stateBackupRef.current = null;
    } catch (clearError) {
      console.warn('Failed to clear state backup:', clearError);
    }
  }, [componentName]);

  /**
   * Check component health
   */
  const checkComponentHealth = useCallback(() => {
    if (!componentRef.current) return { healthy: false, issues: ['Component ref not available'] };

    const issues = [];
    const element = componentRef.current;

    try {
      // Check if element is visible
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);

      if (rect.width === 0 && rect.height === 0) {
        issues.push('Component has zero dimensions');
      }

      if (computedStyle.display === 'none') {
        issues.push('Component is hidden (display: none)');
      }

      if (computedStyle.visibility === 'hidden') {
        issues.push('Component is hidden (visibility: hidden)');
      }

      if (computedStyle.opacity === '0') {
        issues.push('Component is transparent (opacity: 0)');
      }

      // Check for text overflow issues
      if (element.scrollWidth > element.clientWidth) {
        issues.push('Horizontal text overflow detected');
      }

      if (element.scrollHeight > element.clientHeight) {
        issues.push('Vertical text overflow detected');
      }

      // Check for gradient issues
      if (computedStyle.backgroundImage.includes('gradient')) {
        if (computedStyle.backgroundAttachment === 'fixed') {
          issues.push('Fixed background attachment may cause gradient issues');
        }
      }

      return {
        healthy: issues.length === 0,
        issues: issues,
        element: element,
        computedStyle: computedStyle,
        rect: rect
      };
    } catch (healthCheckError) {
      console.warn('Component health check failed:', healthCheckError);
      return {
        healthy: false,
        issues: ['Health check failed'],
        error: healthCheckError.message
      };
    }
  }, []);

  /**
   * Apply recovery strategy
   */
  const applyRecoveryStrategy = useCallback(async (strategyName, options = {}) => {
    const healthCheck = checkComponentHealth();

    if (!healthCheck.healthy) {
      const errorInfo = {
        errorType: strategyName,
        component: componentName,
        errorMessage: `Component health issues: ${healthCheck.issues.join(', ')}`,
        element: componentRef.current,
        healthCheck: healthCheck,
        ...options
      };

      return await handleUIError(errorInfo);
    }

    return { success: true, message: 'Component is healthy, no recovery needed' };
  }, [componentName, checkComponentHealth, handleUIError]);

  /**
   * Force component re-render
   */
  const forceRerender = useCallback(() => {
    if (componentRef.current) {
      // Trigger a re-render by dispatching a custom event
      const event = new CustomEvent('force-rerender', {
        detail: { component: componentName }
      });
      componentRef.current.dispatchEvent(event);
    }
  }, [componentName]);

  /**
   * Reset component to safe state
   */
  const resetToSafeState = useCallback(() => {
    if (!componentRef.current) return;

    const element = componentRef.current;

    try {
      // Remove potentially problematic classes
      element.classList.remove('animate-fade-in', 'animate-slide-up', 'animate-slide-in');

      // Reset inline styles that might cause issues
      element.style.animation = '';
      element.style.transition = '';
      element.style.transform = '';

      // Ensure visibility
      if (element.style.display === 'none') {
        element.style.display = '';
      }
      if (element.style.visibility === 'hidden') {
        element.style.visibility = '';
      }
      if (element.style.opacity === '0') {
        element.style.opacity = '';
      }

      // Apply safe classes
      element.classList.add('state-recovery');

    } catch (resetError) {
      console.error('Failed to reset component to safe state:', resetError);
    }
  }, []);

  // Set up event listeners for recovery events
  useEffect(() => {
    const handleStateRecovery = (event) => {
      if (event.detail.component === componentName) {
        const restoredState = restoreState();
        if (restoredState && onRecoverySuccess) {
          onRecoverySuccess({
            success: true,
            strategy: 'state-recovery',
            restoredState: restoredState
          });
        }
      }
    };

    const handleComponentRecovery = (event) => {
      if (event.detail.component === componentName) {
        forceRerender();
      }
    };

    const handleForceRerender = (event) => {
      if (event.detail.component === componentName) {
        resetToSafeState();
      }
    };

    window.addEventListener('ui-state-recovery', handleStateRecovery);
    window.addEventListener('component-recovery', handleComponentRecovery);
    window.addEventListener('force-rerender', handleForceRerender);

    return () => {
      window.removeEventListener('ui-state-recovery', handleStateRecovery);
      window.removeEventListener('component-recovery', handleComponentRecovery);
      window.removeEventListener('force-rerender', handleForceRerender);
    };
  }, [componentName, restoreState, onRecoverySuccess, forceRerender, resetToSafeState]);

  // Periodic health checks if auto-recovery is enabled
  useEffect(() => {
    if (!enableAutoRecovery) return;

    const healthCheckInterval = setInterval(() => {
      const healthCheck = checkComponentHealth();

      if (!healthCheck.healthy && recoveryAttemptsRef.current < 3) {
        console.log(`Auto-recovery triggered for ${componentName}:`, healthCheck.issues);

        healthCheck.issues.forEach(async (issue) => {
          let errorType = 'component';

          if (issue.includes('overflow')) {
            errorType = 'wrapping';
          } else if (issue.includes('gradient')) {
            errorType = 'gradient';
          } else if (issue.includes('hidden') || issue.includes('transparent')) {
            errorType = 'display';
          }

          await handleUIError({
            type: errorType,
            message: issue
          }, { autoRecovery: true });
        });
      }
    }, 15000); // Check every 15 seconds

    return () => clearInterval(healthCheckInterval);
  }, [enableAutoRecovery, componentName, checkComponentHealth, handleUIError]);

  return {
    componentRef,
    handleUIError,
    backupState,
    restoreState,
    clearStateBackup,
    checkComponentHealth,
    applyRecoveryStrategy,
    forceRerender,
    resetToSafeState,
    recoveryAttempts: recoveryAttemptsRef.current
  };
};
