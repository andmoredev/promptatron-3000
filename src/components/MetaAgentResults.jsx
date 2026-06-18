import { useState } from 'react';
import PropTypes from 'prop-types';
import LoadingSpinner from './LoadingSpinner';

/**
 * Component for displaying meta-agent evaluation results
 * Shows color-coded indicators, expandable details, and overall recommendations
 */
const MetaAgentResults = ({
  evaluationStatus,
  isLoading = false,
  error = null,
  onRetry = null
}) => {
  const [expandedAgents, setExpandedAgents] = useState(new Set());

  const toggleAgentExpansion = (agentType) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentType)) {
      newExpanded.delete(agentType);
    } else {
      newExpanded.add(agentType);
    }
    setExpandedAgents(newExpanded);
  };

  const getRecommendationColor = (recommendation) => {
    switch (recommendation) {
      case 'accept':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'reject':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'warning':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getRecommendationIcon = (recommendation) => {
    switch (recommendation) {
      case 'accept':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'reject':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getAgentDisplayName = (agentType) => {
    switch (agentType) {
      case 'fact-checker':
        return 'Fact Checker';
      case 'error-containment':
        return 'Error Containment';
      case 'quality-enforcer':
        return 'Quality Enforcer';
      default:
        return agentType.replaceAll('-', ' ').replaceAll(/\b\w/g, l => l.toUpperCase());
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <LoadingSpinner size="sm" color="blue" />
            <div>
              <h4 className="text-sm font-medium text-blue-800">Meta-Agent Analysis</h4>
              <p className="text-sm text-blue-600">
                {evaluationStatus?.currentPhase || 'Starting meta-agent evaluation...'}
              </p>
              {evaluationStatus?.progress !== undefined && (
                <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${evaluationStatus.progress}%` }}
                  />
                </div>
              )}
              {evaluationStatus?.completedAgents !== undefined && evaluationStatus?.totalAgents && (
                <p className="text-xs text-blue-500 mt-1">
                  {evaluationStatus.completedAgents} of {evaluationStatus.totalAgents} agents completed
                </p>
              )}
            </div>
          </div>

          {/* Cancel button for running evaluations */}
          {evaluationStatus?.status === 'running' && onRetry && (
            <button
              onClick={() => onRetry('cancel')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1 border border-blue-300 rounded hover:bg-blue-100 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800">Meta-Agent Analysis Failed</h4>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Retry Analysis
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show cancelled state
  if (evaluationStatus?.status === 'cancelled') {
    const cancellationReason = evaluationStatus.cancellationReason || 'user_requested';
    const duration = evaluationStatus.duration ? Math.round(evaluationStatus.duration / 1000) : null;

    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-yellow-800">Meta-Agent Analysis Cancelled</h4>
            <p className="text-sm text-yellow-600 mt-1">
              {evaluationStatus.currentPhase}
              {duration && ` (ran for ${duration} seconds)`}
            </p>

            {cancellationReason === 'timeout' && (
              <p className="text-xs text-yellow-600 mt-2">
                The evaluation timed out. You can try again with a shorter prompt or check your network connection.
              </p>
            )}

            {evaluationStatus.completedAgents > 0 && (
              <p className="text-xs text-yellow-600 mt-2">
                {evaluationStatus.completedAgents} of {evaluationStatus.totalAgents} agents completed before cancellation.
              </p>
            )}

            {onRetry && (
              <button
                onClick={() => onRetry('restart')}
                className="mt-2 text-sm text-yellow-600 hover:text-yellow-700 font-medium"
              >
                Restart Analysis
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show empty state if no evaluation status
  if (!evaluationStatus) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="text-center">
          <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <p className="text-sm text-gray-600">No meta-agent analysis available</p>
        </div>
      </div>
    );
  }

  const { result, agentResults = [], status } = evaluationStatus;

  return (
    <div className="space-y-4">
      {/* Overall Recommendation */}
      {result && (
        <div className={`border rounded-lg p-4 ${getRecommendationColor(result.overallRecommendation)}`}>
          <div className="flex items-start space-x-3">
            {getRecommendationIcon(result.overallRecommendation)}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">
                  Overall Recommendation: {result.overallRecommendation.toUpperCase()}
                </h4>
                <span className="text-sm font-medium">
                  {result.overallConfidence}% confidence
                </span>
              </div>
              <p className="text-sm mt-1">{result.summary}</p>

              {/* Agent Summary Stats */}
              <div className="flex items-center space-x-4 mt-2 text-xs">
                <span>
                  {result.successfulAgents}/{result.agentCount} agents completed
                </span>
                {result.recommendations && (
                  <div className="flex space-x-2">
                    {result.recommendations.accept > 0 && (
                      <span className="text-green-600">✓ {result.recommendations.accept}</span>
                    )}
                    {result.recommendations.reject > 0 && (
                      <span className="text-red-600">✗ {result.recommendations.reject}</span>
                    )}
                    {result.recommendations.warning > 0 && (
                      <span className="text-yellow-600">⚠ {result.recommendations.warning}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Degraded Service Warning */}
              {result.degraded && (result.failedAgents > 0 || result.fallbackAgents > 0) && (
                <div className="mt-3 p-2 bg-yellow-100 border border-yellow-300 rounded text-xs">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="font-medium text-yellow-800">Degraded Analysis</span>
                  </div>
                  <p className="text-yellow-700 mt-1">
                    {result.failedAgents > 0 && `${result.failedAgents} agent(s) failed`}
                    {result.failedAgents > 0 && result.fallbackAgents > 0 && ', '}
                    {result.fallbackAgents > 0 && `${result.fallbackAgents} agent(s) used fallback responses`}
                    . This recommendation may be less reliable than usual.
                  </p>

                  {/* Failure Reasons */}
                  {result.failureReasons && Object.keys(result.failureReasons).length > 0 && (
                    <div className="mt-2">
                      <span className="font-medium text-yellow-800">Failure reasons: </span>
                      {Object.entries(result.failureReasons).map(([reason, count], index) => (
                        <span key={reason} className="text-yellow-700">
                          {index > 0 && ', '}
                          {reason.replace(/_/g, ' ')} ({count})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Individual Agent Results */}
      {agentResults.length > 0 && (
        <div className="space-y-3">
          <h5 className="text-sm font-medium text-gray-700">Individual Agent Analysis:</h5>

          {agentResults.map((agentResult, index) => {
            const isExpanded = expandedAgents.has(agentResult.agentType);
            const isFailedAgent = agentResult.failed;
            const isFallbackAgent = agentResult.details?.fallback;
            const failureReason = agentResult.details?.reason;

            return (
              <div
                key={agentResult.agentType || index}
                className={`border rounded-lg ${
                  isFailedAgent || isFallbackAgent
                    ? 'bg-gray-50 border-gray-300'
                    : getRecommendationColor(agentResult.recommendation)
                }`}
              >
                <button
                  className="w-full p-3 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                  onClick={() => toggleAgentExpansion(agentResult.agentType)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {isFailedAgent || isFallbackAgent ? (
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      ) : (
                        getRecommendationIcon(agentResult.recommendation)
                      )}
                      <div>
                        <h6 className="text-sm font-medium">
                          {getAgentDisplayName(agentResult.agentType)}
                          {isFallbackAgent && (
                            <span className="ml-2 text-xs text-gray-500 font-normal">(Fallback)</span>
                          )}
                        </h6>
                        <p className="text-xs opacity-75">
                          {isFailedAgent || isFallbackAgent ? (
                            <>
                              {failureReason === 'timeout' && 'Timed out'}
                              {failureReason === 'cancelled' && 'Cancelled'}
                              {failureReason === 'network_error' && 'Network error'}
                              {failureReason === 'authentication_failed' && 'Authentication failed'}
                              {!failureReason || failureReason === 'evaluation_failed' ? 'Analysis failed' : ''}
                            </>
                          ) : (
                            `${agentResult.recommendation.toUpperCase()} • ${agentResult.confidence}% confidence`
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {agentResult.timestamp && (
                        <span className="text-xs opacity-75">
                          {formatTimestamp(agentResult.timestamp)}
                        </span>
                      )}
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-current border-opacity-20">
                    <div className="mt-3 space-y-3">
                      {/* Analysis Text */}
                      <div>
                        <h7 className="text-xs font-medium opacity-75 uppercase tracking-wide">Analysis</h7>
                        <p className="text-sm mt-1 leading-relaxed">
                          {agentResult.analysis}
                        </p>
                      </div>

                      {/* Agent-Specific Details */}
                      {agentResult.details && Object.keys(agentResult.details).length > 0 && (
                        <div>
                          <h7 className="text-xs font-medium opacity-75 uppercase tracking-wide">Details</h7>
                          <div className="mt-1 space-y-2">

                            {/* Fact Checker Details */}
                            {agentResult.agentType === 'fact-checker' && agentResult.details.findings && (
                              <div>
                                <h8 className="text-xs font-medium">Findings:</h8>
                                <ul className="text-sm mt-1 space-y-1">
                                  {agentResult.details.findings.map((finding, idx) => (
                                    <li key={`finding-${agentResult.agentType}-${idx}`} className="flex items-start space-x-2">
                                      <span className="text-xs mt-1">•</span>
                                      <span>{finding}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Error Containment Details */}
                            {agentResult.agentType === 'error-containment' && agentResult.details.safetyIssues && (
                              <div>
                                <h8 className="text-xs font-medium">Safety Issues:</h8>
                                <ul className="text-sm mt-1 space-y-1">
                                  {agentResult.details.safetyIssues.map((issue, idx) => (
                                    <li key={`safety-${agentResult.agentType}-${idx}`} className="flex items-start space-x-2">
                                      <span className="text-xs mt-1">⚠</span>
                                      <span>{issue}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Quality Enforcer Details */}
                            {agentResult.agentType === 'quality-enforcer' && agentResult.details.qualityScore && (
                              <div>
                                <div className="flex items-center justify-between">
                                  <h8 className="text-xs font-medium">Quality Score:</h8>
                                  <span className="text-sm font-medium">{agentResult.details.qualityScore}/100</span>
                                </div>
                                {agentResult.details.breakdown && (
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div className="flex justify-between">
                                      <span>Reasoning:</span>
                                      <span>{agentResult.details.breakdown.reasoning}/25</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Completeness:</span>
                                      <span>{agentResult.details.breakdown.completeness}/25</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Tool Usage:</span>
                                      <span>{agentResult.details.breakdown.toolUsage}/25</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Communication:</span>
                                      <span>{agentResult.details.breakdown.communication}/25</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Error Details for Failed Agents */}
                            {agentResult.details.error && (
                              <div>
                                <h8 className="text-xs font-medium text-red-600">Error:</h8>
                                <p className="text-sm mt-1 text-red-600">{agentResult.details.error}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Model Information */}
                      {agentResult.modelId && (
                        <div className="text-xs opacity-60">
                          Model: {agentResult.modelId}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Status Information */}
      {status && status !== 'completed' && (
        <div className="text-xs text-gray-500 text-center">
          Status: {status} • {evaluationStatus.currentPhase}
        </div>
      )}
    </div>
  );
};

MetaAgentResults.propTypes = {
  evaluationStatus: PropTypes.shape({
    id: PropTypes.string,
    status: PropTypes.oneOf(['running', 'completed', 'error', 'cancelled']),
    progress: PropTypes.number,
    currentPhase: PropTypes.string,
    completedAgents: PropTypes.number,
    totalAgents: PropTypes.number,
    cancellationReason: PropTypes.string,
    duration: PropTypes.number,
    agentResults: PropTypes.arrayOf(PropTypes.shape({
      agentType: PropTypes.string.isRequired,
      recommendation: PropTypes.oneOf(['accept', 'reject', 'warning']).isRequired,
      confidence: PropTypes.number.isRequired,
      analysis: PropTypes.string.isRequired,
      details: PropTypes.object,
      timestamp: PropTypes.string,
      modelId: PropTypes.string,
      failed: PropTypes.bool
    })),
    result: PropTypes.shape({
      overallRecommendation: PropTypes.oneOf(['accept', 'reject', 'warning']).isRequired,
      overallConfidence: PropTypes.number.isRequired,
      summary: PropTypes.string.isRequired,
      agentCount: PropTypes.number,
      successfulAgents: PropTypes.number,
      failedAgents: PropTypes.number,
      fallbackAgents: PropTypes.number,
      degraded: PropTypes.bool,
      failureReasons: PropTypes.object,
      recommendations: PropTypes.shape({
        accept: PropTypes.number,
        reject: PropTypes.number,
        warning: PropTypes.number
      })
    })
  }),
  isLoading: PropTypes.bool,
  error: PropTypes.string,
  onRetry: PropTypes.func
};

export default MetaAgentResults;