import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { tokenEstimationService } from '../services/tokenEstimationService.js';
import { costCalculace } from '../services/costCalculationService.js';
import { performanceMonitor } from '../utils/performanceMonitor.js';

/**
 * Performance monitoring component for displaying service performance metrics
 * Shows token estimation and cost calculation performance data
 */
const PerformanceMonitor = ({
  showDetails = false,
  autoRefresh = false,
  refreshInterval = 5000,
  className = ''
}) => {
  const [performanceData, setPerformanceData] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const refreshPerformanceData = () => {
    try {
      const tokenServiceStatus = tokenEstimationService.getStatus();
      const costServiceStatus = costCalculationService.getStatus();
      const tokenPerformanceCheck = tokenEstimationService.checkPerformanceRequirements();
      const costPerformanceCheck = costCalculationService.checkPerformanceRequirements();
      const globalReport = performanceMonitor.generateReport();

      setPerformanceData({
        tokenService: {
          status: tokenServiceStatus,
          performanceCheck: tokenPerformanceCheck
        },
        costService: {
          status: costServiceStatus,
          performanceCheck: costPerformanceCheck
        },
        global: globalReport,
        timestamp: new Date().toISOString()
      });
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to refresh performance data:', error);
    }
  };

  useEffect(() => {
    refreshPerformanceData();

    if (autoRefresh) {
      const interval = setInterval(refreshPerformanceData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  if (!performanceData) {
    return (
      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
        <div className="text-sm text-gray-500">Loading performance data...</div>
      </div>
    );
  }

  const { tokenService, costService, global } = performanceData;

  const getStatusColor = (passed) => {
    return passed ? 'text-green-600' : 'text-red-600';
  };

  const getStatusIcon = (passed) => {
    return passed ? '✓' : '⚠';
  };

  const formatTime = (ms) => {
    if (ms === null || ms === undefined) return 'N/A';
    return `${ms.toFixed(2)}ms`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return `${value}%`;
  };

  const formatMemory = (mb) => {
    if (mb === null || mb === undefined) return 'N/A';
    return `${mb.toFixed(2)}MB`;
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-900">Performance Monitor</h3>
          <span className="text-xs text-gray-500">
            Updated: {lastUpdate?.toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={refreshPerformanceData}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Refresh
          </button>
          {showDetails && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Token Estimation Service */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900">Token Estimation</h4>
              <span className={`text-sm font-medium ${getStatusColor(tokenService.performanceCheck.passed)}`}>
                {getStatusIcon(tokenService.performanceCheck.passed)}
                {tokenService.performanceCheck.passed ? 'Good' : 'Issues'}
              </span>
            </div>
lassName="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Time:</span>
                <span>{formatTime(tokenService.status.performance?.avgEstimationTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Cache Hit Rate:</span>
                <span>{formatPercent(tokenService.status.performance?.cacheHitRate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Memory:</span>
                <span>{formatMemory(tokenService.status.memory?.totalMB)}</span>
              </div>
            </div>
          </div>

          {/* Cost Calculation Service */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900">Cost Calculation</h4>
              <span className={`text-sm font-medium ${getStatusColor(costService.performanceCheck.passed)}`}>
                {getStatusIcon(costService.performanceCheck.passed)}
                {costService.performanceCheck.passed ? 'Good' : 'Issues'}
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Time:</span>
                <span>{formatTime(costService.status.performance?.avgCalculationTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Cache Hit Rate:</span>
                <span>{formatPercent(costService.status.performance?.calculationCacheHitRate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Memory:</span>
                <span>{formatMemory(costService.status.cache?.memoryUsageMB)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {(tokenService.performanceCheck.recommendations.length > 0 ||
          costService.performanceCheck.recommendations.length > 0) && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h5 className="font-medium text-yellow-800 mb-2">Recommendations</h5>
            <div className="space-y-1">
              {tokenService.performanceCheck.recommendations.map((rec, index) => (
                <div key={`token-${index}`} className="text-sm text-yellow-700">
                  • {rec.message}
                </div>
              ))}
              {costService.performanceCheck.recommendations.map((rec, index) => (
                <div key={`cost-${index}`} className="text-sm text-yellow-700">
                  • {rec.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detailed View */}
      {showDetails && isExpanded && (
        <div className="border-t border-gray-200 p-4">
          <div className="space-y-4">
            {/* Global Performance Metrics */}
            <div>
              <h5 className="font-medium text-gray-900 mb-2">Global Metrics</h5>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">Total Operations</div>
                    <div className="font-medium">{global.summary.totalOperations}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Total Executions</div>
                    <div className="font-medium">{global.summary.totalExecutions}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Slow Operations</div>
                    <div className="font-medium text-red-600">{global.summary.slowOperations}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Memory Trend</div>
                    <div className={`font-medium ${
                      global.summary.memoryTrend === 'increasing' ? 'text-red-600' :
                      global.summary.memoryTrend === 'decreasing' ? 'text-green-600' :
                      'text-gray-900'
                    }`}>
                      {global.summary.memoryTrend}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Service Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Token Service Details</h5>
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span>Total Estimations:</span>
                    <span>{tokenService.status.performance?.totalEstimations || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cache Hits:</span>
                    <span>{tokenService.status.performance?.cacheHits || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cache Misses:</span>
                    <span>{tokenService.status.performance?.cacheMisses || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Encoders Loaded:</span>
                    <span>{tokenService.status.encodersLoaded || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cache Size:</span>
                    <span>{tokenService.status.cache?.size || 0}</span>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="font-medium text-gray-900 mb-2">Cost Service Details</h5>
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span>Total Calculations:</span>
                    <span>{costService.status.performance?.totalCalculations || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cache Hits:</span>
                    <span>{costService.status.performance?.calculationCacheHits || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cache Misses:</span>
                    <span>{costService.status.performance?.calculationCacheMisses || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Models Loaded:</span>
                    <span>{costService.status.modelsLoaded || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cache Size:</span>
                    <span>{costService.status.cache?.size || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

PerformanceMonitor.propTypes = {
  showDetails: PropTypes.bool,
  autoRefresh: PropTypes.bool,
  refreshInterval: PropTypes.number,
  className: PropTypes.string
};

export default PerformanceMonitor;
