import { getEncoding } from 'js-tiktoken';
import { analyzeError, handleError, ErrorTypes } from '../utils/errorHandling.js';
import { handleTokenEstimationError, createFallbackUsageData } from '../utils/tokenCostErrorHandling.js';
import { notificationManager } from '../utils/notificationManager.js';
import { LRUCache } from '../utils/lruCache.js';
import { performanceMonitor } from '../utils/performanceMonitor.js';

/**
 * Service class for token estimation
 * Handles token counting when API doesn't provide usage data
 * Includes performance optimizations: LRU caching, lazy loading, and monitoring
 */
export class TokenEstimationService {
  constructor() {
    this.encoders = new Map(); // Cache for tiktoken encoders (lazy loaded)
    this.tokenCache = new LRUCache(1000); // LRU cache for token estimations
    this.isInitialized = false;
    this.lastError = null;
    this.performanceStats = {
      cacheHits: 0,
      cacheMisses: 0,
      encoderLoads: 0,
      totalEstimations: 0
    };
  }

  /**
   * Model to tokenizer mapping for different AI model families
   * Uses tiktoken encoders as approximations for non-OpenAI models
   */
  getModelTokenizerMapping() {
    return {
      // Claude models - use cl100k_base as approximation
      'anthropic.claude-3-sonnet-20240229-v1:0': 'cl100k_base',
      'anthropic.claude-3-5-sonnet-20241022-v2:0': 'cl100k_base',
      'anthropic.claude-3-5-haiku-20241022-v1:0': 'cl100k_base',
      'anthropic.claude-3-haiku-20240307-v1:0': 'cl100k_base',
      'anthropic.claude-3-opus-20240229-v1:0': 'cl100k_base',

      // Nova models - use o200k_base for newer models
      'amazon.nova-pro-v1:0': 'o200k_base',
      'amazon.nova-lite-v1:0': 'o200k_base',
      'amazon.nova-micro-v1:0': 'o200k_base',

      // Llama models - use cl100k_base as approximation
      'meta.llama3-2-90b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-2-11b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-2-3b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-2-1b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-1-70b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-1-8b-instruct-v1:0': 'cl100k_base',

      // Mistral models - use cl100k_base as approximation
      'mistral.mistral-7b-instruct-v0:2': 'cl100k_base',
      'mistral.mixtral-8x7b-instruct-v0:1': 'cl100k_base',
      'mistral.mistral-large-2402-v1:0': 'cl100k_base',

      // Default fallback
      'default': 'cl100k_base'
    };
  }

  /**
   * Initialize the token estimation service
   * Uses lazy loading - encoders are loaded on demand for better performance
   */
  async initialize() {
    try {
      // Initialize performance monitoring
      performanceMonitor.recordMemorySnapshot('tokenEstimationService_init');

      // Service is ready - encoders will be loaded lazily
      this.isInitialized = true;
      this.lastError = null;

      console.log('Token estimation service initialized with lazy loading and LRU caching', {
        cacheSize: this.tokenCache.maxSize,
        lazyLoading: true
      });

      return {
        success: true,
        message: 'Token estimation service initialized successfully with performance optimizations',
        features: ['lazy-loading', 'lru-caching', 'performance-monitoring']
      };
    } catch (error) {
      this.isInitialized = false;
      this.lastError = error;

      // Handle initialization error with user notification
      const errorResult = handleTokenEstimationError(error, {
        component: 'TokenEstimationService',
        action: 'initialize'
      });

      // Notify user about initialization failure
      notificationManager.notifyServiceInitializationError(
        'TokenEstimationService',
        errorResult.errorInfo,
        {
          canContinue: true,
          userNotification: {
            message: 'Token estimation will use simplified methods. Accuracy may be reduced.',
            actions: ['Continue with basic estimation', 'Refresh page to retry']
          }
        }
      );

      return {
        success: false,
        message: `Token estimation service initialization failed: ${error.message}`,
        error: error,
        fallbackAvailable: true
      };
    }
  }

  /**
   * Get the appropriate tokenizer for a given model
   * @param {string} modelId - The model identifier
   * @returns {string} - The tokenizer name to use
   */
  getModelTokenizer(modelId) {
    const mapping = this.getModelTokenizerMapping();
    return mapping[modelId] || mapping['default'];
  }

