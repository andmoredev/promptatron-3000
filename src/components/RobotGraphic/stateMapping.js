/**
 * @fileoverview State management integration utilities for RobotGraphic component
 * Maps application states to robot states and provides state change detection
 */

import { ROBOT_STATES, getRobotState } from './robotStates.js';

/**
 * Maps application states from App.jsx to robot states
 * @param {Object} appState - The application state object
 * @param {boolean} appState.isLoading - Whether the app is currently loading
 * @param {string|null} appState.error - Current error message, if any
 * @param {string} appState.progressStatus - Current progress status message
 * @param {number} appState.progressValue - Progress value (0-100)
 * @param {Object} appState.testResults - Test results object
 * @returns {string} The corresponding robot state key
 */
export function mapAppStateToRobotState(appState) {
  const { isLoading, error, progressStatus, progressValue, testResults } = appState;

  // Error state takes highest priority
  if (error) {
    return 'error';
  }

  // Loading states - map to thinking or talking based on progress
  if (isLoading) {
    // If we have progress status, determine if we're thinking or talking
    if (progressStatus) {
      const status = progressStatus.toLowerCase();

      // Early stages: thinking
      if (status.includes('initializing') ||
          status.includes('connecting') ||
          status.includes('validating') ||
          progressValue < 50) {
        return 'thinking';
      }

      // Later stages: talking (generating response)
      if (status.includes('sending') ||
          status.includes('generating') ||
          status.includes('processing response') ||
          progressValue >= 50) {
        return 'talking';
      }
    }

    // Default loading state is thinking
    return 'thinking';
  }

  // If we just completed a test successfully, return to happy state (idle)
  // According to Requirement 4.3: "WHEN an operation completes successfully THEN the robot SHALL return to happy state"
  if (testResults && !error && !isLoading) {
    return 'idle';
  }

  // Default state is idle (happy)
  return 'idle';
}

/**
 * Detects if the robot state should change based on application state changes
 * @param {Object} currentAppState - Current application state
 * @param {Object} previousAppState - Previous application state
 * @returns {Object} State change detection result
 */
export function detectStateChange(currentAppState, previousAppState) {
  const currentRobotState = mapAppStateToRobotState(currentAppState);
  const previousRobotState = previousAppState ? mapAppStateToRobotState(previousAppState) : 'idle';

  const hasChanged = currentRobotState !== previousRobotState;

  // Debug logging when robot debug is enabled
  if (import.meta.env.VITE_ROBOT_DEBUG === 'true') {
    console.log('🔍 State Change Detection:', {
      currentAppState,
      previousAppState,
      currentRobotState,
      previousRobotState,
      hasChanged
    });
  }

  return {
    hasChanged,
    currentState: currentRobotState,
    previousState: previousRobotState,
    reason: hasChanged ? getStateChangeReason(currentAppState, previousAppState) : null
  };
}

/**
 * Determines the reason for a state change for debugging and accessibility
 * @param {Object} currentAppState - Current application state
 * @param {Object} previousAppState - Previous application state
 * @returns {string} Reason for the state change
 */
function getStateChangeReason(currentAppState, previousAppState) {
  const { isLoading, error, progressStatus, testResults } = currentAppState;
  const prevState = previousAppState || {};

  // Error state changes
  if (error && !prevState.error) {
    return 'error_occurred';
  }
  if (!error && prevState.error) {
    return 'error_cleared';
  }

  // Loading state changes
  if (isLoading && !prevState.isLoading) {
    return 'loading_started';
  }
  if (!isLoading && prevState.isLoading) {
    return 'loading_completed';
  }

  // Progress changes within loading
  if (isLoading && prevState.isLoading) {
    const currentProgress = currentAppState.progressValue || 0;
    const prevProgress = prevState.progressValue || 0;

    if (currentProgress >= 50 && prevProgress < 50) {
      return 'progress_advanced_to_talking';
    }
  }

  // Test completion
  if (testResults && !prevState.testResults) {
    return 'test_completed';
  }

  return 'state_updated';
}

/**
 * Creates a state comparison function for React.memo optimization
 * Only re-render if robot-relevant state has changed
 * @param {Object} prevProps - Previous component props
 * @param {Object} nextProps - Next component props
 * @returns {boolean} True if props are equal (should not re-render)
 */
