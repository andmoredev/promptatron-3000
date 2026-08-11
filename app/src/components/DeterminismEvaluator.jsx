import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import LoadingSpinner from './LoadingSpinner'
import ProgressIndicator from './ProgressIndicator'
import ErrorRecoveryOptions from './ErrorRecoveryOptions'
import { determinismService } from '../services/determinismService'
import { handleDeterminismError, assessEvaluationHealth, generateDeterminismErrorMessage, createGracefulDegradationPlan } from '../utils/determinismErrorHandling'
import { ErrorTypes } from '../utils/errorHandling'
import { useDeterminismSettings } from '../hooks/useSettings'

/**
 * Enhanced DeterminismEvaluator component with single-fire logic and improved UI
 * @param {Object} props - Component props
 * @param {Object} props.testResult - The test result to evaluate
 * @param {Function} props.onEvaluationComplete - Callback when evaluation completes
 * @param {boolean} props.enabled - Whether the evaluator is enabled
 * @param {string} props.graderSystemPrompt - Custom grader system prompt
 * @param {boolean} props.shouldStartEvaluation - Trigger to start evaluation (single-fire)
 */
function DeterminismEvaluator({
  testResult,
  onEvaluationComplete,
  enabled = true,
  graderSystemPrompt,
  shouldStartEvaluation = false
}) {
  const [status, setStatus] = useState('idle') // idle, collecting, evaluating, completed, error, throttled
  const [grade, setGrade] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState(null)
  const [errorInfo, setErrorInfo] = useState(null)
  const [progress, setProgress] = useState(0)
  const [currentPhase, setCurrentPhase] = useState('')
  const [evaluationId, setEvaluationId] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [showRecoveryOptions, setShowRecoveryOptions] = useState(false)
  const [completedRequests, setCompletedRequests] = useState(0)
  const [totalRequests, setTotalRequests] = useState(10)
  const [startTime, setStartTime] = useState(null)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(null)
  const [isEvaluationRunning, setIsEvaluationRunning] = useState(false)
  const [throttlingInfo, setThrottlingInfo] = useState(null)
  const [allResponses, setAllResponses] = useState([])
  const [hasStartedOnce, setHasStartedOnce] = useState(false)
  const [evaluationData, setEvaluationData] = useState(null)
  const [degradationPlan, setDegradationPlan] = useState(null)

  // Get determinism settings
  const { settings: determinismSettings } = useDeterminismSettings()

  // Reset state only when testResult ID actually changes (new test)
  const [lastTestId, setLastTestId] = useState(null)

  useEffect(() => {
    if (testResult && enabled && testResult.id !== lastTestId) {
      console.log('New test detected, resetting determinism evaluation:', testResult.id)
      setStatus('idle')
      setGrade(null)
      setError(null)
      setErrorInfo(null)
      setProgress(0)
      setCurrentPhase('')
      setEvaluationId(null)
      setRetryCount(0)
      setShowRecoveryOptions(false)
      setCompletedRequests(0)
      setTotalRequests(determinismSettings?.testCount || 10)
      setStartTime(null)
      setEstimatedTimeRemaining(null)
      setIsEvaluationRunning(false)
      setThrottlingInfo(null)
      setAllResponses([])
      setHasStartedOnce(false)
      setEvaluationData(null)
      setDegradationPlan(null)
      setLastTestId(testResult.id)
    }
  }, [testResult, enabled, lastTestId, determinismSettings?.testCount])

  // Network monitoring not needed for main thread execution

  // Handle evaluation status updates with enhanced throttling visibility
  const handleStatusUpdate = useCallback((evaluationStatus) => {
    console.log('Status update received:', evaluationStatus.status, 'Grade:', evaluationStatus.result)

    // Don't update status if we're already completed
    if (status === 'completed' && grade) {
      console.log('Ignoring status update - evaluation already completed')
      return
    }

    // Map service status to component status with enhanced phases
    let componentStatus = evaluationStatus.status
    let phaseMessage = evaluationStatus.currentPhase || ''

    // Enhanced phase messaging based on progress
    if (evaluationStatus.status === 'running') {
      if (evaluationStatus.progress < 80) {
        componentStatus = 'collecting'
        phaseMessage = evaluationStatus.currentPhase?.includes('Handling rate limits')
          ? 'Handling rate limits...'
          : 'Collecting additional responses...'
      } else {
        componentStatus = 'evaluating'
        phaseMessage = 'Evaluating determinism...'
      }
    }

    setStatus(componentStatus)
    setProgress(evaluationStatus.progress || 0)
    setCurrentPhase(phaseMessage)
    setCompletedRequests(evaluationStatus.completedRequests || 0)
    setTotalRequests(evaluationStatus.totalRequests || determinismSettings?.testCount || 10)
    setEstimatedTimeRemaining(evaluationStatus.estimatedTimeRemaining)

    // Handle throttling information with enhanced statistics
    if (evaluationStatus.currentPhase?.includes('rate limits') ||
        evaluationStatus.currentPhase?.includes('throttl') ||
        evaluationStatus.throttlingVisible) {
      setStatus('throttled')

      const throttlingStats = evaluationStatus.throttlingStats || {};
      setThrottlingInfo({
        message: evaluationStatus.currentPhase?.includes('retrying')
          ? evaluationStatus.currentPhase
          : 'Handling AWS rate limits...',
        retryCount: evaluationStatus.retryCount || 0,
        nextRetryIn: evaluationStatus.nextRetryIn || null,
        throttledCount: throttlingStats.throttledCount || 0,
        abandonedCount: throttlingStats.abandonedCount || 0,
        hasThrottling: throttlingStats.hasThrottling || false
      })
    } else {
      setThrottlingInfo(null)
    }

    // Set start time if not already set and evaluation is running
    if (evaluationStatus.status === 'running' && evaluationStatus.startTime && !startTime) {
      setStartTime(evaluationStatus.startTime)
    }

    // Store all responses for modal display
    if (evaluationStatus.responses) {
      setAllResponses(evaluationStatus.responses)
    }

    // Update evaluation data for recovery options
    setEvaluationData({
      completedRequests: evaluationStatus.completedRequests || 0,
      totalRequests: evaluationStatus.totalRequests || determinismSettings?.testCount || 10,
      responses: evaluationStatus.responses || [],
      throttlingStats: evaluationStatus.throttlingStats,
      progress: evaluationStatus.progress || 0
    })

    // Assess evaluation health
    const health = assessEvaluationHealth(evaluationStatus)
    if (health.status === 'warning' || health.status === 'critical') {
      console.warn('Evaluation health issues detected:', health)
    }

    if (evaluationStatus.status === 'completed' && evaluationStatus.result) {
      console.log('Evaluation completed with result:', evaluationStatus.result)
      // Set all completion states immediately and prevent further updates
      setStatus('completed')

      const throttlingStats = evaluationStatus.throttlingStats || {};
      setGrade({
        ...evaluationStatus.result,
        allResponses: evaluationStatus.result.allResponses || evaluationStatus.responses || allResponses,
        responsesUsedForGrading: evaluationStatus.result.responsesUsedForGrading,
        throttlingStats: throttlingStats,
        throttledCount: throttlingStats.throttledCount || 0,
        abandonedCount: throttlingStats.abandonedCount || 0
      })
      setIsEvaluationRunning(false)
      setProgress(100)
      setCurrentPhase('Evaluation complete')
      setEvaluationId(null) // Clear evaluation ID to prevent restarts
      setThrottlingInfo(null)
      if (onEvaluationComplete) {
        onEvaluationComplete(evaluationStatus.result)
      }
      // Don't process any more status updates for this evaluation
      return
    } else if (evaluationStatus.status === 'error') {
      const errorInfo = handleDeterminismError(new Error(evaluationStatus.error), {
        component: 'DeterminismEvaluator',
        operation: 'evaluation',
        evaluationId: evaluationStatus.id,
        evaluationStatus: evaluationStatus.status,
        retryCount,
        completedRequests: evaluationStatus.completedRequests || 0,
        totalRequests: evaluationStatus.totalRequests || determinismSettings?.testCount || 10,
        responses: evaluationStatus.responses || []
      })

      const userMessage = generateDeterminismErrorMessage(errorInfo)

      // Create graceful degradation plan
      const plan = createGracefulDegradationPlan(evaluationData || {
        completedRequests: evaluationStatus.completedRequests || 0,
        totalRequests: evaluationStatus.totalRequests || determinismSettings?.testCount || 10,
        responses: evaluationStatus.responses || []
      }, new Error(evaluationStatus.error))

      setError(userMessage)
      setErrorInfo(errorInfo)
      setDegradationPlan(plan)
      setShowRecoveryOptions(true)
      setIsEvaluationRunning(false)
      setThrottlingInfo(null)
    }
  }, [onEvaluationComplete, retryCount, status, grade, determinismSettings?.testCount, allResponses])

  // Start evaluation with single-fire logic
  const startEvaluation = useCallback(async () => {
    if (!testResult || isEvaluationRunning || hasStartedOnce) {
      console.log('Skipping evaluation start:', {
        hasTestResult: !!testResult,
        isRunning: isEvaluationRunning,
        hasStarted: hasStartedOnce
      })
      return
    }

    try {
      setHasStartedOnce(true)
      setIsEvaluationRunning(true)
      setStatus('collecting')
      setError(null)
      setErrorInfo(null)
      setProgress(0)
      setCurrentPhase('Starting evaluation...')
      setShowRecoveryOptions(false)
      setCompletedRequests(0)
      setTotalRequests(determinismSettings?.testCount || 10)
      setStartTime(Date.now())
      setEstimatedTimeRemaining(null)
      setThrottlingInfo(null)
      setAllResponses([])

      const config = {
        id: testResult.id,
        testId: testResult.id,
        modelId: testResult.modelId,
        systemPrompt: testResult.systemPrompt,
        userPrompt: testResult.userPrompt,
        content: testResult.datasetContent,
        originalResponse: testResult.response,
        datasetType: testResult.datasetType,
        datasetOption: testResult.datasetOption,
        toolConfig: testResult.toolConfig, // Include tool configuration for consistent tool usage
        customGraderPrompt: graderSystemPrompt,
        testCount: determinismSettings?.testCount || 10,
        maxRetryAttempts: determinismSettings?.maxRetryAttempts || 3,
        enableThrottlingAlerts: determinismSettings?.enableThrottlingAlerts !== false
      }

      const newEvaluationId = await determinismService.startEvaluation(config)
      setEvaluationId(newEvaluationId)

      // Subscribe to status updates
      const unsubscribe = determinismService.onStatusUpdate(newEvaluationId, handleStatusUpdate)

      // Clean up subscription when component unmounts or evaluation changes
      return unsubscribe

    } catch (error) {
      const errorInfo = handleDeterminismError(error, {
        component: 'DeterminismEvaluator',
        operation: 'startEvaluation',
        retryCount
      })

      const userMessage = generateDeterminismErrorMessage(errorInfo)
      setStatus('error')
      setError(userMessage)
      setErrorInfo(errorInfo)
      setShowRecoveryOptions(true)
      setIsEvaluationRunning(false)
    }
  }, [testResult, isEvaluationRunning, hasStartedOnce, graderSystemPrompt, handleStatusUpdate, determinismSettings, retryCount])

  // Retry evaluation
  const retryEvaluation = useCallback(async () => {
    setRetryCount(prev => prev + 1)
    setShowRecoveryOptions(false)
    setError(null)
    setErrorInfo(null)
    setDegradationPlan(null)
    await startEvaluation()
  }, [startEvaluation])

  // Complete evaluation with partial data
  const completeWithPartialData = useCallback(async () => {
    if (!evaluationId) return

    try {
      setShowRecoveryOptions(false)
      setError(null)
      setCurrentPhase('Completing with partial data...')

      const success = await determinismService.completeWithPartialData(evaluationId, 'user_requested')
      if (!success) {
        setError('Failed to complete with partial data')
        setShowRecoveryOptions(true)
      }
    } catch (error) {
      console.error('Failed to complete with partial data:', error)
      setError(error.message)
      setShowRecoveryOptions(true)
    }
  }, [evaluationId])

  // Modify settings and retry
  const modifySettingsAndRetry = useCallback(async (newSettings) => {
    if (!evaluationId) return

    try {
      setShowRecoveryOptions(false)
      setError(null)
      setErrorInfo(null)
      setDegradationPlan(null)
      setCurrentPhase('Retrying with modified settings...')

      const newEvaluationId = await determinismService.retryWithModifiedSettings(evaluationId, newSettings)
      setEvaluationId(newEvaluationId)

      // Subscribe to new evaluation
      const unsubscribe = determinismService.onStatusUpdate(newEvaluationId, handleStatusUpdate)
      return unsubscribe
    } catch (error) {
      console.error('Failed to retry with modified settings:', error)
      setError(error.message)
      setShowRecoveryOptions(true)
    }
  }, [evaluationId, handleStatusUpdate])

  // Export evaluation data
  const exportEvaluationData = useCallback(() => {
    if (!evaluationId) return

    try {
      determinismService.exportEvaluationData(evaluationId)
    } catch (error) {
      console.error('Failed to export evaluation data:', error)
      setError('Failed to export evaluation data')
    }
  }, [evaluationId])

  // Pause evaluation
  const pauseEvaluation = useCallback(async () => {
    if (!evaluationId || status !== 'evaluating') return

    try {
      await determinismService.pauseEvaluation(evaluationId)
      setStatus('paused')
      setCurrentPhase('Evaluation paused')
    } catch (error) {
      console.error('Failed to pause evaluation:', error)
    }
  }, [evaluationId, status])

  // Resume evaluation
  const resumeEvaluation = useCallback(async () => {
    if (!evaluationId || status !== 'paused') return

    try {
      await determinismService.resumeEvaluation(evaluationId)
      setStatus('evaluating')
      setCurrentPhase('Resuming evaluation...')
    } catch (error) {
      const errorInfo = handleDeterminismError(error, {
        component: 'DeterminismEvaluator',
        operation: 'resumeEvaluation',
        evaluationStatus: status
      })

      const userMessage = generateDeterminismErrorMessage(errorInfo)
      setError(userMessage)
      setErrorInfo(errorInfo)
      setShowRecoveryOptions(true)
    }
  }, [evaluationId, status])

  // Cancel evaluation
  const cancelEvaluation = useCallback(async () => {
    if (!evaluationId) return

    try {
      await determinismService.cancelEvaluation(evaluationId)
      setStatus('idle')
      setEvaluationId(null)
      setProgress(0)
      setCurrentPhase('')
    } catch (error) {
      console.error('Failed to cancel evaluation:', error)
    }
  }, [evaluationId])

  // Single-fire evaluation trigger based on shouldStartEvaluation prop
  useEffect(() => {
    if (shouldStartEvaluation && testResult && enabled && !hasStartedOnce && !isEvaluationRunning) {
      console.log('Starting determinism evaluation for test:', testResult.id)
      startEvaluation()
    }
  }, [shouldStartEvaluation, testResult, enabled, hasStartedOnce, isEvaluationRunning, startEvaluation])

  if (!enabled || !testResult) {
    return null
  }

  const getGradeColor = (gradeValue) => {
    switch (gradeValue) {
      case 'A': return 'bg-primary-600 text-white'
      case 'B': return 'bg-secondary-700 text-white'
      case 'C': return 'bg-yellow-500 text-white'
      case 'D': return 'bg-orange-500 text-white'
      case 'F': return 'bg-red-500 text-white'
      default: return 'bg-gray-500 text-white'
    }
  }

  const getGradeDescription = (gradeValue) => {
    switch (gradeValue) {
      case 'A': return 'Highly Deterministic (>90%)'
      case 'B': return 'Good Determinism (70-90%)'
      case 'C': return 'Moderate Determinism (50-70%)'
      case 'D': return 'Low Determinism (30-50%)'
      case 'F': return 'Non-deterministic (<30%)'
      default: return 'Unknown'
    }
  }

  const handleGradeClick = () => {
    if (grade) {
      setShowModal(true)
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
  }

  return (
    <div className="mt-4 p-4 bg-gradient-to-r from-primary-50 to-secondary-100 border border-primary-200 rounded-lg determinism-gradient-container">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700 flex items-center space-x-2">
          <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>Determinism Evaluation</span>
        </h4>

        {status === 'completed' && grade && (
          <button
            onClick={handleGradeClick}
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold transition-all duration-200 hover:scale-105 hover:shadow-md ${getGradeColor(grade.grade)}`}
            title={`Click for details - ${getGradeDescription(grade.grade)}`}
          >
            Grade: {grade.grade}
          </button>
        )}
      </div>

      {/* Enhanced Status Display with Smooth Transitions */}
      {status === 'idle' && (
        <div className="flex items-center space-x-2 text-sm text-gray-600 animate-fade-in">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Ready to evaluate determinism</span>
        </div>
      )}

      {/* Collecting Additional Responses Phase */}
      {status === 'collecting' && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center space-x-2">
            <LoadingSpinner size="sm" color="primary" inline />
            <span className="text-sm font-medium text-primary-700">Collecting additional responses...</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 bg-primary-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-gray-600">
            <span>{completedRequests} of {totalRequests} responses</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
        </div>
      )}

      {/* Evaluating Determinism Phase */}
      {status === 'evaluating' && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center space-x-2">
            <LoadingSpinner size="sm" color="primary" inline />
            <span className="text-sm font-medium text-primary-700">Evaluating determinism...</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 bg-primary-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>

          <div className="text-xs text-gray-600 text-center">
            Analyzing response consistency with grader LLM...
          </div>
        </div>
      )}

      {/* Throttling Status */}
      {status === 'throttled' && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-yellow-500 animate-pulse-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-sm font-medium text-yellow-700">Handling rate limits...</span>
          </div>

          {throttlingInfo && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="text-sm text-yellow-800">
                <div className="font-medium mb-1">AWS Rate Limiting Detected</div>
                <div className="text-xs space-y-1">
                  <div>
                    Retry attempt: {throttlingInfo.retryCount + 1}
                    {throttlingInfo.nextRetryIn && (
                      <span> • Next retry in {Math.ceil(throttlingInfo.nextRetryIn / 1000)}s</span>
                    )}
                  </div>
                  {throttlingInfo.hasThrottling && (
                    <div>
                      Throttled requests: {throttlingInfo.throttledCount}
                      {throttlingInfo.abandonedCount > 0 && (
                        <span> • Abandoned: {throttlingInfo.abandonedCount}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 bg-yellow-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-gray-600">
            <span>{completedRequests} of {totalRequests} responses</span>
            <span>Waiting for rate limits to clear...</span>
          </div>
        </div>
      )}

      {status === 'paused' && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-yellow-700 font-medium">Evaluation paused</span>
          </div>

          <ProgressIndicator
            status="paused"
            progress={progress}
            currentPhase={currentPhase}
            completedRequests={completedRequests}
            totalRequests={totalRequests}
            startTime={startTime}
            estimatedTimeRemaining={estimatedTimeRemaining}
            showDetails={true}
          />

          <div className="flex space-x-2">
            <button
              onClick={resumeEvaluation}
              className="text-xs bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 transition-colors"
            >
              Resume
            </button>
            <button
              onClick={cancelEvaluation}
              className="text-xs bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start space-x-2 text-sm">
            <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1">
              <div className="text-red-700 font-medium">Evaluation failed</div>
              <div className="text-red-600 mt-1">{error}</div>
              {retryCount > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  Retry attempt: {retryCount}
                </div>
              )}
            </div>
          </div>

          {showRecoveryOptions && (
            <ErrorRecoveryOptions
              errorInfo={errorInfo}
              onRetry={retryEvaluation}
              onCancel={cancelEvaluation}
              onCompletePartial={completeWithPartialData}
              onModifySettings={modifySettingsAndRetry}
              onExportData={exportEvaluationData}
              retryCount={retryCount}
              evaluationData={evaluationData}
            />
          )}

          {degradationPlan && degradationPlan.preserveOriginalResult && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <div className="font-medium mb-1">Original Test Result Preserved</div>
                  <div className="text-xs">
                    Your original test result remains fully functional. The determinism evaluation failure does not affect your primary testing capabilities.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}



      {/* Detailed Breakdown Modal */}
      {showModal && grade && (
        <DeterminismModal
          grade={grade}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}

/**
 * Optimized ResponseItem component for virtualized rendering
 * Memoized to prevent unnecessary re-renders with large datasets
 */
const ResponseItem = React.memo(({ response, index, hasTools, isThrottled, responseTime, isExpanded, onToggleExpand, isToolsExpanded, onToggleToolsExpand }) => {
  return (
    <div
      className={`border-2 rounded-xl p-5 transition-all duration-200 hover:shadow-md ${
        isThrottled
          ? 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-300 opacity-75'
          : hasTools
            ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-sm'
            : 'bg-gradient-to-r from-white to-gray-50 border-gray-200 shadow-sm'
      }`}
    >
      {/* Response Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            isThrottled
              ? 'bg-gray-400 text-white'
              : hasTools
                ? 'bg-blue-500 text-white'
                : 'bg-primary-500 text-white'
          }`}>
            {index + 1}
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-800">
              Response {index + 1}
            </span>
            {responseTime && (
              <div className="text-xs text-gray-500">
                {responseTime}s response time
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Status Badges */}
          {isThrottled && (
            <span className="px-2 py-1 text-xs bg-yellow-200 text-yellow-800 rounded-full font-medium">
              Throttled
            </span>
          )}
          {hasTools && (
            <span className="px-2 py-1 text-xs bg-blue-200 text-blue-800 rounded-full font-medium">
              {response.toolUsage.toolCalls?.length || 0} Tools
            </span>
          )}

          <button
            onClick={onToggleExpand}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium px-3 py-1 rounded-md hover:bg-primary-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} response ${index + 1}`}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Tool Usage Stats */}
      {hasTools && (
        <div className="mb-4 p-4 bg-white bg-opacity-60 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-semibold text-blue-800">Tool Usage Details</span>
              <span className="text-xs text-blue-600">({response.toolUsage.toolCalls?.length || 0} tools)</span>
            </div>
            <button
              onClick={onToggleToolsExpand}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              {isToolsExpanded ? 'Hide' : 'Show'}
            </button>
          </div>

          {isToolsExpanded && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="text-xs">
                  <span className="font-medium text-blue-700">Tools Called:</span>
                  <span className="ml-1 text-blue-600">{response.toolUsage.toolCalls?.length || 0}</span>
                </div>
                <div className="text-xs">
                  <span className="font-medium text-blue-700">Extraction Status:</span>
                  <span className={`ml-1 ${response.toolUsage.extractionSuccess !== false ? 'text-green-600' : 'text-red-600'}`}>
                    {response.toolUsage.extractionSuccess !== false ? 'Success' : 'Failed'}
                  </span>
                </div>
              </div>

              {response.toolUsage.toolCalls?.map((tool, toolIndex) => (
                <div key={toolIndex} className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-blue-800">
                      {tool.name || tool.toolName || 'Unknown Tool'}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        tool.attempted
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {tool.attempted ? 'Attempted' : 'Executed'}
                      </span>
                      {tool.timestamp && (
                        <span className="text-xs text-blue-600">
                          {new Date(tool.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tool Input Parameters */}
                  <div className="bg-white bg-opacity-70 p-2 rounded border border-blue-100">
                    <div className="text-xs font-medium text-blue-700 mb-1">Parameters:</div>
                    <div className="text-xs text-blue-800 font-mono max-h-20 overflow-y-auto">
                      {tool.input
                        ? (typeof tool.input === 'string'
                            ? tool.input.length > 200
                              ? tool.input.substring(0, 200) + '...'
                              : tool.input
                            : JSON.stringify(tool.input, null, 2).length > 200
                              ? JSON.stringify(tool.input, null, 2).substring(0, 200) + '...'
                              : JSON.stringify(tool.input, null, 2)
                          )
                        : 'No input parameters'
                      }
                    </div>
                  </div>

                  {/* Tool Validation Status */}
                  {tool.parameterValidation && (
                    <div className="mt-2 text-xs">
                      <span className={`font-medium ${
                        tool.parameterValidation.isValid
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}>
                        Validation: {tool.parameterValidation.isValid ? 'Valid' : 'Invalid'}
                      </span>
                      {!tool.parameterValidation.isValid && tool.parameterValidation.errors && (
                        <div className="text-red-600 mt-1">
                          {tool.parameterValidation.errors.slice(0, 2).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Response Content */}
      <div className={`text-sm text-gray-700 leading-relaxed ${
        isExpanded ? '' : 'line-clamp-4'
      }`}>
        <div className="bg-white bg-opacity-80 p-4 rounded-lg border border-gray-200">
          {(() => {
            if (response.text && response.text.trim()) {
              return response.text;
            } else if (typeof response === 'string' && response.trim()) {
              return response;
            } else if (response && typeof response === 'object') {
              const content = response.content || response.message;
              if (content && content.trim()) {
                return content;
              }

              // Check if the model used tools but didn't generate text content
              if (response.toolUsage && response.toolUsage.hasToolUsage && response.toolUsage.toolCalls && response.toolUsage.toolCalls.length > 0) {
                return (
                  <div className="flex items-center space-x-2 text-gray-600 italic">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Model used {response.toolUsage.toolCalls.length} tool{response.toolUsage.toolCalls.length !== 1 ? 's' : ''} without generating text content</span>
                  </div>
                );
              }

              return 'No response content available';
            } else {
              return 'No response content available';
            }
          })()}
        </div>
      </div>

      {/* Metadata Footer */}
      {response.timestamp && (
        <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
          Generated: {new Date(response.timestamp).toLocaleString()}
          {response.retryCount > 0 && (
            <span className="ml-3">• Retries: {response.retryCount}</span>
          )}
        </div>
      )}
    </div>
  )
})

ResponseItem.displayName = 'ResponseItem'

/**
 * Enhanced modal component for displaying comprehensive determinism evaluation results
 * Optimized for performance with large response sets and improved accessibility
 */
function DeterminismModal({ grade, onClose }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [expandedResponse, setExpandedResponse] = useState(null)
  const [expandedToolsResponses, setExpandedToolsResponses] = useState(new Set())
  const [virtualizedStart, setVirtualizedStart] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Performance optimization: virtualize large response lists
  const ITEMS_PER_PAGE = 20
  const filteredResponses = React.useMemo(() => {
    if (!grade?.allResponses) return []

    if (!searchTerm) return grade.allResponses

    return grade.allResponses.filter(response =>
      response.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.toolUsage?.toolCalls?.some(call =>
        call.toolName?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    )
  }, [grade?.allResponses, searchTerm])

  const visibleResponses = React.useMemo(() => {
    return filteredResponses.slice(virtualizedStart, virtualizedStart + ITEMS_PER_PAGE)
  }, [filteredResponses, virtualizedStart])

  // Handle tool expansion toggle
  const toggleToolsExpansion = (responseIndex) => {
    const newExpanded = new Set(expandedToolsResponses)
    if (newExpanded.has(responseIndex)) {
      newExpanded.delete(responseIndex)
    } else {
      newExpanded.add(responseIndex)
    }
    setExpandedToolsResponses(newExpanded)
  }

  useEffect(() => {
    console.log('DeterminismModal received grade object:', grade)
    console.log('Grade has metrics:', !!grade?.metrics)
    console.log('Grade has allResponses:', !!grade?.allResponses)
    console.log('Grade has throttledCount:', grade?.throttledCount)

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    // Accessibility: trap focus within modal
    const handleTabKey = (e) => {
      if (e.key === 'Tab') {
        const focusableElements = document.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('keydown', handleTabKey)

    // Set initial focus to close button for accessibility
    const closeButton = document.querySelector('[data-modal-close]')
    if (closeButton) {
      closeButton.focus()
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('keydown', handleTabKey)
    }
  }, [onClose, grade])

  const getGradeColor = (gradeValue) => {
    switch (gradeValue) {
      case 'A': return 'text-primary-700 bg-primary-50 border-primary-200'
      case 'B': return 'text-secondary-800 bg-secondary-100 border-secondary-200'
      case 'C': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'D': return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'F': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const formatPercentage = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A'
    return `${(value * 100).toFixed(1)}%`
  }

  const exportData = () => {
    const exportObj = {
      grade: grade.grade,
      score: grade.score,
      timestamp: grade.timestamp,
      metrics: grade.metrics,
      allResponses: grade.allResponses,
      throttledCount: grade.throttledCount,
      notable_variations: grade.notable_variations
    }

    const dataStr = JSON.stringify(exportObj, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `determinism-evaluation-${grade.grade}-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[95vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h3 id="modal-title" className="text-lg font-semibold text-gray-900">
              Comprehensive Determinism Analysis
            </h3>
            <p id="modal-description" className="text-sm text-gray-600 mt-1">
              Grade {grade.grade} - {grade.allResponses?.length || 0} responses analyzed
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={exportData}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded px-2 py-1"
              aria-label="Export evaluation data"
            >
              Export Data
            </button>
            <button
              data-modal-close
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded p-1"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'overview'}
            aria-controls="overview-panel"
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              activeTab === 'overview'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Analysis Overview
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'responses'}
            aria-controls="responses-panel"
            onClick={() => setActiveTab('responses')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              activeTab === 'responses'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All Responses ({grade.allResponses?.length || 0})
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Analysis Overview Tab (Combined Summary + Detailed Analysis) */}
          {activeTab === 'overview' && (
            <div className="p-6">
              {/* Grade Summary */}
              <div className={`p-6 rounded-lg border-2 mb-6 ${getGradeColor(grade.grade)}`}>
                <div className="text-center mb-4">
                  <div className="text-4xl font-bold mb-2">Grade: {grade.grade}</div>
                  <div className="text-lg opacity-90">
                    {grade.grade === 'A' && 'Highly Deterministic (>90% consistency)'}
                    {grade.grade === 'B' && 'Good Determinism (70-90% consistency)'}
                    {grade.grade === 'C' && 'Moderate Determinism (50-70% consistency)'}
                    {grade.grade === 'D' && 'Low Determinism (30-50% consistency)'}
                    {grade.grade === 'F' && 'Non-deterministic (<30% consistency)'}
                  </div>
                </div>

                {/* Summary Notes */}
                {grade.notes && (
                  <div className="text-sm opacity-90 text-center italic">
                    "{grade.notes}"
                  </div>
                )}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 p-4 rounded-xl text-center shadow-sm">
                  <div className="text-xs font-medium text-blue-600 mb-1">Total Responses</div>
                  <div className="text-2xl font-bold text-blue-900">{grade.allResponses?.length || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 p-4 rounded-xl text-center shadow-sm">
                  <div className="text-xs font-medium text-emerald-600 mb-1">Determinism Score</div>
                  <div className="text-2xl font-bold text-emerald-900">{grade.score}%</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 p-4 rounded-xl text-center shadow-sm">
                  <div className="text-xs font-medium text-purple-600 mb-1">Tool Usage Consistency</div>
                  <div className="text-2xl font-bold text-purple-900">
                    {formatPercentage(grade.metrics?.toolUsageConsistency)}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 p-4 rounded-xl text-center shadow-sm">
                  <div className="text-xs font-medium text-orange-600 mb-1">Avg Response Time</div>
                  <div className="text-2xl font-bold text-orange-900">
                    {grade.allResponses?.length > 0
                      ? `${(grade.allResponses.reduce((sum, r) => sum + (r.responseTime || 0), 0) / grade.allResponses.length / 1000).toFixed(1)}s`
                      : 'N/A'
                    }
                  </div>
                </div>
              </div>

              {/* Consistency Breakdown */}
              {grade.metrics ? (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Consistency Breakdown</h4>

                  {/* Simple Visual Bar Chart */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Decision Consistency</span>
                        <span className="text-sm font-bold text-blue-600">{formatPercentage(grade.metrics.decisionConsistency)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(grade.metrics.decisionConsistency || 0) * 100}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Structure Consistency</span>
                        <span className="text-sm font-bold text-green-600">{formatPercentage(grade.metrics.structureConsistency)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(grade.metrics.structureConsistency || 0) * 100}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Semantic Equivalence</span>
                        <span className="text-sm font-bold text-purple-600">{formatPercentage(grade.metrics.semanticSimilarity)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(grade.metrics.semanticSimilarity || 0) * 100}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Exact Text Match</span>
                        <span className="text-sm font-bold text-orange-600">{formatPercentage(grade.metrics.exactMatches ? grade.metrics.exactMatches / grade.metrics.responseCount : 0)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${grade.metrics.exactMatches && grade.metrics.responseCount ? (grade.metrics.exactMatches / grade.metrics.responseCount) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Additional Important Metrics */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 p-4 rounded-lg shadow-sm">
                      <div className="text-sm font-medium text-teal-800 mb-1">Unique Responses</div>
                      <div className="text-xl font-bold text-teal-900">
                        {grade.metrics?.uniqueResponses || (() => {
                          const uniqueTexts = new Set(grade.allResponses?.map(r => r.text || '') || []);
                          return uniqueTexts.size;
                        })()}
                      </div>
                      <div className="text-xs text-teal-700 mt-1">Distinct outputs</div>
                    </div>

                    {grade.metrics.response_length_variance !== undefined && (
                      <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 p-4 rounded-lg shadow-sm">
                        <div className="text-sm font-medium text-cyan-800 mb-1">Length Variance</div>
                        <div className="text-xl font-bold text-cyan-900">
                          {grade.metrics.response_length_variance?.toFixed(2) || 'N/A'}
                        </div>
                        <div className="text-xs text-cyan-700 mt-1">Response length consistency</div>
                      </div>
                    )}

                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 p-4 rounded-lg shadow-sm">
                      <div className="text-sm font-medium text-slate-600 mb-1">Analyzed Responses</div>
                      <div className="text-xl font-bold text-slate-900">{grade.metrics.responseCount || grade.metrics.n_runs || 0}</div>
                      <div className="text-xs text-slate-700 mt-1">Used for grading</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Analysis Summary</h4>
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-6 rounded-lg shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-900 mb-1">{grade.grade}</div>
                        <div className="text-sm font-medium text-blue-700">Grade</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-indigo-900 mb-1">{grade.score}%</div>
                        <div className="text-sm font-medium text-indigo-700">Score</div>
                      </div>
                      {grade.allResponses?.length && (
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-900 mb-1">
                            {grade.metrics?.uniqueResponses || (() => {
                              const uniqueTexts = new Set(grade.allResponses.map(r => r.text || ''));
                              return uniqueTexts.size;
                            })()}
                          </div>
                          <div className="text-sm font-medium text-purple-700">Unique Responses</div>
                        </div>
                      )}
                    </div>
                    {grade.reasoning && (
                      <div className="mt-4 pt-4 border-t border-blue-200">
                        <div className="text-sm text-blue-800">
                          <strong>Analysis:</strong> {grade.reasoning}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Additional variance metrics when available */}
                  {grade.variance && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200 p-4 rounded-lg text-center shadow-sm">
                        <div className="text-sm font-medium text-violet-600 mb-1">Total Responses</div>
                        <div className="text-xl font-bold text-violet-900">{grade.variance.responseCount}</div>
                        <div className="text-xs text-violet-700 mt-1">Collected</div>
                      </div>
                      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 p-4 rounded-lg text-center shadow-sm">
                        <div className="text-sm font-medium text-emerald-600 mb-1">Unique Outputs</div>
                        <div className="text-xl font-bold text-emerald-900">{grade.variance.uniqueResponses}</div>
                        <div className="text-xs text-emerald-700 mt-1">Distinct</div>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 p-4 rounded-lg text-center shadow-sm">
                        <div className="text-sm font-medium text-orange-600 mb-1">Avg Length</div>
                        <div className="text-xl font-bold text-orange-900">{grade.variance.averageLength}</div>
                        <div className="text-xs text-orange-700 mt-1">Characters</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Advanced Metrics Section */}
              {grade.metrics && (grade.metrics.tool_consistency_rate !== undefined || grade.metrics.semantic_similarity_variance !== undefined) && (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Advanced Analysis</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Tool Usage Consistency */}
                    {grade.metrics.tool_consistency_rate !== undefined && (
                      <div className="bg-gradient-to-r from-primary-50 to-secondary-50 border border-primary-200 p-4 rounded-lg shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-primary-800">Tool Usage Consistency</div>
                          <div className="text-xl font-bold text-primary-900">
                            {formatPercentage(grade.metrics.toolUsageConsistency)}
                          </div>
                        </div>
                        <div className="text-xs text-primary-700 mb-2">
                          How consistently tools were used across responses
                        </div>
                        <div className="w-full bg-primary-200 rounded-full h-2">
                          <div
                            className="h-2 bg-primary-600 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, (grade.metrics.toolUsageConsistency || 0) * 100))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Semantic Similarity Variance */}
                    {grade.metrics.semantic_similarity_variance !== undefined && (
                      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 p-4 rounded-lg shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-indigo-800">Semantic Similarity</div>
                          <div className="text-xl font-bold text-indigo-900">
                            {(grade.metrics.semantic_similarity_variance * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="text-xs text-indigo-700 mb-2">
                          Variance in semantic meaning across responses
                        </div>
                        <div className="w-full bg-indigo-200 rounded-full h-2">
                          <div
                            className="h-2 bg-indigo-600 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, (1 - grade.metrics.semantic_similarity_variance) * 100))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Tool Usage Variance */}
                    {grade.allResponses?.some(r => r.toolUsage?.hasToolUsage) && (
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 p-4 rounded-lg shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-purple-800">Tool Usage Variance</div>
                          <div className="text-xl font-bold text-purple-900">
                            {(() => {
                              const toolUsageCounts = grade.allResponses.map(r => r.toolUsage?.toolCallCount || 0);
                              const avg = toolUsageCounts.reduce((a, b) => a + b, 0) / toolUsageCounts.length;
                              const variance = toolUsageCounts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / toolUsageCounts.length;
                              return Math.sqrt(variance).toFixed(2);
                            })()}
                          </div>
                        </div>
                        <div className="text-xs text-purple-700 mb-2">
                          Standard deviation of tool calls per response
                        </div>
                        <div className="w-full bg-purple-200 rounded-full h-2">
                          <div
                            className="h-2 bg-purple-600 rounded-full transition-all duration-500"
                            style={{
                              width: `${(() => {
                                const toolUsageCounts = grade.allResponses.map(r => r.toolUsage?.toolCallCount || 0);
                                const avg = toolUsageCounts.reduce((a, b) => a + b, 0) / toolUsageCounts.length;
                                const variance = toolUsageCounts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / toolUsageCounts.length;
                                const stdDev = Math.sqrt(variance);
                                return Math.min(100, Math.max(0, 100 - (stdDev * 20)));
                              })()}%`
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Response Time Consistency */}
                    {grade.allResponses?.some(r => r.responseTime) && (
                      <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 p-4 rounded-lg shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-orange-800">Response Time Consistency</div>
                          <div className="text-xl font-bold text-orange-900">
                            {(() => {
                              const times = grade.allResponses.filter(r => r.responseTime).map(r => r.responseTime / 1000);
                              const avg = times.reduce((a, b) => a + b, 0) / times.length;
                              const variance = times.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / times.length;
                              return Math.sqrt(variance).toFixed(2);
                            })()}s
                          </div>
                        </div>
                        <div className="text-xs text-orange-700 mb-2">
                          Standard deviation of response times
                        </div>
                        <div className="w-full bg-orange-200 rounded-full h-2">
                          <div
                            className="h-2 bg-orange-600 rounded-full transition-all duration-500"
                            style={{
                              width: `${(() => {
                                const times = grade.allResponses.filter(r => r.responseTime).map(r => r.responseTime / 1000);
                                const avg = times.reduce((a, b) => a + b, 0) / times.length;
                                const variance = times.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / times.length;
                                const stdDev = Math.sqrt(variance);
                                return Math.min(100, Math.max(0, 100 - (stdDev * 10)));
                              })()}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}



              {/* Notable Variations */}
              {grade.notable_variations && grade.notable_variations.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span>Notable Variations</span>
                  </h4>
                  <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-4 shadow-sm">
                    <ul className="text-sm text-yellow-800 space-y-2">
                      {grade.notable_variations.map((variation, index) => (
                        <li key={index} className="flex items-start space-x-3">
                          <span className="text-yellow-600 mt-1 flex-shrink-0">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 8 8">
                              <circle cx="4" cy="4" r="3"/>
                            </svg>
                          </span>
                          <span className="leading-relaxed">{variation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Evaluation Summary */}
              {grade.timestamp && (
                <div className="border-t border-gray-200 pt-4">
                  <div className="text-sm text-gray-600 text-center">
                    <span className="font-medium">Evaluation completed:</span> {new Date(grade.timestamp).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Enhanced All Responses Tab with Performance Optimization */}
          {activeTab === 'responses' && (
            <div
              id="responses-panel"
              role="tabpanel"
              aria-labelledby="responses-tab"
              className="p-6"
            >
              {/* Response Stats Header */}
              <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 p-3 rounded-lg text-center shadow-sm">
                  <div className="text-xs text-blue-600 font-medium">Total Responses</div>
                  <div className="text-lg font-bold text-blue-900">{grade.allResponses?.length || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 p-3 rounded-lg text-center shadow-sm">
                  <div className="text-xs text-green-600 font-medium">Tool Usage Consistency</div>
                  <div className="text-lg font-bold text-green-900">
                    {formatPercentage(grade.metrics?.toolUsageConsistency)}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 p-3 rounded-lg text-center shadow-sm">
                  <div className="text-xs text-purple-600 font-medium">Avg Response Time</div>
                  <div className="text-lg font-bold text-purple-900">
                    {grade.allResponses?.length > 0
                      ? `${(grade.allResponses.reduce((sum, r) => sum + (r.responseTime || 0), 0) / grade.allResponses.length / 1000).toFixed(1)}s`
                      : 'N/A'
                    }
                  </div>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 p-3 rounded-lg text-center shadow-sm">
                  <div className="text-xs text-orange-600 font-medium">Throttled</div>
                  <div className="text-lg font-bold text-orange-900">{grade.throttledCount || 0}</div>
                </div>
              </div>

              {/* Search and Filter Controls */}
              {grade.allResponses?.length > 10 && (
                <div className="mb-6 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label htmlFor="response-search" className="sr-only">Search responses</label>
                    <div className="relative">
                      <input
                        id="response-search"
                        type="text"
                        placeholder="Search responses or tool names..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value)
                          setVirtualizedStart(0) // Reset to top when searching
                        }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                      <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 flex items-center">
                    Showing {Math.min(filteredResponses.length, ITEMS_PER_PAGE)} of {filteredResponses.length} responses
                  </div>
                </div>
              )}

              {/* Virtualized Response List for Performance */}
              <div className="space-y-4">
                {filteredResponses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm ? 'No responses match your search.' : 'No responses available.'}
                  </div>
                ) : (
                  <>
                    {/* Loading indicator for large datasets */}
                    {isLoading && (
                      <div className="flex items-center justify-center py-4">
                        <LoadingSpinner size="sm" text="Loading responses..." />
                      </div>
                    )}

                    {/* Virtualized response items */}
                    {visibleResponses.map((response, index) => {
                      const actualIndex = virtualizedStart + index
                      const hasTools = response.toolUsage?.hasToolUsage
                      const isThrottled = response.wasThrottled
                      const responseTime = response.responseTime ? (response.responseTime / 1000).toFixed(2) : null

                      return (
                        <ResponseItem
                          key={actualIndex}
                          response={response}
                          index={actualIndex}
                          hasTools={hasTools}
                          isThrottled={isThrottled}
                          responseTime={responseTime}
                          isExpanded={expandedResponse === actualIndex}
                          onToggleExpand={() => setExpandedResponse(expandedResponse === actualIndex ? null : actualIndex)}
                          isToolsExpanded={expandedToolsResponses.has(actualIndex)}
                          onToggleToolsExpand={() => toggleToolsExpansion(actualIndex)}
                        />
                      )
                    })}

                    {/* Pagination Controls for Large Datasets */}
                    {filteredResponses.length > ITEMS_PER_PAGE && (
                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => setVirtualizedStart(Math.max(0, virtualizedStart - ITEMS_PER_PAGE))}
                          disabled={virtualizedStart === 0}
                          className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                          Previous
                        </button>

                        <span className="text-sm text-gray-600">
                          {virtualizedStart + 1} - {Math.min(virtualizedStart + ITEMS_PER_PAGE, filteredResponses.length)} of {filteredResponses.length}
                        </span>

                        <button
                          onClick={() => setVirtualizedStart(Math.min(filteredResponses.length - ITEMS_PER_PAGE, virtualizedStart + ITEMS_PER_PAGE))}
                          disabled={virtualizedStart + ITEMS_PER_PAGE >= filteredResponses.length}
                          className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          Next
                          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>


            </div>
          )}


        </div>



        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="btn-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

DeterminismEvaluator.propTypes = {
  testResult: PropTypes.object,
  onEvaluationComplete: PropTypes.func,
  enabled: PropTypes.bool,
  graderSystemPrompt: PropTypes.string,
  shouldStartEvaluation: PropTypes.bool
}

DeterminismModal.propTypes = {
  grade: PropTypes.shape({
    grade: PropTypes.oneOf(['A', 'B', 'C', 'D', 'F']).isRequired,
    score: PropTypes.number.isRequired,
    reasoning: PropTypes.string.isRequired,
    allResponses: PropTypes.array,
    throttledCount: PropTypes.number,
    metrics: PropTypes.object,
    notable_variations: PropTypes.array,
    variance: PropTypes.shape({
      responseCount: PropTypes.number,
      uniqueResponses: PropTypes.number,
      averageLength: PropTypes.number,
      lengthVariance: PropTypes.number,
      semanticSimilarity: PropTypes.number,
      actionConsistency: PropTypes.number
    }),
    timestamp: PropTypes.string.isRequired,
    evaluationId: PropTypes.string
  }).isRequired,
  onClose: PropTypes.func.isRequired
}

ErrorRecoveryOptions.propTypes = {
  errorInfo: PropTypes.object,
  onRetry: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  retryCount: PropTypes.number.isRequired
}

export default DeterminismEvaluator
