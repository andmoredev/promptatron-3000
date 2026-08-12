export interface ProgressBarProps {
  /** Progress percentage (0-100) */
  progress?: number
  /** Current status text */
  status?: string
  /** Whether progress is indeterminate */
  indeterminate?: boolean
  /** Color theme */
  color?: 'primary' | 'success' | 'warning' | 'error'
}

/**
 * ProgressBar component for showing progress during operations
 */
function ProgressBar({ progress = 0, status, indeterminate = false, color = 'primary' }: ProgressBarProps) {
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

export default ProgressBar
