/**
 * Streaming Performance Optimizations
 *
 * This module provides utilities for optimizing streaming performance including:
 * - Token batching to reduce UI updates
 * - Debounced content updates
 * - Memory cleanup utilities
 * - Streaming metrics collection
 */

/**
 * Token Batcher - Batches rapid tokens to reduce excessive UI updates
 */
export class TokenBatcher {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 5; // Batch every 5 tokens
    this.flushInterval = options.flushInterval || 100; // Flush every 100ms
    this.onBatch = options.onBatch || (() => {});

    this.tokenBuffer = [];
    this.flushTimer = null;
    this.isActive = false;
  }

  /**
   * Add a token to the batch
   * @param {string} token - The token to add
   */
  addToken(token) {
    if (!this.isActive) return;

    this.tokenBuffer.push(token);

    // Flush if batch size reached
    if (this.tokenBuffer.length >= this.batchSize) {
      this.flush();
    } else {
      // Set timer to flush after interval
      this.scheduleFlush();
    }
  }

  /**
   * Schedule a flush after the flush interval
   */
  scheduleFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Flush all buffered tokens
   */
  flush() {
    if (this.tokenBuffer.length === 0) return;

    const tokens = [...this.tokenBuffer];
    this.tokenBuffer = [];

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.onBatch(tokens);
  }

  /**
   * Start batching tokens
   */
  start() {
    this.isActive = true;
  }

  /**
   * Stop batching and flush remaining tokens
   */
  stop() {
    this.isActive = false;
    this.flush();
  }

  /**
   * Clear all buffered tokens without flushing
   */
  clear() {
    this.tokenBuffer = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

/**
 * Debounced Content Updater - Prevents render thrashing during fast streaming
 */
export class DebouncedContentUpdater {
  constructor(options = {}) {
    this.delay = options.delay || 50; // 50ms debounce delay
    this.onUpdate = options.onUpdate || (() => {});

    this.updateTimer = null;
    this.pendingContent = null;
    this.lastUpdateTime = 0;
    this.isActive = false;
  }

  /**
   * Update content with debouncing
   * @param {string} content - The content to update
   * @param {boolean} immediate - Whether to update immediately
   */
  updateContent(content, immediate = false) {
    if (!this.isActive) return;

    this.pendingContent = content;

    if (immediate) {
      this.flush();
      return;
    }

    // Clear existing timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    // Check if enough time has passed since last update
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;

    if (timeSinceLastUpdate >= this.delay) {
      // Enough time has passed, update immediately
      this.flush();
    } else {
      // Schedule update after remaining delay
      const remainingDelay = this.delay - timeSinceLastUpdate;
      this.updateTimer = setTimeout(() => {
        this.flush();
      }, remainingDelay);
    }
  }

  /**
   * Flush pending content update
   */
  flush() {
    if (this.pendingContent === null) return;

    const content = this.pendingContent;
    this.pendingContent = null;
    this.lastUpdateTime = Date.now();

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    this.onUpdate(content);
  }

  /**
   * Start debounced updates
   */
  start() {
    this.isActive = true;
  }

  /**
   * Stop debounced updates and flush pending content
   */
  stop() {
    this.isActive = false;
    this.flush();
  }

  /**
   * Clear pending updates
   */
  clear() {
    this.pendingContent = null;
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
  }
}

/**
 * Streaming Memory Manager - Handles memory cleanup for streaming state
 */
export class StreamingMemoryManager {
  constructor() {
    this.activeStreams = new Map();
    this.cleanupCallbacks = new Map();
    this.memoryThreshold = 50 * 1024 * 1024; // 50MB threshold
  }

  /**
   * Register a streaming session
   * @param {string} streamId - Unique identifier for the stream
   * @param {Object} streamData - Stream data to track
   */
  registerStream(streamId, streamData = {}) {
    this.activeStreams.set(streamId, {
      ...streamData,
      startTime: Date.now(),
      memoryUsage: 0,
      tokenCount: 0
    });
  }

  /**
   * Update stream data
   * @param {string} streamId - Stream identifier
   * @param {Object} updates - Updates to apply
   */
  updateStream(streamId, updates) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      Object.assign(stream, updates);

      // Estimate memory usage based on content length
      if (updates.content) {
        stream.memoryUsage = new Blob([updates.content]).size;
      }

      // Check memory threshold
      if (stream.memoryUsage > this.memoryThreshold) {
        console.warn(`Stream ${streamId} exceeding memory threshold:`, {
          usage: stream.memoryUsage,
          threshold: this.memoryThreshold
        });
      }
    }
  }

  /**
   * Register cleanup callback for a stream
   * @param {string} streamId - Stream identifier
   * @param {Function} callback - Cleanup callback
   */
  registerCleanup(streamId, callback) {
    if (!this.cleanupCallbacks.has(streamId)) {
      this.cleanupCallbacks.set(streamId, []);
    }
    this.cleanupCallbacks.get(streamId).push(callback);
  }

  /**
   * Clean up a streaming session
   * @param {string} streamId - Stream identifier
   */
  cleanupStream(streamId) {
    // Execute cleanup callbacks
    const callbacks = this.cleanupCallbacks.get(streamId) || [];
    callbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Cleanup callback error:', error);
      }
    });

    // Remove from tracking
    this.activeStreams.delete(streamId);
    this.cleanupCallbacks.delete(streamId);
  }

  /**
   * Clean up all active streams
   */
  cleanupAll() {
    const streamIds = Array.from(this.activeStreams.keys());
    streamIds.forEach(streamId => this.cleanupStream(streamId));
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    const streams = Array.from(this.activeStreams.values());
    const totalMemory = streams.reduce((sum, stream) => sum + (stream.memoryUsage || 0), 0);
    const totalTokens = streams.reduce((sum, stream) => sum + (stream.tokenCount || 0), 0);

    return {
      activeStreams: streams.length,
      totalMemoryUsage: totalMemory,
      totalTokens: totalTokens,
      averageMemoryPerStream: streams.length > 0 ? totalMemory / streams.length : 0,
      streams: streams.map(stream => ({
        id: stream.id,
        memoryUsage: stream.memoryUsage,
        tokenCount: stream.tokenCount,
        duration: Date.now() - stream.startTime
      }))
    };
  }

  /**
   * Force garbage collection hint (if available)
   */
  forceGarbageCollection() {
    // Request garbage collection if available (Chrome DevTools)
    if (window.gc && typeof window.gc === 'function') {
      try {
        window.gc();
      } catch (error) {
        // Ignore errors - gc() might not be available
      }
    }
  }
}

