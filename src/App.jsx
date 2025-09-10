import { useState, useEffect } from 'react'
import ModelSelector from './components/ModelSelector'
import DatasetSelector from './components/DatasetSelector'
import PromptEditor from './components/PromptEditor'
import TestResults from './components/TestResults'
import History from './components/History'
import Comparison from './components/Comparison'
import ErrorBoundary from './components/ErrorBoundary'
import BrowserCompatibility from './components/BrowserCompatibility'
import HelpGuide from './components/HelpGuide'
import LoadingSpinner from './components/LoadingSpinner'
import ProgressBar from './components/ProgressBar'
import ThemeProvider from './components/ThemeProvider'
import { bedrockService } from './services/bedrockService'
import { useHistory } from './hooks/useHistory'
import { validateForm } from './utils/formValidation'
import { handleError, retryWithBackoff } from './utils/errorHandling'
import { getSafeColorClass } from './utils/themeUtils'

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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('test')
  const [validationErrors, setValidationErrors] = useState({})
  const [selectedForComparison, setSelectedForComparison] = useState([])
  const [retryCount, setRetryCount] = useState(0)
  const [progressStatus, setProgressStatus] = useState('')
  const [progressValue, setProgressValue] = useState(0)

  // Use the history hook for managing test history
  const { saveTestResult } = useHistory()

  // Form validation function
  const isFormValid = () => {
    return Object.keys(validationErrors).length === 0 &&
           selectedModel &&
           prompt.trim() &&
           selectedDataset.type &&
           selectedDataset.option &&
           selectedDataset.content
  }

  // Clear error when user makes changes
  useEffect(() => {
    if (error) {
      setError(null)
    }
    // Clear validation errors when user makes changes
    setValidationErrors({})
  }, [selectedModel, selectedDataset, prompt])

  // Real-time validation using enhanced validation utility
  useEffect(() => {
    const formData = {
      selectedModel,
      prompt,
      selectedDataset
    }

    const validationResult = validateForm(formData)
    setValidationErrors(validationResult.errors)
  }, [selectedModel, prompt, selectedDataset])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + Enter: Run test
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (isFormValid() && !isLoading) {
          handleRunTest()
        }
      }

      // Ctrl/Cmd + H: Switch to History tab
      if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
        event.preventDefault()
        setActiveTab('history')
      }

      // Ctrl/Cmd + T: Switch to Test tab
      if ((event.ctrlKey || event.metaKey) && event.key === 't') {
        event.preventDefault()
        setActiveTab('test')
      }

      // Ctrl/Cmd + C: Switch to Comparison tab (when available)
      if ((event.ctrlKey || event.metaKey) && event.key === 'c' && selectedForComparison.length > 0) {
        event.preventDefault()
        setActiveTab('comparison')
      }

      // Escape: Clear current selection or close modals
      if (event.key === 'Escape') {
        if (selectedForComparison.length > 0) {
          setSelectedForComparison([])
        }
        if (error) {
          setError(null)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFormValid, isLoading, selectedForComparison.length, error])

  const validateTestConfiguration = () => {
    const formData = {
      selectedModel,
      prompt,
      selectedDataset
    }

    const validationResult = validateForm(formData)

    if (!validationResult.isValid) {
      return Object.values(validationResult.errors)
    }

    return []
  }

  const handleRunTest = async () => {
    // Comprehensive validation
    const validationErrors = validateTestConfiguration()
    if (validationErrors.length > 0) {
      const errorInfo = handleError(
        new Error(validationErrors.join('. ')),
        { component: 'App', action: 'validateTestConfiguration' }
      )
      setError(errorInfo.userMessage)
      return
    }

    setIsLoading(true)
    setError(null)
    setRetryCount(0)
    setProgressStatus('Initializing...')
    setProgressValue(10)

    try {
      console.log('Running test with:', {
        model: selectedModel,
        dataset: selectedDataset,
        prompt: prompt
      })

      // Use retry with backoff for the test execution
      const testResult = await retryWithBackoff(
        async () => {
          // Ensure BedrockService is ready
          setProgressStatus('Connecting to AWS Bedrock...')
          setProgressValue(25)

          if (!bedrockService.isReady()) {
            const initResult = await bedrockService.initialize()
            if (!initResult.success) {
              throw new Error(`AWS Bedrock initialization failed: ${initResult.message}`)
            }
          }

          setProgressStatus('Sending request to model...')
          setProgressValue(50)

          // Use BedrockService to invoke the model
          const response = await bedrockService.invokeModel(
            selectedModel,
            prompt,
            selectedDataset.content
          )

          setProgressStatus('Processing response...')
          setProgressValue(75)

          return {
            id: Date.now().toString(),
            modelId: selectedModel,
            prompt: prompt,
            datasetType: selectedDataset.type,
            datasetOption: selectedDataset.option,
            response: response.text,
            usage: response.usage,
            timestamp: new Date().toISOString()
          }
        },
        {
          maxRetries: 2,
          baseDelay: 1000,
          onRetry: (error, attempt, delay) => {
            console.log(`Retrying test execution (attempt ${attempt}) after ${delay}ms:`, error.message)
            setRetryCount(attempt)
          }
        }
      )

      setProgressStatus('Saving results...')
      setProgressValue(90)

      setTestResults(testResult)
      setRetryCount(0)

      // Save to history using the history service
      await saveTestResult(testResult)

      setProgressStatus('Complete!')
      setProgressValue(100)

    } catch (err) {
      console.error('Test execution failed:', err)

      // Use enhanced error handling
      const errorInfo = handleError(err, {
        component: 'App',
        action: 'runTest',
        model: selectedModel,
        datasetType: selectedDataset.type,
        promptLength: prompt.length
      })

      setError(errorInfo.userMessage)
      setRetryCount(0)
    } finally {
      setIsLoading(false)
      setProgressStatus('')
      setProgressValue(0)
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

  const handleCompareTests = (tests) => {
    setSelectedForComparison(tests)
    if (tests.length > 0) {
      setActiveTab('comparison')
    }
  }

  const handleRemoveFromComparison = (testId) => {
    setSelectedForComparison(prev => prev.filter(test => test.id !== testId))
  }

  const handleClearComparison = () => {
    setSelectedForComparison([])
  }

  // Theme configuration with null-checking
  const themeConfig = {
    colors: {
      primary: {
        50: '#f0f9f0',
        100: '#e6f3d5',
        500: '#5c8c5a',
        600: '#5c8c5a',
        700: '#4a7348'
      },
      secondary: {
        100: '#e6f3d5',
        200: '#d4ecc8',
        300: '#b8d8b4',
        500: '#9ecc8c',
        700: '#739965',
        800: '#5e7d53'
      },
      tertiary: {
        50: '#e6f3d5',
        100: '#e6f3d5',
        500: '#e6f3d5'
      }
    }
  }

  return (
    <ErrorBoundary>
      <ThemeProvider theme={themeConfig}>
        <BrowserCompatibility>
          <div className="min-h-screen bg-gradient-to-br from-tertiary-50 to-secondary-100">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              {/* Header */}
              <div className="text-center mb-6 lg:mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-primary-700 mb-2">
                  Promptatron 3000
                </h1>
                <p className="text-base md:text-lg text-secondary-700 px-4">
                  Building enterprise-grade AI agents before it was cool
                </p>
              </div>

              {/* Navigation Tabs */}
              <div className="flex justify-center mb-6 lg:mb-8 px-4">
          <div className="bg-white rounded-lg p-1 shadow-sm border border-gray-200 flex flex-wrap sm:flex-nowrap">
            <button
              onClick={() => setActiveTab('test')}
              className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-colors duration-200 text-sm sm:text-base ${
                activeTab === 'test'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Test Harness
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-colors duration-200 text-sm sm:text-base ${
                activeTab === 'history'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              History
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-colors duration-200 relative text-sm sm:text-base ${
                activeTab === 'comparison'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Comparison
              {selectedForComparison.length > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                  {selectedForComparison.length}
                </span>
              )}
            </button>
          </div>
        </div>

              {/* Error Display */}
              {error && (
          <div className="max-w-4xl mx-auto mb-6 animate-fade-in">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 transform transition-all duration-300 hover:shadow-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm text-red-800">{error}</p>
                  {retryCount > 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      Retried {retryCount} time{retryCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <div className="ml-3 flex-shrink-0">
                  <button
                    onClick={() => setError(null)}
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
          </div>
        )}

              {/* Main Content */}
              {activeTab === 'test' && (
          <div className="max-w-7xl mx-auto animate-fade-in">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
              {/* Left Column - Configuration */}
              <div className="space-y-6 animate-slide-up">
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

                {/* Progress Bar */}
                {isLoading && progressStatus && (
                  <div className="mb-6">
                    <ProgressBar
                      progress={progressValue}
                      status={progressStatus}
                      color="primary"
                    />
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
                      <LoadingSpinner size="sm" color="white" text="Running Test..." inline />
                    ) : (
                      'Run Test'
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column - Results */}
              <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
                <TestResults
                  results={testResults}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </div>
        )}

              {activeTab === 'history' && (
          <div className="max-w-6xl mx-auto animate-fade-in">
            <History
              onLoadFromHistory={handleLoadFromHistory}
              onCompareTests={handleCompareTests}
              selectedForComparison={selectedForComparison}
            />
          </div>
        )}

              {activeTab === 'comparison' && (
          <div className="max-w-6xl mx-auto animate-fade-in">
            <Comparison
              selectedTests={selectedForComparison}
              onRemoveTest={handleRemoveFromComparison}
              onClearComparison={handleClearComparison}
            />
          </div>
              )}
            </div>
          </div>

          {/* Help Guide */}
          <HelpGuide />
        </BrowserCompatibility>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App