/**
 * State Persistence Service
 * Handles comprehensive state persistence across navigation and page refreshes
 * Manages test results, model outputs, UI state, and navigation state
 */

import { handleError, ErrorTypes } from '../utils/errorHandling.js';

/**
 * Storage keys for different types of state
 */
const STORAGE_KEYS = {
  UI_STATE: 'promptatron_ui_state',
  NAVIGATION_STATE: 'promptatron_navigation_state',
  TEST_RESULTS_STATE: 'promptatron_test_results_state',
  MODEL_OUTPUT_STATE: 'promptatron_model_output_state',
  SESSION_STATE: 'promptatron_session_state'
};

/**
 * Default state structures
 */
const DEFAULT_UI_STATE = {
  activeTab: 'test',
  selectedForComparison: [],
  validationErrors: {},
  touchedFields: {},
  isExpanded: {},
  viewModes: {},
  lastUpdated: null
};

const DEFAULT_NAVIGATION_STATE = {
  currentRoute: '/',
  previousRoute: null,
  navigationHistory: [],
  tabHistory: ['test'],
  lastNavigation: null
};

const DEFAULT_TEST_RESULTS_STATE = {
  currentResults: null,
  resultsHistory: new Map(),
  lastTestId: null,
  displayState: {},
  lastUpdated: null
};

const DEFAULT_MODEL_OUTPUT_STATE = {
  currentOutput: null,
  outputHistory: new Map(),
  streamingState: {},
  displayErrors: {},
  lastUpdated: null
};

const DEFAULT_SESSION_STATE = {
  sessionId: null,
  startTime: null,
  lastActivity: null,
  testCount: 0,
  navigationCount: 0
};

/**
 * StatePersistenceService class for comprehensive state management
 */
export class StatePersistenceService {
  constructor() {
    this.maxHistorySize = 50;
    this.maxNavigationHistory = 20;
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
    this.isInitialized = false;

    // In-memory state cache for performance
    this.stateCache = {
      ui: null,
      navigation: null,
      testResults: null,
      modelOutput: null,
      session: null
    };

    // Cleanup timer
    this.cleanupTimer = null;

    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.saveUIState = this.saveUIState.bind(this);
    this.restoreUIState = this.restoreUIState.bind(this);
    this.cleanup = this.cleanup.bind(this);
  }

  /**
   * Initialize the state persistence service
   */
  async initialize() {
    try {
      // Initializing state persistence service

      // Initialize session
      await this.initializeSession();

      // Load cached states
      await this.loadAllStates();

      // Start cleanup timer
      this.startCleanupTimer();

      // Set up beforeunload handler for cleanup
      this.setupBeforeUnloadHandler();

      this.isInitialized = true;
      // Service initialized successfully

      return true;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'StatePersistenceService',
        action: 'initialize'
      });

