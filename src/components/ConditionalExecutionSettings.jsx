import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import HelpTooltip from './HelpTooltip'

import { scenarioToolIntegrationService } from '../services/scenarioToolIntegrationService.js'

const ConditionalExecutionSettings = ({
  scenario,
  showToolSettings,
  scenarioConfigLoaded,
  useToolsEnabled,
  onUseToolsToggle,
  maxIterations,
  onMaxIterationsChange,
  determinismEnabled,
  onDeterminismToggle,
  streamingEnabled,
  onStreamingToggle,
  isExecuting,
  conflictMessage,
  hasFormState,
  onClearSavedSettings,
  areToolsAvailable,
  isCollapsed,
  onToggleCollapse
}) => {
  const [shouldShowTools, setShouldShowTools] = useState(false)
  const [toolExecutionMode, setToolExecutionMode] = useState('none')
  const [isLoading, setIsLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState([])
  const [iterationInput, setIterationInput] = useState(maxIterations.toString())
  const [iterationValidationError, setIterationValidationError] = useState('')



  useEffect(() => {
    if (scenario && scenarioConfigLoaded) {
      // Scenario configuration has been loaded, use the showToolSettings flag
      setShouldShowTools(showToolSettings)

      // Determine the correct execution mode by checking the scenario tools
      if (showToolSettings) {
        // Get the execution mode from the service without triggering loading state
        scenarioToolIntegrationService.getToolConfigurationForScenario(scenario)
          .then(toolConfigResult => {
            setToolExecutionMode(toolConfigResult.executionMode || 'detection')
          })
          .catch(error => {
            console.error('[ConditionalExecutionSettings] Error getting tool config:', error);
            setToolExecutionMode('detection') // fallback
          })
      } else {
        setToolExecutionMode('none')
      }

      setValidationErrors([])
      setIsLoading(false)
    } else if (scenario && !scenarioConfigLoaded) {
      // Scenario is selected but configuration not loaded yet
      // Try to get a quick preview if areToolsAvailable indicates tools are present
      if (areToolsAvailable) {
        setShouldShowTools(true)

        // Get the execution mode optimistically
        scenarioToolIntegrationService.getToolConfigurationForScenario(scenario)
          .then(toolConfigResult => {
            setToolExecutionMode(toolConfigResult.executionMode || 'detection')
          })
          .catch(error => {
            console.error('[ConditionalExecutionSettings] Error in optimistic tool config:', error);
            setToolExecutionMode('detection') // fallback
          })

        setIsLoading(false)
      } else {
        setIsLoading(true)
      }
    } else if (!scenario) {
      // No scenario selected
      setShouldShowTools(false)
      setToolExecutionMode('none')
      setValidationErrors([])
      setIsLoading(false)
    } else {
      // Fallback to checking tool settings visibility via service
      checkToolSettingsVisibility()
    }
  }, [scenario, showToolSettings, scenarioConfigLoaded, areToolsAvailable])

  useEffect(() => {
    setIterationInput(maxIterations.toString())
  }, [maxIterations])



  const checkToolSettingsVisibility = async () => {
    if (!scenario) {
      setShouldShowTools(false)
      setToolExecutionMode('none')
      setValidationErrors([])
      return
    }

    setIsLoading(true)

    try {
      // Get tool configuration from scenario tool integration service
      const toolConfigResult = await scenarioToolIntegrationService.getToolConfigurationForScenario(scenario)

      setShouldShowTools(toolConfigResult.hasToolConfig)
      setToolExecutionMode(toolConfigResult.executionMode)

      // Set validation errors if any
      if (toolConfigResult.errors && toolConfigResult.errors.length > 0) {
        setValidationErrors(toolConfigResult.errors)
      } else {
        setValidationErrors([])
      }

    } catch (error) {
      console.error('Error checking tool settings visibility:', error)
      setShouldShowTools(false)
      setToolExecutionMode('none')
      setValidationErrors([`Failed to load tool configuration: ${error.message}`])
    } finally {
      setIsLoading(false)
    }
  }

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
    setIterationValidationError(error)

    if (!error) {
      onMaxIterationsChange(parseInt(value, 10))
    }
  }

  const handleUseToolsToggle = () => {
    if (!isExecuting) {
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

  // Show loading state while checking scenario
  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Execution Settings</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          <span className="ml-2 text-sm text-gray-600">Loading configuration...</span>
        </div>
      </div>
    )
  }

  // Show validation errors if tools are not available but there are errors
  if (!shouldShowTools && validationErrors.length > 0) {
    return (
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Execution Settings</h3>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-red-800">Configuration Errors</h4>
              <div className="mt-2 text-sm text-red-700">
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const showExecutionToggle = toolExecutionMode === 'execution'

  // Show tools if scenario config is loaded and showToolSettings is true,
  // OR if we have optimistic loading based on areToolsAvailable
  // OR if shouldShowTools is explicitly set to true
  const isToolsAvailable = (scenario && scenarioConfigLoaded && showToolSettings) ||
                           (scenario && !scenarioConfigLoaded && areToolsAvailable) ||
                           (scenario && shouldShowTools)

  return (
    <div className="card">
      <div className={`flex items-center justify-between ${isCollapsed ? 'mb-0' : 'mb-4'}`}>
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleCollapse}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleCollapse();
              }
            }}
            className="collapsible-toggle-button group"
            aria-expanded={!isCollapsed}
            aria-controls="execution-settings-content"
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} execution settings section`}
          >
            <svg
              className={`collapsible-chevron ${
                isCollapsed ? 'collapsed' : 'expanded'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span id="execution-settings-header">Execution Settings</span>
          </button>
        </div>
        <div className="flex items-center space-x-2">
          {!isCollapsed && isExecuting && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-green-600 font-medium">Executing</span>
            </div>
          )}
          {!isCollapsed && isLoading && scenario && !scenarioConfigLoaded && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-blue-600 font-medium">Loading configuration...</span>
            </div>
          )}
        </div>
      </div>

      <div
        id="execution-settings-content"
        className={`collapsible-content ${
          isCollapsed ? 'collapsed' : 'expanded'
        }`}
        role="region"
        aria-labelledby="execution-settings-header"
        aria-hidden={isCollapsed}
      >
        <div className="space-y-4">
          {/* Tools Mode Toggle - only show if tools are available */}
          {(isToolsAvailable || (scenario && showToolSettings)) && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <svg
                  className="w-5 h-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Tools Mode</h4>
                  <p className="text-xs text-gray-500">
                    {showExecutionToggle
                      ? "Enable tool execution for interactive AI capabilities"
                      : "Tools are available for detection only"
                    }
                  </p>
                </div>
              </div>
              {showExecutionToggle ? (
                <div className="flex items-center space-x-3">
                  <span className={`text-sm ${useToolsEnabled ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
                    Detection
                  </span>
                  <button
                    type="button"
                    onClick={handleUseToolsToggle}
                    disabled={isExecuting}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                      useToolsEnabled
                        ? 'bg-primary-600'
                        : 'bg-gray-200'
                    } ${
                      isExecuting ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    role="switch"
                    aria-checked={useToolsEnabled}
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
            ) : (
              <span className="text-sm text-yellow-600 font-medium">Detection Only</span>
            )}
          </div>
        )}



        {/* Maximum Iterations - only show if tools are enabled and execution mode is available */}
        {useToolsEnabled && showExecutionToggle && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <label
                htmlFor="max-iterations"
                className="text-sm font-medium text-gray-700"
              >
                Max Iterations
              </label>
              <HelpTooltip
                content="The maximum number of tool execution rounds allowed. This prevents infinite loops if the LLM gets stuck in a tool usage cycle. Each iteration includes the LLM's response and any tool executions."
                position="right"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                id="max-iterations"
                type="number"
                min="1"
                max="50"
                value={iterationInput}
                onChange={handleIterationChange}
                disabled={isExecuting}
                className={`w-16 px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                  iterationValidationError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                } ${
                  isExecuting ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                }`}
                aria-describedby="max-iterations-help"
              />
              {iterationValidationError && (
                <p className="text-sm text-red-600 ml-2">{iterationValidationError}</p>
              )}
            </div>
          </div>
        )}

        {/* Determinism Evaluation Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg
              className="w-5 h-5 text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-gray-900">Determinism Evaluation</h4>
              <p className="text-xs text-gray-500">
                Analyze response consistency across multiple runs
              </p>
            </div>
          </div>
          <button
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
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                determinismEnabled && !useToolsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Streaming Response Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg
              className="w-5 h-5 text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-gray-900">Streaming Response</h4>
              <p className="text-xs text-gray-500">
                Show response as it's generated in real-time
              </p>
            </div>
          </div>
          <button
            onClick={() => onStreamingToggle(!streamingEnabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              streamingEnabled
                ? "bg-primary-600"
                : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                streamingEnabled
                  ? "translate-x-5"
                  : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Conflict message */}
        {conflictMessage && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <svg
                className="h-5 w-5 text-yellow-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <span className="text-sm text-yellow-800">
                {conflictMessage}
              </span>
            </div>
          </div>
        )}



        {/* Clear Saved Settings */}
        {hasFormState && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={onClearSavedSettings}
              className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H8a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span>Clear saved settings</span>
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

ConditionalExecutionSettings.propTypes = {
  scenario: PropTypes.string,
  showToolSettings: PropTypes.bool,
  scenarioConfigLoaded: PropTypes.bool,
  useToolsEnabled: PropTypes.bool.isRequired,
  onUseToolsToggle: PropTypes.func.isRequired,
  maxIterations: PropTypes.number.isRequired,
  onMaxIterationsChange: PropTypes.func.isRequired,
  determinismEnabled: PropTypes.bool.isRequired,
  onDeterminismToggle: PropTypes.func.isRequired,
  streamingEnabled: PropTypes.bool.isRequired,
  onStreamingToggle: PropTypes.func.isRequired,
  isExecuting: PropTypes.bool.isRequired,
  conflictMessage: PropTypes.string,
  hasFormState: PropTypes.bool.isRequired,
  onClearSavedSettings: PropTypes.func.isRequired,
  areToolsAvailable: PropTypes.bool.isRequired,
  isCollapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func
}

ConditionalExecutionSettings.defaultProps = {
  scenario: null,
  conflictMessage: null,
  isCollapsed: false,
  onToggleCollapse: null
}

export default ConditionalExecutionSettings
