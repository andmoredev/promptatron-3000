import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import LoadingSpinner from './LoadingSpinner'
import ProgressIndicator from './ProgressIndicator'
import { determinismService } from '../services/determinismService'
import { handleDeterminismError, assessEvaluationHealth, generateDeterminismErrorMessage } from '../utils/determinismErrorHandling'
import { ErrorTypes } from '../utils/errorHandling'

/**
 * DeterminismEvaluator component displays evaluation status and results
 * @param {Object} props - Component
param {Object} props.testResult - The test result to evaluate
 * @param {Function} props.onEvaluationComplete - Callback when evaluation completes
 * @param {boolean} props.enabled - Whether the evaluator is enabled
 * @param {string} props.graderSystemPrompt - Custom grader system prompt
 */
function DeterminismEvaluator({
  testResult,
  onEvaluationComplete,
  enabled = true,
  graderSystemPrompt
}) {
  const [status, setStatus] = useState('idle') // idle, evaluating, completed, error, paused
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
      setTotalRequests(10)
      setStartTime(null)
      setEstimatedTimeRemaining(null)
      setIsEvaluationRunning(false)
      setLastTestId(testResult.id)
    }
  }, [testResult, enabled, lastTestId])

  // Network monitoring not needed for main thread execution

  // Handle evaluation status updates
  const handleStatusUpdate = useCallback((evaluationStatus) => {
    console.log('Status update received:', evaluationStatus.status, 'Grade:', evaluationStatus.result)

    // Don't update status if we're already completed
    if (status === 'completed' && grade) {
      console.log('Ignoring status update - evaluation already completed')
      return
    }

    setStatus(evaluationStatus.status)
    setProgress(evaluationStatus.progress || 0)
    setCurrentPhase(evaluationStatus.currentPhase || '')
    setCompletedRequests(evaluationStatus.completedRequests || 0)
    setTotalRequests(evaluationStatus.totalRequests || 10)
    setEstimatedTimeRemaining(evaluationStatus.estimatedTimeRemaining)

    // Set start time if not already set and evaluation is running
    if (evaluationStatus.status === 'running' && evaluationStatus.startTime && !startTime) {
      setStartTime(evaluationStatus.startTime)
    }

    // Assess evaluation health
    const health = assessEvaluationHealth(evaluationStatus)
    if (health.status === 'warning' || health.status === 'critical') {
      console.warn('Evaluation health issues detected:', health)
    }

    if (evaluationStatus.status === 'completed' && evaluationStatus.result) {
      console.log('Evaluation completed with result:', evaluationStatus.result)
      // Set all completion states immediately and prevent further updates
      setStatus('completed')
      setGrade(evaluationStatus.result)
      setIsEvaluationRunning(false)
      setProgress(100)
      setCurrentPhase('Evaluation complete')
      setEvaluationId(null) // Clear evaluation ID to prevent restarts
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
        retryCount
      })

      const userMessage = generateDeterminismErrorMessage(errorInfo)
      setError(userMessage)
      setErrorInfo(errorInfo)
      setShowRecoveryOptions(true)
      setIsEvaluationRunning(false)
    }
  }, [onEvaluationComplete, retryCount, status, grade])

  // Start evaluation
  const startEvaluation = useCallback(async () => {
    if (!testResult || status === 'evaluating' || status === 'running' || isEvaluationRunning) return

    try {
      setStatus('evaluating')
      setError(null)
      setErrorInfo(null)
      setProgress(0)
      setCurrentPhase('Starting evaluation...')
      setShowRecoveryOptions(false)
      setCompletedRequests(0)
      setTotalRequests(10)
      setStartTime(Date.now())
      setEstimatedTimeRemaining(null)

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
        customGraderPrompt: graderSystemPrompt
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
    }
  }, [testResult, status, graderSystemPrompt, handleStatusUpdate])

  // Retry evaluation
  const retryEvaluation = useCallback(async () => {
    setRetryCount(prev => prev + 1)
    await startEvaluation()
  }, [startEvaluation])

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

  // Auto-start evaluation when testResult is available (only once)
  useEffect(() => {
    // Only start if we're in idle state, have no grade, and no evaluation is running
    if (testResult && enabled && status === 'idle' && !evaluationId && !isEvaluationRunning && !grade) {
      console.log('Auto-starting determinism evaluation for test:', testResult.id)
      setIsEvaluationRunning(true)
      startEvaluation()
    } else if (testResult && grade) {
      console.log('Skipping auto-start - already have grade for this test')
    }
  }, [testResult, enabled, status, evaluationId, isEvaluationRunning, grade, startEvaluation])

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

      {/* Status Display */}
      {status === 'idle' && (
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Ready to evaluate determinism</span>
        </div>
      )}

      {(status === 'evaluating' || status === 'running') && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="h-2 bg-primary-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
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
              retryCount={retryCount}
            />
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
 * Modal component for displaying detailed determinism evaluation results
 */
function DeterminismModal({ grade, onClose }) {
  useEffect(() => {
    console.log('DeterminismModal received grade object:', grade)
    console.log('Grade has metrics:', !!grade?.metrics)
    console.log('Grade has notes:', !!grade?.notes)
    console.log('Grade has notable_variations:', !!grade?.notable_variations)
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
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
    return `${(value * 100).toFixed(1)}%`
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Determinism Evaluation Details
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
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

          {/* Consistency Metrics */}
          {grade.metrics ? (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Detailed Analysis</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                  <div className="text-sm font-medium text-blue-800 mb-1">Decision Consistency</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {formatPercentage(grade.metrics.decision_consistency_rate)}
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    How often the model made the same decisions
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <div className="text-sm font-medium text-green-800 mb-1">Structure Consistency</div>
                  <div className="text-2xl font-bold text-green-900">
                    {formatPercentage(grade.metrics.structure_consistency_rate)}
                  </div>
                  <div className="text-xs text-green-700 mt-1">
                    How consistent the response format was
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                  <div className="text-sm font-medium text-purple-800 mb-1">Semantic Equivalence</div>
                  <div className="text-2xl font-bold text-purple-900">
                    {formatPercentage(grade.metrics.semantic_equivalence_rate)}
                  </div>
                  <div className="text-xs text-purple-700 mt-1">
                    How similar the meaning was across responses
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                  <div className="text-sm font-medium text-orange-800 mb-1">Exact Text Match</div>
                  <div className="text-2xl font-bold text-orange-900">
                    {formatPercentage(grade.metrics.exact_text_rate)}
                  </div>
                  <div className="text-xs text-orange-700 mt-1">
                    How often responses were identical
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center">
                <div className="text-sm text-gray-600">Analyzed Responses</div>
                <div className="text-xl font-bold text-gray-900">{grade.metrics.n_runs}</div>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Analysis Summary</h4>
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="text-sm text-blue-800">
                  <p className="mb-2"><strong>Grade:</strong> {grade.grade}</p>
                  <p className="mb-2"><strong>Score:</strong> {grade.score}%</p>
                  {grade.reasoning && <p><strong>Analysis:</strong> {grade.reasoning}</p>}
                </div>
              </div>
              {grade.variance && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center">
                    <div className="text-sm text-gray-600">Responses</div>
                    <div className="text-lg font-bold text-gray-900">{grade.variance.responseCount}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center">
                    <div className="text-sm text-gray-600">Unique</div>
                    <div className="text-lg font-bold text-gray-900">{grade.variance.uniqueResponses}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center">
                    <div className="text-sm text-gray-600">Avg Length</div>
                    <div className="text-lg font-bold text-gray-900">{grade.variance.averageLength}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tool Usage Consistency Section */}
          {grade.metrics && grade.metrics.tool_consistency_rate !== undefined && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Tool Usage Consistency</span>
                <div className="group relative">
                  <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                    Evaluates how consistently the model uses tools across multiple runs
                  </div>
                </div>
              </h4>

              {/* Tool Usage Score from Grader */}
              <div className="bg-gradient-to-r from-primary-50 to-secondary-50 border border-primary-200 p-4 rounded-lg mb-4 card-with-gradient">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-primary-800">Tool Usage Consistency</div>
                  <div className="text-2xl font-bold text-primary-900">
                    {formatPercentage(grade.metrics.tool_consistency_rate)}
                  </div>
                </div>
                <div className="text-xs text-primary-700">
                  Evaluated by grader LLM as part of overall determinism assessment
                </div>
                <div className="w-full bg-primary-200 rounded-full h-2 mt-2">
                  <div
                    className="h-2 bg-primary-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, grade.metrics.tool_consistency_rate * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          )}



          {/* Notable Variations */}
          {grade.notable_variations && grade.notable_variations.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-semibold text-gray-900 mb-3">Notable Variations</h4>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <ul className="text-sm text-yellow-800 space-y-1">
                  {grade.notable_variations.map((variation, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-yellow-600 mt-0.5">•</span>
                      <span>{variation}</span>
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
  graderSystemPrompt: PropTypes.string
}

/**
 * Error recovery options component
 */
function ErrorRecoveryOptions({ errorInfo, onRetry, onCancel, retryCount }) {
  const [showDetails, setShowDetails] = useState(false)

  const getRecoveryOptions = () => {
    return errorInfo?.recoveryOptions || []
  }

  const handleRecoveryAction = (action) => {
    switch (action) {
      case 'retry_evaluation':
      case 'retry_with_fallback':
      case 'retry_with_delay':
      case 'retry_with_backoff':
        onRetry()
        break
      case 'cancel_evaluation':
        onCancel()
        break
      case 'refresh_page':
        window.location.reload()
        break
      case 'pause_evaluation':
        // This would be handled by the parent component
        console.log('Pause evaluation requested')
        break
      default:
        console.log('Recovery action not implemented:', action)
    }
  }

  const shouldShowRetry = () => {
    return errorInfo?.canRetry && retryCount < 3
  }

  const getActionButtonStyle = (priority) => {
    switch (priority) {
      case 'high':
        return 'bg-primary-600 hover:bg-primary-700 text-white'
      case 'medium':
        return 'bg-yellow-600 hover:bg-yellow-700 text-white'
      case 'low':
        return 'bg-gray-500 hover:bg-gray-600 text-white'
      default:
        return 'bg-gray-500 hover:bg-gray-600 text-white'
    }
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-medium text-red-800">Recovery Options</h5>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-red-600 hover:text-red-700"
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {showDetails && (
        <div className="space-y-2">
          <div className="text-xs text-red-700">
            <div className="font-medium">Available Recovery Actions:</div>
            <ul className="list-disc list-inside mt-1 space-y-1">
              {getRecoveryOptions().map((option, index) => (
                <li key={index}>
                  <span className="font-medium">{option.label}:</span> {option.description}
                </li>
              ))}
            </ul>
          </div>

          {errorInfo?.errorCode && (
            <div className="text-xs text-gray-600">
              <span className="font-medium">Error Code:</span> {errorInfo.errorCode}
            </div>
          )}

          {errorInfo?.fallbackAvailable && (
            <div className="text-xs text-primary-700 bg-primary-50 p-2 rounded">
              <span className="font-medium">Fallback Available:</span> This evaluation can continue using an alternative method.
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {getRecoveryOptions().slice(0, 3).map((option, index) => (
          <button
            key={index}
            onClick={() => handleRecoveryAction(option.action)}
            className={`text-xs px-3 py-1 rounded transition-colors ${getActionButtonStyle(option.priority)}`}
            title={option.description}
          >
            {option.label}
          </button>
        ))}

        {shouldShowRetry() && !getRecoveryOptions().some(opt => opt.action.includes('retry')) && (
          <button
            onClick={onRetry}
            className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors"
          >
            Retry Evaluation
          </button>
        )}
      </div>

      {retryCount > 0 && (
        <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
          <span className="font-medium">Retry History:</span> {retryCount} attempt{retryCount > 1 ? 's' : ''} made
        </div>
      )}
    </div>
  )
}

DeterminismEvaluator.propTypes = {
  testResult: PropTypes.object,
  onEvaluationComplete: PropTypes.func,
  enabled: PropTypes.bool,
  graderSystemPrompt: PropTypes.string
}

DeterminismModal.propTypes = {
  grade: PropTypes.shape({
    grade: PropTypes.oneOf(['A', 'B', 'C', 'D', 'F']).isRequired,
    score: PropTypes.number.isRequired,
    reasoning: PropTypes.string.isRequired,
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
