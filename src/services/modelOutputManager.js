/**
 * Model Output State Management Service
 * Handles output state persistence, restoration, and error recovery for model responses
 */

import { handleError, ErrorTypes } from '../utils/errorHandling.js'

/**
 * Streaming state interface
 */
const DEFAULT_STREAMING_STATE = {
  isStreaming: false,
  streamingEnabled: false,
  currentChunk: '',
  accumulatedText: '',
  streamComplete: false,
  streamError: null,
  streamingProgress: null,
  toolUsage: { detected: false, activeTools: [], completedTools: [] }
}

/**
 * Model output state interface
 */
const DEFAULT_OUTPUT_STATE = {
  currentOutput: null,
  testId: null,
  timestamp: null,
  isDisplaying: false,
  lastError: null,
  streaming: { ...DEFAULT_STREAMING_STATE },
  modelId: null,
  systemPrompt: null,
  userPrompt: null,
  usage: null,
  isStreamed: false,
  streamingMetrics: null
}

/**
 * ModelOutputManager class for handling output state persistence and recovery
 */
export class ModelOutputManager {
  constructor() {
    this.state = { ...DEFAULT_OUTPUT_STATE }
    this.stateHistory = new Map()
    this.streamingCallbacks = new Set()
    this.maxHistorySize = 50
    this.recoveryAttempts = new Map()
    this.maxRecoveryAttempts = 3

    // Bind methods to preserve context
    this.initializeOutput = this.initializeOutput.bind(this)
    this.updateOutput = this.updateOutput.bind(this)
    this.restoreState = this.restoreState.bind(this)
    this.handleDisplayError = this.handleDisplayError.bind(this)
  }

  /**
   * Initialize output state for a new test
   * @param {string} testId - Unique test identifier
   * @param {Object} config - Configuration options
   * @param {boolean} config.streamingEnabled - Whether streaming is enabled
   * @param {string} config.modelId - Model identifier
   * @param {string} config.systemPrompt - System prompt
   * @param {string} config.userPrompt - User prompt
   */
  initializeOutput(testId, config = {}) {
    try {
      const {
        streamingEnabled = false,
        modelId = null,
        systemPrompt = null,
        userPrompt = null
      } = config

      this.state = {
        ...DEFAULT_OUTPUT_STATE,
        testId,
        timestamp: new Date().toISOString(),
        isDisplaying: true,
        modelId,
        systemPrompt,
        userPrompt,
        streaming: {
          ...DEFAULT_STREAMING_STATE,
          streamingEnabled,
          isStreaming: streamingEnabled
        }
      }

      // Clear any previous recovery attempts for this test
      this.recoveryAttempts.delete(testId)

      console.log('ModelOutputManager: Initialized output state for test', testId, {
        streamingEnabled,
        modelId
      })

      return true
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'ModelOutputManager',
        action: 'initializeOutput',
        testId
      })

