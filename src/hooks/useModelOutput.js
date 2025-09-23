/**
 * React hook for model output state management
 * Provides integration with Mnager for React components
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { modelOutputManager } from '../services/modelOutputManager.js'

/**
 * Custom hook for managing model output state
 * @param {Object} options - Hook options
 * @param {boolean} options.autoRestore - Whether to automatically restore state on mount
 * @param {string} options.testId - Test ID to restore (if autoRestore is true)
 * @returns {Object} Hook interface
 */
export function useModelOutput(options = {}) {
  const { autoRestore = false, testId = null } = options

  // State for React component updates
  const [outputState, setOutputState] = useState(() => modelOutputManager.getCurrentState())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Refs for stable callback references
  const streamingCallbackRef = useRef(null)
  const updateTimeoutRef = useRef(null)

  // Update local state from manager
  const updateStateFromManager = useCallback(() => {
    const currentState = modelOutputManager.getCurrentState()
    setOutputState(currentState)
    setError(currentState.lastError)
  }, [])

  // Debounced state update to prevent excessive re-renders during streaming
  const debouncedUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }

    updateTimeoutRef.current = setTimeout(() => {
      updateStateFromManager()
    }, 50) // 50ms debounce for smooth streaming updates
  }, [updateStateFromManager])

  // Initialize output for a new test
  const initializeOutput = useCallback((testId, config = {}) => {
    setIsLoading(true)
    setError(null)

    try {
      const success = modelOutputManager.initializeOutput(testId, config)
      if (success) {
        updateStateFromManager()
      } else {
        setError('Failed to initialize output state')
      }
      return success
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [updateStateFromManager])

  // Update output content
  const updateOutput = useCallback((content, options = {}) => {
    try {
      const success = modelOutputManager.updateOutput(content, options)
      if (success) {
        // Use debounced update for streaming, immediate for complete responses
        if (options.isChunk) {
          debouncedUpdate()
        } else {
          updateStateFromManager()
        }
      } else {
        setError('Failed to update output')
      }
      return success
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [updateStateFromManager, debouncedUpdate])

  // Handle streaming error
  const handleStreamingError = useCallback((error) => {
    try {
      modelOutputManager.handleStreamingError(error)
      updateStateFromManager()
    } catch (err) {
      setError(err.message)
    }
  }, [updateStateFromManager])

  // Complete streaming
  const completeStreaming = useCallback((finalMetrics = {}) => {
    try {
      modelOutputManager.completeStreaming(finalMetrics)
      updateStateFromManager()
    } catch (err) {
      setError(err.message)
    }
  }, [updateStateFromManager])

  // Restore state from history
  const restoreState = useCallback((targetTestId = null) => {
    setIsLoading(true)
    setError(null)

    try {
      const restored = modelOutputManager.restoreState(targetTestId)
      if (restored) {
        setOutputState(restored)
        setError(restored.lastError)
        return restored
      } else {
        setError('No state found to restore')
        return null
      }
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Handle display errors
  const handleDisplayError = useCallback((error, context = {}) => {
    try {
      const recovered = modelOutputManager.handleDisplayError(error, context)
      updateStateFromManager()
      return recovered
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [updateStateFromManager])

  // Clear current state
  const clearState = useCallback(() => {
    modelOutputManager.clearState()
    updateStateFromManager()
  }, [updateStateFromManager])

  // Register streaming callback
  const registerStreamingCallback = useCallback((callback) => {
    if (streamingCallbackRef.current) {
      modelOutputManager.unregisterStreamingCallback(streamingCallbackRef.current)
    }

    streamingCallbackRef.current = callback
    modelOutputManager.registerStreamingCallback(callback)
  }, [])

  // Unregister streaming callback
  const unregisterStreamingCallback = useCallback(() => {
    if (streamingCallbackRef.current) {
      modelOutputManager.unregisterStreamingCallback(streamingCallbackRef.current)
      streamingCallbackRef.current = null
    }
  }, [])

  // Auto-restore state on mount if requested
  useEffect(() => {
    if (autoRestore) {
      restoreState(testId)
    }
  }, [autoRestore, testId, restoreState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear any pending timeouts
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }

      // Unregister streaming callback
      unregisterStreamingCallback()
    }
  }, [unregisterStreamingCallback])

  // Computed values
  const isDisplaying = outputState.isDisplaying && !!outputState.output
  const isStreaming = outputState.streaming?.isStreaming || false
  const hasError = !!error
  const streamingProgress = outputState.streaming?.streamingProgress || null

  return {
    // State
    outputState,
    isLoading,
    error,
    isDisplaying,
    isStreaming,
    hasError,
    streamingProgress,

    // Actions
    initializeOutput,
    updateOutput,
    handleStreamingError,
    completeStreaming,
    restoreState,
    handleDisplayError,
    clearState,
    registerStreamingCallback,
    unregisterStreamingCallback,

    // Utilities
    getCurrentOutput: () => outputState.output,
    getCurrentTestId: () => outputState.testId,
    getStreamingState: () => outputState.streaming,
    getLastError: () => error,

    // Manager access (for advanced usage)
    manager: modelOutputManager
  }
}

/**
 * Hook for accessing model output state without managing it
 * Useful for components that only need to read the current state
 * @returns {Object} Read-only state interface
 */
export function useModelOutputState() {
  const [outputState, setOutputState] = useState(() => modelOutputManager.getCurrentState())

  useEffect(() => {
    const updateState = () => {
      setOutputState(modelOutputManager.getCurrentState())
    }

    // Update state periodically to catch external changes
    const interval = setInterval(updateState, 1000)

    return () => clearInterval(interval)
  }, [])

  return {
    outputState,
    isDisplaying: outputState.isDisplaying && !!outputState.output,
    isStreaming: outputState.streaming?.isStreaming || false,
    hasError: !!outputState.lastError,
    currentOutput: outputState.output,
    currentTestId: outputState.testId,
    streamingProgress: outputState.streaming?.streamingProgress || null,
    lastError: outputState.lastError
  }
}

export default useModelOutput
