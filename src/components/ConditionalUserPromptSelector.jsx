import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import HelpTooltip from './HelpTooltip'
import { scenarioService } from '../services/scenarioService.js'

const ConditionalUserPromptSelector = ({
  scenario,
  selectedUserPrompt,
  onUserPromptSelect,
  validationError,
  allowCustomPrompts = true
}) => {
  const [shouldShow, setShouldShow] = useState(false)
  const [userPrompts, setUserPrompts] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    checkUserPromptVisibility()
  }, [scenario])

  const checkUserPromptVisibility = async () => {
    if (!scenario) {
      setShouldShow(false)
      setUserPrompts([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Ensure scenario service is initialized
      if (!scenarioService.isInitialized) {
        await scenarioService.initialize();
      }

      // Get UI configuration for this scenario
      const uiConfig = await scenarioService.getUIConfiguration(scenario)
      setShouldShow(uiConfig.showUserPromptSelector)

      if (uiConfig.showUserPromptSelector) {
        // Load user prompts from scenario
        const prompts = await scenarioService.getUserPrompts(scenario)
        setUserPrompts(prompts)
      } else {
        setUserPrompts([])
      }
    } catch (err) {
      console.error('Error checking user prompt visibility:', err)
      setError(`Failed to load user prompts: ${err.message}`)
      setShouldShow(false)
      setUserPrompts([])
    } finally {
      setIsLoading(false)
    }
  }

  const handlePromptSelect = (promptId) => {
    if (!promptId) {
      onUserPromptSelect('')
      return
    }

    const selectedPrompt = userPrompts.find(p => p.id === promptId)
    if (selectedPrompt) {
      onUserPromptSelect(selectedPrompt.content)
    }
  }

  const handleCustomPromptToggle = () => {
    // Clear selection to allow custom input
    onUserPromptSelect('')
  }

  // Don't render anything if user prompts shouldn't be shown
  if (!shouldShow) {
    return null
  }

  // Show loading state while checking scenario
  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">User Prompt</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          <span className="ml-2 text-sm text-gray-600">Loading user prompts...</span>
        </div>
      </div>
    )
  }

  // Show error state if loading failed
  if (error) {
    return (
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">User Prompt</h3>
        </div>
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  // Find currently selected prompt
  const currentPromptId = userPrompts.find(p => p.content === selectedUserPrompt)?.id || ''
  const isCustomPrompt = selectedUserPrompt && !currentPromptId

  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">User Prompt</h3>
        <HelpTooltip
          content="Choose from scenario-provided user prompts that contain specific requests optimized for this use case."
          position="right"
        />
      </div>

      {userPrompts.length > 0 && (
        <div className="space-y-4">
          {/* Prompt Selection */}
          <div>
            <label htmlFor="user-prompt-select" className="block text-sm font-medium text-gray-700 mb-2">
              Available User Prompts
            </label>
            <select
              id="user-prompt-select"
              value={currentPromptId}
              onChange={(e) => handlePromptSelect(e.target.value)}
              className={`select-field ${
                validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
              }`}
            >
              <option value="">Choose a user prompt...</option>
              {userPrompts.map((prompt) => (
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
          {selectedUserPrompt && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-green-800">
                  {isCustomPrompt ? 'Custom User Prompt' :
                   userPrompts.find(p => p.id === currentPromptId)?.name || 'Selected Prompt'}
                </h4>
                {allowCustomPrompts && !isCustomPrompt && (
                  <button
                    onClick={handleCustomPromptToggle}
                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    Edit Custom
                  </button>
                )}
              </div>
              <div className="text-sm text-green-700 max-h-32 overflow-y-auto">
                <div className="font-mono bg-white p-2 rounded border border-green-200 text-safe">
                  {selectedUserPrompt}
                  {selectedUserPrompt && !selectedUserPrompt.endsWith('\n') && '\n'}
                  <span className="text-gray-400 italic">[Dataset content will be appended here]</span>
                </div>
              </div>
            </div>
          )}

          {/* Custom Prompt Notice */}
          {allowCustomPrompts && (
            <div className="text-xs text-gray-500">
              You can also use the Prompt Configuration section to create custom user prompts.
            </div>
          )}
        </div>
      )}

      {/* No Prompts Available */}
      {userPrompts.length === 0 && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-sm text-gray-600">
            No user prompts available for this scenario.
          </p>
          {allowCustomPrompts && (
            <p className="text-xs text-gray-500 mt-1">
              Use the Prompt Configuration section to create a custom user prompt.
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

ConditionalUserPromptSelector.propTypes = {
  scenario: PropTypes.string,
  selectedUserPrompt: PropTypes.string,
  onUserPromptSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string,
  allowCustomPrompts: PropTypes.bool
}

ConditionalUserPromptSelector.defaultProps = {
  scenario: null,
  selectedUserPrompt: '',
  validationError: null,
  allowCustomPrompts: true
}

export default ConditionalUserPromptSelector
