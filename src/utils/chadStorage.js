/**
 * Chad Storage Utility
 *
 * Manages persistence of Chad reveal state using localStorage with error handling
 * and version management for future migrations.
 */

import { generateStorageKey } from './momentoConfig.js';

const CHAD_STORAGE_KEY = generateStorageKey('chad_reveal')
const CURRENT_VERSION = '1.0'

/**
 * Default Chad reveal state structure
 */
const DEFAULT_STATE = {
  isRevealed: false,
  revealedAt: null,
  version: CURRENT_VERSION
}

/**
 * Save Chad reveal state to localStorage
 * @param {boolean} isRevealed - Whether Chad has been revealed
 * @returns {boolean} - Success status of save operation
 */
export const saveChadRevealState = (isRevealed) => {
  try {
    const state = {
      isRevealed: Boolean(isRevealed),
      revealedAt: isRevealed ? Date.now() : null,
      version: CURRENT_VERSION
    }

    localStorage.setItem(CHAD_STORAGE_KEY, JSON.stringify(state))
    return true
  } catch (error) {
    console.warn('Failed to save Chad reveal state:', error)
    return false
  }
}

/**
 * Load Chad reveal state from localStorage
 * @returns {Object} - Chad reveal state object
 */
export const loadChadRevealState = () => {
  try {
    const saved = localStorage.getItem(CHAD_STORAGE_KEY)

    if (!saved) {
      return { ...DEFAULT_STATE }
    }

    const parsed = JSON.parse(saved)

    // Validate the loaded state structure
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('Invalid Chad reveal state format, using default')
      return { ...DEFAULT_STATE }
    }

    // Handle version migrations if needed
    const migratedState = migrateStateVersion(parsed)

    // Ensure all required fields exist with proper types
    const finalState = {
      isRevealed: Boolean(migratedState.isRevealed),
      revealedAt: migratedState.revealedAt || null,
      version: migratedState.version || CURRENT_VERSION
    };

    return finalState;
  } catch (error) {
    console.warn('Failed to load Chad reveal state:', error)
    return { ...DEFAULT_STATE }
  }
}

/**
 * Clear Chad reveal state from localStorage
 * @returns {boolean} - Success status of clear operation
 */
export const clearChadRevealState = () => {
  try {
    localStorage.removeItem(CHAD_STORAGE_KEY)
    return true
  } catch (error) {
    console.warn('Failed to clear Chad reveal state:', error)
    return false
  }
}

/**
 * Check if localStorage is available and functional
 * @returns {boolean} - Whether localStorage is available
 */
export const isStorageAvailable = () => {
  try {
    const testKey = '__chad_storage_test__'
    localStorage.setItem(testKey, 'test')
    localStorage.removeItem(testKey)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Get Chad reveal state with fallback for storage unavailability
 * @returns {Object} - Chad reveal state with storage availability info
 */
export const getChadRevealStateWithFallback = () => {
  const storageAvailable = isStorageAvailable()

  if (!storageAvailable) {
    return {
      ...DEFAULT_STATE,
      storageAvailable: false,
      fallbackMode: true
    }
  }

  const loadedState = loadChadRevealState();

  const finalState = {
    ...loadedState,
    storageAvailable: true,
    fallbackMode: false
  };

  return finalState;
}

/**
 * Handle version migrations for Chad reveal state
 * @param {Object} state - The loaded state object
 * @returns {Object} - Migrated state object
 */
const migrateStateVersion = (state) => {
  const currentVersion = state.version || '1.0'

  // Future version migrations can be added here
  switch (currentVersion) {
    case '1.0':
      // Current version, no migration needed
      return state

    default:
      // Unknown version, use current structure but preserve data
      console.warn(`Unknown Chad reveal state version: ${currentVersion}`)
      return {
        isRevealed: Boolean(state.isRevealed),
        revealedAt: state.revealedAt || null,
        version: CURRENT_VERSION
      }
  }
}

/**
 * Development utility to reset Chad reveal state
 * Only available in development mode
 * @returns {boolean} - Success status of reset operation
 */
export const resetChadRevealState = () => {
  if (import.meta.env.DEV) {
    return clearChadRevealState()
  }

  console.warn('resetChadRevealState is only available in development mode')
  return false
}
