import React, { useState } from 'react'
import PropTypes from 'prop-types'

/**
 * Component to display tool configuration status and errors
 * Provides user-friendly feedbackool availability and issues
 */
const ToolConfigurationStatus = ({
  toolConfigResult,
  datasetType,
  showDetails = false,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Don't render anything if no tool config result
  if (!toolConfigResult) {
    return null
  }

  const {
    hasToolConfig,
    fallbackMode,
    message,
    errors = [],
    warnings = [],
    gracefulDegradation,
    validationResult,
    toolsAvailable = []
  } = toolConfigResult

  // Determine status and styling
  const getStatusInfo = () => {
    if (errors.length > 0) {
      return {
        type: 'error',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-800',
        iconColor: 'text-red-500',
        icon: (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      }
    }

    if (warnings.length > 0 || fallbackMode) {
      return {
        type: 'warning',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        textColor: 'text-yellow-800',
        iconColor: 'text-yellow-500',
        icon: (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      }
    }

    if (hasToolConfig) {
      return {
        type: 'success',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-800',
        iconColor: 'text-green-500',
        icon: (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      }
    }

    return {
      type: 'info',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      textColor: 'text-gray-800',
      iconColor: 'text-gray-500',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  }

  const statusInfo = getStatusInfo()
  const hasDetails = showDetails && (errors.length > 0 || warnings.length > 0 || validationResult)

  return (
    <div className={`${statusInfo.bgColor} border ${statusInfo.borderColor} rounded-lg p-3 ${className}`}>
      {/* Main status message */}
      <div className="flex items-start space-x-2">
        <div className={`${statusInfo.iconColor} flex-shrink-0 mt-0.5`}>
          {statusInfo.icon}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-medium ${statusInfo.textColor}`}>
            {message}
          </p>

          {/* Tool count and names */}
          {hasToolConfig && toolsAvailable.length > 0 && (
            <p className="text-xs text-gray-600 mt-1">
              Available tools: {toolsAvailable.join(', ')}
            </p>
          )}

          {/* Graceful degradation notice */}
          {gracefulDegradation && (
            <p className="text-xs text-gray-600 mt-1">
              Analysis will continue without tool capabilities.
            </p>
          )}

          {/* Details toggle */}
          {hasDetails && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-gray-600 hover:text-gray-800 mt-2 flex items-center space-x-1"
            >
              <svg
                className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
          {/* Errors */}
          {errors.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-red-800 mb-1">Errors:</h4>
              <ul className="text-xs text-red-700 space-y-1">
                {errors.map((error, index) => (
                  <li key={index} className="flex items-start space-x-1">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-yellow-800 mb-1">Warnings:</h4>
              <ul className="text-xs text-yellow-700 space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index} className="flex items-start space-x-1">
                    <span className="text-yellow-500 mt-0.5">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation details */}
          {validationResult && (
            <div>
              <h4 className="text-xs font-medium text-gray-800 mb-1">Validation Details:</h4>
              <div className="text-xs text-gray-700 space-y-1">
                <p>Status: {validationResult.isValid ? 'Valid' : 'Invalid'}</p>
                {validationResult.userMessages && validationResult.userMessages.length > 0 && (
                  <ul className="space-y-1">
                    {validationResult.userMessages.map((msg, index) => (
                      <li key={index} className="flex items-start space-x-1">
                        <span className="text-gray-500 mt-0.5">•</span>
                        <span>{msg}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

ToolConfigurationStatus.propTypes = {
  toolConfigResult: PropTypes.shape({
    hasToolConfig: PropTypes.bool,
    fallbackMode: PropTypes.bool,
    message: PropTypes.string,
    errors: PropTypes.arrayOf(PropTypes.string),
    warnings: PropTypes.arrayOf(PropTypes.string),
    gracefulDegradation: PropTypes.bool,
    validationResult: PropTypes.object,
    toolsAvailable: PropTypes.arrayOf(PropTypes.string)
  }),
  datasetType: PropTypes.string,
  showDetails: PropTypes.bool,
  className: PropTypes.string
}

export default ToolConfigurationStatus
