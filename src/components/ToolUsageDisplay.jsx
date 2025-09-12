import { useState } from 'react'
import PropTypes from 'prop-types'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

const ToolUsageDisplay = ({ toolUsage }) => {
  const [expandedTools, setExpandedTools] = useState(new Set())
  const [showErrors, setShowErrors] = useState(false)

  // Handle case where no tool usage data is provided
  if (!toolUsage) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-sm text-gray-600">No tools used</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          The model completed its analysis without attempting to use any tools.
        </p>
      </div>
    )
  }

  // Handle case where tool usage exists but no tools were called
  if (!toolUsage.hasToolUsage || !toolUsage.toolCalls || toolUsage.toolCalls.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-sm text-gray-600">No tools used</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Tools were available ({toolUsage.availableTools?.join(', ') || 'unknown'}), but the model chose not to use them.
        </p>
      </div>
    )
  }

  const toggleToolExpansion = (toolIndex) => {
    const newExpanded = new Set(expandedTools)
    if (newExpanded.has(toolIndex)) {
      newExpanded.delete(toolIndex)
    } else {
      newExpanded.add(toolIndex)
    }
    setExpandedTools(newExpanded)
  }

  const formatToolInput = (input) => {
    if (typeof input === 'object') {
      return JSON.stringify(input, null, 2)
    }
    return String(input)
  }

  const renderErrorSection = () => {
    const hasErrors = toolUsage.extractionErrors && toolUsage.extractionErrors.length > 0
    const hasWarnings = toolUsage.extractionWarnings && toolUsage.extractionWarnings.length > 0

    if (!hasErrors && !hasWarnings) {
      return null
    }

    const errorCount = hasErrors ? toolUsage.extractionErrors.length : 0
    const warningCount = hasWarnings ? toolUsage.extractionWarnings.length : 0

    return (
      <div className="mt-3">
        <button
          onClick={() => setShowErrors(!showErrors)}
          className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
        >
          <svg className={`h-4 w-4 transition-transform ${showErrors ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>
            {errorCount > 0 && `${errorCount} error${errorCount !== 1 ? 's' : ''}`}
            {errorCount > 0 && warningCount > 0 && ', '}
            {warningCount > 0 && `${warningCount} warning${warningCount !== 1 ? 's' : ''}`}
          </span>
        </button>

        {showErrors && (
          <div className="mt-2 space-y-2">
            {/* Errors */}
            {hasErrors && toolUsage.extractionErrors.map((error, index) => (
              <div key={`error-${index}`} className="bg-red-50 border border-red-200 rounded p-3">
                <div className="flex items-start space-x-2">
                  <svg className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-red-800">
                      {error.userMessage || error.message}
                    </p>
                    {error.type && (
                      <p className="text-xs text-red-600 mt-1">
                        Type: {error.type.replace(/_/g, ' ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Warnings */}
            {hasWarnings && toolUsage.extractionWarnings.map((warning, index) => (
              <div key={`warning-${index}`} className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <div className="flex items-start space-x-2">
                  <svg className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-yellow-800">
                      {warning.userMessage || warning.message}
                    </p>
                    {warning.type && (
                      <p className="text-xs text-yellow-600 mt-1">
                        Type: {warning.type.replace(/_/g, ' ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const getToolCallStatusIcon = (toolCall) => {
    if (toolCall.extractionSuccess === false) {
      return (
        <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }

    if (toolCall.wasToolAvailable === false) {
      return (
        <svg className="h-4 w-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      )
    }

    if (toolCall.parameterValidation && !toolCall.parameterValidation.isValid) {
      return (
        <svg className="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      )
    }

    return (
      <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }

  const getToolCallStatusMessage = (toolCall) => {
    if (toolCall.extractionSuccess === false) {
      return 'Failed to extract tool call data'
    }

    if (toolCall.wasToolAvailable === false) {
      return 'Tool was not available to model'
    }

    if (toolCall.parameterValidation && !toolCall.parameterValidation.isValid) {
      return 'Invalid parameters provided'
    }

    return 'Tool call attempted (not executed)'
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {toolUsage.toolCalls.map((toolCall, index) => {
          const isExpanded = expandedTools.has(index)
          const hasIssues = toolCall.extractionSuccess === false ||
                           toolCall.wasToolAvailable === false ||
                           (toolCall.parameterValidation && !toolCall.parameterValidation.isValid)

          const borderColor = hasIssues ?
            (toolCall.extractionSuccess === false ? 'border-red-200' : 'border-yellow-200') :
            'border-orange-200'
          const bgColor = hasIssues ?
            (toolCall.extractionSuccess === false ? 'bg-red-50' : 'bg-yellow-50') :
            'bg-orange-50'

          return (
            <div key={index} className={`${bgColor} border ${borderColor} rounded-lg overflow-hidden`}>
              {/* Tool header */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium text-orange-900">
                          {toolCall.toolName}
                        </h4>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleToolExpansion(index)}
                      className="text-xs text-orange-600 hover:text-orange-800 font-medium"
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                </div>

                {/* Parameter validation errors */}
                {toolCall.parameterValidation && !toolCall.parameterValidation.isValid && (
                  <div className="mt-3 p-2 bg-yellow-100 border border-yellow-300 rounded">
                    <p className="text-xs font-medium text-yellow-800">Parameter Validation Issues:</p>
                    <ul className="text-xs text-yellow-700 mt-1 list-disc list-inside">
                      {toolCall.parameterValidation.errors.map((error, errorIndex) => (
                        <li key={errorIndex}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Extraction error */}
                {toolCall.extractionError && (
                  <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded">
                    <p className="text-xs font-medium text-red-800">Extraction Error:</p>
                    <p className="text-xs text-red-700 mt-1">{toolCall.extractionError}</p>
                  </div>
                )}
              </div>

              {/* Expanded parameter details - only show when expanded */}
              {isExpanded && (
                <div className="border-t border-orange-200 bg-white">
                  <div className="p-4">
                    <h5 className="text-xs font-medium text-gray-700 mb-3">Parameters:</h5>
                    <div className="bg-gray-50 border border-gray-200 rounded overflow-hidden">
                      <SyntaxHighlighter
                        language="json"
                        style={oneLight}
                        customStyle={{
                          margin: 0,
                          fontSize: '12px',
                          lineHeight: '1.4',
                          background: 'transparent'
                        }}
                      >
                        {formatToolInput(toolCall.input)}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Error and warning section */}
      {renderErrorSection()}

      {/* Graceful degradation notice */}
      {toolUsage.gracefulDegradation && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <svg className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-xs font-medium text-gray-700">Partial Tool Detection</p>
              <p className="text-xs text-gray-600 mt-1">
                Some tool usage data may be incomplete due to processing issues. The analysis has continued with available information.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

ToolUsageDisplay.propTypes = {
  toolUsage: PropTypes.shape({
    hasToolUsage: PropTypes.bool,
    toolCalls: PropTypes.arrayOf(PropTypes.shape({
      toolName: PropTypes.string.isRequired,
      toolUseId: PropTypes.string.isRequired,
      input: PropTypes.oneOfType([PropTypes.object, PropTypes.string]).isRequired,
      attempted: PropTypes.bool,
      timestamp: PropTypes.string.isRequired
    })),
    toolCallCount: PropTypes.number,
    availableTools: PropTypes.arrayOf(PropTypes.string)
  })
}

export default ToolUsageDisplay