export function createRobotStateComparison(prevProps, nextProps) {
  // Extract robot-relevant state from props
  const prevRobotState = mapAppStateToRobotState(prevProps.appState || {});
  const nextRobotState = mapAppStateToRobotState(nextProps.appState || {});

  // Compare robot state
  if (prevRobotState !== nextRobotState) {
    return false; // Props are different, should re-render
  }

  // Compare other props that affect rendering
  if (prevProps.size !== nextProps.size ||
      prevProps.className !== nextProps.className ||
      prevProps.ariaLabel !== nextProps.ariaLabel) {
    return false; // Props are different, should re-render
  }

  // Props are equal, should not re-render
  return true;
}

/**
 * Hook-like function to manage robot state transitions with timing
 * Handles brief "talking" state after successful completion
 * @param {Object} appState - Current application state
 * @param {Object} options - Configuration options
 * @param {number} [options.talkingDuration=2000] - How long to show talking state after completion
 * @returns {Object} State management result
 */
export function manageRobotStateTransitions(appState, options = {}) {
  const { talkingDuration = 2000 } = options;

  let currentState = mapAppStateToRobotState(appState);
  let transitionTimeout = null;

  // If we just completed successfully, show talking briefly then transition to idle
  if (currentState === 'talking' && !appState.isLoading && appState.testResults && !appState.error) {
    transitionTimeout = setTimeout(() => {
      currentState = 'idle';
    }, talkingDuration);
  }

  return {
    currentState,
    cleanup: () => {
      if (transitionTimeout) {
        clearTimeout(transitionTimeout);
      }
    }
  };
}

/**
 * Validates that the application state object has the expected structure
 * @param {Object} appState - Application state to validate
 * @returns {Object} Validation result
 */
export function validateAppState(appState) {
  if (!appState || typeof appState !== 'object') {
    return {
      isValid: false,
      errors: ['App state must be an object'],
      normalizedState: getDefaultAppState()
    };
  }

  const errors = [];
  const normalizedState = { ...getDefaultAppState(), ...appState };

  // Validate expected properties
  if (typeof normalizedState.isLoading !== 'boolean') {
    errors.push('isLoading must be a boolean');
    normalizedState.isLoading = false;
  }

  if (normalizedState.error !== null && typeof normalizedState.error !== 'string') {
    errors.push('error must be null or a string');
    normalizedState.error = null;
  }

  if (typeof normalizedState.progressStatus !== 'string') {
    errors.push('progressStatus must be a string');
    normalizedState.progressStatus = '';
  }

  if (typeof normalizedState.progressValue !== 'number' ||
      normalizedState.progressValue < 0 ||
      normalizedState.progressValue > 100) {
    errors.push('progressValue must be a number between 0 and 100');
    normalizedState.progressValue = 0;
  }

  return {
    isValid: errors.length === 0,
    errors,
    normalizedState
  };
}

/**
 * Returns the default application state structure
 * @returns {Object} Default app state
 */
function getDefaultAppState() {
  return {
    isLoading: false,
    error: null,
    progressStatus: '',
    progressValue: 0,
    testResults: null
  };
}

/**
 * Creates a debounced state change handler to prevent rapid state changes
 * @param {Function} callback - Function to call when state changes
 * @param {number} [delay=100] - Debounce delay in milliseconds
 * @returns {Function} Debounced handler function
 */
export function createDebouncedStateHandler(callback, delay = 100) {
  let timeoutId = null;
  let lastState = null;

  return function(newState) {
    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    timeoutId = setTimeout(() => {
      // Only call callback if state actually changed
      if (JSON.stringify(newState) !== JSON.stringify(lastState)) {
        callback(newState);
        lastState = { ...newState };
      }
    }, delay);
  };
}

/**
 * Utility to extract robot-relevant state from full App.jsx state
 * @param {Object} fullAppState - Complete application state
 * @returns {Object} Minimal state object needed for robot
 */
export function extractRobotRelevantState(fullAppState) {
  return {
    isLoading: fullAppState.isLoading || false,
    error: fullAppState.error || null,
    progressStatus: fullAppState.progressStatus || '',
    progressValue: fullAppState.progressValue || 0,
    testResults: fullAppState.testResults || null
  };
}