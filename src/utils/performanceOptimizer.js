import { tokenEstimationService } from '../services/tokenEstimationService.js';
import { costCalculationService } from '../services/costCalculationService.js';
import { performanceMonitor } from './performanceMonitor.js
/**
 * Performance optimizer utility for managing service performance
 * Provides automated optimization strategies and monitoring
 */
export class PerformanceOptimizer {
  constructor() {
    this.optimizationRules = {
      // Memory optimization thresholds
      maxTokenServiceMemoryMB: 50,
      maxCostServiceMemoryMB: 10,

      // Performance thresholds
      maxTokenEstimationTime: 100,
      maxCostCalculationTime: 10,

      // Cache optimization thresholds
      minCacheHitRate: 50,
      maxCacheSize: 1000,

      // Automatic optimization triggers
      autoOptimizeMemory: true,
      autoOptimizeCache: true,
      memoryCheckInterval: 30000, // 30 seconds
      performanceCheckInterval: 60000 // 1 minute
    };

    this.isMonitoring = false;
    this.monitoringIntervals = [];
    this.optimizationHistory = [];
  }

  /**
   * Start automatic performance monitoring and optimization
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.warn('Performance monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    console.log('Starting performance monitoring and optimization');

    // Memory monitoring
    if (this.optimizationRules.autoOptimizeMemory) {
      const memoryInterval = setInterval(() => {
        this.checkAndOptimizeMemory();
      }, this.optimizationRules.memoryCheckInterval);

      this.monitoringIntervals.push(memoryInterval);
    }

    // Performance monitoring
    const performanceInterval = setInterval(() => {
      this.checkAndOptimizePerformance();
    }, this.optimizationRules.performanceCheckInterval);

    this.monitoringIntervals.push(performanceInterval);

    // Record monitoring start
    performanceMonitor.recordMemorySnapshot('monitoring_started');
  }

  /**
   * Stop automatic performance monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    // Clear all intervals
    this.monitoringIntervals.forEach(interval => clearInterval(interval));
    this.monitoringIntervals = [];

    console.log('Performance monitoring stopped');
    performanceMonitor.recordMemorySnapshot('monitoring_stopped');
  }

  /**
   * Check and optimize memory usage
   */
  async checkAndOptimizeMemory() {
    try {
      const tokenServiceStatus = tokenEstimationService.getStatus();
      const costServiceStatus = costCalculationService.getStatus();

      const optimizations = [];

      // Check token service memory
      if (tokenServiceStatus.memory?.totalMB > this.optimizationRules.maxTokenServiceMemoryMB) {
        console.log(`Token service memory usage high: ${tokenServiceStatus.memory.totalMB}MB`);

        // Optimize encoder memory
        tokenEstimationService.optimizeEncoderMemory(2);
        optimizations.push({
          service: 'tokenEstimation',
          action: 'optimizeEncoderMemory',
          beforeMB: tokenServiceStatus.memory.totalMB,
          reason: 'Memory usage exceeded threshold'
        });
      }

      // Check cost service memory
      if (costServiceStatus.cache?.memoryUsageMB > this.optimizationRules.maxCostServiceMemoryMB) {
        console.log(`Cost service cache memory usage high: ${costServiceStatus.cache.memoryUsageMB}MB`);

        // Clear some calculation cache
        costCalculationService.clearCalculationCache();
        optimizations.push({
          service: 'costCalculation',
          action: 'clearCalculationCache',
          beforeMB: costServiceStatus.cache.memoryUsageMB,
          reason: 'Cache memory usage exceeded threshold'
        });
      }

      if (optimizations.length > 0) {
        this.recordOptimization('memory', optimizations);
        performanceMonitor.recordMemorySnapshot('memory_optimized', { optimizations });
      }
    } catch (error) {
      console.error('Memory optimization check failed:', error);
    }
  }

