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
  selectedScenario: '',
  selectedDataset: {
    id: '',
    name: '',
    content: null
  },
  systemPrompt: '',
  userPrompt: '',
  determinismEnabled: true,
  streamingEnabled: true,
  useToolsEnabled: false,
  maxIterations: 10
};

/**
 * Save form state to localStorage
 * @param {Object} formState - Current form state to save
 */
export const saveFormState = (formState) => {
  try {
    // Only save non-sensitive form configuration, not content
    const stateToSave = {
      selectedModel: formState.selectedModel || '',
      selectedScenario: formState.selectedScenario || '',
      selectedDataset: {
        id: formState.selectedDataset?.id || '',
        name: formState.selectedDataset?.name || '',
        // Don't save actual content, just the selection
        content: null
      },
      systemPrompt: formState.systemPrompt || '',
      userPrompt: formState.userPrompt || '',
      determinismEnabled: formState.determinismEnabled !== undefined ? formState.determinismEnabled : true,
      streamingEnabled: formState.streamingEnabled !== undefined ? formState.streamingEnabled : true,
      useToolsEnabled: formState.useToolsEnabled !== undefined ? formState.useToolsEnabled : false,
      maxIterations: formState.maxIterations || 10
    };

    localStorage.setItem(FORM_STATE_KEY, JSON.stringify(stateToSave));
    // Form state saved successfully
  } catch (error) {
    console.warn('Failed to save form state:', error);
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
 * Get a debounced save function to avoid excessive localStorage writes
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Function} Debounced save function
 */
export const createDebouncedSave = (delay = 1000) => {
  let timeoutId;

  return (formState) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      saveFormState(formState);
    }, delay);
  };
};