  /**
   * Get or create an encoder for the specified tokenizer (lazy loading)
   * @param {string} tokenizerName - The name of the tokenizer
   * @returns {Object|null} - The encoder instance or null if failed
   */
  getEncoder(tokenizerName) {
    const timerId = performanceMonitor.startTimer('encoder_load');

    try {
      // Check cache first
      if (this.encoders.has(tokenizerName)) {
        performanceMonitor.stopTimer('encoder_load', timerId);
        return this.encoders.get(tokenizerName);
      }

      // Lazy load encoder on demand
      console.log(`Lazy loading encoder: ${tokenizerName}`);
      const encoder = getEncoding(tokenizerName);
      this.encoders.set(tokenizerName, encoder);
      this.performanceStats.encoderLoads++;

      // Record memory usage after loading encoder
      performanceMonitor.recordMemorySnapshot(`encoder_loaded_${tokenizerName}`, {
        encoderName: tokenizerName,
        totalEncoders: this.encoders.size
      });

      performanceMonitor.stopTimer('encoder_load', timerId);
      return encoder;
    } catch (error) {
      console.warn(`Failed to get encoder for ${tokenizerName}:`, error.message);
      this.lastError = error;
      performanceMonitor.stopTimer('encoder_load', timerId);
      return null;
    }
  }

  /**
   * Generate cache key for token estimation
   * @param {string} text - The text to count tokens for
   * @param {string} modelId - The model identifier
   * @returns {string} - Cache key
   * @private
   */
  generateCacheKey(text, modelId) {
    // Create a hash-like key from text and model
    const textHash = this.simpleHash(text);
    return `${modelId}:${textHash}:${text.length}`;
  }

  /**
   * Simple hash function for cache keys
   * @param {string} str - String to hash
   * @returns {string} - Hash string
   * @private
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Estimate token count for a given text and model with caching and performance monitoring
   * @param {string} text - The text to count tokens for
   * @param {string} modelId - The model identifier
   * @returns {Object} - Token estimation result
   */
  estimateTokens(text, modelId) {
    const timerId = performanceMonitor.startTimer('token_estimation');
    this.performanceStats.totalEstimations++;

    try {
      if (!text || typeof text !== 'string') {
        performanceMonitor.stopTimer('token_estimation', timerId);
        return {
          tokens: 0,
          isEstimated: true,
          method: 'empty-text',
          error: null,
          cached: false,
          duration: 0
        };
      }

      // Check cache first
      const cacheKey = this.generateCacheKey(text, modelId);
      const cachedResult = this.tokenCache.get(cacheKey);

      if (cachedResult) {
        this.performanceStats.cacheHits++;
        const duration = performanceMonitor.stopTimer('token_estimation', timerId);
        return {
          ...cachedResult,
          cached: true,
          duration
        };
      }

      this.performanceStats.cacheMisses++;

      const tokenizerName = this.getModelTokenizer(modelId);
      const encoder = this.getEncoder(tokenizerName);

      let result;
      if (!encoder) {
        // Fallback to character-based estimation
        const estimatedTokens = Math.ceil(text.length / 4); // Rough approximation: 4 chars per token
        result = {
          tokens: estimatedTokens,
          isEstimated: true,
          method: 'character-fallback',
          error: 'Tokenizer unavailable, using character-based estimation'
        };
      } else {
        const tokens = encoder.encode(text);
        result = {
          tokens: tokens.length,
          isEstimated: true,
          method: tokenizerName,
          error: null
        };
      }

      // Cache the result
      this.tokenCache.set(cacheKey, result);

      const duration = performanceMonitor.stopTimer('token_estimation', timerId);
      return {
        ...result,
        cached: false,
        duration
      };
    } catch (error) {
      console.warn(`Token estimation failed for model ${modelId}:`, error.message);
      this.lastError = error;

      // Use enhanced error handling
      const errorResult = handleTokenEstimationError(error, {
        modelId,
        text,
        estimationMethod: this.getModelTokenizer(modelId)
      });

      // Notify user if this is a significant error
      if (error.message?.includes('memory') || error.message?.includes('encoder')) {
        notificationManager.notifyTokenEstimationError(
          errorResult.errorInfo,
          errorResult
        );
      }

      const duration = performanceMonitor.stopTimer('token_estimation', timerId);
      return {
        ...errorResult,
        cached: false,
        duration
      };
    }
  }

