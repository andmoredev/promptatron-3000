import { useState } from 'react'
import PropTypes from 'prop-types'

/**
 * Component for displaying scenario validation errors with detailed feedback
 */
const ScenarioValidationDisplay = ({
  validation,
  scenarioId,
  onFix,
  onIgnore,
  showDetails = true
}) => {
  const [expandedErrors, setExpandedErrors] = useState(new Set())
  const [showWarnings, setShowWarnings] = useState(true)

  if (!validation || validation.isValid) {
    // Only show warnings if they exist, don't show success message
    if (validation?.warnings?.length > 0) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-3">
            <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-sm font-medium text-yellow-800">
              {validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''} found
            </span>
          </div>
          <div className="space-y-2">
            {validation.warnings.map((warning, index) => (
              <div key={index} className="flex items-start space-x-2 text-sm text-yellow-700">
                <svg className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    // Return null when validation passes with no warnings - don't show anything
    return null
  }

  const errors = validation.enhancedErrors || validation.errors || {}
  const warnings = validation.warnings || []
  const errorCount = Object.keys(errors).length
  const warningCount = warnings.length

  const toggleErrorExpansion = (errorKey) => {
    const newExpanded = new Set(expandedErrors)
    if (newExpanded.has(errorKey)) {
      newExpanded.delete(errorKey)
    } else {
      newExpanded.add(errorKey)
    }
    setExpandedErrors(newExpanded)
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high':
        return 'text-red-700 bg-red-100 border-red-200'
      case 'medium':
        return 'text-yellow-700 bg-yellow-100 border-yellow-200'
      case 'low':
        return 'text-blue-700 bg-blue-100 border-blue-200'
      default:
        return 'text-gray-700 bg-gray-100 border-gray-200'
    }
  }

  const renderError = (errorKey, errorData) => {
    const isExpanded = expandedErrors.has(errorKey)
    const isEnhanced = typeof errorData === 'object' && errorData.message
    const message = isEnhanced ? errorData.message : errorData
    const suggestions = isEnhanced ? errorData.suggestions || [] : []
    const severity = isEnhanced ? errorData.severity : 'medium'
    const fixable = isEnhanced ? errorData.fixable : false

    return (
      <div key={errorKey} className="border border-red-200 rounded-lg p-3 bg-red-50">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <svg className="h-4 w-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-red-800">
                {errorKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </span>
              {isEnhanced && (
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(severity)}`}>
                  {severity}
                </span>
              )}
              {fixable && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-green-700 bg-green-100 border border-green-200">
                  fixable
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-red-700">
              {message}
            </p>
          </div>

          <div className="flex items-center space-x-2 ml-4">
            {fixable && onFix && (
              <button
                onClick={() => onFix(errorKey, errorData)}
                className="text-xs text-green-600 hover:text-green-700 font-medium"
              >
                Auto-Fix
              </button>
            )}

            {suggestions.length > 0 && (
              <button
                onClick={() => toggleErrorExpansion(errorKey)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                {isExpanded ? 'Hide Help' : 'Show Help'}
              </button>
            )}
          </div>
        </div>

        {/* Expanded Error Details */}
        {isExpanded && suggestions.length > 0 && (
          <div className="mt-3 border-t border-red-200 pt-3">
            <h5 className="text-xs font-medium text-red-800 mb-2">How to fix this:</h5>
            <ul className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="text-xs">
                  <div className="flex items-start space-x-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(suggestion.priority)}`}>
                      {suggestion.type || 'tip'}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium text-red-800">{suggestion.action}</div>
                      <div className="text-red-600">{suggestion.description}</div>
                      {suggestion.example && (
                        <div className="mt-1 text-xs text-red-500 font-mono bg-red-100 px-2 py-1 rounded border border-red-200">
                          Example: {suggestion.example}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const renderWarning = (warning, index) => {
    return (
      <div key={index} className="flex items-start space-x-2 text-sm text-yellow-700">
        <svg className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span>{warning}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Validation Summary */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-sm font-medium text-red-800">
              Scenario Validation Failed
              {scenarioId && (
                <span className="ml-2 text-xs text-red-600 font-mono">
                  ({scenarioId})
                </span>
              )}
            </h3>
          </div>

          {onIgnore && (
            <button
              onClick={onIgnore}
              className="text-xs text-red-600 hover:text-red-700 font-medium"
            >
              Ignore Errors
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center space-x-4 text-xs text-red-700">
          <span>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          {warningCount > 0 && (
            <span>{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
          )}
          {validation.validationTime && (
            <span>Validated in {validation.validationTime}ms</span>
          )}
        </div>
      </div>

      {/* Validation Errors */}
      {errorCount > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Validation Errors</h4>
          {Object.entries(errors).map(([key, error]) => renderError(key, error))}
        </div>
      )}

      {/* Validation Warnings */}
      {warningCount > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Warnings</h4>
            <button
              onClick={() => setShowWarnings(!showWarnings)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {showWarnings ? 'Hide' : 'Show'} Warnings
            </button>
          </div>

          {showWarnings && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
              {warnings.map(renderWarning)}
            </div>
          )}
        </div>
      )}

      {/* Validation Details */}
      {showDetails && validation.validationDetails && (
        <details className="text-sm">
          <summary className="font-medium text-gray-900 cursor-pointer hover:text-gray-700">
            Validation Details
          </summary>
          <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(validation.validationDetails).map(([check, passed]) => (
                <div key={check} className="flex items-center space-x-2">
                  {passed ? (
                    <svg className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-3 w-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={passed ? 'text-green-700' : 'text-red-700'}>
                    {check.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* Validation Context */}
      {validation.validationContext && (
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer hover:text-gray-800">
            Validation Context
          </summary>
          <pre className="mt-2 bg-gray-100 p-2 rounded overflow-x-auto">
            {JSON.stringify(validation.validationContext, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

ScenarioValidationDisplay.propTypes = {
  validation: PropTypes.shape({
    isValid: PropTypes.bool.isRequired,
    errors: PropTypes.object,
    enhancedErrors: PropTypes.object,
    warnings: PropTypes.array,
    validationDetails: PropTypes.object,
    validationTime: PropTypes.number,
    validationContext: PropTypes.object
  }),
  scenarioId: PropTypes.string,
  onFix: PropTypes.func,
  onIgnore: PropTypes.func,
  showDetails: PropTypes.bool
}

export default ScenarioValidationDisplay
