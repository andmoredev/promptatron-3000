import React from 'react'
import PropTypes from 'prop-types'

/**
 * ProgressBar component for showing progress during operations
 * @param {Object} props - Component props
 * @param {number} props.progress - Progress percentage (0-100)
 * @param {string} props.status - Current status text
 * @param {boolean} props.indeterminate - Whether progress is indeterminate
 * @param {string} props.color - Color theme (primary, success, warning, error)
 */
function ProgressBar({ progress = 0, status, indeterminate = false, color = 'primary' }) {
  const colorClasses = {
    primary: 'bg-primary-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600'
  }

  const backgroundClasses = {
    primary: 'bg-primary-100',
    success: 'bg-green-100',
    warning: 'bg-yellow-100',
    error: 'bg-red-100'
  }

  return (
    <div className="w-full">
      {status && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">{status}</span>
          {!indeterminate && (
            <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
          )}
        </div>
      )}

      <div className={`w-full h-2 rounded-full ${backgroundClasses[color]}`}>
        <div
          className={`h-2 rounded-full transition-all duration-300 ease-out ${colorClasses[color]} ${
            indeterminate ? 'animate-pulse' : ''
          }`}
          style={{
            width: indeterminate ? '100%' : `${Math.min(100, Math.max(0, progress))}%`
          }}
        />
      </div>
    </div>
  )
}

ProgressBar.propTypes = {
  progress: PropTypes.number,
  status: PropTypes.string,
  indeterminate: PropTypes.bool,
  color: PropTypes.oneOf(['primary', 'success', 'warning', 'error'])
}

export default ProgressBar