  /**
   * Estimate tokens for input (system prompt + user prompt + content)
   * @param {string} systemPrompt - The system prompt
   * @param {string} userPrompt - The user prompt
   * @param {string} content - Additional content (dataset, etc.)
   * @param {string} modelId - The model identifier
   * @returns {Object} - Token estimation result
   */
  estimateInputTokens(systemPrompt, userPrompt, content, modelId) {
    try {
      // Combine all input text similar to how BedrockService constructs the request
      let fullInput = '';

      if (systemPrompt?.trim()) {
        fullInput += systemPrompt.trim() + '\n\n';
      }

      if (userPrompt?.trim()) {
        fullInput += userPrompt.trim();
      }

      if (content?.trim()) {
        fullInput += '\n\nData to analyze:\n' + content.trim();
      }

      return this.estimateTokens(fullInput, modelId);
    } catch (error) {
      console.warn('Input token estimation failed:', error.message);
      this.lastError = error;

      return {
        tokens: null,
        isEstimated: true,
        method: 'error',
        error: error.message
      };
    }
  }

  /**
   * Estimate tokens for output (model response)
   * @param {string} responseText - The model response text
   * @param {string} modelId - The model identifier
   * @returns {Object} - Token estimation result
   */
  estimateOutputTokens(responseText, modelId) {
    return this.estimateTokens(responseText, modelId);
  }

  /**
   * Check if the service is ready to use
   * @returns {boolean} - True if service is initialized
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Get service status information including performance metrics
   * @returns {Object} - Status information
   */
  getStatus() {
    const cacheStats = this.tokenCache.getStats();
    const memoryUsage = this.getMemoryUsage();
    const performanceMetrics = performanceMonitor.getMetrics('token_estimation');

    return {
      initialized: this.isInitialized,
      ready: this.isReady(),
      encodersLoaded: this.encoders.size,
      lastError: this.lastError?.message || null,
      supportedEncoders: ['cl100k_base', 'o200k_base'],
      performance: {
        ...this.performanceStats,
        cacheHitRate: this.performanceStats.totalEstimations > 0
          ? Math.round((this.performanceStats.cacheHits / this.performanceStats.totalEstimations) * 100)
          : 0,
        avgEstimationTime: performanceMetrics?.avgTime || null,
        recentAvgTime: performanceMetrics?.recentAvg || null
      },
      cache: {
        ...cacheStats,
        memoryUsageMB: Math.round(this.tokenCache.getMemoryUsage() / 1024 / 1024 * 100) / 100
      },
      memory: memoryUsage
    };
  }

  /**
   * Get memory usage information for the service
   * @returns {Object} - Memory usage data
   */
  getMemoryUsage() {
    let totalMemory = 0;

    // Estimate encoder memory usage
    const encoderMemory = this.encoders.size * 1024 * 1024; // Rough estimate: 1MB per encoder
    totalMemory += encoderMemory;

    // Cache memory usage
    const cacheMemory = this.tokenCache.getMemoryUsage();
    totalMemory += cacheMemory;

    return {
      totalMB: Math.round(totalMemory / 1024 / 1024 * 100) / 100,
      encodersMB: Math.round(encoderMemory / 1024 / 1024 * 100) / 100,
      cacheMB: Math.round(cacheMemory / 1024 / 1024 * 100) / 100,
      encodersCount: this.encoders.size,
      cacheSize: this.tokenCache.size()
    };
  }

  /**
   * Check if performance requirements are met
   * @returns {Object} - Performance check result
   */
  checkPerformanceRequirements() {
    const requirements = {
      maxAvgEstimationTime: 100, // 100ms as per requirement 7.1
      minCacheHitRate: 50, // 50% cache hit rate for efficiency
      maxMemoryUsageMB: 50 // 50MB memory limit
    };

    const status = this.getStatus();
    const performanceCheck = performanceMonitor.checkPerformanceRequirements(
      'token_estimation',
      requirements.maxAvgEstimationTime,
      requirements.maxAvgEstimationTime
    );

    const cacheHitRate = status.performance.cacheHitRate;
    const memoryUsage = status.memory.totalMB;

    const checks = {
      estimationSpeed: performanceCheck.passed,
      cacheEfficiency: cacheHitRate >= requirements.minCacheHitRate,
      memoryUsage: memoryUsage <= requirements.maxMemoryUsageMB
    };

    const allPassed = Object.values(checks).every(check => check);

    return {
      passed: allPassed,
      requirements,
      actual: {
        avgEstimationTime: performanceCheck.avgTime,
        cacheHitRate,
        memoryUsageMB: memoryUsage
      },
      checks,
      recommendations: this.generatePerformanceRecommendations(checks, status)
    };
  }

