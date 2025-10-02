import { useState, useMemo, useEffect } from 'react'
import PropTypes from 'prop-types'

const WorkflowTimeline = ({
  workflow = [],
  isExecuting = false,
  onStepExpand,
  onCopyStep
}) => {
  const [expandedSteps, setExpandedSteps] = useState(new Set())
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(true)
  const [collapsedIterations, setCollapsedIterations] = useState(new Set())

  const toggleStepExpansion = (stepId) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId)
    } else {
      newExpanded.add(stepId)
    }
    setExpandedSteps(newExpanded)
    onStepExpand?.(stepId)
  }

  const toggleTimelineCollapse = () => {
    setIsTimelineCollapsed(!isTimelineCollapsed)
  }

  const toggleIterationCollapse = (iteration) => {
    const newCollapsed = new Set(collapsedIterations)
    if (newCollapsed.has(iteration)) {
      newCollapsed.delete(iteration)
    } else {
      newCollapsed.add(iteration)
    }
    setCollapsedIterations(newCollapsed)
  }

  // Group workflow steps by iteration
  const workflowByIteration = useMemo(() => {
    const grouped = {}
    workflow.forEach(step => {
      const iteration = step.iteration || 0
      if (!grouped[iteration]) {
        grouped[iteration] = []
      }
      grouped[iteration].push(step)
    })
    return grouped
  }, [workflow])

  // Initialize all iterations as collapsed when workflow changes
  useEffect(() => {
    if (workflow.length > 0) {
      const allIterations = new Set(Object.keys(workflowByIteration).map(k => parseInt(k)))
      setCollapsedIterations(allIterations)
    }
  }, [workflowByIteration, workflow.length])

  // Get iteration statistics
  const getIterationStats = (steps) => {
    const stats = {
      totalSteps: steps.length,
      completedSteps: steps.filter(s => s.status === 'completed').length,
      errorSteps: steps.filter(s => s.status === 'error').length,
      toolCalls: steps.filter(s => s.type === 'tool_call').length,
      duration: null
    }

    // Calculate total duration if available
    const firstStep = steps[0]
    const lastStep = steps[steps.length - 1]
    if (firstStep && lastStep && firstStep.timestamp && lastStep.timestamp) {
      const startTime = new Date(firstStep.timestamp).getTime()
      const endTime = new Date(lastStep.timestamp).getTime()
      stats.duration = endTime - startTime
    }

    return stats
  }

  const copyStepContent = async (step) => {
    try {
      let contentToCopy = ''

      switch (step.type) {
        case 'llm_request':
          contentToCopy = `LLM Request (${step.timestamp})\n`
          if (step.content.messages) {
            contentToCopy += step.content.messages.map(msg =>
              `${msg.role}: ${msg.content?.[0]?.text || JSON.stringify(msg.content)}`
            ).join('\n')
          }
          break
        case 'llm_response':
          contentToCopy = `LLM Response (${step.timestamp})\n${step.content.response || ''}`
          if (step.content.toolCalls?.length > 0) {
            contentToCopy += '\n\nTool Calls:\n' + step.content.toolCalls.map(call =>
              `- ${call.name}: ${JSON.stringify(call.input, null, 2)}`
            ).join('\n')
          }
          break
        case 'tool_call':
          contentToCopy = `Tool Call: ${step.content.toolName} (${step.timestamp})\nParameters: ${JSON.stringify(step.content.parameters, null, 2)}`
          break
        case 'tool_result':
          contentToCopy = `Tool Result (${step.timestamp})\nSuccess: ${step.content.success}\nResult: ${JSON.stringify(step.content.result, null, 2)}`
          break
        case 'error':
          contentToCopy = `Error (${step.timestamp})\nType: ${step.content.errorType}\nMessage: ${step.content.error}`
          break
        default:
          contentToCopy = `${step.type} (${step.timestamp})\n${JSON.stringify(step.content, null, 2)}`
      }

      await navigator.clipboard.writeText(contentToCopy)
      onCopyStep?.(step.id)
    } catch (err) {
      console.error('Failed to copy step content:', err)
    }
  }

  const getStepIcon = (step) => {
    const baseClasses = "h-5 w-5 flex-shrink-0"

    switch (step.type) {
      case 'llm_request':
        return (
          <svg className={`${baseClasses} text-blue-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )
      case 'llm_response':
        return (
          <svg className={`${baseClasses} text-green-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        )
      case 'tool_call':
        return (
          <svg className={`${baseClasses} text-purple-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )
      case 'tool_result':
        return (
          <svg className={`${baseClasses} ${step.content.success ? 'text-green-600' : 'text-red-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {step.content.success ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
        )
      case 'error':
        return (
          <svg className={`${baseClasses} text-red-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className={`${baseClasses} text-gray-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getStepTitle = (step) => {
    switch (step.type) {
      case 'llm_request':
        return `LLM Request (Iteration ${step.iteration})`
      case 'llm_response':
        return `LLM Response (Iteration ${step.iteration})`
      case 'tool_call':
        return `Tool Call: ${step.content.toolName}`
      case 'tool_result':
        return `Tool Result: ${step.content.success ? 'Success' : 'Failed'}`
      case 'error':
        return `Error: ${step.content.errorType || 'Unknown'}`
      default:
        return step.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
  }

  const getStepDescription = (step) => {
    switch (step.type) {
      case 'llm_request':
        return `Sending request to model with ${step.content.messages?.length || 0} messages`
      case 'llm_response':
        const toolCallCount = step.content.toolCalls?.length || 0
        return toolCallCount > 0
          ? `Response received with ${toolCallCount} tool call${toolCallCount !== 1 ? 's' : ''}`
          : 'Response received'
      case 'tool_call':
        return `Executing ${step.content.toolName} with parameters`
      case 'tool_result':
        return step.content.success
          ? 'Tool executed successfully'
          : `Tool execution failed: ${step.content.error || 'Unknown error'}`
      case 'error':
        return step.content.error || 'An error occurred'
      default:
        return 'Processing step'
    }
  }

  const formatTimestamp = (timestamp) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      })
    } catch {
      return timestamp
    }
  }

  const formatDuration = (duration) => {
    if (!duration) return null
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(2)}s`
  }

  const getStatusIndicator = (step) => {
    const baseClasses = "w-2 h-2 rounded-full flex-shrink-0"

    switch (step.status) {
      case 'pending':
        return <div className={`${baseClasses} bg-gray-300`} title="Pending" />
      case 'in_progress':
        return <div className={`${baseClasses} bg-blue-400 animate-pulse`} title="In Progress" />
      case 'completed':
        return <div className={`${baseClasses} bg-green-400`} title="Completed" />
      case 'error':
        return <div className={`${baseClasses} bg-red-400`} title="Error" />
      default:
        return <div className={`${baseClasses} bg-gray-300`} title="Unknown" />
    }
  }

  if (workflow.length === 0 && !isExecuting) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No Workflow Data</h3>
          <p className="mt-1 text-sm text-gray-500">
            Run a test with tool execution enabled to see the workflow timeline.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleTimelineCollapse}
            className="flex items-center space-x-2 text-lg font-semibold text-gray-900 hover:text-primary-600 transition-colors"
          >
            <svg
              className={`h-5 w-5 transition-transform duration-200 ${isTimelineCollapsed ? '' : 'rotate-90'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>Workflow Timeline</span>
          </button>
          {workflow.length > 0 && (
            <span className="text-sm text-gray-500">
              ({Object.keys(workflowByIteration).length} iteration{Object.keys(workflowByIteration).length !== 1 ? 's' : ''}, {workflow.length} step{workflow.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        {isExecuting && (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-blue-600 font-medium">Executing</span>
          </div>
        )}
      </div>

      {!isTimelineCollapsed && (
        <div className="space-y-6">
          {Object.entries(workflowByIteration)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([iteration, steps]) => {
              const iterationNum = parseInt(iteration)
              const isIterationCollapsed = collapsedIterations.has(iterationNum)
              const stats = getIterationStats(steps)

              return (
                <div key={iteration} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Iteration Header */}
                  <div className="bg-gray-50 border-b border-gray-200">
                    <button
                      onClick={() => toggleIterationCollapse(iterationNum)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <svg
                          className={`h-4 w-4 transition-transform duration-200 ${isIterationCollapsed ? '' : 'rotate-90'}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <h4 className="text-sm font-semibold text-gray-900">
                          Iteration {iterationNum}
                        </h4>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>{stats.totalSteps} step{stats.totalSteps !== 1 ? 's' : ''}</span>
                          {stats.toolCalls > 0 && (
                            <span className="flex items-center space-x-1">
                              <svg className="h-3 w-3 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span>{stats.toolCalls} tool{stats.toolCalls !== 1 ? 's' : ''}</span>
                            </span>
                          )}
                          {stats.duration && (
                            <span>{formatDuration(stats.duration)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {stats.errorSteps > 0 && (
                          <div className="flex items-center space-x-1 text-red-600">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-xs">{stats.errorSteps}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-1 text-green-600">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs">{stats.completedSteps}</span>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Iteration Steps */}
                  {!isIterationCollapsed && (
                    <div className="p-4 space-y-4">
                      {steps.map((step, stepIndex) => {
                        const isExpanded = expandedSteps.has(step.id)
                        const isLast = stepIndex === steps.length - 1

                        return (
                          <div key={step.id} className="relative">
                            {/* Timeline line */}
                            {!isLast && (
                              <div className="absolute left-6 top-12 w-0.5 h-8 bg-gray-200" />
                            )}

                            <div className={`flex items-start space-x-3 p-3 rounded-lg transition-colors duration-200 ${
                              step.status === 'error'
                                ? 'bg-red-50 border border-red-200'
                                : 'bg-gray-50 hover:bg-gray-100'
                            }`}>
                              {/* Step icon */}
                              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white border-2 border-gray-200">
                                {getStepIcon(step)}
                              </div>

                              {/* Step content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <h4 className="text-sm font-medium text-gray-900">
                                      {getStepTitle(step)}
                                    </h4>
                                    {getStatusIndicator(step)}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs text-gray-500">
                                      {formatTimestamp(step.timestamp)}
                                    </span>
                                    {step.duration && (
                                      <span className="text-xs text-gray-500">
                                        ({formatDuration(step.duration)})
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <p className="mt-1 text-sm text-gray-600">
                                  {getStepDescription(step)}
                                </p>

                                {/* Action buttons */}
                                <div className="mt-2 flex items-center space-x-2">
                                  <button
                                    onClick={() => toggleStepExpansion(step.id)}
                                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                                  >
                                    {isExpanded ? 'Collapse' : 'Expand'}
                                  </button>
                                  <button
                                    onClick={() => copyStepContent(step)}
                                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                                  >
                                    Copy
                                  </button>
                                </div>

                                {/* Expanded content */}
                                {isExpanded && (
                                  <div className="mt-3 p-3 bg-white border border-gray-200 rounded-md">
                                    <div className="space-y-3">
                                      {/* Step metadata */}
                                      <div className="grid grid-cols-2 gap-4 text-xs">
                                        <div>
                                          <span className="font-medium text-gray-700">ID:</span>
                                          <span className="ml-1 text-gray-600 font-mono">{step.id}</span>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-700">Status:</span>
                                          <span className={`ml-1 capitalize ${
                                            step.status === 'error' ? 'text-red-600' :
                                            step.status === 'completed' ? 'text-green-600' :
                                            'text-gray-600'
                                          }`}>
                                            {step.status.replace('_', ' ')}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Step content details */}
                                      <div>
                                        <h5 className="text-xs font-medium text-gray-700 mb-2">Content:</h5>
                                        <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded border overflow-x-auto">
                                          {JSON.stringify(step.content, null, 2)}
                                        </pre>
                                      </div>

                                      {/* Step metadata */}
                                      {step.metadata && Object.keys(step.metadata).length > 0 && (
                                        <div>
                                          <h5 className="text-xs font-medium text-gray-700 mb-2">Metadata:</h5>
                                          <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded border overflow-x-auto">
                                            {JSON.stringify(step.metadata, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {workflow.length > 0 && !isTimelineCollapsed && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{workflow.length} step{workflow.length !== 1 ? 's' : ''} total</span>
            {workflow.length > 0 && (
              <span>
                Started: {formatTimestamp(workflow[0]?.timestamp)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

WorkflowTimeline.propTypes = {
  workflow: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['llm_request', 'llm_response', 'tool_call', 'tool_result', 'error']).isRequired,
    timestamp: PropTypes.string.isRequired,
    duration: PropTypes.number,
    iteration: PropTypes.number,
    content: PropTypes.object.isRequired,
    metadata: PropTypes.object,
    status: PropTypes.oneOf(['pending', 'in_progress', 'completed', 'error']).isRequired
  })),
  isExecuting: PropTypes.bool,
  onStepExpand: PropTypes.func,
  onCopyStep: PropTypes.func
}

export default WorkflowTimeline