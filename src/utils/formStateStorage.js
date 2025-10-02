/**
 * Form state persistence utility
 * Saves and restores form values to/from localStorage
 */

const FORM_STATE_KEY = 'promptatron_form_state';

/**
 * Default form state structure
 */
const DEFAULT_FORM_STATE = {
  selectedModel: '',
  selectedDataset: {
    type: '',
    option: '',
    content: null
  },
  systemPrompt: '',
  userPrompt: '',
  determinismEnabled: true,
  streamingEnabled: true
};

/**
 * Get the size of a string in bytes
 * @param {string} str - String to measure
 * @returns {number} Size in bytes
 */
const getStringSize = (str) => {
  return new Blob([str]).size;
};

/**
 * Check available localStorage space
 * @returns {Object} Storage info
 */
const getStorageInfo = () => {
  try {
    const testKey = 'storage_test_key';
    const testValue = 'x';
    let totalSize = 0;

    // Estimate current usage
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += getStringSize(localStorage[key]) + getStringSize(key);
      }
    }

    return {
      used: totalSize,
      available: true
    };
  } catch (error) {
    return {
      used: 0,
      available: false
    };
  }
};

/**
 * Truncate long text fields to prevent quota issues
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
const truncateText = (text, maxLength = 5000) => {
  if (!text || typeof text !== 'string') return text;
  if (text.length <= maxLength) return text;

  return text.substring(0, maxLength) + '... [truncated]';
};

/**
 * Clean up old or large localStorage entries
 */
