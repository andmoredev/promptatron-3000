import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { DeterminismErrorTypes } from '../utils/determinismErrorHandling'

/**
 * Eror recovery options component for determinism evaluation
 * Provides user-friendly recovery actions with clear explanations
 */
function ErrorRecoveryOptions({
  errorInfo,
  onRetry,
  onCancel,
  onCompletePartial,
  onModifySettings,
  onExportData,
  retryCount = 0,
  evaluationData = null
}) {
  const [selectedAction, setSelectedAction] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [modifiedSettings, setModifiedSettings] = useState({
    testCount: 10,
    maxRetryAttempts: 3,
    enableThrottlingAlerts: true
  })

  const hasPartialData = evaluationData?.completedRequests > 0
  const partialDataCount = evaluationData?.completedRequests || 0

  const handleActionSelect = (action) => {
    setSelectedAction(action)

    switch (action) {
      case 'retry':
        onRetry?.()
        break
      case 'complete_partial':
        onCompletePartial?.()
        break
      case 'modify_settings':
        setShowSettings(true)
        break
      case 'export_data':
        onExportData?.()
        break
      case 'cancel':
        onCancel?.()
        break
      default:
        break
    }
  }

  const handleSettingsSubmit = () => {
    setShowSettings(false)
    onModifySettings?.(modifiedSettings)
  }

  const getErrorIcon = (errorType) => {
    switch (errorType) {
      case DeterminismErrorTypes.THROTTLING:
        return (
          <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case DeterminismErrorTypes.NETWORK:
      case DeterminismErrorTypes.NETWORK_INSTABILITY:
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 2.25a9.75 9.75 0 109.75 9.75A9.75 9.75 0 0012 2.25z" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
    }
  }

  const getRecoveryActions = () => {
    const actions = []

    // Primary recovery actions based on error type and available data
    if (errorInfo.type === DeterminismErrorTypes.THROTTLING) {
      if (hasPartialData && partialDataCount >= 3) {
        actions.push({
          action: 'complete_partial',
          label: `Continue with ${partialDataCount} responses`,
          description: 'Analyze the responses collected before throttling occurred',
          priority: 'high',
          icon: '✓',
          color: 'bg-green-50 border-green-200 text-green-800'
        })
      }

      actions.push({
        action: 'modify_settings',
        label: 'Retry with fewer requests',
        description: 'Reduce test count to avoid rate limiting',
        priority: 'high',
        icon: '⚙️',
        color: 'bg-blue-50 border-blue-200 text-blue-800'
      })
    } else if (errorInfo.type === DeterminismErrorTypes.NETWORK_INSTABILITY) {
      if (hasPartialData) {
        actions.push({
          action: 'complete_partial',
          label: `Analyze ${partialDataCount} collected responses`,
          description: 'Use responses collected before network issues',
          priority: 'high',
          icon: '✓',
          color: 'bg-green-50 border-green-200 text-green-800'
        })
      }

      actions.push({
        action: 'retry',
        label: 'Retry when network is stable',
        description: 'Wait for network connection to stabilize and retry',
        priority: 'medium',
        icon: '🔄',
        color: 'bg-yellow-50 border-yellow-200 text-yellow-800'
      })
    } else if (errorInfo.type === DeterminismErrorTypes.GRADER_FAILURE) {
      if (hasPartialData) {
        actions.push({
          action: 'complete_partial',
          label: 'Use statistical analysis',
          description: 'Perform basic analysis without LLM grader',
          priority: 'high',
          icon: '📊',
          color: 'bg-purple-50 border-purple-200 text-purple-800'
        })
      }
    } else {
      // Generic error handling
      if (hasPartialData && partialDataCount >= 3) {
        actions.push({
          action: 'complete_partial',
          label: `Continue with ${partialDataCount} responses`,
          description: 'Analyze the partial data collected',
          priority: 'high',
          icon: '✓',
          color: 'bg-green-50 border-green-200 text-green-800'
        })
      }

      if (retryCount < 2) {
        actions.push({
          action: 'retry',
          label: 'Retry evaluation',
          description: 'Start the evaluation again from the beginning',
          priority: 'medium',
          icon: '🔄',
          color: 'bg-blue-50 border-blue-200 text-blue-800'
        })
      }
    }

    // Always offer settings modification
    actions.push({
      action: 'modify_settings',
      label: 'Adjust settings and retry',
      description: 'Modify evaluation parameters and try again',
      priority: 'medium',
      icon: '⚙️',
      color: 'bg-gray-50 border-gray-200 text-gray-800'
    })

    // Export option if we have data
    if (hasPartialData) {
      actions.push({
        action: 'export_data',
        label: 'Export collected data',
        description: 'Download responses for manual analysis',
        priority: 'low',
        icon: '💾',
        color: 'bg-indigo-50 border-indigo-200 text-indigo-800'
      })
    }

    // Cancel option
    actions.push({
      action: 'cancel',
      label: 'Cancel evaluation',
      description: 'Return to normal testing mode',
      priority: 'low',
      icon: '✕',
      color: 'bg-red-50 border-red-200 text-red-800'
    })

    return actions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
  }

  const recoveryActions = getRecoveryActions()

  if (showSettings) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
        <h4 className="text-sm font-medium text-blue-800 mb-3 flex items-center space-x-2">
          <span>⚙️</span>
          <span>Modify Evaluation Settings</span>
        </h4>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-blue-700 mb-1">
              Number of test requests
            </label>
            <select
              value={modifiedSettings.testCount}
              onChange={(e) => setModifiedSettings(prev => ({ ...prev, testCount: parseInt(e.target.value) }))}
              className="w-full text-xs border border-blue-300 rounded px-2 py-1 bg-white"
            >
              <option value={5}>5 requests (faster)</option>
              <option value={7}>7 requests</option>
              <option value={10}>10 requests (default)</option>
              <option value={15}>15 requests</option>
              <option value={20}>20 requests (slower)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-blue-700 mb-1">
              Max retry attempts per request
            </label>
            <select
              value={modifiedSettings.maxRetryAttempts}
              onChange={(e) => setModifiedSettings(prev => ({ ...prev, maxRetryAttempts: parseInt(e.target.value) }))}
              className="w-full text-xs border border-blue-300 rounded px-2 py-1 bg-white"
            >
              <option value={1}>1 attempt (no retries)</option>
              <option value={2}>2 attempts</option>
              <option value={3}>3 attempts (default)</option>
              <option value={5}>5 attempts (more persistent)</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="throttling-alerts"
              checked={modifiedSettings.enableThrottlingAlerts}
              onChange={(e) => setModifiedSettings(prev => ({ ...prev, enableThrottlingAlerts: e.target.checked }))}
              className="text-blue-600"
            />
            <label htmlFor="throttling-alerts" className="text-xs text-blue-700">
              Show throttling alerts and countdowns
            </label>
          </div>
        </div>

        <div className="flex space-x-2 mt-4">
          <button
            onClick={handleSettingsSubmit}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
          >
            Apply Settings & Retry
          </button>
          <button
            onClick={() => setShowSettings(false)}
            className="text-xs bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-3">
      <div className="flex items-start space-x-3 mb-4">
        {getErrorIcon(errorInfo.type)}
        <div className="flex-1">
          <h4 className="text-sm font-medium text-red-800 mb-1">
            Recovery Options Available
          </h4>
          <p className="text-xs text-red-700">
            {hasPartialData
              ? `${partialDataCount} responses were collected before the error occurred.`
              : 'No responses were collected before the error occurred.'
            }
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {recoveryActions.map((action, index) => (
          <button
            key={action.action}
            onClick={() => handleActionSelect(action.action)}
            disabled={action.disabled}
            className={`w-full text-left p-3 rounded-lg border transition-all duration-200 hover:shadow-sm ${
              action.disabled
                ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200'
                : `${action.color} hover:shadow-md`
            }`}
          >
            <div className="flex items-start space-x-3">
              <span className="text-lg">{action.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-medium mb-1">
                  {action.label}
                  {action.priority === 'high' && (
                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-90">
                  {action.description}
                </div>
                {action.estimatedWait && (
                  <div className="text-xs opacity-75 mt-1">
                    Estimated wait: {action.estimatedWait}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {retryCount > 0 && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
          <strong>Note:</strong> This is retry attempt #{retryCount + 1}.
          Consider adjusting settings if the issue persists.
        </div>
      )}
    </div>
  )
}

ErrorRecoveryOptions.propTypes = {
  errorInfo: PropTypes.object.isRequired,
  onRetry: PropTypes.func,
  onCancel: PropTypes.func,
  onCompletePartial: PropTypes.func,
  onModifySettings: PropTypes.func,
  onExportData: PropTypes.func,
  retryCount: PropTypes.number,
  evaluationData: PropTypes.object
}

export default ErrorRecoveryOptions
