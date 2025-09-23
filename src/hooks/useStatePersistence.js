/**
 * React hook for state persistence across navigation and page refreshes
 * Provides integration with StatePersistenceService for React components
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { statePersistenceService } from '../services/statePersistenceService.js'

/**
 * Main hook for comprehensive state persistence
 * @param {Object} options - Hook options
 * @param {boolean} options.autoRestore - Whether to automatically restore state on mount
 * @param {boolean} options.autoSave - Whether to automatically save state changes
 * @param {number} options.saveDelay - Debounce delay for auto-save (ms)
 * @returns {Object} Hook interface
 */
export function useStatePersistence(options = {}) {
  const {
    autoRestore = true,
    autoSave = true,
    saveDelay = 1000
  } = options

  // State for service status
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState(null)
  const [stateInfo, setStateInfo] = useState(null)

  // Refs for debouncing and cleanup
  const saveTimeoutRef = useRef(null)
  const mountedRef = useRef(true)

  // Initialize service on mount
  useEffect(() => {
    const initializeService = async () => {
      try {
        const success = await statePersistenceService.initialize()
        if (mountedRef.current) {
          setIsInitialized(success)
          if (success) {
            setStateInfo(statePersistenceService.getStateInfo())
          } else {
            setError('Failed to initialize state persistence service')
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message)
          setIsInitialized(false)
        }
      }
    }

    initializeService()

    return () => {
      mountedRef.current = false
    }
  }, [])

  // Debounced save function
  const debouncedSave = useCallback((saveFunction) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && isInitialized) {
        saveFunction()
      }
    }, saveDelay)
  }, [saveDelay, isInitialized])

  // Save UI state
  const saveUIState = useCallback(async (uiState) => {
    if (!isInitialized) return false

    try {
      const success = await statePersistenceService.saveUIState(uiState)
      if (success && mountedRef.current) {
        setStateInfo(statePersistenceService.getStateInfo())
      }
      return success
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return false
    }
  }, [isInitialized])

  // Save UI state with debouncing
  const saveUIStateDebounced = useCallback((uiState) => {
    if (autoSave) {
      debouncedSave(() => saveUIState(uiState))
    }
  }, [autoSave, debouncedSave, saveUIState])

  // Restore UI state
  const restoreUIState = useCallback(() => {
    if (!isInitialized) return null

    try {
      return statePersistenceService.restoreUIState()
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return null
    }
  }, [isInitialized])

  // Save navigation state
  const saveNavigationState = useCallback(async (navigationState) => {
    if (!isInitialized) return false

    try {
      const success = await statePersistenceService.saveNavigationState(navigationState)
      if (success && mountedRef.current) {
        setStateInfo(statePersistenceService.getStateInfo())
      }
      return success
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return false
    }
  }, [isInitialized])

  // Restore navigation state
  const restoreNavigationState = useCallback(() => {
    if (!isInitialized) return null

    try {
      return statePersistenceService.restoreNavigationState()
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return null
    }
  }, [isInitialized])

  // Save test results state
  const saveTestResultsState = useCallback(async (testResults, testId = null) => {
    if (!isInitialized) return false

    try {
      const success = await statePersistenceService.saveTestResultsState(testResults, testId)
      if (success && mountedRef.current) {
        setStateInfo(statePersistenceService.getStateInfo())
      }
      return success
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return false
    }
  }, [isInitialized])

  // Restore test results state
  const restoreTestResultsState = useCallback((testId = null) => {
    if (!isInitialized) return null

    try {
      return statePersistenceService.restoreTestResultsState(testId)
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return null
    }
  }, [isInitialized])

  // Save model output state
  const saveModelOutputState = useCallback(async (outputData, testId = null) => {
    if (!isInitialized) return false

    try {
      const success = await statePersistenceService.saveModelOutputState(outputData, testId)
      if (success && mountedRef.current) {
        setStateInfo(statePersistenceService.getStateInfo())
      }
      return success
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return false
    }
  }, [isInitialized])

  // Restore model output state
  const restoreModelOutputState = useCallback((testId = null) => {
    if (!isInitialized) return null

    try {
      return statePersistenceService.restoreModelOutputState(testId)
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return null
    }
  }, [isInitialized])

  // Get session information
  const getSessionInfo = useCallback(() => {
    if (!isInitialized) return null

    try {
      return statePersistenceService.getSessionInfo()
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return null
    }
  }, [isInitialized])

  // Clear all state
  const clearAllState = useCallback(async () => {
    if (!isInitialized) return false

    try {
      const success = await statePersistenceService.clearAllState()
      if (success && mountedRef.current) {
        setStateInfo(statePersistenceService.getStateInfo())
      }
      return success
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      return false
    }
  }, [isInitialized])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return {
    // Status
    isInitialized,
    error,
    stateInfo,

    // UI State
    saveUIState,
    saveUIStateDebounced,
    restoreUIState,

    // Navigation State
    saveNavigationState,
    restoreNavigationState,

    // Test Results State
    saveTestResultsState,
    restoreTestResultsState,

    // Model Output State
    saveModelOutputState,
    restoreModelOutputState,

    // Session
    getSessionInfo,

    // Utilities
    clearAllState,

    // Service access (for advanced usage)
    service: statePersistenceService
  }
}