  /**
   * Check and optimize performance
   */
  async checkAndOptimizePerformance() {
    try {
      const tokenPerformanceCheck = tokenEstimationService.checkPerformanceRequirements();
      const costPerformanceCheck = costCalculationService.checkPerformanceRequirements();

      const optimizations = [];

      // Check token estimation performance
      if (!tokenPerformanceCheck.passed) {
        console.log('Token estimation performance issues detected');

        // If cache hit rate is low, consider cache size optimization
        if (tokenPerformanceCheck.actual.cacheHitRate < this.optimizationRules.minCacheHitRate) {
          // This is informational - cache size is already optimized via LRU
          optimizations.push({
            service: 'tokenEstimation',
            action: 'cacheAnalysis',
            issue: 'Low cache hit rate',
            recommendation: 'Monitor token estimation patterns'
          });
   }

      // Check cost calculation performance
      if (!costPerformanceCheck.passed) {
        console.log('Cost calculation performance issues detected');

        optimizations.push({
          service: 'costCalculation',
          action: 'performanceAnalysis',
          issue: 'Slow calculations',
          recommendation: 'Review calculation complexity'
        });
      }

      if (optimizations.length > 0) {
        this.recordOptimization('performance', optimizations);
      }
    } catch (error) {
      console.error('Performance optimization check failed:', error);
    }
  }

  /**
   * Force memory optimization for all services
   */
  async optimizeMemory() {
    console.log('Forcing memory optimization');

    const beforeStats = {
      tokenService: tokenEstimationService.getMemoryUsage(),
      costService: costCalculationService.getStatus().cache
    };

    // Clear caches
    tokenEstimationService.clearTokenCache();
    tokenEstimationService.optimizeEncoderMemory(1); // Keep only 1 encoder
    costCalculationService.clearCalculationCache();

    const afterStats = {
      tokenService: tokenEstimationService.getMemoryUsage(),
      costService: costCalculationService.getStatus().cache
    };

    const optimization = {
      type: 'forced_memory_optimization',
      timestamp: new Date().toISOString(),
      beforeStats,
      afterStats,
      memoryFreedMB: (beforeStats.tokenService.totalMB + beforeStats.costService.memoryUsageMB) -
                     (afterStats.tokenService.totalMB + afterStats.costService.memoryUsageMB)
    };

    this.recordOptimization('forced_memory', [optimization]);
    performanceMonitor.recordMemorySnapshot('forced_memory_optimization', optimization);

    return optimization;
  }

  /**
   * Get performance optimization recommendations
   * @returns {Array} - Array of recommendations
   */
  getOptimizationRecommendations() {
    const recommendations = [];

    try {
      const tokenServiceStatus = tokenEstimationService.getStatus();
      const costServiceStatus = costCalculationService.getStatus();
      const tokenPerformanceCheck = tokenEstimationService.checkPerformanceRequirements();
      const costPerformanceCheck = costCalculationService.checkPerformanceRequirements();

      // Memory recommendations
      if (tokenServiceStatus.memory?.totalMB > this.optimizationRules.maxTokenServiceMemoryMB * 0.8) {
        recommendations.push({
          type: 'memory',
          priority: 'medium',
          service: 'tokenEstimation',
          message: `Token service memory usage is approaching limit (${tokenServiceStatus.memory.totalMB}MB)`,
          action: 'Consider clearing encoder cache or reducing cache size'
        });
      }

      if (costServiceStatus.cache?.memoryUsageMB > this.optimizationRules.maxCostServiceMemoryMB * 0.8) {
        recommendations.push({
          type: 'memory',
          priority: 'medium',
          service: 'costCalculation',
          message: `Cost service cache memory usage is high (${costServiceStatus.cache.memoryUsageMB}MB)`,
          action: 'Consider clearing calculation cache'
        });
      }

      // Performance recommendations
      if (!tokenPerformanceCheck.passed) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          service: 'tokenEstimation',
          message: 'Token estimation performance requirements not met',
          action: 'Review token estimation patterns and cache efficiency'
        });
      }

