/**
 * @fileoverview React hook for managing Chad reveal state with persistence and animations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  saveChadRevealState,
  loadChadRevealState,
  clearChadRevealState,
  getChadRevealStateWithFallback,
  resetChadRevealState
} from '../../utils/chadStorage.js';

/**
 * Custom React hook for managing Chad reveal state
 * Provides state management, persistence, and animation controls for Chad reveal functionality
 *
 * @param {Object} options - Configuration options
 * @param {number} [options.revealAnimationDuration=800] - Duration of reveal animation in milliseconds
 * @param {number} [options.revealDelay=300] - Delay before starting reveal animation
 * @param {boolean} [options.enablePersistence=true] - Whether to persist state to localStorage
 * @returns {Object} Chad reveal state management object
 */
export function useChadReveal(options = {}) {
  const {
    revealAnimationDuration = 800,
    revealDelay = 300,
    enablePersistence = true
  } = options;

  // Core state
  const [isRevealed, setIsRevealed] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [error, setError] = useState(null);

  // Refs for managing timeouts and preventing race conditions
  const revealTimeoutRef = useRef(null);
  const animationTimeoutRef = useRef(null);
  const mountedRef = useRef(false); // Start as false, will be set to true in useEffect

  /**
   * Load Chad reveal state from storage on initialization
   */
  const loadRevealState = useCallback(() => {
    console.log('loadRevealState called, enablePersistence:', enablePersistence);
    if (!enablePersistence) {
      console.log('Persistence disabled, skipping load');
      return;
    }

    try {
      console.log('Loading Chad reveal state from storage...');
      const state = getChadRevealStateWithFallback();
      console.log('Loaded state:', state);

      console.log('Setting state:', {
        isRevealed: state.isRevealed,
        storageAvailable: state.storageAvailable,
        fallbackMode: state.fallbackMode
      });
      setIsRevealed(state.isRevealed);
      setStorageAvailable(state.storageAvailable);
      setFallbackMode(state.fallbackMode);
      setError(null);

      console.log('Chad reveal state loaded successfully:', {
        isRevealed: state.isRevealed,
        storageAvailable: state.storageAvailable,
        fallbackMode: state.fallbackMode,
        revealedAt: state.revealedAt
      });
    } catch (err) {
      console.warn('Failed to load Chad reveal state:', err);
      setError('Failed to load reveal state');
      setFallbackMode(true);
    }
  }, [enablePersistence]);

  /**
   * Save Chad reveal state to storage
   */
  const saveRevealState = useCallback((revealed) => {
    if (!enablePersistence) {
      return true;
    }

    try {
      const success = saveChadRevealState(revealed);

      if (!success && mountedRef.current) {
        setFallbackMode(true);
        console.warn('Chad reveal state could not be persisted - using session-only mode');
      }

      return success;
    } catch (err) {
      console.warn('Failed to save Chad reveal state:', err);
      if (mountedRef.current) {
        setError('Failed to save reveal state');
        setFallbackMode(true);
      }
      return false;
    }
  }, [enablePersistence]);

  /**
   * Trigger Chad reveal with smooth animation
   */
  const revealChad = useCallback(async () => {
    console.log('revealChad called!', { isRevealing, isRevealed, mountedRef: mountedRef.current });

    // Prevent multiple simultaneous reveals
    if (isRevealing || isRevealed) {
      console.log('Chad reveal blocked:', { isRevealing, isRevealed });
      return false;
    }

    console.log('Starting Chad reveal process...');
    setError(null);
    setIsRevealing(true);

    try {
      // Immediate reveal for testing - skip timeouts for now
      console.log('Completing Chad reveal immediately...');

      // Complete the reveal
      setIsRevealed(true);
      setIsRevealing(false);

      // Persist the reveal state
      const saveResult = saveRevealState(true);
      console.log('Save reveal state result:', saveResult);

      console.log('Chad revealed successfully!');
      return true;
    } catch (err) {
      console.error('Failed to reveal Chad:', err);
      setError('Failed to reveal Chad');
      setIsRevealing(false);
      return false;
    }
  }, [isRevealing, isRevealed, revealAnimationDuration, revealDelay, saveRevealState]);

  /**
   * Reset Chad reveal state (development only)
   * This function allows developers to test the reveal functionality
   */
  const resetReveal = useCallback(() => {
    if (!import.meta.env.DEV) {
      console.warn('resetReveal is only available in development mode');
      return false;
    }

    try {
      // Clear any pending timeouts
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }

      // Reset state
      setIsRevealed(false);
      setIsRevealing(false);
      setError(null);

      // Clear storage
      const success = resetChadRevealState();

      if (import.meta.env.DEV) {
        console.log('Chad reveal state reset (development only)');
      }

      return success;
    } catch (err) {
      console.error('Failed to reset Chad reveal state:', err);
      setError('Failed to reset reveal state');
      return false;
    }
  }, []);

  /**
   * Force immediate reveal without animation (for testing)
   */
  const forceReveal = useCallback((revealed = true) => {
    if (!import.meta.env.DEV) {
      console.warn('forceReveal is only available in development mode');
      return false;
    }

    try {
      // Clear any pending animations
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }

      setIsRevealed(revealed);
      setIsRevealing(false);
      setError(null);

      // Persist the state
      saveRevealState(revealed);

      if (import.meta.env.DEV) {
        console.log(`Chad reveal state forced to: ${revealed}`);
      }

      return true;
    } catch (err) {
      console.error('Failed to force Chad reveal state:', err);
      setError('Failed to force reveal state');
      return false;
    }
  }, [saveRevealState]);

  /**
   * Get current reveal state information
   */
  const getRevealInfo = useCallback(() => {
    return {
      isRevealed,
      isRevealing,
      storageAvailable,
      fallbackMode,
      error,
      hasActiveAnimation: !!(revealTimeoutRef.current || animationTimeoutRef.current)
    };
  }, [isRevealed, isRevealing, storageAvailable, fallbackMode, error]);

  /**
   * Check if Chad should be visible (revealed and not currently revealing)
   */
  const shouldShowChad = useCallback(() => {
    return isRevealed && !isRevealing;
  }, [isRevealed, isRevealing]);

  /**
   * Check if reveal button should be visible
   */
  const shouldShowRevealButton = useCallback(() => {
    const shouldShow = !isRevealed && !isRevealing;
    console.log('shouldShowRevealButton:', { shouldShow, isRevealed, isRevealing });
    return shouldShow;
  }, [isRevealed, isRevealing]);

  // Set mounted state and cleanup timeouts on unmount
  useEffect(() => {
    mountedRef.current = true;
    console.log('Chad reveal hook mounted, setting mountedRef to true');

    return () => {
      console.log('Chad reveal hook unmounting, setting mountedRef to false');
      mountedRef.current = false;

      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Load reveal state on mount (after mountedRef is set)
  useEffect(() => {
    console.log('useChadReveal load effect triggered, calling loadRevealState');
    loadRevealState();
  }, [loadRevealState]);

  // Development debugging
  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_CHAD_DEBUG === 'true') {
      console.log('Chad reveal state updated:', {
        isRevealed,
        isRevealing,
        storageAvailable,
        fallbackMode,
        error
      });
    }
  }, [isRevealed, isRevealing, storageAvailable, fallbackMode, error]);

  return {
    // Core state
    isRevealed,
    isRevealing,

    // Storage info
    storageAvailable,
    fallbackMode,
    error,

    // Actions
    revealChad,
    resetReveal,
    forceReveal, // Development only

    // Utilities
    getRevealInfo,
    shouldShowChad,
    shouldShowRevealButton,

    // Debug info (development only)
    ...(import.meta.env.DEV && {
      debug: {
        hasRevealTimeout: !!revealTimeoutRef.current,
        hasAnimationTimeout: !!animationTimeoutRef.current,
        mountedRef: mountedRef.current,
        options: {
          revealAnimationDuration,
          revealDelay,
          enablePersistence
        }
      }
    })
  };
}

/**
 * Lightweight hook that only returns the current reveal state
 * Useful for components that only need to know if Chad is revealed
 *
 * @returns {boolean} Whether Chad is currently revealed
 */
export function useChadRevealState() {
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    try {
      const state = loadChadRevealState();
      setIsRevealed(state.isRevealed);
    } catch (err) {
      console.warn('Failed to load Chad reveal state:', err);
      setIsRevealed(false);
    }
  }, []);

  return isRevealed;
}

/**
 * Hook for components that need to react to Chad reveal state changes
 * Provides a callback that fires when reveal state changes
 *
 * @param {Function} onRevealChange - Callback function called when reveal state changes
 * @param {Object} options - Configuration options
 * @returns {Object} Reveal state and utilities
 */
export function useChadRevealListener(onRevealChange, options = {}) {
  const revealState = useChadReveal(options);
  const previousRevealedRef = useRef(revealState.isRevealed);

  useEffect(() => {
    if (revealState.isRevealed !== previousRevealedRef.current) {
      previousRevealedRef.current = revealState.isRevealed;

      if (typeof onRevealChange === 'function') {
        onRevealChange(revealState.isRevealed, revealState);
      }
    }
  }, [revealState.isRevealed, onRevealChange, revealState]);

  return revealState;
}