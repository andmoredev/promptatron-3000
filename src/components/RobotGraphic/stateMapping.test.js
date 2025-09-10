/**
 * @fileoverview Integration tests for robot state mapping and transitions
 */

import {
  mapAppStateToRobotState,
  detectStateChange,
  validateAppState,
  extractRobotRelevantState,
  createDebouncedStateHandler,
  createRobotStateComparison
} from './stateMapping.js';

/**
 * Test suite for mapAppStateToRobotState function
 */
describe('mapAppStateToRobotState', () => {
  test('should return idle for default state', () => {
    const appState = {
      isLoading: false,
      error: null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    };

    expect(mapAppStateToRobotState(appState)).toBe('idle');
  });

  test('should return error when error exists', () => {
    const appState = {
      isLoading: false,
      error: 'Something went wrong',
      progressStatus: '',
      progressValue: 0,
      testResults: null
    };

    expect(mapAppStateToRobotState(appState)).toBe('error');
  });

  test('should return thinking for early loading stages', () => {
    const appState = {
      isLoading: true,
      error: null,
      progressStatus: 'Initializing...',
      progressValue: 25,
      testResults: null
    };

    expect(mapAppStateToRobotState(appState)).toBe('thinking');
  });

  test('should return talking for later loading stages', () => {
    const appState = {
      isLoading: true,
      error: null,
      progressStatus: 'Generating response...',
      progressValue: 75,
      testResults: null
    };

    expect(mapAppStateToRobotState(appState)).toBe('talking');
  });

  test('should return talking when test results are present', () => {
    const appState = {
      isLoading: false,
      error: null,
      progressStatus: '',
      progressValue: 100,
      testResults: { id: '123', response: 'Test response' }
    };

    expect(mapAppStateToRobotState(appState)).toBe('talking');
  });

  test('should prioritize error over other states', () => {
    const appState = {
      isLoading: true,
      error: 'Critical error',
      progressStatus: 'Processing...',
      progressValue: 50,
      testResults: { id: '123' }
    };

    expect(mapAppStateToRobotState(appState)).toBe('error');
  });
});

/**
 * Test suite for detectStateChange function
 */
describe('detectStateChange', () => {
  test('should detect state change from idle to thinking', () => {
    const currentState = {
      isLoading: true,
      error: null,
      progressStatus: 'Starting...',
      progressValue: 10,
      testResults: null
    };

    const previousState = {
      isLoading: false,
      error: null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    };

    const result = detectStateChange(currentState, previousState);

    expect(result.hasChanged).toBe(true);
    expect(result.currentState).toBe('thinking');
    expect(result.previousState).toBe('idle');
    expect(result.reason).toBe('loading_started');
  });

  test('should not detect change when state remains the same', () => {
    const state = {
      isLoading: false,
      error: null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    };

    const result = detectStateChange(state, state);

    expect(result.hasChanged).toBe(false);
    expect(result.currentState).toBe('idle');
    expect(result.previousState).toBe('idle');
    expect(result.reason).toBe(null);
  });

  test('should detect progress transition from thinking to talking', () => {
    const currentState = {
      isLoading: true,
      error: null,
      progressStatus: 'Generating response...',
      progressValue: 60,
      testResults: null
    };

    const previousState = {
      isLoading: true,
      error: null,
      progressStatus: 'Connecting...',
      progressValue: 30,
      testResults: null
    };

    const result = detectStateChange(currentState, previousState);

    expect(result.hasChanged).toBe(true);
    expect(result.currentState).toBe('talking');
    expect(result.previousState).toBe('thinking');
    expect(result.reason).toBe('progress_advanced_to_talking');
  });

  test('should handle null previous state', () => {
    const currentState = {
      isLoading: false,
      error: null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    };

    const result = detectStateChange(currentState, null);

    expect(result.hasChanged).toBe(false);
    expect(result.currentState).toBe('idle');
    expect(result.previousState).toBe('idle');
  });
});

/**
 * Test suite for validateAppState function
 */
