import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

/**
 * Progress indicator component for determinism evaluation
 * Shows detailed progress with phases, time estimates, and visual indicators
 */
function ProgressIndicator({
  status,
  progress = 0,
  currentPhase = '',
  completedRequests = 0,
  totalRequests = 30,
  startTime,
  estimatedTimeRemaining,
  showDetails = true,
  size = 'normal'
}) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [calculatedTimeRemaining, setCalculatedTimeRemaining] = useState(null)

  // Update elapsed time every second
  useEffect(() => {
    if (!startTime || status !== 'running') return

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setElapsedTime(elapsed)

      // Calculate estimated time remaining based on progress
      if (progress > 5) {
        const totalEstimated = (elapsed / (progress / 100))
        const remaining = Math.max(0, totalEstimated - elapsed)
        setCalculatedTimeRemaining(Math.floor(remaining))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime, status, progress])

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const getPhaseInfo = (phase) => {
    const phaseMap = {
      'Starting evaluation': { order: 1, color: 'blue', icon: '🚀' },
      'Initializing': { order: 1, color: 'blue', icon: '⚙️' },
      'Executing model requests': { order: 2, color: 'green', icon: '🤖' },
      'Analyzing responses': { order: 3, color: 'green', icon: '🔍' },
      'Grading responses': { order: 3, color: 'green', icon: '📊' },
      'Evaluation complete': { order: 4, color: 'green', icon: '✅' }
    }

    // Find matching phase (case insensitive, partial match)
    const normalizedPhase = phase.toLowerCase()
    for (const [key, value] of Object.entries(phaseMap)) {
      if (normalizedPhase.includes(key.toLowerCase())) {
        return value
      }
    }

    // Default for unknown phases
    return { order: 2, color: 'gray', icon: '⏳' }
  }

  const phaseInfo = getPhaseInfo(currentPhase)
  const timeRemaining = estimatedTimeRemaining || calculatedTimeRemaining

  if (size === 'compact') {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-16 bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-primary-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <span className="text-xs text-gray-600">{Math.round(progress)}%</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Main Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center text-sm">
          <span className="font-medium text-gray-700">
            {phaseInfo.icon} {currentPhase || 'Processing...'}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ease-out ${
              phaseInfo.color === 'blue' ? 'bg-primary-500' :
              phaseInfo.color === 'green' ? 'bg-secondary-700' :
              'bg-gray-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>

      {showDetails && status === 'running' && (
        <>
          {/* Time Information */}
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              Elapsed: {formatTime(elapsedTime)}
            </span>
            {timeRemaining && (
              <span>
                Remaining: ~{formatTime(timeRemaining)}
              </span>
            )}
          </div>

          {/* Phase Indicators */}
          <div className="flex items-center space-x-1">
            {[
              { name: 'Initialize', order: 1 },
              { name: 'Execute', order: 2 },
              { name: 'Analyze', order: 3 },
              { name: 'Complete', order: 4 }
            ].map((phase) => {
              const isActive = phaseInfo.order === phase.order
              const isCompleted = phaseInfo.order > phase.order
              const isUpcoming = phaseInfo.order < phase.order

              return (
                <div
                  key={phase.name}
                  className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                    isCompleted
                      ? 'bg-secondary-700'
                      : isActive
                      ? (phaseInfo.color === 'blue' ? 'bg-primary-500' :
                         phaseInfo.color === 'green' ? 'bg-secondary-700' :
                         'bg-gray-500')
                      : 'bg-gray-200'
                  }`}
                  title={`${phase.name} phase ${
                    isCompleted ? '(completed)' : isActive ? '(active)' : '(upcoming)'
                  }`}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

ProgressIndicator.propTypes = {
  status: PropTypes.oneOf(['idle', 'running', 'paused', 'completed', 'error']).isRequired,
  progress: PropTypes.number,
  currentPhase: PropTypes.string,
  completedRequests: PropTypes.number,
  totalRequests: PropTypes.number,
  startTime: PropTypes.number,
  estimatedTimeRemaining: PropTypes.number,
  showDetails: PropTypes.bool,
  size: PropTypes.oneOf(['compact', 'normal'])
}

export default ProgressIndicator
