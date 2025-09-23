import React, { useState, useEffect } from 'react';
import { useUIErrorRecovery } from '../hooks/useUIErrorRecovery';
import { createUIError } from '../utils/uiErrorIntegration';

/**
 * Example component demonstrating UI error recovery usage
 * This component shows how to integrate the UI error recovery system
 */
const UIErrorRecoveryExample = () => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Use the UI error recovery hook
  const {
    componentRef,
    handleUIError,
    checkComponentHealth,
    applyRecoveryStrategy,
    resetToSafeState
  } = useUIErrorRecovery('UIErrorRecoveryExample', {
    enableAutoRecovery: true,
    enableStateBackup: true,
    onRecoveryAttempt: (errorInfo) => {
      console.log('Recovery attempt:', errorInfo);
    },
    onRecoverySuccess: (result) => {
      console.log('Recovery successful:', result);
      setHasError(false);
      setErrorMessage('');
    },
    onRecoveryFailure: (result) => {
      console.error('Recovery failed:', result);
      setErrorMessage(`Recovery failed: ${result.userMessage || 'Unknown error'}`);
    }
  });

  // Simulate different types of UI errors for demonstration
  const simulateGradientError = async () => {
    const error = createUIError('Gradient rendering issue detected', {
      errorType: 'gradient',
      component: 'UIErrorRecoveryExample'
    });

    setHasError(true);
    setErrorMessage('Simulating gradient error...');

    try {
      await handleUIError(error);
    } catch (err) {
      setErrorMessage(`Error handling failed: ${err.message}`);
    }
  };

  const simulateTextWrappingError = async () => {
    const error = createUIError('Text overflow detected', {
      errorType: 'wrapping',
      component: 'UIErrorRecoveryExample'
    });

    setHasError(true);
    setErrorMessage('Simulating text wrapping error...');

    try {
      await handleUIError(error);
    } catch (err) {
      setErrorMessage(`Error handling failed: ${err.message}`);
    }
  };

  const simulateDisplayError = async () => {
    const error = createUIError('Component display issue', {
      errorType: 'display',
      component: 'UIErrorRecoveryExample'
    });

    setHasError(true);
    setErrorMessage('Simulating display error...');

    try {
      await handleUIError(error);
    } catch (err) {
      setErrorMessage(`Error handling failed: ${err.message}`);
    }
  };

  const performHealthCheck = async () => {
    const health = checkComponentHealth();
    console.log('Component health check:', health);

    if (!health.healthy) {
      setErrorMessage(`Health issues detected: ${health.issues.join(', ')}`);
      setHasError(true);
    } else {
      setErrorMessage('Component is healthy!');
      setHasError(false);
    }
  };

  const resetComponent = () => {
    resetToSafeState();
    setHasError(false);
    setErrorMessage('Component reset to safe state');
  };

  return (
    <div
      ref={componentRef}
      className="card max-w-2xl mx-auto"
      data-component="UIErrorRecoveryExample"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        UI Error Recovery System Demo
      </h3>

      <p className="text-sm text-gray-600 mb-6">
        This component demonstrates the UI error recovery system. Click the buttons below to simulate different types of UI errors and see how the system handles them.
      </p>

      {/* Error Status Display */}
      {hasError && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-sm font-medium text-yellow-800">Error State Active</span>
          </div>
        </div>
      )}

      {/* Error Message Display */}
      {errorMessage && (
        <div className={`mb-4 p-3 rounded-lg ${
          hasError
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}

      {/* Demo Buttons */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={simulateGradientError}
            className="btn-secondary text-sm"
          >
            Simulate Gradient Error
          </button>

          <button
            onClick={simulateTextWrappingError}
            className="btn-secondary text-sm"
          >
            Simulate Text Wrapping Error
          </button>

          <button
            onClick={simulateDisplayError}
            className="btn-secondary text-sm"
          >
            Simulate Display Error
          </button>

          <button
            onClick={performHealthCheck}
            className="btn-secondary text-sm"
          >
            Check Component Health
          </button>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={resetComponent}
            className="btn-primary text-sm"
          >
            Reset Component
          </button>

          <button
            onClick={() => {
              setHasError(false);
              setErrorMessage('');
            }}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Clear Messages
          </button>
        </div>
      </div>

      {/* Example of problematic content that might need recovery */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Sample Content</h4>
        <div className="system-prompt-display">
          <p className="text-xs text-gray-600">
            This is sample text content that might experience wrapping issues if it becomes very long and exceeds the container width. The UI error recovery system can detect and fix such issues automatically.
          </p>
        </div>

        <div className="mt-2 bg-gradient-to-r from-primary-50 to-secondary-100 p-2 rounded bg-gradient-container">
          <p className="text-xs text-gray-700">
            This is a gradient background that might experience rendering issues on some browsers or screen sizes.
          </p>
        </div>
      </div>

      {/* Recovery System Status */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Recovery System Status</h4>
        <div className="text-xs text-gray-600 space-y-1">
          <div>Auto Recovery: Enabled</div>
          <div>State Backup: Enabled</div>
          <div>Health Monitoring: Active</div>
        </div>
      </div>
    </div>
  );
};

export default UIErrorRecoveryExample;
