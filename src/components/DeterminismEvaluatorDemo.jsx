import React, { useState } from 'react'
import DeterminismEvaluator from './DeterminismEvaluator'

/**
 * Demo component to test DeterminismEvaluator functionality
 * This can be used for manual testing and development
 */
function DeterminismEvaluatorDemo() {
  const [testResult] = useState({
    id: 'demo-test-123',
    modelId: 'anthropic.claude-3-sonnet',
    systemPrompt: 'You are a helpful data analyst.',
    userPrompt: 'Analyze the following dataset for patterns and insights.',
    response: 'Based on the data analysis, I found several interesting patterns...',
    timestamp: new Date().toISOString()
  })

  const [mockGrade] = useState({
    grade: 'B',
    score: 85,
    reasoning: 'The model responses showed good consistency with some minor variations in phrasing and structure. Most responses followed similar analytical patterns, but there were occasional differences in the order of insights presented.',
    variance: {
      responseCount: 30,
      uniqueResponses: 8,
      averageLength: 342,
      lengthVariance: 18.3,
      semanticSimilarity: 0.82,
      actionConsistency: 0.89
    },
    timestamp: new Date().toISOString(),
    evaluationId: 'demo-eval-456'
  })

  const [enabled, setEnabled] = useState(true)
  const [simulateState, setSimulateState] = useState('idle') // idle, evaluating, completed, error

  const handleEvaluationComplete = (grade) => {
    console.log('Evaluation completed:', grade)
  }

  // Create a modified component that simulates different states
  const SimulatedEvaluator = () => {
    const [status, setStatus] = useState(simulateState)
    const [grade, setGrade] = useState(simulateState === 'completed' ? mockGrade : null)
    const [error, setError] = useState(simulateState === 'error' ? 'Simulated network error' : null)
    const [progress, setProgress] = useState(simulateState === 'evaluating' ? 65 : 0)
    const [currentPhase, setCurrentPhase] = useState(simulateState === 'evaluating' ? 'Analyzing response variance...' : '')

    React.useEffect(() => {
      setStatus(simulateState)
      setGrade(simulateState === 'completed' ? mockGrade : null)
      setError(simulateState === 'error' ? 'Simulated network error' : null)
      setProgress(simulateState === 'evaluating' ? 65 : 0)
      setCurrentPhase(simulateState === 'evaluating' ? 'Analyzing response variance...' : '')
    }, [simulateState])

    if (!enabled || !testResult) {
      return null
    }

    return (
      <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700 flex items-center space-x-2">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Determinism Evaluation</span>
          </h4>

          {status === 'completed' && grade && (
            <button
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold transition-all duration-200 hover:scale-105 hover:shadow-md ${
                grade.grade === 'A' ? 'bg-green-500 text-whit
           grade.grade === 'B' ? 'bg-blue-500 text-white' :
                grade.grade === 'C' ? 'bg-yellow-500 text-white' :
                grade.grade === 'D' ? 'bg-orange-500 text-white' :
                'bg-red-500 text-white'
              }`}
            >
              Grade: {grade.grade}
            </button>
          )}
        </div>

        {/* Status Display */}
        {status === 'idle' && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Ready to evaluate determinism</span>
          </div>
        )}

        {status === 'evaluating' && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <svg className="animate-spin h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm text-gray-700">Evaluating determinism...</span>
            </div>

            {currentPhase && (
              <div className="text-xs text-gray-600">
                <span className="font-medium">Current phase:</span> {currentPhase}
              </div>
            )}

            {progress > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-start space-x-2 text-sm">
            <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <div className="text-red-700 font-medium">Evaluation failed</div>
              <div className="text-red-600 mt-1">{error}</div>
            </div>
          </div>
        )}

        {status === 'completed' && grade && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-gray-700">
                Evaluation complete - {
                  grade.grade === 'A' ? 'Highly Deterministic (>90%)' :
                  grade.grade === 'B' ? 'Good Determinism (70-90%)' :
                  grade.grade === 'C' ? 'Moderate Determinism (50-70%)' :
                  grade.grade === 'D' ? 'Low Determinism (30-50%)' :
                  'Non-deterministic (<30%)'
                }
              </span>
            </div>

            <button className="text-xs text-purple-600 hover:text-purple-700 font-medium">
              View Details
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          DeterminismEvaluator Component Demo
        </h2>

        {/* Controls */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">Enabled</span>
            </label>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Simulate State:</span>
            {['idle', 'evaluating', 'completed', 'error'].map(state => (
              <label key={state} className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="simulateState"
                  value={state}
                  checked={simulateState === state}
                  onChange={(e) => setSimulateState(e.target.value)}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700 capitalize">{state}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Component Demo */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Component Output:</h3>
          <SimulatedEvaluator />
        </div>

        {/* Real Component (for comparison) */}
        <div className="mt-6 border border-gray-200 rounded-lg p-4 bg-blue-50">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Actual Component (Idle State):</h3>
          <DeterminismEvaluator
            testResult={testResult}
            onEvaluationComplete={handleEvaluationComplete}
            enabled={enabled}
            graderSystemPrompt="Custom grader prompt for demo"
          />
        </div>
      </div>
    </div>
  )
}

export default DeterminismEvaluatorDemo
