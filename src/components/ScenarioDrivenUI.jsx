import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import ScenarioSelector from './ScenarioSelector'
import ConditionalDatasetSelector from './ConditionalDatasetSelector'
import ConditionalToolSettings from './ConditionalToolSettings'
import ConditionalSystemPromptSelector from './ConditionalSystemPromptSelector'
import ConditionalUserPromptSelector from './ConditionalUserPromptSelector
port PromptEditor from './PromptEditor'
import HelpTooltip from './HelpTooltip'
import { useScenarioUI } from '../hooks/useScenarioUI'

/**
 * ScenarioDrivenUI - Demonstrates the dynamic UI adaptation system
 * This component shows how the UI adapts based on scenario capabilities
 */
const ScenarioDrivenUI = ({
  // Scenario state
  selectedScenario,
  onScenarioSelect,

  // Dataset state
  selectedDataset,
  onDatasetSelect,

  // Prompt state
  systemPrompt,
  userPrompt,
  onSystemPromptChange,
  onUserPromptChange,

  // Tool state
  useToolsEnabled,
  onUseToolsToggle,
  maxIterations,
  onMaxIterationsChange,
  determinismEnabled,
  onDeterminismToggle,
  isExecuting,

  // Validation errors
  validationErrors
}) => {
  const [showPromptEditor, setShowPromptEditor] = useState(true)

  // Use the scenario UI hook for dynamic component visibility
  const {
    uiState,
    scenarioCapabilities,
    shouldShowComponent,
    getVisibilitySummary,
    getScenarioConfiguration,
    isLoading: uiLoading,
    error: uiError
  } = useScenarioUI(selectedScenario)

  // Get scenario configuration
  const scenarioConfig = getScenarioConfiguration()

  // Get visibility summary for debugging
  const visibilitySummary = getVisibilitySummary()

  // Handle scenario-provided prompt selection
  const handleScenarioSystemPromptSelect = (promptContent) => {
    onSystemPromptChange(promptContent)
  }

  const handleScenarioUserPromptSelect = (promptContent) => {
    onUserPromptChange(promptContent)
  }

  // Show UI loading state
  if (uiLoading) {
    return (
      <div className="space-y-6">
        <div className="card">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-600">Loading scenario configuration...</span>
          </div>
        </div>
      </div>
    )
  }

  // Show UI error state
  if (uiError) {
    return (
      <div className="space-y-6">
        <div className="card">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  UI Configuration Error
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{uiError}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Scenario Selection - Always visible */}
      <ScenarioSelector
        selectedScenario={selectedScenario}
        onScenarioSelect={onScenarioSelect}
        validationError={validationErrors?.scenario}
      />

      {/* Dynamic UI Status Indicator (Development only) */}
      {import.meta.env.DEV && selectedScenario && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-center space-x-2 mb-3">
            <h4 className="text-sm font-medium text-blue-800">Dynamic UI Status</h4>
            <HelpTooltip
              content="This shows how the UI adapts based on the selected scenario's capabilities. This indicator is only visible in development mode."
              position="right"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  shouldShowComponent('datasetSelector') ? 'bg-green-400' : 'bg-gray-300'
                }`}></span>
                <span className="text-blue-700">Dataset Selector</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  shouldShowComponent('systemPromptSelector') ? 'bg-green-400' : 'bg-gray-300'
                }`}></span>
                <span className="text-blue-700">System Prompt Selector</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  shouldShowComponent('userPromptSelector') ? 'bg-green-400' : 'bg-gray-300'
                }`}></span>
                <span className="text-blue-700">User Prompt Selector</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  shouldShowComponent('toolSettings') ? 'bg-green-400' : 'bg-gray-300'
                }`}></span>
                <span className="text-blue-700">Tool Settings</span>
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-blue-600">
            {visibilitySummary.totalVisible} of 4 components visible •
            Tool mode: {scenarioCapabilities.toolExecutionMode} •
            Custom prompts: {scenarioConfig.allowCustomPrompts ? 'allowed' : 'disabled'}
          </div>
        </div>
      )}

      {/* Conditional Dataset Selector */}
      <ConditionalDatasetSelector
        scenario={selectedScenario}
        selectedDataset={selectedDataset}
        onDatasetSelect={onDatasetSelect}
        validationError={validationErrors?.dataset}
      />

      {/* Conditional System Prompt Selector */}
      <ConditionalSystemPromptSelector
        scenario={selectedScenario}
        selectedSystemPrompt={systemPrompt}
        onSystemPromptSelect={handleScenarioSystemPromptSelect}
        validationError={validationErrors?.systemPrompt}
        allowCustomPrompts={scenarioConfig.allowCustomPrompts}
      />

      {/* Conditional User Prompt Selector */}
      <ConditionalUserPromptSelector
        scenario={selectedScenario}
        selectedUserPrompt={userPrompt}
        onUserPromptSelect={handleScenarioUserPromptSelect}
        validationError={validationErrors?.userPrompt}
        allowCustomPrompts={scenarioConfig.allowCustomPrompts}
      />

      {/* Prompt Editor - Always visible for custom prompts */}
      {(scenarioConfig.allowCustomPrompts || !selectedScenario) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-semibold text-gray-900">Custom Prompt Configuration</h3>
              <HelpTooltip
                content="Create custom prompts or modify scenario-provided prompts. This section is always available when custom prompts are allowed."
                position="right"
              />
            </div>
            <button
              onClick={() => setShowPromptEditor(!showPromptEditor)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {showPromptEditor ? 'Hide' : 'Show'} Custom Prompts
            </button>
          </div>

          {showPromptEditor && (
            <PromptEditor
              systemPrompt={systemPrompt}
              userPrompt={userPrompt}
              onSystemPromptChange={onSystemPromptChange}
              onUserPromptChange={onUserPromptChange}
              systemPromptError={validationErrors?.systemPrompt}
              userPromptError={validationErrors?.userPrompt}
            />
          )}
        </div>
      )}

      {/* Conditional Tool Settings */}
      <ConditionalToolSettings
        scenario={selectedScenario}
        useToolsEnabled={useToolsEnabled}
        onUseToolsToggle={onUseToolsToggle}
        maxIterations={maxIterations}
        onMaxIterationsChange={onMaxIterationsChange}
        determinismEnabled={determinismEnabled}
        onDeterminismToggle={onDeterminismToggle}
        isExecuting={isExecuting}
      />

      {/* Scenario Configuration Summary */}
      {selectedScenario && (
        <div className="card bg-gray-50 border-gray-200">
          <div className="flex items-center space-x-2 mb-3">
            <h4 className="text-sm font-medium text-gray-700">Scenario Configuration</h4>
            <HelpTooltip
              content="Summary of configuration settings from the selected scenario that affect UI behavior and functionality."
              position="right"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
            <div className="space-y-1">
              <div>Custom prompts: {scenarioConfig.allowCustomPrompts ? 'Allowed' : 'Disabled'}</div>
              <div>Dataset modification: {scenarioConfig.allowDatasetModification ? 'Allowed' : 'Disabled'}</div>
            </div>
            <div className="space-y-1">
              <div>Default streaming: {scenarioConfig.defaultStreamingEnabled ? 'Enabled' : 'Disabled'}</div>
              <div>Max iterations: {scenarioConfig.maxIterations}</div>
            </div>
          </div>
          {scenarioConfig.recommendedModels.length > 0 && (
            <div className="mt-2 text-xs text-gray-600">
              <div>Recommended models: {scenarioConfig.recommendedModels.join(', ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

ScenarioDrivenUI.propTypes = {
  // Scenario props
  selectedScenario: PropTypes.string,
  onScenarioSelect: PropTypes.func.isRequired,

  // Dataset props
  selectedDataset: PropTypes.shape({
    type: PropTypes.string,
    option: PropTypes.string,
    content: PropTypes.string
  }).isRequired,
  onDatasetSelect: PropTypes.func.isRequired,

  // Prompt props
  systemPrompt: PropTypes.string,
  userPrompt: PropTypes.string,
  onSystemPromptChange: PropTypes.func.isRequired,
  onUserPromptChange: PropTypes.func.isRequired,

  // Tool props
  useToolsEnabled: PropTypes.bool.isRequired,
  onUseToolsToggle: PropTypes.func.isRequired,
  maxIterations: PropTypes.number.isRequired,
  onMaxIterationsChange: PropTypes.func.isRequired,
  determinismEnabled: PropTypes.bool.isRequired,
  onDeterminismToggle: PropTypes.func.isRequired,
  isExecuting: PropTypes.bool.isRequired,

  // Validation props
  validationErrors: PropTypes.object
}

ScenarioDrivenUI.defaultProps = {
  selectedScenario: '',
  systemPrompt: '',
  userPrompt: '',
  validationErrors: {}
}

export default ScenarioDrivenUI
