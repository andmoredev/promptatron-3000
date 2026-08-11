import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { streamingMetricsCollector, streamingMemoryManager } from '../utils/streamingOptimizations'

const StreamingPerformanceMonitor = ({
  isVisible = false,
  className = '',
  refreshInterval = 5000
}) => {
  const [metrics, setMetrics] = useState({
    globalStats: {
      totalStreams: 0,
      successfulStreams: 0,
      failedStreams: 0,
      averageTokensPerSecond: 0,
      errorRate: 0
    },
    performanceStats: {
      averageLatency: 0,
      successRate: 0,
      averageDuration: 0
    },
    memoryStats: {
      activeStreams: 0,
      totalMemoryUsage: 0,
      totalTokens: 0
    }
  })

  const [isExpanded, setIsExpanded] = useState(false)

  // Update metrics periodically
  useEffect(() => {
    if (!isVisible) return

    const updateMetrics = () => {
      const globalStats = streamingMetricsCollector.getGlobalStats()
      const performanceStats = streamingMetricsCollector.getPerformanceSummary()
      const memoryStats = streamingMemoryManager.getMemoryStats()

      setMetrics({
        globalStats,
        performanceStats,
        memoryStats
      })
    }

    // Initial update
    updateMetrics()

    // Set up interval
    const interval = setInterval(updateMetrics, refreshInterval)

    return () => clearInterval(interval)
  }, [isVisible, refreshInterval])

  if (!isVisible) return null

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds.toFixed(1)}s`
  }

  const getPerformanceColor = (value, thresholds) => {
    if (value >= thresholds.good) return 'text-green-600'
    if (value >= thresholds.ok) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getSuccessRateColor = (rate) => {
    if (rate >= 0.9) return 'text-green-600'
    if (rate >= 0.7) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <h3 className="text-sm font-medium text-gray-900">
            Streaming Performance
          </h3>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Compact View */}
      {!isExpanded && (
        <div className="p-3">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="text-center">
              <div className="font-semibold text-gray-900">
                {metrics.globalStats.totalStreams}
              </div>
              <div className="text-gray-500">Total Streams</div>
            </div>
            <div className="text-center">
              <div className={`font-semibold ${getPerformanceColor(
                metrics.performanceStats.averageTokensPerSecond,
                { good: 10, ok: 5 }
              )}`}>
                {metrics.performanceStats.averageTokensPerSecond?.toFixed(1) || 0}
              </div>
              <div className="text-gray-500">Tokens/sec</div>
            </div>
            <div className="text-center">
              <div className={`font-semibold ${getSuccessRateColor(metrics.performanceStats.successRate)}`}>
                {((metrics.performanceStats.successRate || 0) * 100).toFixed(0)}%
              </div>
              <div className="text-gray-500">Success Rate</div>
            </div>
          </div>
        </div>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Global Statistics */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Global Statistics</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Streams:</span>
                <span className="font-medium">{metrics.globalStats.totalStreams}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Successful:</span>
                <span className="font-medium text-green-600">
                  {metrics.globalStats.successfulStreams}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Failed:</span>
                <span className="font-medium text-red-600">
                  {metrics.globalStats.failedStreams}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Error Rate:</span>
                <span className={`font-medium ${getSuccessRateColor(1 - metrics.globalStats.errorRate)}`}>
                  {(metrics.globalStats.errorRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Performance Metrics</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Latency:</span>
                <span className="font-medium">
                  {metrics.performanceStats.averageLatency?.toFixed(0) || 0}ms
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Speed:</span>
                <span className={`font-medium ${getPerformanceColor(
                  metrics.performanceStats.averageTokensPerSecond,
                  { good: 10, ok: 5 }
                )}`}>
                  {metrics.performanceStats.averageTokensPerSecond?.toFixed(1) || 0} tokens/sec
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Duration:</span>
                <span className="font-medium">
                  {formatDuration(metrics.performanceStats.averageDuration || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Success Rate:</span>
                <span className={`font-medium ${getSuccessRateColor(metrics.performanceStats.successRate)}`}>
                  {((metrics.performanceStats.successRate || 0) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Memory Usage */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Memory Usage</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Active Streams:</span>
                <span className="font-medium">{metrics.memoryStats.activeStreams}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Memory Usage:</span>
                <span className="font-medium">
                  {formatBytes(metrics.memoryStats.totalMemoryUsage)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Tokens:</span>
                <span className="font-medium">
                  {metrics.memoryStats.totalTokens.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Memory/Stream:</span>
                <span className="font-medium">
                  {formatBytes(metrics.memoryStats.averageMemoryPerStream || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Performance Indicators */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Performance Status</h4>
            <div className="space-y-2">
              {/* Speed Indicator */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Streaming Speed:</span>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    (metrics.performanceStats.averageTokensPerSecond || 0) > 10
                      ? 'bg-green-400'
                      : (metrics.performanceStats.averageTokensPerSecond || 0) > 5
                      ? 'bg-yellow-400'
                      : 'bg-red-400'
                  }`} />
                  <span className="text-xs">
                    {(metrics.performanceStats.averageTokensPerSecond || 0) > 10
                      ? 'Excellent'
                      : (metrics.performanceStats.averageTokensPerSecond || 0) > 5
                      ? 'Good'
                      : 'Needs Optimization'}
                  </span>
                </div>
              </div>

              {/* Memory Indicator */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Memory Usage:</span>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    metrics.memoryStats.totalMemoryUsage < 10 * 1024 * 1024 // 10MB
                      ? 'bg-green-400'
                      : metrics.memoryStats.totalMemoryUsage < 50 * 1024 * 1024 // 50MB
                      ? 'bg-yellow-400'
                      : 'bg-red-400'
                  }`} />
                  <span className="text-xs">
                    {metrics.memoryStats.totalMemoryUsage < 10 * 1024 * 1024
                      ? 'Optimal'
                      : metrics.memoryStats.totalMemoryUsage < 50 * 1024 * 1024
                      ? 'Moderate'
                      : 'High'}
                  </span>
                </div>
              </div>

              {/* Reliability Indicator */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Reliability:</span>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${getSuccessRateColor(metrics.performanceStats.successRate).replace('text-', 'bg-').replace('-600', '-400')}`} />
                  <span className="text-xs">
                    {(metrics.performanceStats.successRate || 0) >= 0.9
                      ? 'Excellent'
                      : (metrics.performanceStats.successRate || 0) >= 0.7
                      ? 'Good'
                      : 'Needs Attention'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  streamingMetricsCollector.clearOldMetrics(0) // Clear all metrics
                  streamingMemoryManager.cleanupAll()
                }}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Clear All Data
              </button>
              <button
                onClick={() => {
                  const data = streamingMetricsCollector.exportMetrics()
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `streaming-metrics-${new Date().toISOString().split('T')[0]}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Export Metrics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

StreamingPerformanceMonitor.propTypes = {
  isVisible: PropTypes.bool,
  className: PropTypes.string,
  refreshInterval: PropTypes.number
}

export default StreamingPerformanceMonitor