import React, { useState } from 'react'
import PropTypes from 'prop-types'
import LoadingSpinner from './LoadingSpinner'

const ImageVerificationResults = ({ results, isLoading, error }) => {
  const [expandedSections, setExpandedSections] = useState({})

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }))
  }

  const getVerificationIcon = (status) => {
    switch (status) {
      case 'accept':
        return (
          <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case 'reject':
        return (
          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'accept': return 'text-green-600'
      case 'warning': return 'text-yellow-600'
      case 'reject': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusBgColor = (status) => {
    switch (status) {
      case 'accept': return 'bg-green-50 border-green-200'
      case 'warning': return 'bg-yellow-50 border-yellow-200'
      case 'reject': return 'bg-red-50 border-red-200'
      default: return 'bg-gray-50 border-gray-200'
    }
  }

  const formatConfidence = (confidence) => {
    if (typeof confidence !== 'number') return 'N/A'
    return `${Math.round(confidence)}%`
  }

  const renderVerificationCard = (title, result, sectionKey) => {
    if (!result) return null

    const isExpanded = expandedSections[sectionKey]

    return (
      <div className={`border rounded-lg p-4 ${getStatusBgColor(result.recommendation)}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <div className="flex-shrink-0 mt-0.5">
              {getVerificationIcon(result.recommendation)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900">{title}</h4>
                <div className="flex items-center space-x-2">
                  {result.confidence !== undefined && (
                    <span className="text-xs text-gray-500">
                      {formatConfidence(result.confidence)} confidence
                    </span>
                  )}
                  <button
                    onClick={() => toggleSection(sectionKey)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    {isExpanded ? 'Less' : 'More'}
                  </button>
                </div>
              </div>

              <div className={`mt-1 text-sm ${getStatusColor(result.recommendation)} font-medium`}>
                {result.recommendation === 'accept' ? '✓ Approved' :
                 result.recommendation === 'warning' ? '⚠ Warning' :
                 result.recommendation === 'reject' ? '✗ Rejected' :
                 'Unknown Status'}
              </div>

              {result.analysis && (
                <p className="mt-2 text-sm text-gray-700">{result.analysis}</p>
              )}

              {/* Expandable Details */}
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  {/* Detailed Findings */}
                  {result.findings && Array.isArray(result.findings) && result.findings.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 mb-1">Findings:</h5>
                      <ul className="text-xs text-gray-600 space-y-1">
                        {result.findings.map((finding, index) => (
                          <li key={index} className="flex items-start space-x-1">
                            <span className="text-gray-400 mt-0.5">•</span>
                            <span>{finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Safety Issues */}
                  {result.safetyIssues && Array.isArray(result.safetyIssues) && result.safetyIssues.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 mb-1">Safety Issues:</h5>
                      <ul className="text-xs text-red-600 space-y-1">
                        {result.safetyIssues.map((issue, index) => (
                          <li key={index} className="flex items-start space-x-1">
                            <span className="text-red-400 mt-0.5">⚠</span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Quality Score Breakdown */}
                  {result.qualityScore !== undefined && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 mb-1">
                        Quality Score: {result.qualityScore}/100
                      </h5>
                      {result.breakdown && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(result.breakdown).map(([category, score]) => (
                            <div key={category} className="flex justify-between">
                              <span className="text-gray-600 capitalize">{category}:</span>
                              <span className="text-gray-900 font-medium">{score}/25</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Raw Response (for debugging) */}
                  {result.rawResponse && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                        Raw Response
                      </summary>
                      <pre className="mt-1 p-2 bg-white border rounded text-xs overflow-x-auto">
                        {JSON.stringify(result.rawResponse, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Verification Results</h3>
        </div>
        <div className="card-body">
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="md" text="Running verification checks..." />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Verification Results</h3>
        </div>
        <div className="card-body">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Verification Failed</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Verification Results</h3>
        </div>
        <div className="card-body">
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">
              Verification results will appear here after image generation
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Use summary data from the service or calculate fallback
  const summary = results.summary || {}
  const verificationTypes = ['contentSafety', 'promptAdherence', 'imageQuality']
  const completedVerifications = verificationTypes.filter(type => results.results?.[type])

  // Use summary data if available, otherwise calculate
  const overallStatus = summary.overallRecommendation ||
    (summary.hasRejections ? 'reject' :
     summary.hasWarnings ? 'warning' : 'accept')
  const overallIcon = getVerificationIcon(overallStatus)
  const overallColor = getStatusColor(overallStatus)

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Verification Results</h3>
          <div className="flex items-center space-x-2">
            {overallIcon}
            <span className={`text-sm font-medium ${overallColor}`}>
              {overallStatus === 'accept' ? 'All Checks Passed' :
               overallStatus === 'warning' ? 'Warnings Found' :
               'Issues Detected'}
            </span>
          </div>
        </div>
      </div>

      <div className="card-body space-y-4">
        {/* Overall Summary */}
        <div className={`rounded-lg p-3 ${getStatusBgColor(overallStatus)}`}>
          <div className="flex items-center space-x-2">
            {overallIcon}
            <div>
              <p className={`text-sm font-medium ${overallColor}`}>
                {overallStatus === 'accept' ? 'Image passed all verification checks' :
                 overallStatus === 'warning' ? 'Image passed with warnings' :
                 'Image failed verification checks'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {summary.successfulVerifications || completedVerifications.length} of {summary.totalVerifications || verificationTypes.length} checks completed
              </p>
              {summary.message && (
                <p className="text-xs text-gray-600 mt-1">{summary.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Individual Verification Results */}
        <div className="space-y-3">
          {results.results?.contentSafety && renderVerificationCard(
            'Content Safety',
            results.results.contentSafety,
            'contentSafety'
          )}

          {results.results?.promptAdherence && renderVerificationCard(
            'Prompt Adherence',
            results.results.promptAdherence,
            'promptAdherence'
          )}

          {results.results?.imageQuality && renderVerificationCard(
            'Image Quality',
            results.results.imageQuality,
            'imageQuality'
          )}
        </div>

        {/* Verification Progress */}
        {(summary.successfulVerifications || completedVerifications.length) < (summary.totalVerifications || verificationTypes.length) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <LoadingSpinner size="sm" inline />
              <div>
                <p className="text-sm text-blue-800">
                  Verification in progress...
                </p>
                <p className="text-xs text-blue-600">
                  {summary.successfulVerifications || completedVerifications.length} of {summary.totalVerifications || verificationTypes.length} checks completed
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Verification Metadata */}
        {results.metadata && (
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer hover:text-gray-700">
              Verification Metadata
            </summary>
            <div className="mt-2 space-y-1">
              {results.metadata.startTime && (
                <div>Started: {new Date(results.metadata.startTime).toLocaleString()}</div>
              )}
              {results.metadata.endTime && (
                <div>Completed: {new Date(results.metadata.endTime).toLocaleString()}</div>
              )}
              {results.metadata.totalTime && (
                <div>Total time: {Math.round(results.metadata.totalTime)}ms</div>
              )}
              {results.metadata.modelUsed && (
                <div>Verification model: {results.metadata.modelUsed}</div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

ImageVerificationResults.propTypes = {
  results: PropTypes.shape({
    contentSafety: PropTypes.shape({
      recommendation: PropTypes.oneOf(['accept', 'warning', 'reject']).isRequired,
      confidence: PropTypes.number,
      analysis: PropTypes.string,
      safetyIssues: PropTypes.arrayOf(PropTypes.string),
      rawResponse: PropTypes.object
    }),
    promptAdherence: PropTypes.shape({
      recommendation: PropTypes.oneOf(['accept', 'warning', 'reject']).isRequired,
      confidence: PropTypes.number,
      analysis: PropTypes.string,
      findings: PropTypes.arrayOf(PropTypes.string),
      rawResponse: PropTypes.object
    }),
    imageQuality: PropTypes.shape({
      recommendation: PropTypes.oneOf(['accept', 'warning', 'reject']).isRequired,
      confidence: PropTypes.number,
      analysis: PropTypes.string,
      qualityScore: PropTypes.number,
      breakdown: PropTypes.shape({
        technical: PropTypes.number,
        composition: PropTypes.number,
        detail: PropTypes.number,
        aesthetics: PropTypes.number
      }),
      rawResponse: PropTypes.object
    }),
    metadata: PropTypes.shape({
      startTime: PropTypes.string,
      endTime: PropTypes.string,
      totalTime: PropTypes.number,
      modelUsed: PropTypes.string
    })
  }),
  isLoading: PropTypes.bool,
  error: PropTypes.string
}

ImageVerificationResults.defaultProps = {
  results: null,
  isLoading: false,
  error: null
}

export default ImageVerificationResults