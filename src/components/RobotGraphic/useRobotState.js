/**
 * @fileoverview React hook for managing robot state integration with application state
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Import the state change reason function from stateMapping
import {
  mapAppStateToRobotState,
  detectStateChange,
  validateAppState,
  extractRobotRelevantState,
  createDebouncedStateHandler
} from './stateMapping.js';

// Helper function to get state change reason (matches stateMapping.js implementation)
function getStateChangeReason(currentAppState, previousAppState) {
  const {
    isLoading,
    error,
    progressStatus,
    testResults,
    isStreaming,
    streamingContent,
    isRequestPending,
    streamingError
  } = currentAppState;
  const prevState = previousAppState || {};

  // Error state changes (including streaming errors)
  if ((error || streamingError) && !prevState.error && !prevState.streamingError) {
    return streamingError ? 'streaming_error_occurred' : 'error_occurred';
  }
  if (!error && !streamingError && (prevState.error || prevState.streamingError)) {
    return 'error_cleared';
  }

  // Streaming state changes
  if (isStreaming && streamingContent && (!prevState.isStreaming || !prevState.streamingContent)) {
    return 'streaming_started_talking';
  }
  if (!isStreaming && prevState.isStreaming) {
    return 'streaming_completed';
  }

  // Request processing state changes
  if (isRequestPending && !prevState.isRequestPending) {
    return 'request_sending_started';
  }
  if (!isRequestPending && prevState.isRequestPending) {
    return 'request_sending_completed';
  }

  // Loading state changes
  if (isLoading && !prevState.isLoading) {
    return 'loading_started';
  }
  if (!isLoading && prevState.isLoading) {
    return 'loading_completed';
  }

  // Progress changes within loading - distinguish thinking vs talking phases
  if (isLoading && prevState.isLoading) {
    const currentProgress = currentAppState.progressValue || 0;
    const prevProgress = prevState.progressValue || 0;

    if (currentProgress >= 50 && prevProgress < 50) {
      return 'progress_advanced_to_talking';
    }
    if (currentProgress < 50 && prevProgress >= 50) {
      return 'progress_returned_to_thinking';
    }
  }

  // Streaming content changes
  if (isStreaming && streamingContent !== prevState.streamingContent) {
    return 'streaming_content_updated';
  }

  // Test completion
  if (testResults && !prevState.testResults) {
    return 'test_completed';
  }

  return 'state_updated';
}

/**
 * Custom hook for managing robot state based on application state
 * @param {Object} appState - Current application state
 * @param {Object} options - Configuration options
 * @param {number} [options.talkingDuration=2000] - Duration to show talking state after completion
 * @param {number} [options.debounceDelay=100] - Debounce delay for state changes
 * @param {boolean} [options.enableTransitions=true] - Whether to enable state transitions
 * @returns {Object} Robot state management object
 */
