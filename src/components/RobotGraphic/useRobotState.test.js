/**
 * @fileoverview Tests for useRobotState hook and related utilities
 */

import { renderHook, act } from '@testing-library/react';
import { useRobotState, useRobotStateComparison, useOptimizedRobotState } from './useRobotState.js';

// Mock timers for testing
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Test suite for useRobotState hook
 */
describe('useRobotState', () => {
  test('should initialize with idle state', () => {
    const appState = {
      isLoading: false,
      error: null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    };

    const { result } = renderHook(() => useRobotState(appState));

    expect(result.current.currentState).toBe('idle');
    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.stateHistory).toHaveLength(0);
  });

  test('should transition to thinking when loading starts', () => {
    const initialState = {
      isLoading: false,
      error: null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    };

    const { result, rerender } = renderHook(
      ({ appState }) => useRobotState(appState),
      { initialProps: { appState: initialState } }
    );

    // Start loading
    const loadingState = {
      ...initialState,
      isLoading: true,
      progressStatus: 'Initializing...',
      progressValue: 10
    };

    act(() => {
      rerender({ appState: loadingState });
      jest.advanceTimersByTime(150); // Advance past debounce delay
    });

    expect(result.current.currentState).toBe('thinking');
    expect(result.current.stateHistory).toHaveLength(1);
    expect(result.current.stateHistory[0].reason).toBe('loading_started');
  });

  test('should transition to talking during response generation', () => {
    const initialState = {
      isLoading: true,
      error: null,
      progressStatus: 'Connecting...',
      progressValue: 30,
      testResults: null
    };

    const { result, rerender } = renderHook(
      ({ appState }) => useRobotState(appState),
      { initialProps: { appState: initialState } }
    );

    // Advance to talking phase
    const talkingState = {
      ...initialState,
      progressStatus: 'Generating response...',
      progressValue: 70
    };

    act(() => {
      rerender({ appState: talkingState });
      jest.advanceTimersByTime(150);
    });

    expect(result.current.currentState).toBe('talking');
  });

  test('should handle error state', () => {
    const initialState = {
      isLoading: true,
      error: null,
      progressStatus: 'Processing...',
      progressValue: 50,
      testResults: null
    };

    const { result, rerender } = renderHook(
      ({ appState }) => useRobotState(appState),
      { initialProps: { appState: initialState } }
    );

    // Error occurs
    const errorState = {
      ...initialState,
      isLoading: false,
      error: 'Something went wrong'
    };

    act(() => {
      rerender({ appState: errorState });
      jest.advanceTimersByTime(150);
    });

    expect(result.current.currentState).toBe('error');
    expect(result.current.stateHistory[result.current.stateHistory.length - 1].reason).toBe('error_occurred');
  });

  test('should transition from talking to idle after completion', () => {
    const completionState = {
      isLoading: false,
      error: null,
      progressStatus: 'Complete!',
      progressValue: 100,
      testResults: { id: '123', response: 'Success' }
    };

    const { result } = renderHook(() => useRobotState(completionState, { talkingDuration: 1000 }));

    act(() => {
      jest.advanceTimersByTime(150); // Initial debounce
    });

    expect(result.current.currentState).toBe('talking');

    act(() => {
      jest.advanceTimersByTime(1000); // Wait for talking duration
    });

    expect(result.current.currentState).toBe('idle');
  });

  test('should provide force update functionality', () => {
    const appState = {
      isLoading: true,
      error: null,
      progressStatus: 'Processing...',
      progressValue: 50,
      testResults: null
    };

    const { result } = renderHook(() => useRobotState(appState));

    act(() => {
      result.current.forceUpdate();
    });

    expect(result.current.currentState).toBe('talking');
    expect(result.current.isTransitioning).toBe(false);
  });

  test('should provide state info', () => {
    const appState = {
      isLoading: false,
      error: null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    };

    const { result } = renderHook(() => useRobotState(appState));

    const stateInfo = result.current.getStateInfo();

    expect(stateInfo).toHaveProperty('currentState');
    expect(stateInfo).toHaveProperty('isTransitioning');
    expect(stateInfo).toHaveProperty('appState');
    expect(stateInfo).toHaveProperty('mappedState');
    expect(stateInfo).toHaveProperty('history');
  });

  test('should clear history', () => {
    const { result, rerender } = renderHook(
      ({ appState }) => useRobotState(appState),
      {
        initialProps: {
          appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
        }
      }
    );

    // Create some history
    act(() => {
      rerender({ appState: { isLoading: true, error: null, progressStatus: 'Loading...', progressValue: 25, testResults: null } });
      jest.advanceTimersByTime(150);
    });

    expect(result.current.stateHistory).toHaveLength(1);

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.stateHistory).toHaveLength(0);
  });

  test('should handle invalid app state', () => {
    const invalidState = null;

    const { result } = renderHook(() => useRobotState(invalidState));

    expect(result.current.currentState).toBe('idle');
  });

  test('should respect debounce delay option', () => {
    const { result, rerender } = renderHook(
      ({ appState }) => useRobotState(appState, { debounceDelay: 200 }),
      {
        initialProps: {
          appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
        }
      }
    );

    // Change state
    act(() => {
      rerender({ appState: { isLoading: true, error: null, progressStatus: 'Loading...', progressValue: 25, testResults: null } });
    });

    // Should not have changed yet (within debounce period)
    expect(result.current.stateHistory).toHaveLength(0);

    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Should have changed after debounce period
    expect(result.current.stateHistory).toHaveLength(1);
  });

  test('should disable transitions when option is false', () => {
    const completionState = {
      isLoading: false,
      error: null,
      progressStatus: 'Complete!',
      progressValue: 100,
      testResults: { id: '123', response: 'Success' }
    };

    const { result } = renderHook(() => useRobotState(completionState, { enableTransitions: false }));

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current.currentState).toBe('talking');

    // Should not transition to idle even after talking duration
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.currentState).toBe('talking');
  });
});