/**
 * Hook specifically for UI state persistence
 * @param {Object} initialState - Initial UI state
 * @param {Object} options - Hook options
 * @returns {Object} UI state management interface
 */
export function useUIStatePersistence(initialState = {}, options = {}) {
  const { autoRestore = true, autoSave = true } = options

  const {
    isInitialized,
    saveUIStateDebounced,
    restoreUIState
  } = useStatePersistence({ autoSave })

  const [uiState, setUIState] = useState(initialState)
  const [isRestored, setIsRestored] = useState(false)

  // Restore state on initialization
  useEffect(() => {
    if (isInitialized && autoRestore && !isRestored) {
      const restoredState = restoreUIState()
      if (restoredState) {
        setUIState(prevState => ({
          ...prevState,
          ...restoredState
        }))
        console.log('useUIStatePersistence: Restored UI state')
      }
      setIsRestored(true)
    }
  }, [isInitialized, autoRestore, isRestored, restoreUIState])

  // Auto-save state changes
  useEffect(() => {
    if (isInitialized && isRestored && autoSave) {
      saveUIStateDebounced(uiState)
    }
  }, [uiState, isInitialized, isRestored, autoSave, saveUIStateDebounced])

  // Update UI state
  const updateUIState = useCallback((updates) => {
    setUIState(prevState => ({
      ...prevState,
      ...updates
    }))
  }, [])

  return {
    uiState,
    setUIState,
    updateUIState,
    isInitialized,
    isRestored
  }
}

/**
 * Hook specifically for navigation state persistence
 * @param {Object} options - Hook options
 * @returns {Object} Navigation state management interface
 */
export function useNavigationStatePersistence(options = {}) {
  const { autoRestore = true } = options

  const {
    isInitialized,
    saveNavigationState,
    restoreNavigationState
  } = useStatePersistence()

  const [navigationState, setNavigationState] = useState({
    currentRoute: '/',
    activeTab: 'test'
  })
  const [isRestored, setIsRestored] = useState(false)

  // Restore state on initialization
  useEffect(() => {
    if (isInitialized && autoRestore && !isRestored) {
      const restoredState = restoreNavigationState()
      if (restoredState) {
        setNavigationState(prevState => ({
          ...prevState,
          ...restoredState
        }))
        console.log('useNavigationStatePersistence: Restored navigation state')
      }
      setIsRestored(true)
    }
  }, [isInitialized, autoRestore, isRestored, restoreNavigationState])

  // Navigate to route
  const navigateToRoute = useCallback(async (route) => {
    const newState = {
      ...navigationState,
      currentRoute: route
    }
    setNavigationState(newState)
    await saveNavigationState(newState)
  }, [navigationState, saveNavigationState])

  // Switch tab
  const switchTab = useCallback(async (tab) => {
    const newState = {
      ...navigationState,
      activeTab: tab
    }
    setNavigationState(newState)
    await saveNavigationState(newState)
  }, [navigationState, saveNavigationState])

  return {
    navigationState,
    navigateToRoute,
    switchTab,
    isInitialized,
    isRestored
  }
}

/**
 * Hook specifically for test results state persistence
 * @param {Object} options - Hook options
 * @returns {Object} Test results state management interface
 */
export function useTestResultsStatePersistence(options = {}) {
  const { autoRestore = true } = options

  const {
    isInitialized,
    saveTestResultsState,
    restoreTestResultsState
  } = useStatePersistence()

  const [testResults, setTestResults] = useState(null)
  const [isRestored, setIsRestored] = useState(false)

  // Restore state on initialization
  useEffect(() => {
    if (isInitialized && autoRestore && !isRestored) {
      const restoredState = restoreTestResultsState()
      if (restoredState && restoredState.currentResults) {
        setTestResults(restoredState.currentResults)
        console.log('useTestResultsStatePersistence: Restored test results')
      }
      setIsRestored(true)
    }
  }, [isInitialized, autoRestore, isRestored, restoreTestResultsState])

  // Save test results
  const saveResults = useCallback(async (results, testId = null) => {
    setTestResults(results)
    return await saveTestResultsState(results, testId)
  }, [saveTestResultsState])

  // Restore specific test results
  const restoreResults = useCallback((testId) => {
    const restoredState = restoreTestResultsState(testId)
    if (restoredState && restoredState.currentResults) {
      setTestResults(restoredState.currentResults)
      return restoredState.currentResults
    }
    return null
  }, [restoreTestResultsState])

  return {
    testResults,
    saveResults,
    restoreResults,
    isInitialized,
    isRestored
  }
}

export default useStatePersistence
