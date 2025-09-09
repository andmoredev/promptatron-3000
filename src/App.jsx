import React, { useState, useEffect } from 'react'
import ModelSelector from './components/ModelSelector'
import DatasetSelector from './components/DatasetSelector'
import PromptEditor from './components/PromptEditor'
import TestResults from './components/TestResults'
import History from './components/History'
import { bedrockService } from './services/bedrockService'

function App() {
  // Core state management for the test harness
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedDataset, setSelectedDataset] = useState({
    type: '',
    option: '',
    content: null
  })
  const [prompt, setPrompt] = useState('')
  const [testResults, setTestResults] = useState(null)
  const [history, setHistory] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('test')
  const [validationErrors, setValidationErrors] = useState({})
  const [modelValidationStatus, setModelValidationStatus] = useState({})

  // Clear error when user makes changes
  useEffect(() => {
    if (error) {
      setError(null)
    }
    // Clear validation errors when user makes changes
    setValidationErrors({})
  }, [selectedModel, selectedDataset, prompt])

  // Real-time validation
  useEffect(() => {
    const errors = {}

    // Model validation
    if (selectedModel === '') {
      errors.model = 'Model selection is required'
    }

    // Prompt validation
    if (prompt.trim() === '') {
      errors.prompt = 'Prompt is required'
    } else if (prompt.trim().length < 10) {
      errors.prompt = 'Prompt must be at least 10 characters long'
    } else if (prompt.trim().length > 10000) {
      errors.prompt = 'Prompt must be less than 10,000 characters'
    }

    // Dataset validation
    if (!selectedDataset.type) {
      errors.dataset = 'Dataset type selection is required'
    } else if (!selectedDataset.option) {
      errors.dataset = 'Dataset file selection is required'
    } else if (!selectedDataset.content) {
      errors.dataset = 'Dataset content not loaded'
    }

    setValidationErrors(errors)
  }, [selectedModel, prompt, selectedDataset])

  const isFormValid = () => {
    return Object.keys(validationErrors).length === 0 &&
           selectedModel &&
           prompt.trim() &&
           selectedDataset.type &&
           selectedDataset.option &&
           selectedDataset.content
  }

  const validateTestConfiguration = () => {
    const errors = []

    // Model validation
    if (!selectedModel) {
      errors.push('Please select a model')
    }

    // Prompt validation
    if (!prompt.trim()) {
      errors.push('Please enter a prompt')
    } else if (prompt.trim().length < 10) {
      errors.push('Prompt must be at least 10 characters long')
    } else if (prompt.trim().length > 10000) {
      errors.push('Prompt must be less than 10,000 characters')
    }

    // Dataset validation
    if (!selectedDataset.type) {
      errors.push('Please select a dataset type')
    } else if (!selectedDataset.option) {
      errors.push('Please select a dataset file')
    } else if (!selectedDataset.content) {
      errors.push('Dataset content not loaded. Please reselect your dataset.')
    }

    return errors
  }

  const handleRunTest = async () => {
    // Comprehensive validation
    const validationErrors = validateTestConfiguration()
    if (validationErrors.length > 0) {
      setError(validationErrors.join('. '))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('Running test with:', {
        model: selectedModel,
        dataset: selectedDataset,
        prompt: prompt
      })

      // Ensure BedrockService is ready
      if (!bedrockService.isReady()) {
        const initResult = await bedrockService.initialize()
        if (!initResult.success) {
          throw new Error(`AWS Bedrock initialization failed: ${initResult.message}`)
        }
      }

      // Use BedrockService to invoke the model
      const response = await bedrockService.invokeModel(
        selectedModel,
        prompt,
        selectedDataset.content
      )

      const testResult = {
        id: Date.now().toString(),
        modelId: selectedModel,
        prompt: prompt,
        datasetType: selectedDataset.type,
        datasetOption: selectedDataset.option,
        response: response.text,
        usage: response.usage,
        timestamp: new Date().toISOString()
      }

      setTestResults(testResult)
      setHistory(prev => [testResult, ...prev])

    } catch (err) {
      console.error('Test execution failed:', err)

      // Enhanced error handling with user-friendly messages
      let errorMessage = 'An error occurred during testing'

      if (err.message.includes('credentials')) {
        errorMessage = 'AWS credentials issue: ' + err.message + '. Please check your AWS configuration.'
      } else if (err.message.includes('AccessDenied') || err.message.includes('UnauthorizedOperation')) {
        errorMessage = 'Access denied: Your AWS credentials do not have permission to access this Bedrock model. Please check your IAM permissions.'
      } else if (err.message.includes('ValidationException')) {
        errorMessage = 'Invalid request: ' + err.message + '. Please check your model selection and prompt format.'
      } else if (err.message.includes('ThrottlingException')) {
        errorMessage = 'Request throttled: Too many requests. Please wait a moment and try again.'
      } else if (err.message.includes('ServiceUnavailableException')) {
        errorMessage = 'Service temporarily unavailable: Please try again in a few moments.'
      } else if (err.message.includes('ModelNotReadyException')) {
        errorMessage = 'Model not ready: The selected model is currently unavailable. Please try a different model.'
      } else if (err.message.includes('network') || err.message.includes('ENOTFOUND')) {
        errorMessage = 'Network error: Please check your internet connection and try again.'
      } else if (err.message.includes('timeout')) {
        errorMessage = 'Request timeout: The model took too long to respond. Please try again.'
      } else {
        errorMessage = err.message || errorMessage
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadFromHistory = (historyItem) => {
    setSelectedModel(historyItem.modelId)
    setSelectedDataset({
      type: historyItem.datasetType,
      option: historyItem.datasetOption,
      content: null // Will be loaded when dataset selector processes this
    })
    setPrompt(historyItem.prompt)
    setActiveTab('test')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Bedrock LLM Analyzer
          </h1>
          <p className="text-lg text-gray-600">
            Test and compare AWS Bedrock foundation models with your datasets
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg p-1 shadow-sm border border-gray-200">
            <button
              onClick={() => setActiveTab('test')}
              className={`px-6 py-2 rounded-md font-medium transition-colors duration-200 ${
                activeTab === 'test'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Test Harness
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-2 rounded-md font-medium transition-colors duration-200 ${
                activeTab === 'history'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              History
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="max-w-4xl mx-auto mb-6">
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
          </div>
        )}

        {/* Main Content */}
        {activeTab === 'test' ? (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column - Configuration */}
              <div className="space-y-6">
                <ModelSelector
                  selectedModel={selectedModel}
                  onModelSelect={setSelectedModel}
                  validationError={validationErrors.model}
                />

                <DatasetSelector
                  selectedDataset={selectedDataset}
                  onDatasetSelect={setSelectedDataset}
                  validationError={validationErrors.dataset}
                />

                <PromptEditor
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  validationError={validationErrors.prompt}
                />

                {/* Validation Summary */}
                {Object.keys(validationErrors).length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">
                          Please complete the following to run your test:
                        </h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <ul className="list-disc list-inside space-y-1">
                            {Object.entries(validationErrors).map(([field, message]) => (
                              <li key={field}>{message}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-center">
                  <button
                    onClick={handleRunTest}
                    disabled={isLoading || !isFormValid()}
                    className={`btn-primary px-8 py-3 text-lg transition-all duration-200 ${
                      isLoading || !isFormValid() ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'
                    }`}
                  >
                    {isLoading ? (
                      <div className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Running Test...
                      </div>
                    ) : (
                      'Run Test'
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column - Results */}
              <div>
                <TestResults
                  results={testResults}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto">
            <History
              history={history}
              onLoadFromHistory={handleLoadFromHistory}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default App