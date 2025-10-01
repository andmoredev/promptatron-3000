import { useState } from 'react'
import PropTypes from 'prop-types'

/**
 * Enhanced error display component for scenario-related errors
 * Provides user-friendly error messages, suggestions, and recovery options
 */
const ScenarioErrorDisplay = ({
  error,
  scenarioId,
  onRetry,
  onDismiss,
  onRecovery,
  showDiagnostics = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [isRecovering, setIsRecovering] = useState(false)

  if (!error) return null

  const errorType = error.type || 'unknown'
  const errorMessage = error.userMessage || error.message || 'An unknown error occurred'
  const suggestions = error.suggestedActions || error.suggestions || []
  const isRecoverable = error.recoverable !== false

  const getErrorIcon = () => {
    switch (error.severity) {
      case 'high':
      case 'critical':
        return (
          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case 'medium':
        return (
          <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getErrorBorderColor = () => {
    switch (error.severity) {
      case 'high':
      case 'critical':
        return 'border-red-200'
      case 'medium':
        return 'border-yellow-200'
      default:
        return 'border-blue-200'
    }
  }

  const getErrorBackgroundColor = () => {
    switch (error.severity) {
      case 'high':
      case 'critical':
        return 'bg-red-50'
      case 'medium':
        return 'bg-yellow-50'
      default:
        return 'bg-blue-50'
    }
  }

  const handleRecovery = async () => {
    if (!onRecovery || isRecovering) return

    setIsRecovering(true)
    try {
      await onRecovery(scenarioId, error)
    } catch (recoveryError) {
      console.error('Recovery failed:', recoveryError)
    } finally {
      setIsRecovering(false)
    }
  }

  const renderSuggestion = (suggestion, index) => {
    if (typeof suggestion === 'string') {
      return (
        <li key={index} className="text-sm text-gray-700">
          {suggestion}
        </li>
      )
    }

    const priorityColors = {
      high: 'text-red-700 bg-red-100',
      medium: 'text-yellow-700 bg-yellow-100',
      low: 'text-gray-700 bg-gray-100'
    }

    const priorityColor = priorityColors[suggestion.priority] || priorityColors.low

    return (
      <li key={index} className="text-sm">
        <div className="flex items-start space-x-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${priorityColor}`}>
            {suggestion.priority || 'info'}
          </span>
          <div className="flex-1">
            <div className="font-medium text-gray-900">{suggestion.action}</div>
            <div className="text-gray-600">{suggestion.description}</div>
            {suggestion.example && (
              <div className="mt-1 text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
                Example: {suggestion.example}
              </div>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className={`border rounded-lg p-4 ${getErrorBorderColor()} ${getErrorBandColor()}`}>
      {/* Error Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            {getErrorIcon()}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-gray-900">
              Scenario Loading Error
              {scenarioId && (
                <span className="ml-2 text-xs text-gray-500 font-mono">
                  ({scenarioId})
                </span>
              )}
            </h3>
            <p className="mt-1 text-sm text-gray-700">
              {errorMessage}
            </p>
            {error.originalMessage && error.originalMessage !== errorMessage && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  Technical details
                </summary>
                <p className="mt-1 text-xs text-gray-600 font-mono bg-gray-100 p-2 rounded">
                  {error.originalMessage}
                </p>
              </details>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 ml-4">
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Retry
            </button>
          )}

          {isRecoverable && onRecovery && (
            <button
              onClick={handleRecovery}
              disabled={isRecovering}
              className="text-sm text-green-600 hover:text-green-700 font-medium disabled:opacity-50"
            >
              {isRecovering ? 'Recovering...' : 'Auto-Fix'}
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {isExpanded ? 'Less' : 'More'}
          </button>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Error Classification */}
          <div className="flex items-center space-x-4 text-xs text-gray-600">
            <span>Type: <span className="font-mono">{errorType}</span></span>
            <span>Severity: <span className="font-mono">{error.severity || 'unknown'}</span></span>
            {error.timestamp && (
              <span>Time: <span className="font-mono">{new Date(error.timestamp).toLocaleTimeString()}</span></span>
            )}
          </div>

          {/* Suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-900">Suggested Solutions</h4>
                <button
                  onClick={() => setShowSuggestions(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Hide
                </button>
              </div>
              <ul className="space-y-3">
                {suggestions.map(renderSuggestion)}
              </ul>
            </div>
          )}

          {/* Context Information */}
          {error.context && Object.keys(error.context).length > 0 && (
            <details>
              <summary className="text-sm font-medium text-gray-900 cursor-pointer hover:text-gray-700">
                Error Context
              </summary>
              <div className="mt-2 text-xs text-gray-600">
                <pre className="bg-gray-100 p-2 rounded overflow-x-auto">
                  {JSON.stringify(error.context, null, 2)}
                </pre>
              </div>
            </details>
          )}

          {/* Diagnostics */}
          {showDiagnostics && error.diagnostics && (
            <details>
              <summary className="text-sm font-medium text-gray-900 cursor-pointer hover:text-gray-700">
                Diagnostic Information
              </summary>
              <div className="mt-2 text-xs text-gray-600">
                <pre className="bg-gray-100 p-2 rounded overflow-x-auto">
                  {JSON.stringify(error.diagnostics, null, 2)}
                </pre>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Recovery Status */}
      {error.recovered && (
        <div className="mt-3 p-2 bg-green-100 border border-green-200 rounded">
          <div className="flex items-center space-x-2">
            <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-green-800">
              Recovered using {error.recoveryMethod || 'automatic recovery'}
            </span>
          </div>
          {error.recoveryWarnings && error.recoveryWarnings.length > 0 && (
            <ul className="mt-1 text-xs text-green-700 list-disc list-inside">
              {error.recoveryWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

ScenarioErrorDisplay.propTypes = {
  error: PropTypes.shape({
    type: PropTypes.string,
    severity: PropTypes.string,
    message: PropTypes.string,
    userMessage: PropTypes.string,
    originalMessage: PropTypes.string,
    suggestedActions: PropTypes.array,
    suggestions: PropTypes.array,
    recoverable: PropTypes.bool,
    context: PropTypes.object,
    diagnostics: PropTypes.object,
    timestamp: PropTypes.string,
    recovered: PropTypes.bool,
    recoveryMethod: PropTypes.string,
    recoveryWarnings: PropTypes.array
  }),
  scenarioId: PropTypes.string,
  onRetry: PropTypes.func,
  onDismiss: PropTypes.func,
  onRecovery: PropTypes.func,
  showDiagnostics: PropTypes.bool
}

export default ScenarioErrorDisplay
