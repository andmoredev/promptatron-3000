import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import ToolExecutionSettings from './ToolExecutionSettings'
import { scenarioService } from '../services/scenarioService.js'
import { scenarioToolIntegrationService } from '../services/scenarioToolIntegrationService.js'

const ConditionalToolSettings = ({
  scenario,
  useToolsEnabled,
  onUseToolsToggle,
  maxIterations,
  onMaxIterationsChange,
  determinismEnabled,
  onDeterminismToggle,
  isExecuting
}) => {
  const [shouldShow, setShouldShow] = useState(false)
  const [toolExecutionMode, setToolExecutionMode] = useState('none')
  const [isLoading, setIsLoading] = useState(false)
  const [toolConfigSummary, setToolConfigSummary] = useState(null)
  const [validationErrors, setValidationErrors] = useState([])

  useEffect(() => {
    checkToolSettingsVisibility()
  }, [scenario])

  const checkToolSettingsVisibility = async () => {
    if (!scenario) {
      setShouldShow(false)
      setToolExecutionMode('none')
      setToolConfigSummary(null)
      setValidationErrors([])
      return
    }

    setIsLoading(true)

    try {
      // Get tool configuration from scenario tool integration service
      const toolConfigResult = await scenarioToolIntegrationService.getToolConfigurationForScenario(scenario)

      setShouldShow(toolConfigResult.hasToolConfig)
      setToolExecutionMode(toolConfigResult.executionMode)

      if (toolConfigResult.hasToolConfig) {
        // Get tool configuration summary for display
        const summary = await scenarioToolIntegrationService.getToolConfigurationSummary(scenario)
        setToolConfigSummary(summary)
      } else {
        setToolConfigSummary(null)
      }

      // Set validation errors if any
      if (toolConfigResult.errors && toolConfigResult.errors.length > 0) {
        setValidationErrors(toolConfigResult.errors)
      } else {
        setValidationErrors([])
      }

    } catch (error) {
      console.error('Error checking tool settings visibility:', error)
      setShouldShow(false)
      setToolExecutionMode('none')
      setToolConfigSummary(null)
      setValidationErrors([`Failed to load tool configuration: ${error.message}`])
    } finally {
      setIsLoading(false)
    }
  }

  // Don't render anything if tools shouldn't be shown and no errors
  if (!shouldShow && validationErrors.length === 0) {
    return null
  }

  // Show loading state while checking scenario
  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Tool Execution Settings</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          <span className="ml-2 text-sm text-gray-600">Loading tool configuration...</span>
        </div>
      </div>
    )
  }

  // Show validation errors if tools are not available but there are errors
  if (!shouldShow && validationErrors.length > 0) {
    return (
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Tool Configuration</h3>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-red-800">Tool Configuration Errors</h4>
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

  // Determine if tools are available based on execution mode
  const isToolsAvailable = toolExecutionMode !== 'none'

  // Show execution toggle only if tools support execution mode
  const showExecutionToggle = toolExecutionMode === 'execution'

  // Render the ToolExecutionSettings component when tools are available
  return (
    <ToolExecutionSettings
      useToolsEnabled={useToolsEnabled}
      onUseToolsToggle={onUseToolsToggle}
      maxIterations={maxIterations}
      onMaxIterationsChange={onMaxIterationsChange}
      determinismEnabled={determinismEnabled}
      onDeterminismToggle={onDeterminismToggle}
      isExecuting={isExecuting}
      isToolsAvailable={isToolsAvailable}
      showExecutionToggle={showExecutionToggle}
      toolExecutionMode={toolExecutionMode}
    />
  )
}

ConditionalToolSettings.propTypes = {
  scenario: PropTypes.string,
  useToolsEnabled: PropTypes.bool.isRequired,
  onUseToolsToggle: PropTypes.func.isRequired,
  maxIterations: PropTypes.number.isRequired,
  onMaxIterationsChange: PropTypes.func.isRequired,
  determinismEnabled: PropTypes.bool.isRequired,
  onDeterminismToggle: PropTypes.func.isRequired,
  isExecuting: PropTypes.bool.isRequired
}

ConditionalToolSettings.defaultProps = {
  scenario: null
}

export default ConditionalToolSettings
