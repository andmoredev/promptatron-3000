/**
 * Demo component to test state persistence functionality
 * This component can be temporarily added to the app to verify state persistence works
 */

import { useState, useEffect } from 'react'
import { useStatePersistence, useUIStatePersistence, useNavigationStatePersistence } from '../hooks/useStatePersistence'

const StatePersistenceDemo = () => {
  const [testResults, setTestResults] = useState(null)
oLog, setDemoLog] = useState([])

  // Use state persistence hooks
  const {
    isInitialized,
    saveTestResultsState,
    restoreTestResultsState,
    saveModelOutputState,
    getSessionInfo,
    stateInfo
  } = useStatePersistence()

  const {
    uiState,
    updateUIState,
    isRestored: uiRestored
  } = useUIStatePersistence({
    demoCounter: 0,
    demoText: '',
    demoChecked: false
  })

  const {
    navigationState,
    switchTab,
    isRestored: navRestored
  } = useNavigationStatePersistence()

  // Add log entry
  const addLog = (message) => {
    setDemoLog(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`])
  }

  // Test functions
  const testUIStatePersistence = async () => {
    const newCounter = (uiState.demoCounter || 0) + 1
    updateUIState({
      demoCounter: newCounter,
      demoText: `Updated at ${new Date().toLocaleTimeString()}`,
      demoChecked: !uiState.demoChecked
    })
    addLog(`UI state updated - Counter: ${newCounter}`)
  }

  const testNavigationPersistence = async () => {
    const tabs = ['test', 'history', 'comparison']
    const currentIndex = tabs.indexOf(navigationState.activeTab || 'test')
    const nextTab = tabs[(currentIndex + 1) % tabs.length]

    await switchTab(nextTab)
    addLog(`Switched to tab: ${nextTab}`)
  }

  const testTestResultsPersistence = async () => {
    const testResult = {
      id: `demo-test-${Date.now()}`,
      modelId: 'demo-model',
      systemPrompt: 'You are a demo assistant',
      userPrompt: 'Generate a demo response',
      response: `Demo response generated at ${new Date().toLocaleString()}`,
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      timestamp: new Date().toISOString()
    }

    const saved = await saveTestResultsState(testResult, testResult.id)
    if (saved) {
      setTestResults(testResult)
      addLog(`Test result saved: ${testResult.id}`)

      // Also save model output
      await saveModelOutputState({
        output: testResult.response,
        testId: testResult.id,
        modelId: testResult.modelId,
        usage: testResult.usage,
        timestamp: testResult.timestamp
      }, testResult.id)
      addLog(`Model output saved for: ${testResult.id}`)
    }
  }

  const testStateRestoration = async () => {
    if (testResults) {
      const restored = restoreTestResultsState(testResults.id)
      if (restored && restored.currentResults) {
        addLog(`Restored test result: ${restored.currentResults.id}`)
      } else {
        addLog('No test result to restore')
      }
    } else {
      addLog('No test results available to restore')
    }
  }

  const clearDemoState = async () => {
    updateUIState({
      demoCounter: 0,
      demoText: '',
      demoChecked: false
    })
    setTestResults(null)
    setDemoLog([])
    addLog('Demo state cleared')
  }

  // Log initialization status
  useEffect(() => {
    if (isInitialized) {
      addLog('State persistence service initialized')
    }
  }, [isInitialized])

  useEffect(() => {
    if (uiRestored) {
      addLog('UI state restored from persistence')
    }
  }, [uiRestored])

  useEffect(() => {
    if (navRestored) {
      addLog('Navigation state restored from persistence')
    }
  }, [navRestored])

  if (!isInitialized) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">State Persistence Demo</h3>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Initializing state persistence...</p>
          </div>
        </div>
      </div>
    )
  }

  const sessionInfo = getSessionInfo()

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">State Persistence Demo</h3>

      {/* Status Information */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Status</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-blue-700">Service Initialized:</span>
            <span className={`ml-2 px-2 py-1 rounded-full text-xs ${isInitialized ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {isInitialized ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="text-blue-700">UI State Restored:</span>
            <span className={`ml-2 px-2 py-1 rounded-full text-xs ${uiRestored ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {uiRestored ? 'Yes' : 'Pending'}
            </span>
          </div>
          <div>
            <span className="text-blue-700">Session ID:</span>
            <span className="ml-2 text-blue-900 font-mono text-xs">
              {sessionInfo?.sessionId?.slice(-8) || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-blue-700">Session Tests:</span>
            <span className="ml-2 text-blue-900 font-semibold">
              {sessionInfo?.testCount || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Current State Display */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">Current State</h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-700">Demo Counter:</span>
            <span className="ml-2 font-semibold text-primary-600">
              {uiState.demoCounter || 0}
            </span>
          </div>
          <div>
            <span className="text-gray-700">Demo Text:</span>
            <span className="ml-2 text-gray-900">
              {uiState.demoText || 'Not set'}
            </span>
          </div>
          <div>
            <span className="text-gray-700">Demo Checked:</span>
            <span className={`ml-2 px-2 py-1 rounded-full text-xs ${uiState.demoChecked ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
              {uiState.demoChecked ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="text-gray-700">Active Tab:</span>
            <span className="ml-2 font-semibold text-primary-600">
              {navigationState.activeTab || 'test'}
            </span>
          </div>
          <div>
            <span className="text-gray-700">Test Results:</span>
            <span className="ml-2 text-gray-900">
              {testResults ? `ID: ${testResults.id.slice(-8)}` : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Test Buttons */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-900 mb-3">Test Actions</h4>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={testUIStatePersistence}
            className="btn-secondary text-sm"
          >
            Test UI State
          </button>
          <button
            onClick={testNavigationPersistence}
            className="btn-secondary text-sm"
          >
            Test Navigation
          </button>
          <button
            onClick={testTestResultsPersistence}
            className="btn-secondary text-sm"
          >
            Test Results State
          </button>
          <button
            onClick={testStateRestoration}
            className="btn-secondary text-sm"
          >
            Test Restoration
          </button>
        </div>
        <div className="mt-3">
          <button
            onClick={clearDemoState}
            className="btn-secondary text-sm w-full"
          >
            Clear Demo State
          </button>
        </div>
      </div>

      {/* Activity Log */}
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 mb-2">Activity Log</h4>
        <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs max-h-40 overflow-y-auto">
          {demoLog.length === 0 ? (
            <div className="text-gray-500">No activity yet...</div>
          ) : (
            demoLog.map((entry, index) => (
              <div key={index} className="mb-1">
                {entry}
              </div>
            ))
          )}
        </div>
      </div>

      {/* State Information */}
      {stateInfo && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-medium text-yellow-900 mb-2">State Information</h4>
          <div className="text-xs text-yellow-800 space-y-1">
            <div>UI History Size: {stateInfo.ui?.touchedFieldsCount || 0}</div>
            <div>Navigation History: {stateInfo.navigation?.historySize || 0}</div>
            <div>Test Results History: {stateInfo.testResults?.historySize || 0}</div>
            <div>Model Output History: {stateInfo.modelOutput?.historySize || 0}</div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Testing Instructions</h4>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Click the test buttons to generate state changes</li>
          <li>Refresh the page to test persistence across page loads</li>
          <li>Check that state is restored after refresh</li>
          <li>Open browser dev tools to see localStorage entries</li>
          <li>Use "Clear Demo State" to reset for new tests</li>
        </ol>
      </div>
    </div>
  )
}

export default StatePersistenceDemo
