import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { bedrockService } from '../services/bedrockService'
import { imageModelRegistry } from '../services/imageModelRegistry'
import LoadingSpinner from './LoadingSpinner'
import Tooltip from './Tooltip'

const ModelSelector = ({
  selectedModel,
  onModelSelect,
  validationError,
  externalError,
  isCollapsed,
  onToggleCollapse,
  generationMode = 'text',
  onGenerationModeChange
}) => {
  const [models, setModels] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [credentialStatus, setCredentialStatus] = useState(null)
  const [filteredModels, setFilteredModels] = useState([])
  const [modelCapabilities, setModelCapabilities] = useState({})

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

  // Filter models based on generation mode
  useEffect(() => {
    if (generationMode === 'image') {
      const imageModels = models.filter(model => bedrockService.isImageGenerationModel(model.id))
      setFilteredModels(imageModels)

      // Load model capabilities for image models
      const capabilities = {}
      imageModels.forEach(model => {
        const modelInfo = imageModelRegistry.getModel(model.id)
        if (modelInfo) {
          capabilities[model.id] = modelInfo.capabilities
        }
      })
      setModelCapabilities(capabilities)
    } else {
      // For text mode, show all models
      setFilteredModels(models)
      setModelCapabilities({})
    }
  }, [models, generationMode])

  const loadModels = async () => {
    setIsLoading(true)
    setError(null)
    setCredentialStatus('checking')

    try {
      if (!bedrockService.isReady()) {
        const initResult = await bedrockService.initialize()

        if (!initResult.success) {
          throw new Error(initResult.message)
        }
      }

      const bedrockModels = await bedrockService.listFoundationModels()

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
            aria-controls="model-selector-content"
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} model selection section`}
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
            <span id="model-selector-header">
              Select Model {generationMode === 'image' ? '(Image Generation)' : '(Text Generation)'}
            </span>
          </button>
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
        <div className="flex items-center space-x-2 min-w-0">
          {isCollapsed && selectedModel && (
            <span className="text-sm text-gray-500 truncate max-w-[220px] sm:max-w-[280px]" title={(() => {
              const m = models.find(m => m.id === selectedModel);
              return m ? `${m.name}${m.provider ? ` (${m.provider})` : ''}` : selectedModel;
            })()}>
              {(() => {
                const m = models.find(m => m.id === selectedModel);
                const modelName = m ? `${m.name}${m.provider ? ` (${m.provider})` : ''}` : selectedModel;
                const imageIcon = bedrockService.isImageGenerationModel(selectedModel) ? ' 🎨' : '';
                const streamingIcon = bedrockService.isStreamingSupported(selectedModel) ? ' ⚡' : '';
                return `${modelName}${imageIcon}${streamingIcon}`;
              })()}
            </span>
          )}
          {!isCollapsed && (
            <button
              onClick={loadModels}
              disabled={isLoading}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      <div
        id="model-selector-content"
        className={`collapsible-content ${
          isCollapsed ? 'collapsed' : 'expanded'
        }`}
        role="region"
        aria-labelledby="model-selector-header"
        aria-hidden={isCollapsed}
      >
        <div className="space-y-4">
          {/* Generation Mode Toggle */}
          {onGenerationModeChange && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Generation Mode
              </label>
              <div className="flex space-x-4">
                <button
                  onClick={() => onGenerationModeChange('text')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                    generationMode === 'text'
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400'
                  }`}
                >
                  📝 Text Generation
                </button>
                <button
                  onClick={() => onGenerationModeChange('image')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                    generationMode === 'image'
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400'
                  }`}
                >
                  🎨 Image Generation
                </button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="py-4">
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
              <option value="">
                {generationMode === 'image' ? 'Choose an image generation model...' : 'Choose a model...'}
              </option>
              {filteredModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} {model.provider && `(${model.provider})`}
                  {bedrockService.isImageGenerationModel(model.id) ? ' 🎨' : ''}
                  {bedrockService.isStreamingSupported(model.id) ? ' ⚡' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Model Capabilities Display for Image Generation */}
          {generationMode === 'image' && selectedModel && modelCapabilities[selectedModel] && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center space-x-1">
                <span>🎨</span>
                <span>Model Capabilities</span>
              </h4>
              <div className="space-y-2 text-xs text-blue-700">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-medium">Max Prompt:</span> {modelCapabilities[selectedModel].maxPromptLength} chars
                  </div>
                  <div>
                    <span className="font-medium">Qualities:</span> {modelCapabilities[selectedModel].supportedQualities?.join(', ')}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Supported Dimensions:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {modelCapabilities[selectedModel].supportedDimensions?.map((dim, index) => (
                      <span key={index} className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {dim.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {modelCapabilities[selectedModel].supportsNegativePrompt && (
                    <span className="flex items-center space-x-1">
                      <span>✅</span>
                      <span>Negative prompts</span>
                    </span>
                  )}
                  {modelCapabilities[selectedModel].supportsBatchGeneration && (
                    <span className="flex items-center space-x-1">
                      <span>✅</span>
                      <span>Batch generation (up to {modelCapabilities[selectedModel].maxBatchSize})</span>
                    </span>
                  )}
                  {modelCapabilities[selectedModel].supportsSeeds && (
                    <span className="flex items-center space-x-1">
                      <span>✅</span>
                      <span>Seed control</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Validation Error */}
          {validationError && (
            <p className="mt-1 text-sm text-red-600">{validationError}</p>
          )}

          {/* Model Count Info */}
          {!isLoading && filteredModels.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-xs text-gray-500">
                {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} available
                {generationMode === 'image' && (
                  <span> for image generation</span>
                )}
              </div>
              {generationMode === 'text' && (
                <>
                  <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center space-x-1">
                      <span>🎨</span>
                      <span>Image generation</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span>⚡</span>
                      <span>Streaming supported</span>
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>{models.filter(m => bedrockService.isImageGenerationModel(m.id)).length} of {models.length} models support image generation</span>
                    <span className="text-gray-400">•</span>
                    <span>{models.filter(m => bedrockService.isStreamingSupported(m.id)).length} of {models.length} models support streaming</span>
                  </div>
                </>
              )}
              {generationMode === 'image' && filteredModels.length === 0 && (
                <div className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded p-2">
                  No image generation models available. Please ensure you have access to Amazon Nova Canvas or other supported image models.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

ModelSelector.propTypes = {
  selectedModel: PropTypes.string.isRequired,
  onModelSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string,
  externalError: PropTypes.string,
  isCollapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func,
  generationMode: PropTypes.oneOf(['text', 'image']),
  onGenerationModeChange: PropTypes.func
}

export default ModelSelector
