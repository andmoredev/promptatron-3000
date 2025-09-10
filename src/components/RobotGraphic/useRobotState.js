/**
 * @fileoverview React hook for managing robot state integration with application state
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  mapAppStateToRobotState,
  detectStateChange,
  validateAppState,
  extractRobotRelevantState,
  createDebouncedStateHandler
} from './stateMapping.js';

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

  // Create debounced state change handler
  const handleStateChange = useCallback((newAppState) => {
    const newRobotState = mapAppStateToRobotState(newAppState);

    // Detect if this is actually a change
    const changeDetection = detectStateChange(newAppState, previousAppStateRef.current);

    if (changeDetection.hasChanged) {
      setIsTransitioning(true);

      // Update state history for debugging
      setStateHistory(prev => [
        ...prev.slice(-9), // Keep last 10 entries
        {
          timestamp: Date.now(),
          from: changeDetection.previousState,
          to: changeDetection.currentState,
          reason: changeDetection.reason,
          appState: { ...newAppState }
        }
      ]);

      // Handle special case: successful completion should show talking briefly
      if (newRobotState === 'talking' &&
          !newAppState.isLoading &&
          newAppState.testResults &&
          !newAppState.error &&
          enableTransitions) {

        // Show talking state
        setCurrentRobotState('talking');

        // Clear any existing timeout
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
        }

        // Transition to idle after delay
        transitionTimeoutRef.current = setTimeout(() => {
          setCurrentRobotState('idle');
          setIsTransitioning(false);
        }, talkingDuration);
      } else {
        // Immediate state change
        setCurrentRobotState(newRobotState);
        setIsTransitioning(false);
      }
    }

    previousAppStateRef.current = newAppState;
  }, [talkingDuration, enableTransitions]);

  // Create or update debounced handler
  useEffect(() => {
    debouncedHandlerRef.current = createDebouncedStateHandler(handleStateChange, debounceDelay);
  }, [handleStateChange, debounceDelay]);

  // React to app state changes
  useEffect(() => {
    if (debouncedHandlerRef.current) {
      debouncedHandlerRef.current(robotRelevantState);
    }
  }, [robotRelevantState]);

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