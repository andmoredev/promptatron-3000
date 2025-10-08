import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import HelpTooltip from './HelpTooltip'

const ToolExecutionSettings = ({
  useToolsEnabled,
  onUseToolsToggle,
  maxIterations,
  onMaxIterationsChange,
  determinismEnabled,
  onDeterminismToggle,
  isExecuting,
  isToolsAvailable = true,
  showExecutionToggle = true,
  toolExecutionMode = 'execution'
}) => {
  const [iterationInput, setIterationInput] = useState(maxIterations.toString())
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    setIterationInput(maxIterations.toString())
  }, [maxIterations])

  const validateIterationCount = (value) => {
    const num = parseInt(value, 10)
    if (isNaN(num)) {
      return 'Please enter a valid number'
    }
    if (num < 1) {
      return 'Minimum iteration count is 1'
    }
    if (num > 50) {
      return 'Maximum iteration count is 50'
    }
    return ''
  }

  const handleIterationChange = (e) => {
    const value = e.target.value
    setIterationInput(value)

    const error = validateIterationCount(value)
    setValidationError(error)

    if (!error) {
      onMaxIterationsChange(parseInt(value, 10))
    }
  }

  const handleUseToolsToggle = () => {
    if (!isExecuting && showExecutionToggle) {
      const newValue = !useToolsEnabled
      onUseToolsToggle(newValue)

      // Automatically disable determinism evaluation when tools are enabled
      if (newValue && determinismEnabled) {
        onDeterminismToggle(false)
      }
    }
  }

  const handleDeterminismToggle = () => {
    if (!isExecuting && !useToolsEnabled) {
      onDeterminismToggle(!determinismEnabled)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Tool Execution Settings</h3>
        {isExecuting && (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-green-600 font-medium">Executing</span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Use Tools Toggle - only show if execution mode is available */}
        {showExecutionToggle && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <label
                htmlFor="use-tools-toggle"
                className="text-sm font-medium text-gray-700"
              >
                Use Tools Mode
              </label>
              <HelpTooltip
                content="When enabled, the LLM will actually execute tools instead of just showing what tools it would call. This allows for interactive tool usage and multi-turn conversations."
                position="right"
              />
            </div>
            <div className="flex items-center space-x-3">
              <span className={`text-sm ${useToolsEnabled ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
                Detection
              </span>
              <button
                id="use-tools-toggle"
                type="button"
                onClick={handleUseToolsToggle}
                disabled={isExecuting || !isToolsAvailable}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                  useToolsEnabled
                    ? 'bg-primary-600'
                    : 'bg-gray-200'
                } ${
                  (isExecuting || !isToolsAvailable) ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                role="switch"
                aria-checked={useToolsEnabled}
                aria-labelledby="use-tools-toggle"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    useToolsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className={`text-sm ${useToolsEnabled ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                Execution
              </span>
            </div>
          </div>
        )}

        {/* Detection Only Mode Info */}
        {!showExecutionToggle && toolExecutionMode === 'detection' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <span className="text-sm font-medium text-yellow-800">Detection Mode Only</span>
                <p className="text-xs text-yellow-700 mt-1">
                  This scenario's tools support detection only. The LLM will identify when to use tools but won't execute them.
                </p>
              </div>
            </div>
          </div>
        )}

        {!isToolsAvailable && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-sm text-yellow-800">
                Tool execution is not available for the current dataset
              </span>
            </div>
          </div>
        )}

        {/* Maximum Iterations - only show if tools are enabled and execution mode is available */}
        {useToolsEnabled && showExecutionToggle && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <label
                htmlFor="max-iterations"
                className="text-sm font-medium text-gray-700"
              >
                Maximum Iterations
              </label>
              <HelpTooltip
                content="The maximum number of tool execution rounds allowed. This prevents infinite loops if the LLM gets stuck in a tool usage cycle. Each iteration includes the LLM's response and any tool executions."
                position="right"
              />
            </div>
            <div className="flex items-center space-x-3">
              <input
                id="max-iterations"
                type="number"
                min="1"
                max="50"
                value={iterationInput}
                onChange={handleIterationChange}
                disabled={isExecuting}
                className={`w-20 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                  validationError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                } ${
                  isExecuting ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                }`}
                aria-describedby="max-iterations-help"
              />
              <span className="text-sm text-gray-500">iterations</span>
            </div>
            {validationError && (
              <p className="text-sm text-red-600">{validationError}</p>
            )}
            <p id="max-iterations-help" className="text-xs text-gray-500">
              Range: 1-50 iterations
            </p>
          </div>
        )}

        {/* Determinism Evaluation Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <label
              htmlFor="determinism-toggle"
              className="text-sm font-medium text-gray-700"
            >
              Determinism Evaluation
            </label>
            <HelpTooltip
              content="Determinism evaluation runs the same prompt multiple times to check for consistent results. This is automatically disabled when tool execution is enabled because tools can change state between runs."
              position="right"
            />
          </div>
          <div className="flex items-center space-x-3">
            <button
              id="determinism-toggle"
              type="button"
              onClick={handleDeterminismToggle}
              disabled={isExecuting || useToolsEnabled}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                determinismEnabled && !useToolsEnabled
                  ? 'bg-primary-600'
                  : 'bg-gray-200'
              } ${
                (isExecuting || useToolsEnabled) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              role="switch"
              aria-checked={determinismEnabled && !useToolsEnabled}
              aria-labelledby="determinism-toggle"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  determinismEnabled && !useToolsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-sm ${
              useToolsEnabled
                ? 'text-gray-400'
                : determinismEnabled
                  ? 'text-gray-900 font-medium'
                  : 'text-gray-500'
            }`}>
              {useToolsEnabled ? 'Disabled (Tools Active)' : determinismEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        {useToolsEnabled && showExecutionToggle && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <svg className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-blue-800 mb-1">Tool Execution Mode Active</h4>
                <p className="text-xs text-blue-700">
                  The LLM will actually execute tools and use their results in multi-turn conversations.
                  Determinism evaluation is automatically disabled to prevent state conflicts.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

ToolExecutionSettings.propTypes = {
  useToolsEnabled: PropTypes.bool.isRequired,
  onUseToolsToggle: PropTypes.func.isRequired,
  maxIterations: PropTypes.number.isRequired,
  onMaxIterationsChange: PropTypes.func.isRequired,
  determinismEnabled: PropTypes.bool.isRequired,
  onDeterminismToggle: PropTypes.func.isRequired,
  isExecuting: PropTypes.bool.isRequired,
  isToolsAvailable: PropTypes.bool,
  showExecutionToggle: PropTypes.bool,
  toolExecutionMode: PropTypes.oneOf(['none', 'detection', 'execution'])
}

export default ToolExecutionSettings
