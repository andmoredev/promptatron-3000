import React, { useState, useEffect } from 'react'
import ModelSelector from './components/ModelSelector'
import DatasetSelector from './components/DatasetSelector'
import PromptEditor from './components/PromptEditor'
import TestResults from './components/TestResults'
import History from './components/History'

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

  // Clear error when user makes changes
  useEffect(() => {
    if (error) {
      setError(null)
    }
  }, [selectedModel, selectedDataset, prompt])

  const handleRunTest = async () => {
    // Validation
    if (!selectedModel) {
      setError('Please select a model')
      return
    }
    if (!prompt.trim()) {
      setError('Please enter a prompt')
      return
    }
    if (!selectedDataset.type || !selectedDataset.option) {
      setError('Please select a dataset')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // This will be implemented in later tasks
      console.log('Running test with:', {
        model: selectedModel,
        dataset: selectedDataset,
        prompt: prompt
      })

      // Placeholder for actual test execution
      const mockResult = {
        id: Date.now().toString(),
        modelId: selectedModel,
        prompt: prompt,
        datasetType: selectedDataset.type,
        datasetOption: selectedDataset.option,
        response: 'This is a placeholder response. Actual AWS Bedrock integration will be implemented in later tasks.',
        timestamp: new Date().toISOString()
      }

      setTestResults(mockResult)
      setHistory(prev => [mockResult, ...prev])

    } catch (err) {
      setError(err.message || 'An error occurred during testing')
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
                />

                <DatasetSelector
                  selectedDataset={selectedDataset}
                  onDatasetSelect={setSelectedDataset}
                />

                <PromptEditor
                  prompt={prompt}
                  onPromptChange={setPrompt}
                />

                <div className="flex justify-center">
                  <button
                    onClick={handleRunTest}
                    disabled={isLoading}
                    className={`btn-primary px-8 py-3 text-lg ${
                      isLoading ? 'opacity-50 cursor-not-allowed' : ''
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