import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { bedrockService } from '../services/bedrockService'
import HelpTooltip from './HelpTooltip'
import LoadingSpinner from './LoadingSpinner'

const ModelSelector = ({ selectedModel, onModelSelect, validationError }) => {
  const [models, setModels] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [credentialStatus, setCredentialStatus] = useState(null)

  // Fallback models in case AWS API is not available
  const fallbackModels = [
    { id: 'amazon.nova-pro-v1:0', name: 'Amazon Nova Pro', provider: 'Amazon' },
    { id: 'amazon.nova-lite-v1:0', name: 'Amazon Nova Lite', provider: 'Amazon' },
    { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
    { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku', provider: 'Anthropic' },
    { id: 'meta.llama3-2-90b-instruct-v1:0', name: 'Llama 3.2 90B', provider: 'Meta' },
    { id: 'meta.llama3-2-11b-instruct-v1:0', name: 'Llama 3.2 11B', provider: 'Meta' }
  ]

  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    setIsLoading(true)
    setError(null)
    setCredentialStatus(null)

    try {
      console.log('Attempting to initialize Bedrock service...')

      // Initialize the Bedrock service if not already done
      if (!bedrockService.isReady()) {
        const initResult = await bedrockService.initialize()
        console.log('Bedrock service initialization result:', initResult)

        if (!initResult.success) {
          throw new Error(initResult.message)
        }
      }

      console.log('Loading models from AWS Bedrock...')
      // Load models from AWS Bedrock
      const bedrockModels = await bedrockService.listFoundationModels()
      console.log('Loaded models:', bedrockModels)

      setModels(bedrockModels)
      setCredentialStatus('valid')

      if (bedrockModels.length === 0) {
        setError('No models available. This might be due to region restrictions or account permissions.')
        setModels(fallbackModels)
      }

    } catch (err) {
      console.error('Failed to load models from AWS Bedrock:', err)
      setError(err.message)
      setCredentialStatus('invalid')

      // Use fallback models when AWS API fails
      setModels(fallbackModels)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900">Select Model</h3>
          <HelpTooltip
            content="Choose from available AWS Bedrock foundation models. Different models excel at different tasks - Claude for reasoning, Nova for general tasks, and Llama for open-source alternatives."
            position="right"
          />
        </div>
        <button
          onClick={loadModels}
          disabled={isLoading}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Credential Status Indicator */}
      {credentialStatus && (
        <div className={`mb-4 p-3 rounded-lg border ${
          credentialStatus === 'valid'
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${
              credentialStatus === 'valid' ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <p className={`text-sm ${
              credentialStatus === 'valid' ? 'text-green-800' : 'text-red-800'
            }`}>
              {credentialStatus === 'valid'
                ? 'AWS credentials validated successfully'
                : 'AWS credentials validation failed'}
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">{error}</p>
          {credentialStatus === 'invalid' && (
            <div className="mt-2 text-xs text-yellow-700">
              <p className="font-medium">To fix this issue:</p>
              <ul className="mt-1 list-disc list-inside space-y-1">
                <li>Configure AWS CLI: <code className="bg-yellow-100 px-1 rounded">aws configure</code></li>
                <li>Set environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY</li>
                <li>Ensure your credentials have Bedrock permissions</li>
                <li>Check that Bedrock is available in your region</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="mb-4 py-4">
          <LoadingSpinner size="md" text="Discovering models..." />
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="model-select" className="block text-sm font-medium text-gray-700">
          Foundation Model
        </label>
        <select
          id="model-select"
          value={selectedModel}
          onChange={(e) => onModelSelect(e.target.value)}
          className={`select-field ${
            validationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
          }`}
          disabled={isLoading}
        >
          <option value="">Choose a model...</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} {model.provider && `(${model.provider})`}
              {bedrockService.isStreamingSupported(model.id) ? ' ⚡' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Validation Error */}
      {validationError && (
        <p className="mt-1 text-sm text-red-600">{validationError}</p>
      )}

      {/* Model Count Info */}
      {!isLoading && models.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-xs text-gray-500">
            {models.length} model{models.length !== 1 ? 's' : ''} available
            {credentialStatus === 'invalid' && ' (using fallback list)'}
          </div>
          <div className="text-xs text-gray-500 flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <span>⚡</span>
              <span>Streaming supported</span>
            </span>
            <span className="text-gray-400">•</span>
            <span>{models.filter(m => bedrockService.isStreamingSupported(m.id)).length} of {models.length} models support streaming</span>
          </div>
        </div>
      )}

      {/* Selected Model Info */}
      {selectedModel && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Selected:</span> {models.find(m => m.id === selectedModel)?.name || selectedModel}
          </p>
          {models.find(m => m.id === selectedModel)?.provider && (
            <p className="text-xs text-blue-600 mt-1">
              Provider: {models.find(m => m.id === selectedModel)?.provider}
            </p>
          )}
          {/* Streaming Support Indicator */}
          <div className="mt-2 flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              bedrockService.isStreamingSupported(selectedModel) ? 'bg-green-500' : 'bg-gray-400'
            }`}></div>
            <span className="text-xs text-blue-700">
              {bedrockService.isStreamingSupported(selectedModel)
                ? 'Streaming supported'
                : 'Standard mode only'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

ModelSelector.propTypes = {
  selectedModel: PropTypes.string.isRequired,
  onModelSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string
}

export default ModelSelector