describe('validateAppState', () => {
  test('should validate correct app state', () => {
    const appState = {
      isLoading: false,
      error: null,
      progressStatus: 'Ready',
      progressValue: 0,
      testResults: null
    };

    const result = validateAppState(appState);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalizedState).toEqual(appState);
  });

  test('should handle null app state', () => {
    const result = validateAppState(null);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('App state must be an object');
    expect(result.normalizedState).toEqual({
      isLoading: false,
      error: null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    });
  });

  test('should normalize invalid property types', () => {
    const appState = {
      isLoading: 'true', // Should be boolean
      error: 123, // Should be string or null
      progressStatus: null, // Should be string
      progressValue: 150, // Should be 0-100
      testResults: 'invalid'
    };

    const result = validateAppState(appState);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.normalizedState.isLoading).toBe(false);
    expect(result.normalizedState.error).toBe(null);
    expect(result.normalizedState.progressStatus).toBe('');
    expect(result.normalizedState.progressValue).toBe(0);
  });

  test('should preserve valid properties while fixing invalid ones', () => {
    const appState = {
      isLoading: true, // Valid
      error: 'Valid error', // Valid
      progressStatus: null, // Invalid - should be string
      progressValue: 50, // Valid
      testResults: { id: '123' } // Valid
    };

    const result = validateAppState(appState);

    expect(result.normalizedState.isLoading).toBe(true);
    expect(result.normalizedState.error).toBe('Valid error');
    expect(result.normalizedState.progressStatus).toBe('');
    expect(result.normalizedState.progressValue).toBe(50);
    expect(result.normalizedState.testResults).toEqual({ id: '123' });
  });
});

/**
 * Test suite for extractRobotRelevantState function
 */
describe('extractRobotRelevantState', () => {
  test('should extract only robot-relevant properties', () => {
    const fullAppState = {
      isLoading: true,
      error: 'Test error',
      progressStatus: 'Processing...',
      progressValue: 50,
      testResults: { id: '123' },
      // Non-robot-relevant properties
      selectedModel: 'claude-3',
      systemPrompt: 'You are an AI',
      userPrompt: 'Analyze this',
      activeTab: 'test',
      validationErrors: {}
    };

    const result = extractRobotRelevantState(fullAppState);

    expect(result).toEqual({
      isLoading: true,
      error: 'Test error',
      progressStatus: 'Processing...',
      progressValue: 50,
      testResults: { id: '123' }
    });

    // Should not include non-robot-relevant properties
    expect(result.selectedModel).toBeUndefined();
    expect(result.systemPrompt).toBeUndefined();
    expect(result.activeTab).toBeUndefined();
  });

  test('should handle missing properties with defaults', () => {
    const partialAppState = {
      isLoading: true
      // Missing other properties
    };

    const result = extractRobotRelevantState(partialAppState);

    expect(result).toEqual({
      isLoading: true,
      error: null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    });
  });
});

/**
 * Test suite for createDebouncedStateHandler function
 */
describe('createDebouncedStateHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should debounce rapid state changes', () => {
    const mockCallback = jest.fn();
    const debouncedHandler = createDebouncedStateHandler(mockCallback, 100);

    // Call multiple times rapidly
    debouncedHandler({ state: 1 });
    debouncedHandler({ state: 2 });
    debouncedHandler({ state: 3 });

    // Should not have called callback yet
    expect(mockCallback).not.toHaveBeenCalled();

    // Fast-forward time
    jest.advanceTimersByTime(100);

    // Should have called callback once with the last state
    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith({ state: 3 });
  });

  test('should not call callback for identical states', () => {
    const mockCallback = jest.fn();
    const debouncedHandler = createDebouncedStateHandler(mockCallback, 50);

    const sameState = { isLoading: false, error: null };

    debouncedHandler(sameState);
    jest.advanceTimersByTime(50);

    debouncedHandler(sameState);
    jest.advanceTimersByTime(50);

    // Should only call once since states are identical
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });
});

/**
 * Test suite for createRobotStateComparison function
 */
