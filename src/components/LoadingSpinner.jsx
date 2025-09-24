import React from 'react'
import PropTypes from 'prop-types'

/**
 * LoadingSpinner component provides consistent loading indicators
 * @param {Object} props - Component props
 * @param {string} props.size - Size of spinner (sm, md, lg)
 * @param {string} props.color - Color theme (primary, white, gray)
 * @param {string} props.text - Optional loading text
 * @param {boolean} props.inline - Whether to display inline or as block
 */
function LoadingSpinner({ size = 'md', color = 'primary', text, inline = false }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }

  const colorClasses = {
    primary: 'border-primary-600',
    white: 'border-white',
    gray: 'border-gray-600'
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  const containerClass = inline ? 'inline-flex items-center' : 'flex items-center justify-center'

  return (
    <div className={containerClass} role="status" aria-live="polite">
      <svg
        className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {text && (
        <span className={`ml-2 ${textSizeClasses[size]} text-gray-600`}>
          {text}
        </span>
      )}
      {!text && <span className="sr-only">Loading...</span>}
    </div>
  )
}

LoadingSpinner.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  color: PropTypes.oneOf(['primary', 'white', 'gray']),
  text: PropTypes.string,
  inline: PropTypes.bool
}

export default LoadingSpinner