  /**
   * Generate performance recommendations
   * @param {Object} checks - Performance check results
   * @param {Object} status - Service status
   * @returns {Array} - Array of recommendations
   * @private
   */
  generatePerformanceRecommendations(checks, status) {
    const recommendations = [];

    if (!checks.estimationSpeed) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: `Token estimation is slower than 100ms (avg: ${status.performance.avgEstimationTime}ms). Consider optimizing text preprocessing.`
      });
    }

    if (!checks.cacheEfficiency) {
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        message: `Cache hit rate is low (${status.performance.cacheHitRate}%). Consider increasing cache size or reviewing cache key strategy.`
      });
    }

    if (!checks.memoryUsage) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        message: `Memory usage is high (${status.memory.totalMB}MB). Consider clearing encoder cache or reducing cache size.`
      });
    }

    if (status.performance.totalEstimations > 1000 && status.performance.cacheHitRate < 30) {
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        message: 'Low cache efficiency with high usage. Consider analyzing token estimation patterns.'
      });
    }

    return recommendations;
  }

  /**
   * Clear encoder cache to free memory
   */
  clearEncoderCache() {
    // Free encoder resources
    for (const encoder of this.encoders.values()) {
      if (encoder && typeof encoder.free === 'function') {
        try {
          encoder.free();
        } catch (error) {
          console.warn('Error freeing encoder:', error.message);
        }
      }
    }

    this.encoders.clear();
    performanceMonitor.recordMemorySnapshot('encoder_cache_cleared');
    console.log('Encoder cache cleared');
  }

  /**
   * Clear token estimation cache
   */
  clearTokenCache() {
    this.tokenCache.clear();
    performanceMonitor.recordMemorySnapshot('token_cache_cleared');
    console.log('Token cache cleared');
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.clearEncoderCache();
    this.clearTokenCache();
  }

  /**
   * Optimize memory usage by clearing least recently used encoders
   * @param {number} maxEncoders - Maximum number of encoders to keep
   */
  optimizeEncoderMemory(maxEncoders = 2) {
    if (this.encoders.size <= maxEncoders) return;

    // This is a simple implementation - in a real scenario, you'd track encoder usage
    const encoderEntries = Array.from(this.encoders.entries());
    const toRemove = encoderEntries.slice(0, encoderEntries.length - maxEncoders);

    for (const [name, encoder] of toRemove) {
      if (encoder && typeof encoder.free === 'function') {
        try {
          encoder.free();
        } catch (error) {
          console.warn(`Error freeing encoder ${name}:`, error.message);
        }
      }
      this.encoders.delete(name);
    }

    performanceMonitor.recordMemorySnapshot('encoder_memory_optimized', {
      removedEncoders: toRemove.length,
      remainingEncoders: this.encoders.size
    });

    console.log(`Optimized encoder memory: removed ${toRemove.length} encoders, ${this.encoders.size} remaining`);
  }

  /**
   * Get performance report for the service
   * @returns {Object} - Performance report
   */
  getPerformanceReport() {
    const status = this.getStatus();
    const performanceCheck = this.checkPerformanceRequirements();
    const memorySnapshots = performanceMonitor.getMemorySnapshots(5);

    return {
      timestamp: new Date().toISOString(),
      service: 'TokenEstimationService',
      status,
      performanceCheck,
      memorySnapshots,
      recommendations: performanceCheck.recommendations
    };
  }

  /**
   * Cleanup resources when service is no longer needed
   */
  cleanup() {
    this.clearAllCaches();
    this.isInitialized = false;
    this.lastError = null;
    this.performanceStats = {
      cacheHits: 0,
      cacheMisses: 0,
      encoderLoads: 0,
      totalEstimations: 0
    };
    performanceMonitor.recordMemorySnapshot('service_cleanup');
  }
}

// Export a singleton instance
export const tokenEstimationService = new TokenEstimationService();