/**
 * Streaming Metrics Collector - Collects performance metrics for streaming
 */
export class StreamingMetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.globalStats = {
      totalStreams: 0,
      successfulStreams: 0,
      failedStreams: 0,
      totalTokens: 0,
      totalDuration: 0,
      averageTokensPerSecond: 0,
      errorRate: 0
    };
  }

  /**
   * Start collecting metrics for a stream
   * @param {string} streamId - Stream identifier
   * @param {Object} metadata - Initial metadata
   */
  startStream(streamId, metadata = {}) {
    this.metrics.set(streamId, {
      id: streamId,
      startTime: Date.now(),
      firstTokenTime: null,
      endTime: null,
      tokenCount: 0,
      errorCount: 0,
      retryCount: 0,
      bytesReceived: 0,
      status: 'active',
      metadata: { ...metadata },
      events: []
    });

    this.globalStats.totalStreams++;
  }

  /**
   * Record a token received
   * @param {string} streamId - Stream identifier
   * @param {string} token - The token received
   */
  recordToken(streamId, token) {
    const stream = this.metrics.get(streamId);
    if (!stream) return;

    const now = Date.now();

    // Record first token latency
    if (stream.firstTokenTime === null) {
      stream.firstTokenTime = now;
      stream.firstTokenLatency = now - stream.startTime;
    }

    stream.tokenCount++;
    stream.bytesReceived += new Blob([token]).size;
    stream.events.push({
      type: 'token',
      timestamp: now,
      size: token.length
    });

    this.globalStats.totalTokens++;
  }

  /**
   * Record an error
   * @param {string} streamId - Stream identifier
   * @param {Error} error - The error that occurred
   */
  recordError(streamId, error) {
    const stream = this.metrics.get(streamId);
    if (!stream) return;

    stream.errorCount++;
    stream.events.push({
      type: 'error',
      timestamp: Date.now(),
      error: error.message
    });
  }

  /**
   * Record a retry attempt
   * @param {string} streamId - Stream identifier
   * @param {number} attempt - Retry attempt number
   */
  recordRetry(streamId, attempt) {
    const stream = this.metrics.get(streamId);
    if (!stream) return;

    stream.retryCount++;
    stream.events.push({
      type: 'retry',
      timestamp: Date.now(),
      attempt: attempt
    });
  }

  /**
   * Complete a stream
   * @param {string} streamId - Stream identifier
   * @param {string} status - Final status ('success' or 'failed')
   */
  completeStream(streamId, status = 'success') {
    const stream = this.metrics.get(streamId);
    if (!stream) return;

    const now = Date.now();
    stream.endTime = now;
    stream.duration = now - stream.startTime;
    stream.status = status;

    // Calculate tokens per second
    if (stream.duration > 0) {
      stream.tokensPerSecond = (stream.tokenCount / stream.duration) * 1000;
    }

    // Update global stats
    if (status === 'success') {
      this.globalStats.successfulStreams++;
    } else {
      this.globalStats.failedStreams++;
    }

    this.globalStats.totalDuration += stream.duration;
    this.updateGlobalAverages();
  }

  /**
   * Update global average calculations
   */
  updateGlobalAverages() {
    const completedStreams = this.globalStats.successfulStreams + this.globalStats.failedStreams;

    if (completedStreams > 0) {
      this.globalStats.averageTokensPerSecond =
        (this.globalStats.totalTokens / this.globalStats.totalDuration) * 1000;

      this.globalStats.errorRate =
        this.globalStats.failedStreams / this.globalStats.totalStreams;
    }
  }

  /**
   * Get metrics for a specific stream
   * @param {string} streamId - Stream identifier
   */
  getStreamMetrics(streamId) {
    return this.metrics.get(streamId);
  }

  /**
   * Get global streaming statistics
   */
  getGlobalStats() {
    return { ...this.globalStats };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const streams = Array.from(this.metrics.values());
    const completedStreams = streams.filter(s => s.status !== 'active');

    if (completedStreams.length === 0) {
      return {
        totalStreams: streams.length,
        averageLatency: 0,
        averageTokensPerSecond: 0,
        successRate: 0,
        averageDuration: 0
      };
    }

    const successfulStreams = completedStreams.filter(s => s.status === 'success');
    const totalLatency = successfulStreams.reduce((sum, s) => sum + (s.firstTokenLatency || 0), 0);
    const totalTokensPerSecond = successfulStreams.reduce((sum, s) => sum + (s.tokensPerSecond || 0), 0);
    const totalDuration = completedStreams.reduce((sum, s) => sum + s.duration, 0);

    return {
      totalStreams: streams.length,
      completedStreams: completedStreams.length,
      successfulStreams: successfulStreams.length,
      averageLatency: successfulStreams.length > 0 ? totalLatency / successfulStreams.length : 0,
      averageTokensPerSecond: successfulStreams.length > 0 ? totalTokensPerSecond / successfulStreams.length : 0,
      successRate: completedStreams.length > 0 ? successfulStreams.length / completedStreams.length : 0,
      averageDuration: completedStreams.length > 0 ? totalDuration / completedStreams.length : 0,
      errorRate: this.globalStats.errorRate
    };
  }

  /**
   * Clear old metrics to prevent memory leaks
   * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
   */
  clearOldMetrics(maxAge = 60 * 60 * 1000) {
    const cutoffTime = Date.now() - maxAge;
    const streamsToDelete = [];

    for (const [streamId, stream] of this.metrics.entries()) {
      if (stream.endTime && stream.endTime < cutoffTime) {
        streamsToDelete.push(streamId);
      }
    }

    streamsToDelete.forEach(streamId => {
      this.metrics.delete(streamId);
    });

    return streamsToDelete.length;
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics() {
    return {
      globalStats: this.getGlobalStats(),
      performanceSummary: this.getPerformanceSummary(),
      streams: Array.from(this.metrics.values()),
      exportTime: new Date().toISOString()
    };
  }
}

