import React from 'react';
import PropTypes from 'prop-types';
import LoadingSpinner from './LoadingSpinner';

/**
 * GuardrailProgressIndicator component provides visual feedback for guardrail operations
 * @param {Object} props - Component props
 * @param {string} props.operation - Current operation being performed
 * @param {number} props.progress - Progress percentage (0-100)
 * @param {boolean} props.isLoading - Whether operation is in progress
 * @param {string} props.status - Current status message
 * @param {string} props.size - Size of the indicator (sm, md, lg)
 */
function GuardrailProgressIndicator({
  operation = 'Processing',
  progress = 0,
  isLoading = false,
  status,
  size = 'md'
}) {
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  if (!isLoading && progress === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {isLoading && <LoadingSpinner size="sm" color="primary" inline />}
          <span className={`font-medium text-gray-700 ${textSizeClasses[size]}`}>
            {operation}
          </span>
        </div>
        {progress > 0 && (
          <span className={`text-gray-500 ${textSizeClasses[size]}`}>
            {Math.round(progress)}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className={`w-full bg-gray-200 rounded-full ${sizeClasses[size]} overflow-hidden`}>
        <div
          className={`bg-primary-600 ${sizeClasses[size]} rounded-full transition-all duration-300 ease-out`}
          style={{
            width: isLoading && progress === 0 ? '100%' : `${Math.min(100, Math.max(0, progress))}%`,
            animation: isLoading && progress === 0 ? 'pulse 2s ease-in-out infinite' : 'none'
          }}
        />
      </div>

      {/* Status message */}
      {status && (
        <p className={`text-gray-600 ${textSizeClasses[size]} animate-fade-in`}>
          {status}
        </p>
      )}
    </div>
  );
}

GuardrailProgressIndicator.propTypes = {
  operation: PropTypes.string,
  progress: PropTypes.number,
  isLoading: PropTypes.bool,
  status: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg'])
};

export default GuardrailProgressIndicator;
