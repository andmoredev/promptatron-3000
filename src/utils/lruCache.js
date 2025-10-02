/**
 * LRU (Least Recently Used) Cache implementation
 * Provides efficient caching with automatic eviction of least recently used items
 */
export class LRUCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = new Map(); // Track access order for LRU
    this.accessCounter = 0;
  }

  /**
   * Get an item from the cache
   * @param {string} key - Cache key
   * @returns {*} - Cached value or undefined if not found
   */
  get(key) {
    if (this.cache.has(key)) {
      // Update access order
      this.accessOrder.set(key, ++this.accessCounter);
      return this.cache.get(key);
    }
    return undefined;
  }

  /**
   * Set an item in the cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    // If key already exists, just update it
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.accessOrder.set(key, ++this.accessCounter);
      return;
    }

    // If cache is at capacity, evict least recently used item
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    // Add new item
    this.cache.set(key, value);
    this.accessOrder.set(key, ++this.accessCounter);
  }

  /**
   * Check if a key exists in the cache
   * @param {string} key - Cache key
   * @returns {boolean} - True if key exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Remove an item from the cache
   * @param {string} key - Cache key
   * @returns {boolean} - True if item was removed
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.accessOrder.delete(key);
    }
    return deleted;
  }

  /**
   * Clear all items from the cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  /**
   * Get current cache size
   * @returns {number} - Number of items in cache
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilizationPercent: Math.round((this.cache.size / this.maxSize) * 100),
      accessCounter: this.accessCounter
    };
  }

  /**
   * Evict the least recently used item
   * @private
   */
  evictLRU() {
    if (this.cache.size === 0) return;

    // Find the key with the smallest access counter
    let lruKey = null;
    let lruAccessTime = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < lruAccessTime) {
        lruAccessTime = accessTime;
        lruKey = key;
      }
    }

    if (lruKey !== null) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
    }
  }

  /**
   * Get all keys in the cache (for debugging)
   * @returns {Array} - Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get memory usage estimate in bytes
   * @returns {number} - Estimated memory usage
   */
  getMemoryUsage() {
    let totalSize = 0;

    // Estimate size of cache entries
    for (const [key, value] of this.cache.entries()) {
      // Rough estimation: key size + value size
      totalSize += this.estimateObjectSize(key) + this.estimateObjectSize(value);
    }

    // Add overhead for Map structures
    totalSize += this.cache.size * 32; // Rough overhead per Map entry
    totalSize += this.accessOrder.size * 32;

    return totalSize;
  }

  /**
   * Estimate the memory size of an object
   * @param {*} obj - Object to estimate
   * @returns {number} - Estimated size in bytes
   * @private
   */
  estimateObjectSize(obj) {
    if (obj === null || obj === undefined) return 0;

    switch (typeof obj) {
      case 'string':
        return obj.length * 2; // UTF-16 encoding
      case 'number':
        return 8; // 64-bit number
      case 'boolean':
        return 4;
      case 'object':
        if (Array.isArray(obj)) {
          return obj.reduce((size, item) => size + this.estimateObjectSize(item), 0);
        }
        // For objects, estimate based on JSON string length
        try {
          return JSON.stringify(obj).length * 2;
        } catch {
          return 100; // Fallback estimate
        }
      default:
        return 50; // Default estimate for unknown types
    }
  }
}