describe('createRobotStateComparison', () => {
  test('should return true when robot states are the same', () => {
    const prevProps = {
      appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null },
      size: 'md',
      className: 'test-class'
    };

    const nextProps = {
      appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null },
      size: 'md',
      className: 'test-class'
    };

    const result = createRobotStateComparison(prevProps, nextProps);
    expect(result).toBe(true); // Should not re-render
  });

  test('should return false when robot states differ', () => {
    const prevProps = {
      appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
    };

    const nextProps = {
      appState: { isLoading: true, error: null, progressStatus: 'Loading...', progressValue: 25, testResults: null }
    };

    const result = createRobotStateComparison(prevProps, nextProps);
    expect(result).toBe(false); // Should re-render
  });

  test('should return false when other relevant props change', () => {
    const sameAppState = { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null };

    const prevProps = {
      appState: sameAppState,
      size: 'md',
      className: 'old-class'
    };

    const nextProps = {
      appState: sameAppState,
      size: 'md',
      className: 'new-class'
    };

    const result = createRobotStateComparison(prevProps, nextProps);
    expect(result).toBe(false); // Should re-render due to className change
  });

  test('should handle missing appState gracefully', () => {
    const prevProps = {};
    const nextProps = { appState: { isLoading: false, error: null } };

    const result = createRobotStateComparison(prevProps, nextProps);
    expect(result).toBe(true); // Both map to idle state
  });
});

/**
 * Integration test suite for complete state transition scenarios
 */
describe('State Transition Integration', () => {
  test('should handle complete test execution flow', () => {
    const states = [
      // Initial idle state
      { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null },
      // Start loading
      { isLoading: true, error: null, progressStatus: 'Initializing...', progressValue: 10, testResults: null },
      // Progress through thinking
      { isLoading: true, error: null, progressStatus: 'Connecting...', progressValue: 30, testResults: null },
      // Transition to talking
      { isLoading: true, error: null, progressStatus: 'Generating response...', progressValue: 70, testResults: null },
      // Complete with results
      { isLoading: false, error: null, progressStatus: 'Complete!', progressValue: 100, testResults: { id: '123', response: 'Success' } },
      // Return to idle
      { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
    ];

    const expectedRobotStates = ['idle', 'thinking', 'thinking', 'talking', 'talking', 'idle'];

    states.forEach((state, index) => {
      const robotState = mapAppStateToRobotState(state);
      expect(robotState).toBe(expectedRobotStates[index]);
    });
  });

  test('should handle error during loading', () => {
    const states = [
      // Start loading
      { isLoading: true, error: null, progressStatus: 'Processing...', progressValue: 50, testResults: null },
      // Error occurs
      { isLoading: false, error: 'Network error', progressStatus: '', progressValue: 0, testResults: null },
      // Error cleared
      { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
    ];

    const expectedRobotStates = ['talking', 'error', 'idle'];

    states.forEach((state, index) => {
      const robotState = mapAppStateToRobotState(state);
      expect(robotState).toBe(expectedRobotStates[index]);
    });
  });

  test('should detect all state changes in flow', () => {
    let previousState = null;
    const changes = [];

    const testFlow = [
      { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null },
      { isLoading: true, error: null, progressStatus: 'Starting...', progressValue: 20, testResults: null },
      { isLoading: true, error: null, progressStatus: 'Processing...', progressValue: 60, testResults: null },
      { isLoading: false, error: null, progressStatus: 'Complete!', progressValue: 100, testResults: { id: '123' } }
    ];

    testFlow.forEach(currentState => {
      const change = detectStateChange(currentState, previousState);
      if (change.hasChanged) {
        changes.push({
          from: change.previousState,
          to: change.currentState,
          reason: change.reason
        });
      }
      previousState = currentState;
    });

    expect(changes).toHaveLength(3);
    expect(changes[0]).toEqual({ from: 'idle', to: 'thinking', reason: 'loading_started' });
    expect(changes[1]).toEqual({ from: 'thinking', to: 'talking', reason: 'progress_advanced_to_talking' });
    expect(changes[2]).toEqual({ from: 'talking', to: 'talking', reason: 'test_completed' });
  });
});