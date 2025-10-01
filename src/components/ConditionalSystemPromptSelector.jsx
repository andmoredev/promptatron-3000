import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import HelpTooltip from './HelpTooltip'
import { scenarioService } from '../services/scenarioService.js'

const ConditionalSystemPromptSelector = ({
  scenario,
  selectedSystemPrompt,
  onSystemPromptSelect,
  validationError,
  allowCustomPrompts = true
}) => {
  const [shouldShow, setShouldShow] = useState(false)
  const [systemPrompts, setSystemPrompts] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    checkSystemPromptVisibility()
  }, [scenario])

  const checkSystemPromptVisibility = async () => {
    if (!scenario) {
      setShouldShow(false)
      setSystemPrompts([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get UI configuration for this scenario
      const uiConfig = await scenarioService.getUIConfiguration(scenario)
      setShouldShow(uiConfig.showSystemPromptSelector)

      if (uiConfig.showSystemPromptSelector) {
        // Load system prompts from scenario
        const prompts = await scenarioService.getSystemPrompts(scenario)
        setSystemPrompts(prompts)
      } else {
        setSystemPrompts([])
      }
    } catch (err) {
      console.error('Error checking system prompt visibility:', err)
      setError(`Failed to load system prompts: ${err.message}`)
      setShouldShow(false)
      setSystemPrompts([])
    } finally {
      setIsLoading(false)
    }
  }

  const handlePromptSelect = (promptId) => {
    if (!promptId) {
      onSystemPromptSelect('')
      return
    }

    const selectedPrompt = systemPrompts.find(p => p.id === promptId)
    if (selectedPrompt) {
      onSystemPromptSelect(selectedPrompt.content)
    }
  }

  const handleCustomPromptToggle = () => {
    // Clear selection to allow custom input
    onSystemPromptSelect('')
  }

  // Don't render anything if system prompts shouldn't be shown
  if (!shouldShow) {
    return null
  }

  // Show loading state while checking scenario
  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">System Prompt</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          <span className="ml-2 text-sm text-gray-600">Loading system prompts...</span>
        </div>
      </div>
    )
  }

  // Show error state if loading failed
  if (error) {
    return (
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">System Prompt</h3>
        </div>
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  // Find currently selected prompt
  const currentPromptId = systemPrompts.find(p => p.content === selectedSystemPrompt)?.id || ''
  const isCustomPrompt = selectedSystemPrompt && !currentPromptId

  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">System Prompt</h3>
        <HelpTooltip
          content="Choose from scenario-provided system prompts that define the AI's role and behavior for this specific use case."
          position="right"
        />
      </div>

      {systemPrompts.length > 0 && (
        <div className="space-y-4">
          {/* Prompt Selection */}
          <div>
            <label htmlFor="system-prompt-select" className="block text-sm font-medium text-gray-700 mb-2">
              Available System Prompts
            </label>
            <select
              id="system-prompt-select"
              value={currentPromptId}
              onChange={(e) => handlePromptSelect(e.target.value)}
              className={`select-field ${
                validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
              }`}
            >
              <option value="">Choose a system prompt...</option>
              {systemPrompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.name}
                </option>
              ))}
              {allowCustomPrompts && (
                <option value="custom">Custom prompt...</option>
              )}
            </select>
          </div>

          {/* Selected Prompt Preview */}
          {selectedSystemPrompt && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-blue-800">
                  {isCustomPrompt ? 'Custom System Prompt' :
                   systemPrompts.find(p => p.id === currentPromptId)?.name || 'Selected Prompt'}
                </h4>
                {allowCustomPrompts && !isCustomPrompt && (
                  <button
                    onClick={handleCustomPromptToggle}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Edit Custom
                  </button>
                )}
              </div>
              <div className="text-sm text-blue-700 max-h-32 overflow-y-auto">
                <div className="font-mono bg-white p-2 rounded border border-blue-200 text-safe">
                  {selectedSystemPrompt}
                </div>
              </div>
            </div>
          )}

          {/* Custom Prompt Notice */}
          {allowCustomPrompts && (
            <div className="text-xs text-gray-500">
              You can also use the Prompt Configuration section to create custom system prompts.
            </div>
          )}
        </div>
      )}

      {/* No Prompts Available */}
      {systemPrompts.length === 0 && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-sm text-gray-600">
            No system prompts available for this scenario.
          </p>
          {allowCustomPrompts && (
            <p className="text-xs text-gray-500 mt-1">
              Use the Prompt Configuration section to create a custom system prompt.
            </p>
          )}
        </div>
      )}

      {/* Validation Error */}
      {validationError && (
        <p className="mt-1 text-sm text-red-600">{validationError}</p>
      )}
    </div>
  )
}

ConditionalSystemPromptSelector.propTypes = {
  scenario: PropTypes.string,
  selectedSystemPrompt: PropTypes.string,
  onSystemPromptSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string,
  allowCustomPrompts: PropTypes.bool
}

ConditionalSystemPromptSelector.defaultProps = {
  scenario: null,
  selectedSystemPrompt: '',
  validationError: null,
  allowCustomPrompts: true
}

export default ConditionalSystemPromptSelector