      if (!costPerformanceCheck.passed) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          service: 'costCalculation',
          message: 'Cost calculation performance requirements not met',
          action: 'Review calculation complexity and caching strategy'
        });
      }

      // Cache efficiency recommendations
      if (tokenServiceStatus.performance?.cacheHitRate < this.optimizationRules.minCacheHitRate) {
        recommendations.push({
          type: 'cache',
          priority: 'low',
          service: 'tokenEstimation',
          message: `Token cache hit rate is low (${tokenServiceStatus.performance.cacheHitRate}%)`,
          action: 'Analyze token estimation patterns to improve cache efficiency'
        });
      }

      if (costServiceStatus.performance?.calculationCacheHitRate < this.optimizationRules.minCacheHitRate) {
        recommendations.push({
          type: 'cache',
          priority: 'low',
          service: 'costCalculation',
          message: `Cost calculation cache hit rate is low (${costServiceStatus.performance.calculationCacheHitRate}%)`,
          action: 'Review cost calculation patterns'
        });
      }

    } catch (error) {
      console.error('Failed to generate optimization recommendations:', error);
      recommendations.push({
        type: 'error',
        priority: 'high',
        service: 'optimizer',
        message: 'Failed to analyze performance metrics',
        action: 'Check service status and error logs'
      });
    }

    return recommendations;
  }

  /**
   * Get optimization history
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} - Array of optimization history entries
   */
  getOptimizationHistory(limit = 10) {
    return this.optimizationHistory
      .slice(-limit)
      .map(entry => ({
        ...entry,
        timestamp: new Date(entry.timestamp).toISOString()
      }));
  }

  /**
   * Get current performance status
   * @returns {Object} - Performance status summary
   */
  getPerformanceStatus() {
    try {
      const tokenServiceStatus = tokenEstimationService.getStatus();
      const costServiceStatus = costCalculationService.getStatus();
      const tokenPerformanceCheck = tokenEstimationService.checkPerformanceRequirements();
      const costPerformanceCheck = costCalculationService.checkPerformanceRequirements();

      return {
        timestamp: new Date().toISOString(),
        overall: {
          healthy: tokenPerformanceCheck.passed && costPerformanceCheck.passed,
          monitoring: this.isMonitoring
        },
        services: {
          tokenEstimation: {
            healthy: tokenPerformanceCheck.passed,
            memoryUsageMB: tokenServiceStatus.memory?.totalMB || 0,
            cacheHitRate: tokenServiceStatus.performance?.cacheHitRate || 0,
            avgTime: tokenServiceStatus.performance?.avgEstimationTime || 0
          },
          costCalculation: {
            healthy: costPerformanceCheck.passed,
            memoryUsageMB: costServiceStatus.cache?.memoryUsageMB || 0,
            cacheHitRate: costServiceStatus.performance?.calculationCacheHitRate || 0,
            avgTime: costServiceStatus.performance?.avgCalculationTime || 0
          }
        },
        recommendations: this.getOptimizationRecommendations(),
        optimizationHistory: this.getOptimizationHistory(5)
      };
    } catch (error) {
      console.error('Failed to get performance status:', error);
      return {
        timestamp: new Date().toISOString(),
        overall: { healthy: false, monitoring: this.isMonitoring },
        services: {},
        recommendations: [],
        optimizationHistory: [],
        error: error.message
      };
    }
  }

  /**
   * Record an optimization action
   * @param {string} type - Type of optimization
   * @param {Array} actions - Array of optimization actions
   * @private
   */
  recordOptimization(type, actions) {
    const entry = {
      type,
      timestamp: Date.now(),
      actions,
      count: actions.length
    };

    this.optimizationHistory.push(entry);

    // Keep only recent history
    if (this.optimizationHistory.length > 100) {
      this.optimizationHistory = this.optimizationHistory.slice(-50);
    }

    console.log(`Recorded ${type} optimization:`, entry);
  }

  /**
   * Update optimization rules
   * @param {Object} newRules - New optimization rules
   */
  updateOptimizationRules(newRules) {
    this.optimizationRules = {
      ...this.optimizationRules,
      ...newRules
    };

    console.log('Optimization rules updated:', this.optimizationRules);
  }

  /**
   * Reset optimization history
   */
  resetHistory() {
    this.optimizationHistory = [];
    console.log('Optimization history reset');
  }
}

// Export a singleton instance
export const performanceOptimizer = new PerformanceOptimizer();
