import { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Component to display guardrail service degradation status and recovery options
 */
const GuardrailDegradationIndicator = ({
  degradationStatus,
  onAttemptRecovery,
  onDismiss,
  className = ''
}) => {
  const [isRecovering, setIsRecovering] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!degradationStatus || !degradationStatus.isDegraded) {
    return null;
  }

  const handleRecoveryAttempt = async () => {
    if (!onAttemptRecovery) return;

    setIsRecovering(true);
    try {
      await onAttemptRecovery();
    } finally {
      setIsRecovering(false);
    }
  };

  const getSeverityColor = () => {
    const reason = degradationStatus.reason;

    if (reason === 'GUARDRAIL_CREDENTIALS' || reason === 'GUARDRAIL_PERMISSIONS') {
      return 'red'; // High severity
    } else if (reason === 'GUARDRAIL_THROTTLING' || reason === 'GUARDRAIL_SERVICE_ERROR') {
      return 'yellow'; // Medium severity
    } else {
      return 'blue'; // Info/low severity
    }
  };

  const color = getSeverityColor();
  const canRecover = degradationStatus.canRecover;

  return (
    <div className={`bg-${color}-50 border border-${color}-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className={`h-5 w-5 text-${color}-400`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-medium text-${color}-800`}>
              Guardrails Running in Degraded Mode
            </h3>

            <div className="flex items-center space-x-2">
              {canRecover && (
                <button
                  onClick={handleRecoveryAttempt}
                  disabled={isRecovering}
                  className={`text-xs px-2 py-1 rounded text-${color}-700 bg-${color}-100 hover:bg-${color}-200 disabled:opacity-50 transition-colors duration-200`}
                >
                  {isRecovering ? 'Recovering...' : 'Try Recovery'}
                </button>
              )}

              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`text-${color}-400 hover:text-${color}-600 transition-colors duration-200`}
              >
                <svg
                  className={`h-4 w-4 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className={`text-${color}-400 hover:text-${color}-600 transition-colors duration-200`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className={`mt-2 text-sm text-${color}-700`}>
            <p>
              Core functionality continues to work, but guardrail features are temporarily unavailable.
              {canRecover && ' You can try to recover the service.'}
            </p>
          </div>

          {isExpanded && (
            <div className={`mt-3 p-3 bg-${color}-100 rounded-md`}>
              <div className="space-y-2">
                <div>
                  <span className={`text-xs font-medium text-${color}-800`}>Reason:</span>
                  <span className={`text-xs text-${color}-700 ml-2`}>
                    {degradationStatus.reason?.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>

                {degradationStatus.timestamp && (
                  <div>
                    <span className={`text-xs font-medium text-${color}-800`}>Since:</span>
                    <span className={`text-xs text-${color}-700 ml-2`}>
                      {new Date(degradationStatus.timestamp).toLocaleString()}
                    </span>
                  </div>
                )}

                {degradationStatus.context && (
                  <div>
                    <span className={`text-xs font-medium text-${color}-800`}>Details:</span>
                    <div className={`text-xs text-${color}-700 ml-2 mt-1`}>
                      {degradationStatus.context.originalError && (
                        <div>Error: {degradationStatus.context.originalError}</div>
                      )}
                      {degradationStatus.context.operationName && (
                        <div>Operation: {degradationStatus.context.operationName}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

GuardrailDegradationIndicator.propTypes = {
  degradationStatus: PropTypes.shape({
    isDegraded: PropTypes.bool.isRequired,
    reason: PropTypes.string,
    context: PropTypes.object,
    timestamp: PropTypes.string,
    canRecover: PropTypes.bool
  }),
  onAttemptRecovery: PropTypes.func,
  onDismiss: PropTypes.func,
  className: PropTypes.string
};

export default GuardrailDegradationIndicator;