      console.error('StatePersistenceService: Initialization failed:', errorInfo.userMessage);
      return false;
    }
  }

  /**
   * Initialize or restore session state
   */
  async initializeSession() {
    try {
      const existingSession = this.loadFromStorage(STORAGE_KEYS.SESSION_STATE);
      const now = Date.now();

      if (existingSession && (now - existingSession.lastActivity) < this.sessionTimeout) {
        // Continue existing session
        this.stateCache.session = {
          ...existingSession,
          lastActivity: now,
          navigationCount: existingSession.navigationCount + 1
        };
        // Continuing existing session
      } else {
        // Create new session
        this.stateCache.session = {
          ...DEFAULT_SESSION_STATE,
          sessionId: this.generateSessionId(),
          startTime: now,
          lastActivity: now
        };
        // Created new session
      }

      await this.saveSessionState();
    } catch (error) {
      console.error('Failed to initialize session:', error);
      // Create minimal session as fallback
      this.stateCache.session = {
        ...DEFAULT_SESSION_STATE,
        sessionId: this.generateSessionId(),
        startTime: Date.now(),
        lastActivity: Date.now()
      };
    }
  }

  /**
   * Generate a unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Load all states from storage into cache
   */
  async loadAllStates() {
    try {
      this.stateCache.ui = this.loadFromStorage(STORAGE_KEYS.UI_STATE) || DEFAULT_UI_STATE;
      this.stateCache.navigation = this.loadFromStorage(STORAGE_KEYS.NAVIGATION_STATE) || DEFAULT_NAVIGATION_STATE;

      // Load test results state and convert Map from JSON
      const testResultsData = this.loadFromStorage(STORAGE_KEYS.TEST_RESULTS_STATE);
      if (testResultsData) {
        this.stateCache.testResults = {
          ...testResultsData,
          resultsHistory: new Map(testResultsData.resultsHistory || [])
        };
      } else {
        this.stateCache.testResults = DEFAULT_TEST_RESULTS_STATE;
      }

      // Load model output state and convert Map from JSON
      const modelOutputData = this.loadFromStorage(STORAGE_KEYS.MODEL_OUTPUT_STATE);
      if (modelOutputData) {
        this.stateCache.modelOutput = {
          ...modelOutputData,
          outputHistory: new Map(modelOutputData.outputHistory || [])
        };
      } else {
        this.stateCache.modelOutput = DEFAULT_MODEL_OUTPUT_STATE;
      }

      // States loaded from storage successfully
    } catch (error) {
      console.error('Failed to load states:', error);
      // Initialize with defaults
      this.stateCache.ui = DEFAULT_UI_STATE;
      this.stateCache.navigation = DEFAULT_NAVIGATION_STATE;
      this.stateCache.testResults = DEFAULT_TEST_RESULTS_STATE;
      this.stateCache.modelOutput = DEFAULT_MODEL_OUTPUT_STATE;
    }
  }

  /**
   * Save UI state (active tab, selections, validation, etc.)
   */
  async saveUIState(uiState) {
    try {
      const stateToSave = {
        ...this.stateCache.ui,
        ...uiState,
        lastUpdated: Date.now()
      };

      this.stateCache.ui = stateToSave;
      this.saveToStorage(STORAGE_KEYS.UI_STATE, stateToSave);

      // Update session activity
      await this.updateSessionActivity();

      return true;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'StatePersistenceService',
        action: 'saveUIState'
      });
      console.error('Failed to save UI state:', errorInfo.userMessage);
      return false;
    }
  }

  /**
   * Restore UI state
   */
  restoreUIState() {
    try {
      const uiState = this.stateCache.ui || DEFAULT_UI_STATE;
      return uiState;
    } catch (error) {
      console.error('Failed to restore UI state:', error);
      return DEFAULT_UI_STATE;
    }
  }

  /**
   * Save navigation state
   */
  async saveNavigationState(navigationState) {
    try {
      const currentNav = this.stateCache.navigation || DEFAULT_NAVIGATION_STATE;

      const stateToSave = {
        ...currentNav,
        ...navigationState,
        lastNavigation: Date.now()
      };

      // Manage navigation history
      if (navigationState.currentRoute && navigationState.currentRoute !== currentNav.currentRoute) {
        stateToSave.previousRoute = currentNav.currentRoute;
        stateToSave.navigationHistory = [
          navigationState.currentRoute,
          ...currentNav.navigationHistory.slice(0, this.maxNavigationHistory - 1)
        ];
      }

      // Manage tab history
      if (navigationState.activeTab && navigationState.activeTab !== currentNav.tabHistory?.[0]) {
        stateToSave.tabHistory = [
          navigationState.activeTab,
          ...currentNav.tabHistory.slice(0, 9) // Keep last 10 tabs
        ];
      }

      this.stateCache.navigation = stateToSave;
      this.saveToStorage(STORAGE_KEYS.NAVIGATION_STATE, stateToSave);

      // Update session activity
      await this.updateSessionActivity('navigation');

      return true;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'StatePersistenceService',
        action: 'saveNavigationState'
      });
      console.error('Failed to save navigation state:', errorInfo.userMessage);
      return false;
    }
  }

  /**
   * Restore navigation state
   */
  restoreNavigationState() {
    try {
      const navState = this.stateCache.navigation || DEFAULT_NAVIGATION_STATE;
      return navState;
    } catch (error) {
      console.error('Failed to restore navigation state:', error);
      return DEFAULT_NAVIGATION_STATE;
    }
  }

  /**
   * Save test results state
   */
  async saveTestResultsState(testResults, testId = null) {
    try {
      const currentState = this.stateCache.testResults || DEFAULT_TEST_RESULTS_STATE;

      const stateToSave = {
        ...currentState,
        currentResults: testResults,
        lastTestId: testId || testResults?.id || currentState.lastTestId,
        lastUpdated: Date.now()
      };

      // Add to history if we have a test ID
      if (testId && testResults) {
        stateToSave.resultsHistory.set(testId, {
          results: testResults,
          timestamp: Date.now(),
          displayState: currentState.displayState[testId] || {}
        });

        // Cleanup old history entries
        if (stateToSave.resultsHistory.size > this.maxHistorySize) {
          const oldestKey = stateToSave.resultsHistory.keys().next().value;
          stateToSave.resultsHistory.delete(oldestKey);
        }
      }

      this.stateCache.testResults = stateToSave;

      // Convert Map to Array for storage
      const storageData = {
        ...stateToSave,
        resultsHistory: Array.from(stateToSave.resultsHistory.entries())
      };
      this.saveToStorage(STORAGE_KEYS.TEST_RESULTS_STATE, storageData);

      // Update session activity
      await this.updateSessionActivity('test');

      return true;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'StatePersistenceService',
        action: 'saveTestResultsState',
        testId
      });
      console.error('Failed to save test results state:', errorInfo.userMessage);
      return false;
    }
  }

  /**
   * Restore test results state
   */
  restoreTestResultsState(testId = null) {
    try {
      const testState = this.stateCache.testResults || DEFAULT_TEST_RESULTS_STATE;

      if (testId && testState.resultsHistory.has(testId)) {
        const historyEntry = testState.resultsHistory.get(testId);
        // Restored test results from history
        return {
          currentResults: historyEntry.results,
          displayState: historyEntry.displayState,
          fromHistory: true,
          timestamp: historyEntry.timestamp
        };
      }

      // Restored current test results state

      return {
        currentResults: testState.currentResults,
        displayState: testState.displayState,
        fromHistory: false,
        lastTestId: testState.lastTestId
      };
    } catch (error) {
      console.error('Failed to restore test results state:', error);
      return {
        currentResults: null,
        displayState: {},
        fromHistory: false,
        lastTestId: null
      };
    }
  }

  /**
   * Save model output state
   */
  async saveModelOutputState(outputData, testId = null) {
    try {
      const currentState = this.stateCache.modelOutput || DEFAULT_MODEL_OUTPUT_STATE;

      const stateToSave = {
        ...currentState,
        currentOutput: outputData,
        lastUpdated: Date.now()
      };

      // Add to history if we have a test ID
      if (testId && outputData) {
        stateToSave.outputHistory.set(testId, {
          output: outputData,
          timestamp: Date.now(),
          streamingState: currentState.streamingState[testId] || {},
          displayErrors: currentState.displayErrors[testId] || {}
        });

        // Cleanup old history entries
        if (stateToSave.outputHistory.size > this.maxHistorySize) {
          const oldestKey = stateToSave.outputHistory.keys().next().value;
          stateToSave.outputHistory.delete(oldestKey);
        }
      }

      this.stateCache.modelOutput = stateToSave;

      // Convert Map to Array for storage
      const storageData = {
        ...stateToSave,
        outputHistory: Array.from(stateToSave.outputHistory.entries())
      };
      this.saveToStorage(STORAGE_KEYS.MODEL_OUTPUT_STATE, storageData);

      return true;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'StatePersistenceService',
        action: 'saveModelOutputState',
        testId
      });
      console.error('Failed to save model output state:', errorInfo.userMessage);
      return false;
    }
  }

  /**
   * Restore model output state
   */
  restoreModelOutputState(testId = null) {
    try {
      const outputState = this.stateCache.modelOutput || DEFAULT_MODEL_OUTPUT_STATE;

      if (testId && outputState.outputHistory.has(testId)) {
        const historyEntry = outputState.outputHistory.get(testId);
        // Restored model output from history
        return {
          currentOutput: historyEntry.output,
          streamingState: historyEntry.streamingState,
          displayErrors: historyEntry.displayErrors,
          fromHistory: true,
          timestamp: historyEntry.timestamp
        };
      }

      // Restored current model output state

      return {
        currentOutput: outputState.currentOutput,
        streamingState: outputState.streamingState,
        displayErrors: outputState.displayErrors,
        fromHistory: false
      };
    } catch (error) {
      console.error('Failed to restore model output state:', error);
      return {
        currentOutput: null,
        streamingState: {},
        displayErrors: {},
        fromHistory: false
      };
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(activityType = 'general') {
    try {
      if (!this.stateCache.session) return;

      this.stateCache.session.lastActivity = Date.now();

      if (activityType === 'test') {
        this.stateCache.session.testCount += 1;
      } else if (activityType === 'navigation') {
        this.stateCache.session.navigationCount += 1;
      }

      await this.saveSessionState();
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }
  }

  /**
   * Save session state
   */
  async saveSessionState() {
    try {
      if (this.stateCache.session) {
        this.saveToStorage(STORAGE_KEYS.SESSION_STATE, this.stateCache.session);
      }
    } catch (error) {
      console.error('Failed to save session state:', error);
    }
  }

  /**
   * Get session information
   */
  getSessionInfo() {
    return this.stateCache.session || DEFAULT_SESSION_STATE;
  }

  /**
   * Start cleanup timer for old state data
   */
  startCleanupTimer() {

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    // Cleanup timer started
  }

  /**
   * Cleanup old state data to prevent memory leaks
   */
  async cleanup() {
    try {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      let cleanedCount = 0;

      // Cleanup test results history
      if (this.stateCache.testResults?.resultsHistory) {
        const toDelete = [];
        for (const [testId, entry] of this.stateCache.testResults.resultsHistory) {
          if (now - entry.timestamp > maxAge) {
            toDelete.push(testId);
          }
        }
        toDelete.forEach(testId => {
          this.stateCache.testResults.resultsHistory.delete(testId);
          cleanedCount++;
        });
      }

      // Cleanup model output history
      if (this.stateCache.modelOutput?.outputHistory) {
        const toDelete = [];
        for (const [testId, entry] of this.stateCache.modelOutput.outputHistory) {
          if (now - entry.timestamp > maxAge) {
            toDelete.push(testId);
          }
        }
        toDelete.forEach(testId => {
          this.stateCache.modelOutput.outputHistory.delete(testId);
          cleanedCount++;
        });
      }

      // Cleanup navigation history
      if (this.stateCache.navigation?.navigationHistory) {
        const maxNavHistory = 10;
        if (this.stateCache.navigation.navigationHistory.length > maxNavHistory) {
          this.stateCache.navigation.navigationHistory =
            this.stateCache.navigation.navigationHistory.slice(0, maxNavHistory);
          cleanedCount++;
        }
      }

      // Save cleaned states if any cleanup occurred
      if (cleanedCount > 0) {
        await this.saveAllStates();
        // Cleaned up old state entries
      }

      return cleanedCount;
    } catch (error) {
      console.error('Cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Save all states to storage
   */
  async saveAllStates() {
    try {
      // Save UI state
      if (this.stateCache.ui) {
        this.saveToStorage(STORAGE_KEYS.UI_STATE, this.stateCache.ui);
      }

      // Save navigation state
      if (this.stateCache.navigation) {
        this.saveToStorage(STORAGE_KEYS.NAVIGATION_STATE, this.stateCache.navigation);
      }

      // Save test results state
      if (this.stateCache.testResults) {
        const storageData = {
          ...this.stateCache.testResults,
          resultsHistory: Array.from(this.stateCache.testResults.resultsHistory.entries())
        };
        this.saveToStorage(STORAGE_KEYS.TEST_RESULTS_STATE, storageData);
      }

      // Save model output state
      if (this.stateCache.modelOutput) {
        const storageData = {
          ...this.stateCache.modelOutput,
          outputHistory: Array.from(this.stateCache.modelOutput.outputHistory.entries())
        };
        this.saveToStorage(STORAGE_KEYS.MODEL_OUTPUT_STATE, storageData);
      }

      // Save session state
      await this.saveSessionState();

      return true;
    } catch (error) {
      console.error('Failed to save all states:', error);
      return false;
    }
  }

  /**
   * Clear all persisted state
   */
  async clearAllState() {
    try {
      // Clear storage
      Object.values(STORAGE_KEYS).forEach(key => {
        this.removeFromStorage(key);
      });

      // Reset cache
      this.stateCache = {
        ui: DEFAULT_UI_STATE,
        navigation: DEFAULT_NAVIGATION_STATE,
        testResults: DEFAULT_TEST_RESULTS_STATE,
        modelOutput: DEFAULT_MODEL_OUTPUT_STATE,
        session: null
      };

      // Reinitialize session
      await this.initializeSession();

      // All state cleared
      return true;
    } catch (error) {
      console.error('Failed to clear all state:', error);
      return false;
    }
  }

  /**
   * Get comprehensive state information
   */
  getStateInfo() {
    try {
      return {
        isInitialized: this.isInitialized,
        session: this.stateCache.session,
        ui: {
          activeTab: this.stateCache.ui?.activeTab,
          hasComparisons: this.stateCache.ui?.selectedForComparison?.length > 0,
          touchedFieldsCount: Object.keys(this.stateCache.ui?.touchedFields || {}).length,
          lastUpdated: this.stateCache.ui?.lastUpdated
        },
        navigation: {
          currentRoute: this.stateCache.navigation?.currentRoute,
          historySize: this.stateCache.navigation?.navigationHistory?.length || 0,
          tabHistorySize: this.stateCache.navigation?.tabHistory?.length || 0,
          lastNavigation: this.stateCache.navigation?.lastNavigation
        },
        testResults: {
          hasCurrentResults: !!this.stateCache.testResults?.currentResults,
          historySize: this.stateCache.testResults?.resultsHistory?.size || 0,
          lastTestId: this.stateCache.testResults?.lastTestId,
          lastUpdated: this.stateCache.testResults?.lastUpdated
        },
        modelOutput: {
          hasCurrentOutput: !!this.stateCache.modelOutput?.currentOutput,
          historySize: this.stateCache.modelOutput?.outputHistory?.size || 0,
          lastUpdated: this.stateCache.modelOutput?.lastUpdated
        }
      };
    } catch (error) {
      console.error('Failed to get state info:', error);
      return {
        isInitialized: false,
        error: error.message
      };
    }
  }

  /**
   * Setup beforeunload handler for cleanup
   */
  setupBeforeUnloadHandler() {
    window.addEventListener('beforeunload', () => {
      try {
        // Save all states before page unload
        this.saveAllStates();

        // Clear cleanup timer
        if (this.cleanupTimer) {
          clearInterval(this.cleanupTimer);
        }
      } catch (error) {
        console.error('Error during beforeunload cleanup:', error);
      }
    });
  }

  /**
   * Save data to localStorage with error handling
   */
  saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, attempting cleanup');
        this.cleanup();
        // Try again after cleanup
        try {
          localStorage.setItem(key, JSON.stringify(data));
        } catch (retryError) {
          console.error('Failed to save after cleanup:', retryError);
        }
      } else {
        console.error('Failed to save to localStorage:', error);
      }
    }
  }

  /**
   * Load data from localStorage with error handling
   */
  loadFromStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
      return null;
    }
  }

  /**
   * Remove data from localStorage
   */
  removeFromStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
    }
  }

  /**
   * Destroy the service and cleanup resources
   */
  destroy() {
    try {
      // Clear cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }

      // Save final state
      this.saveAllStates();

      // Clear cache
      this.stateCache = {};

      this.isInitialized = false;
      // Service destroyed
    } catch (error) {
      console.error('Error during service destruction:', error);
    }
  }
}

// Create and export singleton instance
export const statePersistenceService = new StatePersistenceService();

// Export class for testing
export default StatePersistenceService;