/**
 * Create a singleton instance of the memory manager and metrics collector
 */
export const streamingMemoryManager = new StreamingMemoryManager();
export const streamingMetricsCollector = new StreamingMetricsCollector();

/**
 * Utility function to create optimized streaming handlers
 * @param {Object} options - Configuration options
 * @returns {Object} Optimized streaming handlers
 */
export function createOptimizedStreamingHandlers(options = {}) {
  const {
    batchSize = 5,
    flushInterval = 100,
    debounceDelay = 50,
    enableMetrics = true,
    enableMemoryManagement = true
  } = options;

  let tokenBatcher = null;
  let contentUpdater = null;
  let streamId = null;

  const handlers = {
    /**
     * Initialize optimized streaming
     * @param {string} id - Stream identifier
     * @param {Function} onContentUpdate - Content update callback
     * @param {Object} metadata - Stream metadata
     */
    initialize(id, onContentUpdate, metadata = {}) {
      streamId = id;

      // Initialize token batcher
      tokenBatcher = new TokenBatcher({
        batchSize,
        flushInterval,
        onBatch: (tokens) => {
          const batchedContent = tokens.join('');
          if (contentUpdater) {
            contentUpdater.updateContent(batchedContent);
          } else {
            onContentUpdate(batchedContent);
          }
        }
      });

      // Initialize content updater
      contentUpdater = new DebouncedContentUpdater({
        delay: debounceDelay,
        onUpdate: onContentUpdate
      });

      // Register with memory manager
      if (enableMemoryManagement) {
        streamingMemoryManager.registerStream(streamId, metadata);
        streamingMemoryManager.registerCleanup(streamId, () => {
          tokenBatcher?.clear();
          contentUpdater?.clear();
        });
      }

      // Start metrics collection
      if (enableMetrics) {
        streamingMetricsCollector.startStream(streamId, metadata);
      }

      // Start optimizations
      tokenBatcher.start();
      contentUpdater.start();
    },

    /**
     * Handle incoming token
     * @param {string} token - The token received
     * @param {string} fullContent - Full accumulated content
     */
    onToken(token, fullContent) {
      if (enableMetrics && streamId) {
        streamingMetricsCollector.recordToken(streamId, token);
      }

      if (enableMemoryManagement && streamId) {
        streamingMemoryManager.updateStream(streamId, {
          content: fullContent,
          tokenCount: (streamingMemoryManager.activeStreams.get(streamId)?.tokenCount || 0) + 1
        });
      }

      if (tokenBatcher) {
        tokenBatcher.addToken(token);
      }
    },

    /**
     * Handle streaming error
     * @param {Error} error - The error that occurred
     */
    onError(error) {
      if (enableMetrics && streamId) {
        streamingMetricsCollector.recordError(streamId, error);
      }

      // Flush any pending content
      if (tokenBatcher) {
        tokenBatcher.flush();
      }
      if (contentUpdater) {
        contentUpdater.flush();
      }
    },

    /**
     * Handle streaming completion
     * @param {string} status - Completion status
     */
    onComplete(status = 'success') {
      // Flush all pending content
      if (tokenBatcher) {
        tokenBatcher.stop();
      }
      if (contentUpdater) {
        contentUpdater.stop();
      }

      if (enableMetrics && streamId) {
        streamingMetricsCollector.completeStream(streamId, status);
      }

      if (enableMemoryManagement && streamId) {
        // Schedule cleanup after a delay to allow UI to settle
        setTimeout(() => {
          streamingMemoryManager.cleanupStream(streamId);
        }, 2000);
      }
    },

    /**
     * Force immediate flush of all pending content
     */
    flush() {
      if (tokenBatcher) {
        tokenBatcher.flush();
      }
      if (contentUpdater) {
        contentUpdater.flush();
      }
    },

    /**
     * Clean up all resources
     */
    cleanup() {
      if (tokenBatcher) {
        tokenBatcher.stop();
        tokenBatcher = null;
      }
      if (contentUpdater) {
        contentUpdater.stop();
        contentUpdater = null;
      }
      if (enableMemoryManagement && streamId) {
        streamingMemoryManager.cleanupStream(streamId);
      }
      streamId = null;
    }
  };

  return handlers;
}