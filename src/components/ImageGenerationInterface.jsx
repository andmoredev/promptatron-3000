import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { imageService } from '../services/imageService.js'
import { validateImageGenerationRequest, rateLimiter, sanitizePrompt } from '../utils/imageValidation.js'
import LoadingSpinner from './LoadingSpinner'
import HelpTooltip from './HelpTooltip'

const ImageGenerationInterface = ({
  selectedModel,
  onImageGenerated,
  isLoading,
  error,
  isCollapsed,
  onToggleCollapse,
  scenarioUserPrompts = [],
  initialPrompt = ''
}) => {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [parameters, setParameters] = useState({
    width: 512,
    height: 512,
    quality: 'standard',
    numberOfImages: 1,
    seed: null
  })
  const [promptValidation, setPromptValidation] = useState({ valid: true })
  const [modelInfo, setModelInfo] = useState(null)
  const [parameterErrors, setParameterErrors] = useState({})
  const [validationResult, setValidationResult] = useState(null)
  const [rateLimitStatus, setRateLimitStatus] = useState(null)
  const [showSafetyWarning, setShowSafetyWarning] = useState(false)
  const [sanitizationSuggestion, setSanitizationSuggestion] = useState(null)

  // Load model information when selected model changes
  useEffect(() => {
    if (selectedModel && imageService.isImageGenerationModel(selectedModel)) {
      const info = imageService.getModelInfo(selectedModel)
      setModelInfo(info)

      // Reset parameters to model defaults
      if (info) {
        setParameters(prev => ({
          ...info.defaultParameters,
          seed: prev.seed // Preserve seed if set
        }))
      }
    } else {
      setModelInfo(null)
    }
  }, [selectedModel])

  // Comprehensive validation in real-time
  useEffect(() => {
    if (selectedModel && prompt !== undefined) {
      // Basic prompt validation
      const basicValidation = imageService.validateImagePrompt(selectedModel, prompt)
      setPromptValidation(basicValidation)

      // Enhanced validation with safety checks
      const enhancedValidation = validateImageGenerationRequest(selectedModel, prompt, parameters)
      setValidationResult(enhancedValidation)

      // Check for safety warnings
      const hasSafetyIssues = enhancedValidation.warnings.some(w => w.code === 'SAFETY_WARNING') ||
                             enhancedValidation.errors.some(e => e.code === 'SAFETY_VIOLATION')
      setShowSafetyWarning(hasSafetyIssues)

      // Check if sanitization could help
      if (hasSafetyIssues && prompt.trim()) {
        const sanitization = sanitizePrompt(prompt)
        if (sanitization.changes.length > 0) {
          setSanitizationSuggestion(sanitization)
        } else {
          setSanitizationSuggestion(null)
        }
      } else {
        setSanitizationSuggestion(null)
      }
    }
  }, [selectedModel, prompt, parameters])

  // Update rate limit status periodically
  useEffect(() => {
    const updateRateLimit = () => {
      setRateLimitStatus(rateLimiter.getStatus())
    }

    updateRateLimit()
    const interval = setInterval(updateRateLimit, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [])

  // Validate parameters when they change
  useEffect(() => {
    if (selectedModel && modelInfo) {
      const validation = imageService.validateImageParameters(selectedModel, parameters)
      if (!validation.valid && validation.errors) {
        const errors = {}
        validation.errors.forEach(error => {
          if (error.includes('dimensions')) errors.dimensions = error
          if (error.includes('quality')) errors.quality = error
          if (error.includes('numberOfImages')) errors.numberOfImages = error
        })
        setParameterErrors(errors)
      } else {
        setParameterErrors({})
      }
    }
  }, [selectedModel, parameters, modelInfo])

  const handlePromptChange = useCallback((e) => {
    setPrompt(e.target.value)
  }, [])

  const handleParameterChange = useCallback((field, value) => {
    setParameters(prev => ({
      ...prev,
      [field]: value
    }))
  }, [])

  const handleDimensionChange = useCallback((width, height) => {
    setParameters(prev => ({
      ...prev,
      width: parseInt(width),
      height: parseInt(height)
    }))
  }, [])

  const handleGenerate = useCallback(() => {
    if (!validationResult?.valid || Object.keys(parameterErrors).length > 0) {
      return
    }

    // Record the request for rate limiting
    rateLimiter.recordRequest()

    const generationData = {
      modelId: selectedModel,
      prompt: prompt.trim(),
      parameters: {
        ...parameters,
        seed: parameters.seed || Math.floor(Math.random() * 858993460)
      }
    }

    onImageGenerated?.(generationData)
  }, [selectedModel, prompt, parameters, validationResult, parameterErrors, onImageGenerated])

  const handleSanitizePrompt = useCallback(() => {
    if (sanitizationSuggestion) {
      setPrompt(sanitizationSuggestion.sanitized)
      setSanitizationSuggestion(null)
    }
  }, [sanitizationSuggestion])

  const handleDismissSafetyWarning = useCallback(() => {
    setShowSafetyWarning(false)
  }, [])

  const generateRandomSeed = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 858993460)
    handleParameterChange('seed', newSeed)
  }, [handleParameterChange])

  const isFormValid = validationResult?.valid &&
                     prompt.trim().length > 0 &&
                     Object.keys(parameterErrors).length === 0 &&
                     selectedModel &&
                     imageService.isImageGenerationModel(selectedModel) &&
                     rateLimitStatus?.requestsLastMinute < 10

  if (!selectedModel || !imageService.isImageGenerationModel(selectedModel)) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Image Generation</h3>
        </div>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">
            Select an image generation model to start creating images
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Look for models marked with 🎨 in the model selector
          </p>
        </div>
      </div>
    )
  }

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
            aria-controls="image-generation-content"
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} image generation section`}
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
            <span id="image-generation-header">Image Generation</span>
          </button>
          {!isCollapsed && modelInfo && (
            <HelpTooltip
              content={`Generate images using ${modelInfo.name}. Maximum prompt length: ${modelInfo.maxPromptLength} characters. Supported dimensions and quality settings are available below.`}
              position="right"
            />
          )}
        </div>
        <div className="flex items-center space-x-2 min-w-0">
          {isCollapsed && prompt && (
            <span className="text-sm text-gray-500 truncate max-w-[200px]" title={prompt}>
              "{prompt.substring(0, 30)}{prompt.length > 30 ? '...' : ''}"
            </span>
          )}
        </div>
      </div>

      <div
        id="image-generation-content"
        className={`collapsible-content ${
          isCollapsed ? 'collapsed' : 'expanded'
        }`}
        role="region"
        aria-labelledby="image-generation-header"
        aria-hidden={isCollapsed}
      >
        <div className="space-y-6">
          {/* Model Information */}
          {modelInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-xs font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded">
                  {modelInfo.provider}
                </span>
                <span className="text-sm font-medium text-blue-800">{modelInfo.name}</span>
              </div>
              <div className="text-xs text-blue-600 space-y-1">
                <div>Max prompt length: {modelInfo.maxPromptLength} characters</div>
                <div>Supported qualities: {modelInfo.supportedQualities.join(', ')}</div>
                <div>{modelInfo.supportedDimensions.length} dimension options available</div>
              </div>
            </div>
          )}

          {/* Prompt Templates */}
          {scenarioUserPrompts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="block text-sm font-medium text-gray-700">
                  Prompt Templates
                </span>
                <HelpTooltip
                  content="Pre-configured image generation prompts from the selected scenario. Click to use as starting points for your image generation."
                  position="right"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {scenarioUserPrompts.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setPrompt(template.content)}
                    className="px-3 py-1 text-sm rounded-md transition-colors duration-200 bg-primary-100 hover:bg-primary-200 text-primary-700 border border-primary-300"
                    disabled={isLoading}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rate Limit Status */}
          {rateLimitStatus && (rateLimitStatus.requestsLastMinute > 5 || rateLimitStatus.concurrent > 0) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <svg className="h-4 w-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div className="text-sm text-yellow-800">
                  <div>Requests this minute: {rateLimitStatus.requestsLastMinute}/10</div>
                  {rateLimitStatus.concurrent > 0 && (
                    <div>Active requests: {rateLimitStatus.concurrent}/3</div>
                  )}
                  {rateLimitStatus.cooldownRemaining > 0 && (
                    <div>Cooldown: {Math.ceil(rateLimitStatus.cooldownRemaining / 1000)}s remaining</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Safety Warning */}
          {showSafetyWarning && validationResult && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-red-800">Content Policy Warning</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>Your prompt may contain content that violates our content policy:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      {validationResult.errors.filter(e => e.code === 'SAFETY_VIOLATION').map((error, index) => (
                        <li key={index}>{error.message}</li>
                      ))}
                      {validationResult.warnings.filter(w => w.code === 'SAFETY_WARNING').map((warning, index) => (
                        <li key={index}>{warning.message}</li>
                      ))}
                    </ul>
                    {sanitizationSuggestion && (
                      <div className="mt-3 p-2 bg-red-100 rounded">
                        <p className="font-medium">Suggested fix:</p>
                        <p className="mt-1 text-xs">"{sanitizationSuggestion.sanitized}"</p>
                        <button
                          onClick={handleSanitizePrompt}
                          className="mt-2 text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                        >
                          Use Suggested Prompt
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ml-3 flex-shrink-0">
                  <button
                    onClick={handleDismissSafetyWarning}
                    className="inline-flex text-red-400 hover:text-red-600"
                  >
                    <span className="sr-only">Dismiss</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Prompt Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="image-prompt" className="block text-sm font-medium text-gray-700">
                Image Prompt
              </label>
              <div className="flex items-center space-x-2">
                {validationResult && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    validationResult.safetyScore >= 80
                      ? 'bg-green-100 text-green-700'
                      : validationResult.safetyScore >= 60
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    Safety: {validationResult.safetyScore}/100
                  </span>
                )}
                <span className={`text-xs ${
                  promptValidation.valid ? 'text-gray-500' : 'text-red-500'
                }`}>
                  {prompt.length}{modelInfo ? `/${modelInfo.maxPromptLength}` : ''} characters
                </span>
                {prompt && (
                  <button
                    onClick={() => setPrompt('')}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <textarea
              id="image-prompt"
              value={prompt}
              onChange={handlePromptChange}
              placeholder="Describe the image you want to generate. Be specific about style, composition, colors, and details..."
              className={`input-field resize-none h-24 ${
                !promptValidation.valid || (validationResult && !validationResult.valid)
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : validationResult && validationResult.safetyScore < 80
                  ? 'border-yellow-300 focus:border-yellow-500 focus:ring-yellow-500'
                  : ''
              }`}
              disabled={isLoading}
            />
            {!promptValidation.valid && promptValidation.error && (
              <p className="text-sm text-red-600">{promptValidation.error}</p>
            )}
            {validationResult && validationResult.suggestions.length > 0 && (
              <div className="text-xs text-blue-600 space-y-1">
                <p className="font-medium">Suggestions:</p>
                {validationResult.suggestions.slice(0, 2).map((suggestion, index) => (
                  <p key={index}>• {suggestion.message}</p>
                ))}
              </div>
            )}
            {promptValidation.valid && validationResult?.valid && prompt.length > 0 && (
              <p className="text-sm text-green-600">✓ Prompt is valid and safe</p>
            )}
          </div>

          {/* Image Parameters */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Image Parameters</h4>

            {/* Dimensions */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Dimensions
              </label>
              <select
                value={`${parameters.width}x${parameters.height}`}
                onChange={(e) => {
                  const [width, height] = e.target.value.split('x').map(Number)
                  handleDimensionChange(width, height)
                }}
                className={`select-field ${parameterErrors.dimensions ? 'border-red-300' : ''}`}
                disabled={isLoading}
              >
                {modelInfo?.supportedDimensions.map((dim) => (
                  <option key={`${dim.width}x${dim.height}`} value={`${dim.width}x${dim.height}`}>
                    {dim.label}
                  </option>
                ))}
              </select>
              {parameterErrors.dimensions && (
                <p className="text-sm text-red-600">{parameterErrors.dimensions}</p>
              )}
            </div>

            {/* Quality */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Quality
              </label>
              <select
                value={parameters.quality}
                onChange={(e) => handleParameterChange('quality', e.target.value)}
                className={`select-field ${parameterErrors.quality ? 'border-red-300' : ''}`}
                disabled={isLoading}
              >
                {modelInfo?.supportedQualities.map((quality) => (
                  <option key={quality} value={quality}>
                    {quality.charAt(0).toUpperCase() + quality.slice(1)}
                  </option>
                ))}
              </select>
              {parameterErrors.quality && (
                <p className="text-sm text-red-600">{parameterErrors.quality}</p>
              )}
            </div>

            {/* Number of Images */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Number of Images
              </label>
              <select
                value={parameters.numberOfImages}
                onChange={(e) => handleParameterChange('numberOfImages', parseInt(e.target.value))}
                className={`select-field ${parameterErrors.numberOfImages ? 'border-red-300' : ''}`}
                disabled={isLoading}
              >
                {[1, 2, 3, 4].map((num) => (
                  <option key={num} value={num}>
                    {num} image{num > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
              {parameterErrors.numberOfImages && (
                <p className="text-sm text-red-600">{parameterErrors.numberOfImages}</p>
              )}
            </div>

            {/* Seed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Seed (Optional)
                </label>
                <button
                  onClick={generateRandomSeed}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  disabled={isLoading}
                >
                  Random
                </button>
              </div>
              <input
                type="number"
                value={parameters.seed || ''}
                onChange={(e) => handleParameterChange('seed', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Leave empty for random seed"
                className="input-field"
                min="0"
                max="858993459"
                disabled={isLoading}
              />
              <p className="text-xs text-gray-500">
                Use the same seed with identical parameters to reproduce images
              </p>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={!isFormValid || isLoading}
              className={`px-6 py-2 rounded-md font-medium transition-colors duration-200 ${
                isFormValid && !isLoading
                  ? 'bg-primary-600 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <LoadingSpinner size="sm" color="white" inline />
                  <span>Generating...</span>
                </div>
              ) : (
                'Generate Image'
              )}
            </button>
          </div>

          {/* Usage Guidelines */}
          {validationResult?.usageGuidelines && validationResult.usageGuidelines.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-800 mb-3">Usage Guidelines</h4>
              {validationResult.usageGuidelines.map((guideline, index) => (
                <div key={index} className="mb-3 last:mb-0">
                  <h5 className="text-xs font-semibold text-blue-700 mb-1">{guideline.title}</h5>
                  <ul className="text-xs text-blue-600 space-y-1">
                    {guideline.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex items-start space-x-1">
                        <span>•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Form Validation Summary */}
          {!isFormValid && !isLoading && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Please complete the following to generate images:
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <ul className="list-disc list-inside space-y-1">
                      {!selectedModel && <li>Select an image generation model</li>}
                      {!prompt.trim() && <li>Enter an image prompt</li>}
                      {validationResult && !validationResult.valid && <li>Fix validation errors above</li>}
                      {Object.keys(parameterErrors).length > 0 && <li>Fix parameter validation errors</li>}
                      {rateLimitStatus?.requestsLastMinute >= 10 && <li>Wait for rate limit to reset</li>}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

ImageGenerationInterface.propTypes = {
  selectedModel: PropTypes.string,
  onImageGenerated: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  error: PropTypes.string,
  isCollapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func,
  scenarioUserPrompts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired
  })),
  initialPrompt: PropTypes.string
}

ImageGenerationInterface.defaultProps = {
  selectedModel: '',
  isLoading: false,
  error: null,
  isCollapsed: false,
  onToggleCollapse: () => {},
  scenarioUserPrompts: [],
  initialPrompt: ''
}

export default ImageGenerationInterface