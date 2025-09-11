import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

const StreamingOutput = ({
  content,
  isStreaming,
  isComplete,
  onCopy,
  streamingProgress,
  className = '',
  performanceMetrics = null
}) => {
  const [copyStatus, setCopyStatus] = useState(null) // 'success', 'error', or null
  const [displayContent, setDisplayContent] = useState('')
  const [renderCount, setRenderCount] = useState(0)
  const contentRef = useRef(null)
  const liveRegionRef = useRef(null)
  const lastUpdateTime = useRef(Date.now())

  // Update display content with performance tracking
  useEffect(() => {
    if (content !== displayContent) {
      setDisplayContent(content)
      setRenderCount(prev => prev + 1)
      lastUpdateTime.current = Date.now()

      // Auto-scroll to bottom during streaming with throttling
      if (isStreaming && contentRef.current) {
        // Throttle scrolling to prevent excessive DOM manipulation
        const now = Date.now()
        if (now - (contentRef.current.lastScrollTime || 0) > 100) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight
          contentRef.current.lastScrollTime = now
        }
      }
    }
  }, [content, displayContent, isStreaming])

  // Announce streaming status changes to screen readers
  useEffect(() => {
    if (liveRegionRef.current) {
      if (isStreaming && content) {
        liveRegionRef.current.textContent = 'AI is generating response...'
      } else if (isComplete && content) {
        liveRegionRef.current.textContent = 'Response generation complete'
      }
    }
  }, [isStreaming, isComplete, content])

  const handleCopyClick = async () => {
    if (!displayContent.trim()) return

    try {
      await navigator.clipboard.writeText(displayContent)
      setCopyStatus('success')
      onCopy?.(displayContent)

      // Clear success status after 2 seconds
      setTimeout(() => setCopyStatus(null), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      setCopyStatus('error')

      // Try fallback copy method
      try {
        const textArea = document.createElement('textarea')
        textArea.value = displayContent
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)

        setCopyStatus('success')
        onCopy?.(displayContent)
        setTimeout(() => setCopyStatus(null), 2000)
      } catch (fallbackError) {
        console.error('Fallback copy also failed:', fallbackError)
        setTimeout(() => setCopyStatus(null), 3000)
      }
    }
  }

  const getStreamingStatusText = () => {
    if (isStreaming) {
      const tokensReceived = streamingProgress?.tokensReceived || 0
      const tokensPerSecond = streamingProgress?.tokensPerSecond || 0

      if (tokensPerSecond > 0) {
        return `Generating response... ${tokensReceived} tokens (${tokensPerSecond} tokens/sec)`
      }
      return `Generating response... ${tokensReceived} tokens received`
    }
    if (isComplete) {
      const totalTokens = streamingProgress?.tokensReceived || 0
      const duration = streamingProgress?.duration || 0
      if (totalTokens > 0 && duration > 0) {
        return `Response complete - ${totalTokens} tokens in ${duration}s`
      }
      return 'Response complete'
    }
    return ''
  }

  const getCopyButtonText = () => {
    if (copyStatus === 'success') return 'Copied!'
    if (copyStatus === 'error') return 'Copy Failed'
    return 'Copy Output'
  }

  const getCopyButtonIcon = () => {
    if (copyStatus === 'success') {
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    }

    if (copyStatus === 'error') {
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )
    }

    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    )
  }

  return (
    <div className={`streaming-output ${className}`}>
      {/* Screen reader live region for status announcements */}
      <div
        ref={liveRegionRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="false"
      />

      {/* Header with status and copy button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {isStreaming && (
            <div className="flex items-center space-x-2">
              <div className="animate-pulse">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
              <span className="text-sm text-primary-600 font-medium">
                Streaming...
              </span>
            </div>
          )}

          {isComplete && !isStreaming && (
            <div className="flex items-center space-x-2">
              <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-green-600 font-medium">
                Complete
              </span>
            </div>
          )}
        </div>

        {/* Copy button - only show when there's content */}
        {displayContent.trim() && (
          <button
            onClick={handleCopyClick}
            disabled={!displayContent.trim()}
            className={`inline-flex items-center space-x-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              copyStatus === 'success'
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : copyStatus === 'error'
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            aria-label={`Copy response to clipboard. ${copyStatus === 'success' ? 'Successfully copied' : copyStatus === 'error' ? 'Copy failed, try again' : ''}`}
          >
            {getCopyButtonIcon()}
            <span>{getCopyButtonText()}</span>
          </button>
        )}
      </div>

      {/* Enhanced streaming progress indicator with performance metrics */}
      {streamingProgress && isStreaming && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="grid grid-cols-2 gap-4 text-xs text-blue-700 mb-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Tokens:</span>
              <span>{streamingProgress.tokensReceived || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Speed:</span>
              <span>{streamingProgress.tokensPerSecond || 0} tokens/sec</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Duration:</span>
              <span>{streamingProgress.duration || 0}s</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Updates:</span>
              <span>{renderCount}</span>
            </div>
          </div>

          {streamingProgress.estimatedTotal && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-blue-600 mb-1">
                <span>Progress</span>
                <span>{Math.round((streamingProgress.tokensReceived / streamingProgress.estimatedTotal) * 100)}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (streamingProgress.tokensReceived / streamingProgress.estimatedTotal) * 100)}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Performance indicator */}
          <div className="mt-2 flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              (streamingProgress.tokensPerSecond || 0) > 10
                ? 'bg-green-400'
                : (streamingProgress.tokensPerSecond || 0) > 5
                ? 'bg-yellow-400'
                : 'bg-red-400'
            }`} />
            <span className="text-xs text-blue-600">
              {(streamingProgress.tokensPerSecond || 0) > 10
                ? 'Excellent performance'
                : (streamingProgress.tokensPerSecond || 0) > 5
                ? 'Good performance'
                : 'Optimizing...'}
            </span>
          </div>
        </div>
      )}

      {/* Content display area */}
      <div
        ref={contentRef}
        className="streaming-content bg-white border border-gray-200 rounded-lg p-4 min-h-[200px] max-h-[500px] overflow-y-auto"
        role="log"
        aria-label="AI response content"
        aria-live={isStreaming ? "polite" : "off"}
        aria-atomic="false"
      >
        {displayContent ? (
          <div className="whitespace-pre-wrap text-gray-900 leading-relaxed">
            {displayContent}
            {isStreaming && (
              <span className="inline-block w-2 h-5 bg-primary-500 animate-pulse ml-1" aria-hidden="true" />
            )}
          </div>
        ) : (
          <div className="text-gray-500 italic">
            {isStreaming ? 'Waiting for response...' : 'No content to display'}
          </div>
        )}
      </div>

      {/* Status message */}
      {getStreamingStatusText() && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          {getStreamingStatusText()}
        </div>
      )}

      {/* Copy feedback messages */}
      {copyStatus === 'success' && (
        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-700 flex items-center space-x-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Response copied to clipboard successfully!</span>
          </p>
        </div>
      )}

      {copyStatus === 'error' && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700 flex items-center space-x-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Failed to copy to clipboard. Please try selecting and copying manually.</span>
          </p>
        </div>
      )}
    </div>
  )
}

StreamingOutput.propTypes = {
  content: PropTypes.string,
  isStreaming: PropTypes.bool,
  isComplete: PropTypes.bool,
  onCopy: PropTypes.func,
  streamingProgress: PropTypes.shape({
    tokensReceived: PropTypes.number,
    estimatedTotal: PropTypes.number,
    startTime: PropTypes.number,
    tokensPerSecond: PropTypes.number,
    duration: PropTypes.number
  }),
  performanceMetrics: PropTypes.shape({
    renderCount: PropTypes.number,
    averageLatency: PropTypes.number,
    memoryUsage: PropTypes.number
  }),
  className: PropTypes.string
}

StreamingOutput.defaultProps = {
  content: '',
  isStreaming: false,
  isComplete: false,
  onCopy: null,
  streamingProgress: null,
  performanceMetrics: null,
  className: ''
}

export default StreamingOutput