export function useRobotState(appState, options = {}) {
  const {
    talkingDuration = 2000,
    debounceDelay = 100,
    enableTransitions = true
  } = options;

  // Internal state
  const [currentRobotState, setCurrentRobotState] = useState('idle');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [stateHistory, setStateHistory] = useState([]);

  // Refs for managing timeouts and previous state
  const transitionTimeoutRef = useRef(null);
  const previousAppStateRef = useRef(null);
  const debouncedHandlerRef = useRef(null);

  // Validate and normalize app state
  const validatedAppState = useMemo(() => {
    const validation = validateAppState(appState);
    if (!validation.isValid) {
      console.warn('Invalid app state provided to useRobotState:', validation.errors);
    }
    return validation.normalizedState;
  }, [appState]);

  // Extract only robot-relevant state for comparison
  const robotRelevantState = useMemo(() => {
    return extractRobotRelevantState(validatedAppState);
  }, [validatedAppState]);

  // Enhanced state change handler for thinking and talking states
  const handleStateChange = useCallback((newAppState) => {
    const newRobotState = mapAppStateToRobotState(newAppState);
    const previousAppState = previousAppStateRef.current;

    // Enhanced logging for streaming states
    if (import.meta.env.VITE_ROBOT_DEBUG === 'true') {
      console.log('🤖 Processing state change:', {
        newAppState: {
          isLoading: newAppState.isLoading,
          isStreaming: newAppState.isStreaming,
          isRequestPending: newAppState.isRequestPending,
          hasStreamingContent: !!newAppState.streamingContent,
          error: newAppState.error,
          streamingError: newAppState.streamingError
        },
        newRobotState,
        currentRobotState,
        previousAppState: previousAppState ? {
          isLoading: previousAppState.isLoading,
          isStreaming: previousAppState.isStreaming,
          isRequestPending: previousAppState.isRequestPending
        } : null
      });
    }

    // Always update the previous state reference
    previousAppStateRef.current = newAppState;

    // Check if robot state actually changed
    const previousRobotState = previousAppState ? mapAppStateToRobotState(previousAppState) : 'idle';

    if (newRobotState !== previousRobotState) {
      const reason = getStateChangeReason(newAppState, previousAppState);

      if (import.meta.env.VITE_ROBOT_DEBUG === 'true') {
        console.log('🤖 Robot state transition:', {
          from: previousRobotState,
          to: newRobotState,
          reason,
          isThinkingToTalking: previousRobotState === 'thinking' && newRobotState === 'talking',
          isTalkingToIdle: previousRobotState === 'talking' && newRobotState === 'idle'
        });
      }

      // Update state history for debugging
      setStateHistory(prev => [
        ...prev.slice(-9), // Keep last 10 entries
        {
          timestamp: Date.now(),
          from: previousRobotState,
          to: newRobotState,
          reason,
          appState: { ...newAppState }
        }
      ]);

      // Handle state transitions based on requirements
      if (newRobotState === 'thinking') {
        // Requirement 2.1: "WHEN streaming begins THEN the robot graphic SHALL transition to a 'talking' or 'generating' visual state"
        // But thinking state is for request processing phase
        setCurrentRobotState('thinking');
        setIsTransitioning(false);
      } else if (newRobotState === 'talking') {
        // Requirement 2.2: "WHEN tokens are actively streaming THEN the robot SHALL maintain animated visual indicators"
        setCurrentRobotState('talking');
        setIsTransitioning(false);
      } else if (newRobotState === 'idle') {
        // Requirement 2.3: "WHEN streaming completes successfully THEN the robot SHALL transition to a completed or neutral state"
        setCurrentRobotState('idle');
        setIsTransitioning(false);
      } else if (newRobotState === 'error') {
        // Requirement 2.4: "WHEN streaming encounters an error THEN the robot SHALL transition to an appropriate error state"
        setCurrentRobotState('error');
        setIsTransitioning(false);
      } else {
        // Default case
        setCurrentRobotState(newRobotState);
        setIsTransitioning(false);
      }

      // Clear any existing timeout since we're changing state
      if (transitionTimeoutRef.current) {
        if (import.meta.env.VITE_ROBOT_DEBUG === 'true') {
          console.log('🤖 Clearing existing timeout for state change');
        }
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    } else {
      if (import.meta.env.VITE_ROBOT_DEBUG === 'true') {
        console.log('🤖 No robot state change detected, staying in:', newRobotState);
      }
    }
  }, [talkingDuration, enableTransitions, currentRobotState]);

  // Create or update debounced handler
  useEffect(() => {
    debouncedHandlerRef.current = createDebouncedStateHandler(handleStateChange, debounceDelay);
  }, [handleStateChange, debounceDelay]);

  // React to app state changes
  useEffect(() => {
    // Direct state change handling (bypassing debouncing for now)
    handleStateChange(robotRelevantState);
  }, [robotRelevantState, handleStateChange]);



  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // Force immediate state update (bypasses debouncing)
  const forceStateUpdate = useCallback(() => {
    const newRobotState = mapAppStateToRobotState(robotRelevantState);
    setCurrentRobotState(newRobotState);
    setIsTransitioning(false);

    // Clear any pending transitions
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, [robotRelevantState]);

  // Get current state info
  const getStateInfo = useCallback(() => {
    return {
      currentState: currentRobotState,
      isTransitioning,
      appState: robotRelevantState,
      mappedState: mapAppStateToRobotState(robotRelevantState),
      history: stateHistory
    };
  }, [currentRobotState, isTransitioning, robotRelevantState, stateHistory]);

  // Reset state history (useful for testing)
  const clearHistory = useCallback(() => {
    setStateHistory([]);
  }, []);

  return {
    // Current robot state
    currentState: currentRobotState,

    // State management info
    isTransitioning,
    stateHistory,

    // Control functions
    forceUpdate: forceStateUpdate,
    getStateInfo,
    clearHistory,

    // Debugging info
    debug: {
      appState: robotRelevantState,
      mappedState: mapAppStateToRobotState(robotRelevantState),
      previousState: previousAppStateRef.current,
      hasTimeout: !!transitionTimeoutRef.current
    }
  };
}

/**
 * Hook for comparing robot state changes (useful for React.memo)
 * @param {Object} appState - Application state to monitor
 * @returns {Object} Comparison utilities
 */
export function useRobotStateComparison(appState) {
  const previousStateRef = useRef(null);
  const [changeCount, setChangeCount] = useState(0);

  const currentRobotState = useMemo(() => {
    return mapAppStateToRobotState(appState);
  }, [appState]);

  const hasChanged = useMemo(() => {
    const prevState = previousStateRef.current;
    const changed = prevState !== null && prevState !== currentRobotState;

    if (changed) {
      setChangeCount(prev => prev + 1);
    }

    previousStateRef.current = currentRobotState;
    return changed;
  }, [currentRobotState]);

  return {
    currentState: currentRobotState,
    hasChanged,
    changeCount,
    previousState: previousStateRef.current
  };
}

/**
 * Performance-optimized hook that only updates when robot state actually changes
 * @param {Object} appState - Application state
 * @param {Object} options - Hook options
 * @returns {string} Current robot state (only updates when changed)
 */
export function useOptimizedRobotState(appState, options = {}) {
  const { enableLogging = false } = options;

  const [robotState, setRobotState] = useState(() => mapAppStateToRobotState(appState));
  const previousRobotStateRef = useRef(robotState);
  const renderCountRef = useRef(0);

  useEffect(() => {
    renderCountRef.current += 1;

    const newRobotState = mapAppStateToRobotState(appState);

    if (newRobotState !== previousRobotStateRef.current) {
      if (enableLogging) {
        console.log(`Robot state changed: ${previousRobotStateRef.current} -> ${newRobotState} (render #${renderCountRef.current})`);
      }

      setRobotState(newRobotState);
      previousRobotStateRef.current = newRobotState;
    }
  }, [appState, enableLogging]);

  return robotState;
}