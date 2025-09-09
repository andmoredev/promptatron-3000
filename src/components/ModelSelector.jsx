import React, { useState, useEffect } from 'react'

const ModelSelector = ({ selectedModel, onModelSelect }) => {
  const [models, setModels] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Placeholder models - will be replaced with actual AWS Bedrock integration
  const placeholderModels = [
    { id: 'amazon.nova-pro-v1:0', name: 'Amazon Nova Pro' },
    { id: 'amazon.nova-lite-v1:0', name: 'Amazon Nova Lite' },
    { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet' },
    { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku' },
    { id: 'meta.llama3-2-90b-instruct-v1:0', name: 'Llama 3.2 90B' },
    { id: 'meta.llama3-2-11b-instruct-v1:0', name: 'Llama 3.2 11B' }
  ]

  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // TODO: Replace with actual AWS Bedrock API call in later tasks
      // For now, use placeholder data
      await new Promise(resolve => setTimeout(resolve, 500)) // Simulate API call
      setModels(placeholderModels)
    } catch (err) {
      setError('Failed to load models. Please check your AWS credentials.')
      setModels(placeholderModels) // Fallback to placeholder models
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Select Model</h3>
        <button
          onClick={loadModels}
          disabled={isLoading}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">{error}</p>
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
          className="select-field"
          disabled={isLoading}
        >
          <option value="">Choose a model...</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>

      {selectedModel && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Selected:</span> {models.find(m => m.id === selectedModel)?.name || selectedModel}
          </p>
        </div>
      )}
    </div>
  )
}

export default ModelSelector