const cleanupStorage = () => {
  try {
    // Remove old entries that might be taking up space
    const keysToCheck = [
      'promptatron_test_history',
      'promptatron_ui_state',
      'promptatron_navigation_state',
      'promptatron_test_results'
    ];

    for (const key of keysToCheck) {
      const item = localStorage.getItem(key);
      if (item && getStringSize(item) > 100000) { // > 100KB
        console.warn(`Removing large localStorage item: ${key} (${Math.round(getStringSize(item) / 1024)}KB)`);
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn('Failed to cleanup storage:', error);
  }
};

/**
 * Save form state to localStorage with quota management
 * @param {Object} formState - Current form state to save
 */
export const saveFormState = (formState) => {
  try {
    // Only save non-sensitive form configuration, not content
    const stateToSave = {
      selectedModel: formState.selectedModel || '',
      selectedDataset: {
        type: formState.selectedDataset?.type || '',
        option: formState.selectedDataset?.option || '',
        // Don't save actual content, just the selection
        content: null
      },
      // Truncate prompts to prevent quota issues
      systemPrompt: truncateText(formState.systemPrompt || '', 2000),
      userPrompt: truncateText(formState.userPrompt || '', 3000),
      determinismEnabled: formState.determinismEnabled !== undefined ? formState.determinismEnabled : true,
      streamingEnabled: formState.streamingEnabled !== undefined ? formState.streamingEnabled : true,
      useToolsEnabled: formState.useToolsEnabled || false,
      maxIterations: formState.maxIterations || 10
    };

    const serializedState = JSON.stringify(stateToSave);

    // Check if the data is too large
    if (getStringSize(serializedState) > 50000) { // > 50KB
      console.warn('Form state is large, truncating prompts further');
      stateToSave.systemPrompt = truncateText(stateToSave.systemPrompt, 500);
      stateToSave.userPrompt = truncateText(stateToSave.userPrompt, 1000);
    }

    localStorage.setItem(FORM_STATE_KEY, JSON.stringify(stateToSave));
    // Form state saved successfully
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, attempting cleanup...');

      // Notify storage monitor about quota exceeded error
      if (typeof window !== 'undefined' && window.storageMonitor) {
        window.storageMonitor.handleQuotaExceededError(error);
      }

      // Try to clean up storage and retry
      cleanupStorage();

      try {
        // Retry with minimal state
        const minimalState = {
          selectedModel: formState.selectedModel || '',
          selectedDataset: {
            type: formState.selectedDataset?.type || '',
            option: formState.selectedDataset?.option || '',
            content: null
          },
          // Save only first 500 chars of prompts
          systemPrompt: truncateText(formState.systemPrompt || '', 500),
          userPrompt: truncateText(formState.userPrompt || '', 500),
          determinismEnabled: formState.determinismEnabled !== undefined ? formState.determinismEnabled : true,
          streamingEnabled: formState.streamingEnabled !== undefined ? formState.streamingEnabled : true
        };

        localStorage.setItem(FORM_STATE_KEY, JSON.stringify(minimalState));
        console.info('Form state saved with reduced size after cleanup');
      } catch (retryError) {
        console.error('Failed to save form state even after cleanup:', retryError);
        // Clear the form state key to prevent future issues
        try {
          localStorage.removeItem(FORM_STATE_KEY);
        } catch (clearError) {
          // If we can't even clear, localStorage is in a bad state
          console.error('Critical localStorage error - unable to clear form state');
        }
      }
    } else {
      console.warn('Failed to save form state:', error);
    }
  }
};

/**
 * Load form state from localStorage
 * @returns {Object} Restored form state or default values
 */
export const loadFormState = () => {
  try {
    const savedState = localStorage.getItem(FORM_STATE_KEY);

    if (!savedState) {
      return DEFAULT_FORM_STATE;
    }

    const parsedState = JSON.parse(savedState);

    // Merge with defaults to ensure all required fields exist
    return {
      ...DEFAULT_FORM_STATE,
      ...parsedState,
      selectedDataset: {
        ...DEFAULT_FORM_STATE.selectedDataset,
        ...parsedState.selectedDataset,
        // Always reset content to null on load
        content: null
      }
    };
  } catch (error) {
    console.warn('Failed to load form state, using defaults:', error);
    return DEFAULT_FORM_STATE;
  }
};

/**
 * Clear saved form state
 */
export const clearFormState = () => {
  try {
    localStorage.removeItem(FORM_STATE_KEY);
    // Form state cleared
  } catch (error) {
    console.warn('Failed to clear form state:', error);
  }
};

/**
 * Check if form state exists in storage
 * @returns {boolean} True if saved state exists
 */
export const hasFormState = () => {
  try {
    return localStorage.getItem(FORM_STATE_KEY) !== null;
  } catch (error) {
    return false;
  }
};

/**
 * Get localStorage usage statistics
 * @returns {Object} Storage usage info
 */
export const getStorageUsage = () => {
  try {
    let totalSize = 0;
    let itemCount = 0;
    const items = {};

    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        const value = localStorage[key];
        const size = getStringSize(value) + getStringSize(key);
        items[key] = {
          size: size,
          sizeKB: Math.round(size / 1024 * 100) / 100
        };
        totalSize += size;
        itemCount++;
      }
    }

    return {
      totalSize,
      totalSizeKB: Math.round(totalSize / 1024 * 100) / 100,
      totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
      itemCount,
      items,
      // Estimate quota (usually 5-10MB per origin)
      estimatedQuotaUsage: Math.round((totalSize / (5 * 1024 * 1024)) * 100)
    };
  } catch (error) {
    return {
      error: error.message,
      totalSize: 0,
      itemCount: 0
    };
  }
};

/**
 * Clear specific localStorage entry
 * @param {string} key - Key to clear
 * @returns {boolean} Success status
 */
export const clearStorageKey = (key) => {
  try {
    localStorage.removeItem(key);
    console.log(`Cleared storage key: ${key}`);
    return true;
  } catch (error) {
    console.error(`Failed to clear key ${key}:`, error);
    return false;
  }
};

/**
 * Clear all localStorage entries (nuclear option)
 * @returns {number} Number of entries cleared
 */
export const clearAllLocalStorage = () => {
  try {
    const keyCount = localStorage.length;
    localStorage.clear();
    console.info(`Cleared all localStorage (${keyCount} entries)`);
    return keyCount;
  } catch (error) {
    console.error('Failed to clear all localStorage:', error);
    return 0;
  }
};

