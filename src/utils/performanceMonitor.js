/**
 * Performance monitoring utility for tracking operation timing and memory usage
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.memorySnapshots = [];
    this.maxSnapshots = 100;
  }

  /**
   * Start timing an operation
   * @param {string} operationName - Name of the operation
   * @returns {string} - Timer ID for stopping the timer
   */
  startTimer(operationName) {
    const timerId = `${operationName}_${Date.now()}_${Math.random()}`;
    const startTime = performance.now();

    if (!this.metrics.has(operationName)) {
      this.metrics.set(operationName, {
        totalTime: 0,
        count: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0,
        recentTimes: [],
        maxRecentTimes: 10
      });
    }

    // Store start time for this specific timer
    this.metrics.get(operationName).currentTimers = this.metrics.get(operationName).currentTimers || new Map();
    this.metrics.get(operationName).currentTimers.set(timerId, startTime);

    return timerId;
  }

  /**
   * Stop timing an operation
   * @param {string} operationName - Name of the operation
   * @param {string} timerId - Timer ID returned from startTimer
   * @returns {number} - Duration in milliseconds
   */
  stopTimer(operationName, timerId) {
    const endTime = performance.now();
    const metrics = this.metrics.get(operationName);

    if (!metrics || !metrics.currentTimers || !metrics.currentTimers.has(timerId)) {
      console.warn(`Timer ${timerId} for operation ${operationName} not found`);
      return 0;
    }

    const startTime = metrics.currentTimers.get(timerId);
    const duration = endTime - startTime;

    // Update metrics
    metrics.totalTime += duration;
    metrics.count++;
    metrics.minTime = Math.min(metrics.minTime, duration);
    metrics.maxTime = Math.max(metrics.maxTime, duration);
    metrics.avgTime = metrics.totalTime / metrics.count;

    // Clean up timer
    metrics.currentTimers.delete(timerId);

    // Keep recent times for trend analysis
    metrics.recentTimes.push(duration);
    if (metrics.recentTimes.length > metrics.maxRecentTimes) {
      metrics.recentTimes.shift();
    }

    return duration;
  }

  /**
   * Time a function execution
   * @param {string} operationName - Name of the operation
   * @param {Function} fn - Function to time
   * @returns {Promise<*>} - Result of the function
   */
  async timeFunction(operationName, fn) {
    const timerId = this.startTimer(operationName);
    try {
      const result = await fn();
      return result;
    } finally {
      this.stopTimer(operationName, timerId);
    }
  }

  /**
   * Record a memory snapshot
   * @param {string} label - Label for the snapshot
   * @param {Object} additionalData - Additional data to include
   */
  recordMemorySnapshot(label, additionalData = {}) {
    if (this.memorySnapshots.length >= this.maxSnapshots) {
      this.memorySnapshots.shift();
    }

    const snapshot = {
      timestamp: Date.now(),
      label,
      memory: this.getMemoryUsage(),
      ...additionalData
    };

    this.memorySnapshots.push(snapshot);
  }

  /**
   * Get current memory usage (if available)
   * @returns {Object} - Memory usage information
   */
  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  /**
   * Get metrics for a specific operation
   * @param {string} operationName - Name of the operation
   * @returns {Object} - Metrics for the operation
   */
  getMetrics(operationName) {
    return this.metrics.get(operationName) || null;
  }

  /**
   * Get all metrics
   * @returns {Map} - All metrics
   */
  getAllMetrics() {
    return new Map(this.metrics);
  }

  /**
   * Get memory snapshots
   * @returns {Array} - Array of memory snapshots
   */
  getMemorySnapshots() {
    return [...this.memorySnapshots];
  }

  /**
   * Clear metrics for a specific operation
   * @param {string} operationName - Name of the operation
   */
  clearMetrics(operationName) {
    this.metrics.delete(operationName);
  }

  /**
   * Clear all metrics
   */
  clearAllMetrics() {
    this.metrics.clear();
  }

  /**
   * Clear memory snapshots
   */
  clearMemorySnapshots() {
    this.memorySnapshots = [];
  }

  /**
   * Get performance summary
   * @returns {Object} - Performance summary
   */
  getSummary() {
    const summary = {
      operations: {},
      totalOperations: 0,
      memorySnapshots: this.memorySnapshots.length
    };

    for (const [operationName, metrics] of this.metrics.entries()) {
      summary.operations[operationName] = {
        count: metrics.count,
        totalTime: metrics.totalTime,
        avgTime: metrics.avgTime,
        minTime: metrics.minTime,
        maxTime: metrics.maxTime
      };
      summary.totalOperations += metrics.count;
    }

    return summary;
  }

  /**
   * Reset metrics for a specific operation
   * @param {string} operationName - Name of the operation
   */
  resetMetrics(operationName) {
    this.metrics.delete(operationName);
  }
}

// Export a singleton instance
export const performanceMonitor = new PerformanceMonitor();
