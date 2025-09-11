import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { bedrockService } from '../services/bedrockService'
import LoadingSpinner from './LoadingSpinner'
import Tooltip from './Tooltip'

const ModelSelector = ({ selectedModel, onModelSelect, validationError, externalError }) => {
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
    setCredentialStatus('checking')

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
          {/* AWS Credential Status Icon */}
          {credentialStatus === 'valid' && !externalError ? (
            <Tooltip
              content="AWS Credentials: ✅ Connected and validated

Your AWS credentials are working correctly and you have access to Bedrock foundation models."
              position="bottom"
            >
              <div className="w-3 h-3 rounded-full bg-green-500 cursor-help"></div>
            </Tooltip>
          ) : credentialStatus === 'invalid' || externalError ? (
            <Tooltip
              content={`AWS Credentials: ❌ Error

${externalError || error || 'Invalid or missing credentials'}

Please check your AWS configuration:
• Run 'aws configure' to set up credentials
• Ensure you have Bedrock permissions
• Verify your region supports Bedrock`}
              position="bottom"
            >
              <svg
                className="w-3 h-3 text-red-500 cursor-help"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </Tooltip>
          ) : credentialStatus === 'checking' ? (
            <Tooltip
              content="AWS Credentials: ⏳ Checking connection

Validating your AWS credentials and Bedrock access..."
              position="bottom"
            >
              <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse cursor-help"></div>
            </Tooltip>
          ) : (
            <Tooltip
              content="AWS Credentials: ⚪ Not checked yet

Credential validation will occur when loading models."
              position="bottom"
            >
              <div className="w-3 h-3 rounded-full bg-gray-400 cursor-help"></div>
            </Tooltip>
          )}
        </div>
        <button
          onClick={loadModels}
          disabled={isLoading}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>



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


    </div>
  )
}

ModelSelector.propTypes = {
  selectedModel: PropTypes.string.isRequired,
  onModelSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string,
  externalError: PropTypes.string
}

export default ModelSelector