/**
 * Clear all Promptatron-related localStorage entries
 */
export const clearAllAppStorage = () => {
  try {
    const keysToRemove = [];

    // Get all localStorage keys using Object.keys method (more reliable)
    const allKeys = Object.keys(localStorage);

    console.log('All localStorage keys:', allKeys);

    // Find all keys that are related to the app
    allKeys.forEach(key => {
      if (
        // Promptatron-specific keys
        key.startsWith('promptatron_') ||
        key === 'promptatron_form_state' ||
        key === 'promptatron_app_settings' ||

        // Bedrock and LLM related keys
        key.includes('bedrock') ||
        key.includes('llm-analyzer') ||
        key === 'bedrock-test-history' ||

        // Determinism evaluation keys
        key.startsWith('determinism_eval_') ||
        key === 'determinism_eval_index' ||

        // Error reporting keys
        key === 'error-reports' ||
        key === 'ui-error-reports' ||
        key === 'tool-error-reports' ||

        // Settings and state keys
        key.startsWith('settings_') ||
        key.includes('settings') ||
        key.includes('state') ||

        // Chad storage
        key.includes('chad') ||
        key.startsWith('__chad_') ||

        // UI state and recovery keys
        key.includes('ui_state') ||
        key.includes('ui-state') ||
        key.startsWith('ui-state-') ||

        // Storage utility patterns (store_key format)
        (key.includes('_') && (
          key.startsWith('test_') ||
          key.startsWith('history_') ||
          key.startsWith('workflow_') ||
          key.startsWith('form_') ||
          key.startsWith('settings_') ||
          key.startsWith('state_')
        )) ||

        // Any other app-specific patterns
        key.includes('workflow') ||
        key.includes('test-history') ||
        key.includes('form-state') ||

        // Test keys that might be left behind
        key.startsWith('__localStorage_test__') ||
        key.startsWith('storage_test_key') ||
        key.startsWith('quota_test_')
      ) {
        keysToRemove.push(key);
      }
    });

    console.log('Keys to remove:', keysToRemove);

    // Remove all found keys
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`Removed key: ${key}`);
      } catch (removeError) {
        console.error(`Failed to remove key ${key}:`, removeError);
      }
    });

    // Also try to clear any remaining large items that might be app-related
    const remainingKeys = Object.keys(localStorage);
    remainingKeys.forEach(key => {
      try {
        const item = localStorage.getItem(key);
        if (item && item.length > 50000) { // > 50KB
          console.log(`Removing large item: ${key} (${Math.round(item.length / 1024)}KB)`);
          localStorage.removeItem(key);
          keysToRemove.push(key);
        }
      } catch (error) {
        console.warn(`Error checking key ${key}:`, error);
      }
    });

    console.info(`Cleared ${keysToRemove.length} localStorage entries`);

    // Force a storage event to trigger monitoring updates
    window.dispatchEvent(new StorageEvent('storage', {
      key: null,
      oldValue: null,
      newValue: null,
      url: window.location.href,
      storageArea: localStorage
    }));

    return keysToRemove.length;
  } catch (error) {
    console.error('Failed to clear app storage:', error);
    return 0;
  }
};

/**
 * Get a debounced save function to avoid excessive localStorage writes
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Function} Debounced save function
 */
export const createDebouncedSave = (delay = 1000) => {
  let timeoutId;
  let saveAttempts = 0;
  const maxAttempts = 3;

  return (formState) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      // Reset attempt counter periodically
      if (saveAttempts >= maxAttempts) {
        console.warn('Too many save attempts, skipping form state save');
        saveAttempts = 0; // Reset for next time
        return;
      }

      saveAttempts++;
      saveFormState(formState);

      // Reset counter on successful save (after a delay)
      setTimeout(() => {
        saveAttempts = Math.max(0, saveAttempts - 1);
      }, 30000); // Reset after 30 seconds
    }, delay);
  };
};