/**
 * Test suite for useRobotStateComparison hook
 */
describe('useRobotStateComparison', () => {
  test('should track state changes', () => {
    const { result, rerender } = renderHook(
      ({ appState }) => useRobotStateComparison(appState),
      {
        initialProps: {
          appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
        }
      }
    );

    expect(result.current.currentState).toBe('idle');
    expect(result.current.hasChanged).toBe(false);
    expect(result.current.changeCount).toBe(0);

    // Change to loading state
    rerender({ appState: { isLoading: true, error: null, progressStatus: 'Loading...', progressValue: 25, testResults: null } });

    expect(result.current.currentState).toBe('thinking');
    expect(result.current.hasChanged).toBe(true);
    expect(result.current.changeCount).toBe(1);
  });

  test('should not increment change count for same state', () => {
    const appState = { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null };

    const { result, rerender } = renderHook(
      ({ appState }) => useRobotStateComparison(appState),
      { initialProps: { appState } }
    );

    const initialChangeCount = result.current.changeCount;

    // Re-render with same state
    rerender({ appState });

    expect(result.current.changeCount).toBe(initialChangeCount);
    expect(result.current.hasChanged).toBe(false);
  });
});

/**
 * Test suite for useOptimizedRobotState hook
 */
describe('useOptimizedRobotState', () => {
  test('should return current robot state', () => {
    const appState = {
      isLoading: true,
      error: null,
      progressStatus: 'Processing...',
      progressValue: 60,
      testResults: null
    };

    const { result } = renderHook(() => useOptimizedRobotState(appState));

    expect(result.current).toBe('talking');
  });

  test('should only update when robot state changes', () => {
    const { result, rerender } = renderHook(
      ({ appState }) => useOptimizedRobotState(appState),
      {
        initialProps: {
          appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
        }
      }
    );

    const initialState = result.current;

    // Change non-robot-affecting properties
    rerender({
      appState: {
        isLoading: false,
        error: null,
        progressStatus: 'Different status', // This shouldn't affect robot state
        progressValue: 0,
        testResults: null
      }
    });

    expect(result.current).toBe(initialState);
  });

  test('should update when robot state actually changes', () => {
    const { result, rerender } = renderHook(
      ({ appState }) => useOptimizedRobotState(appState),
      {
        initialProps: {
          appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
        }
      }
    );

    expect(result.current).toBe('idle');

    // Change to loading state
    rerender({
      appState: {
        isLoading: true,
        error: null,
        progressStatus: 'Loading...',
        progressValue: 25,
        testResults: null
      }
    });

    expect(result.current).toBe('thinking');
  });

  test('should handle logging option', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { rerender } = renderHook(
      ({ appState }) => useOptimizedRobotState(appState, { enableLogging: true }),
      {
        initialProps: {
          appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
        }
      }
    );

    // Change state to trigger logging
    rerender({
      appState: {
        isLoading: true,
        error: null,
        progressStatus: 'Loading...',
        progressValue: 25,
        testResults: null
      }
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Robot state changed'));

    consoleSpy.mockRestore();
  });
});

/**
 * Integration tests for hook interactions
 */
describe('Hook Integration', () => {
  test('should handle rapid state changes with debouncing', () => {
    const { result, rerender } = renderHook(
      ({ appState }) => useRobotState(appState, { debounceDelay: 100 }),
      {
        initialProps: {
          appState: { isLoading: false, error: null, progressStatus: '', progressValue: 0, testResults: null }
        }
      }
    );

    // Rapid state changes
    act(() => {
      rerender({ appState: { isLoading: true, error: null, progressStatus: 'Step 1', progressValue: 10, testResults: null } });
      rerender({ appState: { isLoading: true, error: null, progressStatus: 'Step 2', progressValue: 20, testResults: null } });
      rerender({ appState: { isLoading: true, error: null, progressStatus: 'Step 3', progressValue: 30, testResults: null } });
    });

    // Should not have processed changes yet
    expect(result.current.stateHistory).toHaveLength(0);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Should have processed only the final state
    expect(result.current.stateHistory).toHaveLength(1);
    expect(result.current.currentState).toBe('thinking');
  });

  test('should cleanup timeouts on unmount', () => {
    const { unmount } = renderHook(() => useRobotState({
      isLoading: false,
      error: null,
      progressStatus: 'Complete!',
      progressValue: 100,
      testResults: { id: '123' }
    }));

    // Should not throw errors on unmount
    expect(() => unmount()).not.toThrow();
  });
});