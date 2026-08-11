import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import ProgressBar from './ProgressBar'

const ToolExecutionMonitor = ({
  currentIteration,
  maxIterations,
  activeTools = [],
  executionStatus,
  onCancel,
  executionStartTime,
  totalSteps = 0,
  completedSteps = 0
}) => {
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    let interval = null

    if (executionStatus === 'executing' && executionStartTime) {
      interval = setInterval(() => {
        const now = Date.now()
        const start = new Date(executionStartTime).getTime()
        setElapsedTime(now - start)
      }, 100)
    } else {
      setElapsedTime(0)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [executionStatus, executionStartTime])

  const formatElapsedTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    const remainingMs = ms % 1000

    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
    }
    return `${remainingSeconds}.${Math.floor(remainingMs / 100)}`
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'executing':
        return 'text-blue-600'
      case 'completed':
        return 'text-green-600'
      case 'error':
        return 'text-red-600'
      case 'cancelled':
        return 'text-yellow-600'
      default:
        return 'text-gray-600'
    }
  }

  const getStatusIcon = (status) => {
    const baseClasses = "h-5 w-5"

    switch (status) {
      case 'executing':
        return (
          <svg className={`${baseClasses} text-blue-600 animate-spin`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )
      case 'completed':
        return (
          <svg className={`${baseClasses} text-green-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'error':
        return (
          <svg className={`${baseClasses} text-red-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'cancelled':
        return (
          <svg className={`${baseClasses} text-yellow-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className={`${baseClasses} text-gray-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        )
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'idle':
        return 'Ready'
      case 'executing':
        return 'Executing'
      case 'completed':
        return 'Completed'
      case 'error':
        return 'Error'
      case 'cancelled':
        return 'Cancelled'
      default:
        return 'Unknown'
    }
  }

  const progressPercentage = maxIterations > 0 ? (currentIteration / maxIterations) * 100 : 0
  const stepsProgressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  if (executionStatus === 'idle') {
    return (
      <div className="card">
        <div className="text-center py-6">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Tool Execution Monitor</h3>
          <p className="mt-1 text-sm text-gray-500">
            Enable tool execution and run a test to monitor progress here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Execution Monitor</h3>
        <div className="flex items-center space-x-2">
          {getStatusIcon(executionStatus)}
          <span className={`text-sm font-medium ${getStatusColor(executionStatus)}`}>
            {getStatusText(executionStatus)}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Iteration Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Iteration Progress</span>
            <span className="text-sm text-gray-500">
              {currentIteration} of {maxIterations}
            </span>
          </div>
          <ProgressBar
            progress={progressPercentage}
            status={executionStatus === 'executing' ? 'in-progress' :
                   executionStatus === 'completed' ? 'completed' :
                   executionStatus === 'error' ? 'error' : 'idle'}
            color="primary"
            showPercentage={false}
          />
          <div className="mt-1 text-xs text-gray-500">
            {executionStatus === 'executing' && currentIteration < maxIterations &&
              `Processing iteration ${currentIteration}...`}
            {executionStatus === 'completed' && 'All iterations completed'}
            {executionStatus === 'error' && 'Execution stopped due to error'}
            {executionStatus === 'cancelled' && 'Execution cancelled by user'}
          </div>
        </div>

        {/* Steps Progress */}
        {totalSteps > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Step Progress</span>
              <span className="text-sm text-gray-500">
                {completedSteps} of {totalSteps} steps
              </span>
            </div>
            <ProgressBar
              progress={stepsProgressPercentage}
              status={executionStatus === 'executing' ? 'in-progress' :
                     executionStatus === 'completed' ? 'completed' :
                     executionStatus === 'error' ? 'error' : 'idle'}
              color="secondary"
              showPercentage={false}
            />
          </div>
        )}

        {/* Execution Time */}
        {(executionStatus === 'executing' || elapsedTime > 0) && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Elapsed Time</span>
            <span className="text-sm text-gray-900 font-mono">
              {formatElapsedTime(elapsedTime)}
            </span>
          </div>
        )}

        {/* Active Tools */}
        {activeTools.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Active Tools</h4>
            <div className="space-y-2">
              {activeTools.map((tool, index) => (
                <div key={index} className="flex items-center space-x-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <span className="text-sm text-blue-800 font-medium">{tool}</span>
                  <span className="text-xs text-blue-600">executing...</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status Messages */}
        {executionStatus === 'executing' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <svg className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-blue-800">Execution in Progress</h4>
                <p className="text-xs text-blue-700 mt-1">
                  The LLM is processing your request and executing tools. This may take several minutes depending on the complexity of the task.
                </p>
              </div>
            </div>
          </div>
        )}

        {executionStatus === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <svg className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-green-800">Execution Completed</h4>
                <p className="text-xs text-green-700 mt-1">
                  Tool execution finished successfully. Check the workflow timeline and results below.
                </p>
              </div>
            </div>
          </div>
        )}

        {executionStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <svg className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-red-800">Execution Error</h4>
                <p className="text-xs text-red-700 mt-1">
                  Tool execution encountered an error. Check the workflow timeline for details and error information.
                </p>
              </div>
            </div>
          </div>
        )}

        {executionStatus === 'cancelled' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <svg className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-yellow-800">Execution Cancelled</h4>
                <p className="text-xs text-yellow-700 mt-1">
                  Tool execution was cancelled by user request. Partial results may be available in the workflow timeline.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Button */}
        {executionStatus === 'executing' && onCancel && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={onCancel}
              className="w-full px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-300 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-200"
            >
              Cancel Execution
            </button>
            <p className="mt-2 text-xs text-gray-500 text-center">
              Cancelling will stop the execution and preserve partial results
            </p>
          </div>
        )}

        {/* Execution Summary */}
        {(executionStatus === 'completed' || executionStatus === 'error' || executionStatus === 'cancelled') && (
          <div className="pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Final Status:</span>
                <span className={`ml-2 capitalize ${getStatusColor(executionStatus)}`}>
                  {getStatusText(executionStatus)}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Total Time:</span>
                <span className="ml-2 text-gray-900 font-mono">
                  {formatElapsedTime(elapsedTime)}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Iterations:</span>
                <span className="ml-2 text-gray-900">
                  {currentIteration} / {maxIterations}
                </span>
              </div>
              {totalSteps > 0 && (
                <div>
                  <span className="font-medium text-gray-700">Steps:</span>
                  <span className="ml-2 text-gray-900">
                    {completedSteps} / {totalSteps}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

ToolExecutionMonitor.propTypes = {
  currentIteration: PropTypes.number.isRequired,
  maxIterations: PropTypes.number.isRequired,
  activeTools: PropTypes.arrayOf(PropTypes.string),
  executionStatus: PropTypes.oneOf(['idle', 'executing', 'completed', 'error', 'cancelled']).isRequired,
  onCancel: PropTypes.func,
  executionStartTime: PropTypes.string,
  totalSteps: PropTypes.number,
  completedSteps: PropTypes.number
}

export default ToolExecutionMonitor