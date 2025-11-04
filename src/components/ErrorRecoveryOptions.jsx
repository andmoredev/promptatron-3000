import React, { useState } from 'react'
import PropTypes from 'prop-types'

const ErrorRecoveryOptions = ({
  errorInfo,
  onRecoveryAction,
  onDismiss,
  isLoading = false
}) => {
  const [selectedOption, setSelectedOption] = useState(null)

  if (!errorInfo || !errorInfo.recoveryOptions || errorInfo.recoveryOptions.length === 0) {
    return null
  }

  const handleOptionSelect = (option) => {
    setSelectedOption(option)
    if (option.automatic) {
      onRecoveryAction?.(option)
    }
  }

  const handleExecuteOption = () => {
    if (selectedOption) {
      onRecoveryAction?.(selectedOption)
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'red'
      case 'medium': return 'yellow'
      case 'low': return 'blue'
      default: return 'gray'
    }
  }

  const color = getSeverityColor(errorInfo.severity)

  return (
    <div className={`bg-${color}-50 border border-${color}-200 rounded-lg p-4`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className={`h-5 w-5 text-${color}-400`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className={`text-sm font-medium text-${color}-800`}>
            {errorInfo.userMessage}
          </h3>

          {errorInfo.recoveryOptions.length > 0 && (
            <div className="mt-3">
              <p className={`text-sm text-${color}-700 mb-2`}>
                Try one of these recovery options:
              </p>

              <div className="space-y-2">
                {errorInfo.recoveryOptions.map((option) => (
                  <div key={option.id} className="flex items-start space-x-3">
                    <input
                      type="radio"
                      id={`recovery-${option.id}`}
                      name="recovery-option"
                      value={option.id}
                      checked={selectedOption?.id === option.id}
                      onChange={() => handleOptionSelect(option)}
                      className={`mt-1 h-4 w-4 text-${color}-600 focus:ring-${color}-500 border-gray-300`}
                      disabled={isLoading}
                    />
                    <label
                      htmlFor={`recovery-${option.id}`}
                      className={`text-sm text-${color}-700 cursor-pointer`}
                    >
                      <div className="font-medium">{option.title}</div>
                      <div className="text-xs mt-1">{option.description}</div>
                      {option.delay && (
                        <div className="text-xs mt-1 italic">
                          Will wait {Math.ceil(option.delay / 1000)} seconds before retrying
                        </div>
                      )}
                    </label>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center space-x-3">
                {selectedOption && !selectedOption.automatic && (
                  <button
                    onClick={handleExecuteOption}
                    disabled={isLoading}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                      isLoading
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : `bg-${color}-600 text-white hover:bg-${color}-700 focus:outline-none focus:ring-2 focus:ring-${color}-500 focus:ring-offset-2`
                    }`}
                  >
                    {isLoading ? 'Processing...' : 'Apply Fix'}
                  </button>
                )}

                <button
                  onClick={onDismiss}
                  className={`px-3 py-2 text-sm font-medium text-${color}-700 hover:text-${color}-800 transition-colors duration-200`}
                  disabled={isLoading}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {errorInfo.suggestedActions && errorInfo.suggestedActions.length > 0 && (
            <div className="mt-4">
              <p className={`text-sm font-medium text-${color}-800 mb-2`}>
                Additional suggestions:
              </p>
              <ul className={`text-sm text-${color}-700 space-y-1`}>
                {errorInfo.suggestedActions.slice(0, 3).map((action, index) => (
                  <li key={index} className="flex items-start space-x-1">
                    <span>•</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {errorInfo.fallbackModels && errorInfo.fallbackModels.length > 0 && (
            <div className="mt-3 p-2 bg-blue-100 rounded">
              <p className="text-xs font-medium text-blue-800">
                Alternative models available:
              </p>
              <p className="text-xs text-blue-700 mt-1">
                {errorInfo.fallbackModels.join(', ')}
              </p>
            </div>
          )}
        </div>

        <div className="ml-3 flex-shrink-0">
          <button
            onClick={onDismiss}
            className={`inline-flex text-${color}-400 hover:text-${color}-600 transition-colors duration-200`}
            disabled={isLoading}
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

ErrorRecoveryOptions.propTypes = {
  errorInfo: PropTypes.shape({
    userMessage: PropTypes.string.isRequired,
    severity: PropTypes.oneOf(['low', 'medium', 'high']).isRequired,
    recoveryOptions: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      description: PropTypes.string.isRequired,
      action: PropTypes.string.isRequired,
      automatic: PropTypes.bool,
      delay: PropTypes.number
    })),
    suggestedActions: PropTypes.arrayOf(PropTypes.string),
    fallbackModels: PropTypes.arrayOf(PropTypes.string)
  }),
  onRecoveryAction: PropTypes.func,
  onDismiss: PropTypes.func.isRequired,
  isLoading: PropTypes.bool
}

ErrorRecoveryOptions.defaultProps = {
  errorInfo: null,
  onRecoveryAction: () => {},
  isLoading: false
}

export default ErrorRecoveryOptions