      this.state.lastError = errorInfo.userMessage
      return false
    }
  }

  /**
   * Update output with new content (for streaming or complete responses)
   * @paramstring} content - New content to add or replace
   * @param {Object} options - Update options
   * @param {boolean} options.isChunk - Whether this is a streaming chunk
   * @param {boolean} options.isComplete - Whether this completes the response
   * @param {Object} options.metadata - Additional metadata
   */
  updateOutput(content, options = {}) {
    try {
      const {
        isChunk = false,
        isComplete = false,
        metadata = {}
      } = options

      if (!this.state.testId) {
        throw new Error('No active test - call initializeOutput first')
      }

      if (isChunk && this.state.streaming.streamingEnabled) {
        // Handle streaming chunk
        this.state.streaming.currentChunk = content
        this.state.streaming.accumulatedText += content
        this.state.currentOutput = this.state.streaming.accumulatedText

        // Update streaming progress if provided
        if (metadata.streamingProgress) {
          this.state.streaming.streamingProgress = metadata.streamingProgress
        }

        // Update tool usage if provided
        if (metadata.toolUsage) {
          this.state.streaming.toolUsage = metadata.toolUsage
        }

        // Notify streaming callbacks
        this.streamingCallbacks.forEach(callback => {
          try {
            callback(this.state.currentOutput, metadata)
          } catch (callbackError) {
            console.warn('Streaming callback error:', callbackError)
          }
        })

      } else {
        // Handle complete response
        this.state.currentOutput = content
        this.state.streaming.accumulatedText = content
      }

      if (isComplete) {
        this.state.streaming.isStreaming = false
        this.state.streaming.streamComplete = true
        this.state.isStreamed = this.state.streaming.streamingEnabled

        // Store final metrics
        if (metadata.usage) {
          this.state.usage = metadata.usage
        }
        if (metadata.streamingMetrics) {
          this.state.streamingMetrics = metadata.streamingMetrics
        }

        // Save to history
        this.saveToHistory()
      }

      // Clear any previous errors on successful update
      this.state.lastError = null

      return true
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'ModelOutputManager',
        action: 'updateOutput',
        testId: this.state.testId,
        isChunk,
        isComplete
      })

      this.state.lastError = errorInfo.userMessage
      return false
    }
  }

  /**
   * Handle streaming error
   * @param {Error|string} error - Streaming error
   */
  handleStreamingError(error) {
    try {
      const errorMessage = typeof error === 'string' ? error : error.message

      this.state.streaming.streamError = errorMessage
      this.state.streaming.isStreaming = false
      this.state.lastError = errorMessage

      // Preserve any accumulated content
      if (this.state.streaming.accumulatedText) {
        this.state.currentOutput = this.state.streaming.accumulatedText
        console.log('ModelOutputManager: Preserved partial streaming content after error')
      }

      // Attempt recovery if we haven't exceeded max attempts
      this.attemptRecovery('streaming_error', errorMessage)

    } catch (recoveryError) {
      console.error('Failed to handle streaming error:', recoveryError)
    }
  }

  /**
   * Complete streaming (successful completion)
   * @param {Object} finalMetrics - Final streaming metrics
   */
  completeStreaming(finalMetrics = {}) {
    try {
      if (this.state.streaming.isStreaming) {
        this.state.streaming.isStreaming = false
        this.state.streaming.streamComplete = true
        this.state.isStreamed = true

        if (finalMetrics.usage) {
          this.state.usage = finalMetrics.usage
        }
        if (finalMetrics.streamingMetrics) {
          this.state.streamingMetrics = finalMetrics.streamingMetrics
        }

        // Ensure current output matches accumulated text
        this.state.currentOutput = this.state.streaming.accumulatedText

        // Save to history
        this.saveToHistory()

        console.log('ModelOutputManager: Streaming completed successfully')
      }
    } catch (error) {
      console.error('Failed to complete streaming:', error)
    }
  }

  /**
   * Save current state to history
   */
  saveToHistory() {
    try {
      if (!this.state.testId || !this.state.currentOutput) {
        return
      }

      const historyEntry = {
        testId: this.state.testId,
        output: this.state.currentOutput,
        timestamp: this.state.timestamp,
        modelId: this.state.modelId,
        systemPrompt: this.state.systemPrompt,
        userPrompt: this.state.userPrompt,
        usage: this.state.usage,
        isStreamed: this.state.isStreamed,
        streamingMetrics: this.state.streamingMetrics,
        savedAt: new Date().toISOString()
      }

      this.stateHistory.set(this.state.testId, historyEntry)

      // Cleanup old history entries
      if (this.stateHistory.size > this.maxHistorySize) {
        const oldestKey = this.stateHistory.keys().next().value
        this.stateHistory.delete(oldestKey)
      }

      console.log('ModelOutputManager: Saved state to history for test', this.state.testId)
    } catch (error) {
      console.warn('Failed to save state to history:', error)
    }
  }

  /**
   * Restore state from history or current state
   * @param {string} testId - Test ID to restore (optional, uses current if not provided)
   * @returns {Object|null} Restored state or null if not found
   */
  restoreState(testId = null) {
    try {
      const targetTestId = testId || this.state.testId

      if (!targetTestId) {
        console.warn('ModelOutputManager: No test ID provided for state restoration')
        return null
      }

      // First check if this is the current active state
      if (this.state.testId === targetTestId && this.state.currentOutput) {
        console.log('ModelOutputManager: Returning current active state')
        return this.getCurrentState()
      }

      // Check history
      const historyEntry = this.stateHistory.get(targetTestId)
      if (historyEntry) {
        console.log('ModelOutputManager: Restored state from history for test', targetTestId)
        return {
          testId: historyEntry.testId,
          output: historyEntry.output,
          timestamp: historyEntry.timestamp,
          modelId: historyEntry.modelId,
          systemPrompt: historyEntry.systemPrompt,
          userPrompt: historyEntry.userPrompt,
          usage: historyEntry.usage,
          isStreamed: historyEntry.isStreamed,
          streamingMetrics: historyEntry.streamingMetrics,
          isDisplaying: true,
          lastError: null
        }
      }

      console.warn('ModelOutputManager: No state found for test', targetTestId)
      return null
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'ModelOutputManager',
        action: 'restoreState',
        testId: testId || this.state.testId
      })

      return {
        testId: testId || this.state.testId,
        output: null,
        lastError: errorInfo.userMessage,
        isDisplaying: false
      }
    }
  }

  /**
   * Handle display errors and attempt recovery
   * @param {Error|string} error - Display error
   * @param {Object} context - Error context
   * @returns {boolean} Whether recovery was attempted
   */
  handleDisplayError(error, context = {}) {
    try {
      const errorMessage = typeof error === 'string' ? error : error.message

      this.state.lastError = errorMessage

      console.error('ModelOutputManager: Display error occurred:', errorMessage, context)

      // Attempt recovery
      return this.attemptRecovery('display_error', errorMessage, context)
    } catch (recoveryError) {
      console.error('Failed to handle display error:', recoveryError)
      return false
    }
  }

  /**
   * Attempt recovery from various error types
   * @param {string} errorType - Type of error
   * @param {string} errorMessage - Error message
   * @param {Object} context - Additional context
   * @returns {boolean} Whether recovery was attempted
   */
  attemptRecovery(errorType, errorMessage, context = {}) {
    try {
      const testId = this.state.testId
      if (!testId) return false

      // Check if we've exceeded max recovery attempts
      const attempts = this.recoveryAttempts.get(testId) || 0
      if (attempts >= this.maxRecoveryAttempts) {
        console.warn('ModelOutputManager: Max recovery attempts exceeded for test', testId)
        return false
      }

      // Increment recovery attempts
      this.recoveryAttempts.set(testId, attempts + 1)

      switch (errorType) {
        case 'display_error':
          return this.recoverFromDisplayError(errorMessage, context)
        case 'streaming_error':
          return this.recoverFromStreamingError(errorMessage, context)
        case 'state_error':
          return this.recoverFromStateError(errorMessage, context)
        default:
          return this.recoverFromGenericError(errorMessage, context)
      }
    } catch (error) {
      console.error('Recovery attempt failed:', error)
      return false
    }
  }

  /**
   * Recover from display errors
   * @param {string} errorMessage - Error message
   * @param {Object} context - Error context
   * @returns {boolean} Recovery success
   */
  recoverFromDisplayError(errorMessage, context) {
    try {
      // If we have output content, try to preserve it
      if (this.state.currentOutput) {
        console.log('ModelOutputManager: Preserving output content during display error recovery')

        // Clear the error to allow re-rendering
        this.state.lastError = null

        // Force a re-render by updating the timestamp
        this.state.timestamp = new Date().toISOString()

        return true
      }

      // If no content, try to restore from history
      const restored = this.restoreState()
      if (restored && restored.output) {
        this.state.currentOutput = restored.output
        this.state.lastError = null
        console.log('ModelOutputManager: Recovered output from history')
        return true
      }

      return false
    } catch (error) {
      console.error('Display error recovery failed:', error)
      return false
    }
  }

  /**
   * Recover from streaming errors
   * @param {string} errorMessage - Error message
   * @param {Object} context - Error context
   * @returns {boolean} Recovery success
   */
  recoverFromStreamingError(errorMessage, context) {
    try {
      // Preserve any accumulated content
      if (this.state.streaming.accumulatedText) {
        this.state.currentOutput = this.state.streaming.accumulatedText
        this.state.streaming.isStreaming = false
        this.state.streaming.streamComplete = true

        // Save partial result to history
        this.saveToHistory()

        console.log('ModelOutputManager: Recovered partial streaming content')
        return true
      }

      return false
    } catch (error) {
      console.error('Streaming error recovery failed:', error)
      return false
    }
  }

  /**
   * Recover from state management errors
   * @param {string} errorMessage - Error message
   * @param {Object} context - Error context
   * @returns {boolean} Recovery success
   */
  recoverFromStateError(errorMessage, context) {
    try {
      // Reset to a clean state while preserving essential data
      const preservedOutput = this.state.currentOutput
      const preservedTestId = this.state.testId

      this.state = {
        ...DEFAULT_OUTPUT_STATE,
        testId: preservedTestId,
        currentOutput: preservedOutput,
        timestamp: new Date().toISOString(),
        isDisplaying: !!preservedOutput,
        lastError: null
      }

      console.log('ModelOutputManager: Reset state while preserving output')
      return true
    } catch (error) {
      console.error('State error recovery failed:', error)
      return false
    }
  }

  /**
   * Recover from generic errors
   * @param {string} errorMessage - Error message
   * @param {Object} context - Error context
   * @returns {boolean} Recovery success
   */
  recoverFromGenericError(errorMessage, context) {
    try {
      // Clear the error and attempt to continue
      this.state.lastError = null

      // If we have any content, preserve it
      if (this.state.currentOutput || this.state.streaming.accumulatedText) {
        this.state.currentOutput = this.state.currentOutput || this.state.streaming.accumulatedText
        this.state.isDisplaying = true

        console.log('ModelOutputManager: Generic error recovery - preserved content')
        return true
      }

      return false
    } catch (error) {
      console.error('Generic error recovery failed:', error)
      return false
    }
  }

  /**
   * Register a callback for streaming updates
   * @param {Function} callback - Callback function (content, metadata) => void
   */
  registerStreamingCallback(callback) {
    if (typeof callback === 'function') {
      this.streamingCallbacks.add(callback)
    }
  }

  /**
   * Unregister a streaming callback
   * @param {Function} callback - Callback function to remove
   */
  unregisterStreamingCallback(callback) {
    this.streamingCallbacks.delete(callback)
  }

  /**
   * Get current state
   * @returns {Object} Current state
   */
  getCurrentState() {
    return {
      testId: this.state.testId,
      output: this.state.currentOutput,
      timestamp: this.state.timestamp,
      isDisplaying: this.state.isDisplaying,
      lastError: this.state.lastError,
      streaming: { ...this.state.streaming },
      modelId: this.state.modelId,
      systemPrompt: this.state.systemPrompt,
      userPrompt: this.state.userPrompt,
      usage: this.state.usage,
      isStreamed: this.state.isStreamed,
      streamingMetrics: this.state.streamingMetrics
    }
  }

  /**
   * Check if output is currently being displayed
   * @returns {boolean} Whether output is being displayed
   */
  isDisplaying() {
    return this.state.isDisplaying && !!this.state.currentOutput
  }

  /**
   * Check if streaming is active
   * @returns {boolean} Whether streaming is active
   */
  isStreaming() {
    return this.state.streaming.isStreaming
  }

  /**
   * Get streaming progress
   * @returns {Object|null} Streaming progress or null
   */
  getStreamingProgress() {
    return this.state.streaming.streamingProgress
  }

  /**
   * Get last error
   * @returns {string|null} Last error message or null
   */
  getLastError() {
    return this.state.lastError
  }

  /**
   * Clear current state
   */
  clearState() {
    this.state = { ...DEFAULT_OUTPUT_STATE }
    this.streamingCallbacks.clear()
    console.log('ModelOutputManager: State cleared')
  }

  /**
   * Get state history
   * @returns {Array} Array of history entries
   */
  getStateHistory() {
    return Array.from(this.stateHistory.values()).sort((a, b) =>
      new Date(b.savedAt) - new Date(a.savedAt)
    )
  }

  /**
   * Clear state history
   */
  clearHistory() {
    this.stateHistory.clear()
    this.recoveryAttempts.clear()
    console.log('ModelOutputManager: History cleared')
  }

  /**
   * Get service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      hasActiveState: !!this.state.testId,
      isDisplaying: this.state.isDisplaying,
      isStreaming: this.state.streaming.isStreaming,
      hasError: !!this.state.lastError,
      historySize: this.stateHistory.size,
      callbackCount: this.streamingCallbacks.size,
      lastError: this.state.lastError,
      currentTestId: this.state.testId
    }
  }
}

// Create and export singleton instance
export const modelOutputManager = new ModelOutputManager()

// Export class for testing
export default ModelOutputManager
