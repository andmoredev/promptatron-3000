/**
 * Caching Utility
 *
 * Simple caching implementation using Momento Cache.
 * Provides inline caching operations with fallback behavior.
 */

import { isMomentoEnabled, getMomentoClient, generateCacheKey, getCacheName } from './momentoConfig.js';

/**
 * Check cache for a response
 * @param {string} cacheKey - Cache key to check
 * @param {string|null} ifNoneMatch - ETag for conditional requests
 * @returns {Promise<Object|null>} Cached response or null if not found
 */
export async function checkCache(cacheKey, ifNoneMatch = null) {
  // If Momento is not enabled, return null (cache miss)
  if (!isMomentoEnabled()) {
    return null;
  }

  try {
    const momentoClient = getMomentoClient();
    const result = await momentoClient.get(getCacheName(), cacheKey);

    if (!result.value) {
      return null; // Cache miss
    }

    const cached = JSON.parse(result.value);

    // Handle conditional requests (304 Not Modified)
    if (ifNoneMatch && ifNoneMatch === cached.meta?.etag) {
      return {
        status: 304,
        meta: cached.meta
      };
    }

    // Mark as from cache and return
    if (cached.meta) {
      cached.meta.from_cache = true;
    }

    return cached;
  } catch (error) {
    console.warn('Cache check failed:', error.message);
    return null; // Treat as cache miss on error
  }
}

/**
 * Cache a response
 * @param {string} cacheKey - Cache key to store under
 * @param {Object} response - Response object to cache
 * @param {number} ttlSeconds - Time to live in seconds (default: 300)
 * @returns {Promise<boolean>} True if cached successfully
 */
export async function cacheResponse(cacheKey, response, ttlSeconds = 300) {
  // If Momento is not enabled, skip caching
  if (!isMomentoEnabled()) {
    return false;
  }

  try {
    const momentoClient = getMomentoClient();

    // Ensure response has from_cache set to false before caching
    const responseToCache = {
      ...response,
      meta: {
        ...response.meta,
        from_cache: false
      }
    };

    await momentoClient.set(
      getCacheName(),
      cacheKey,
      JSON.stringify(responseToCache),
      ttlSeconds
    );

    return true;
  } catch (error) {
    console.warn('Failed to cache response:', error.message);
    return false;
  }
}

/**
 * Generate ETag for response data
 * @param {Object} data - Response data to generate ETag for
 * @returns {string} ETag value
 */
export function generateEtag(data) {
  const timestamp = Date.now();
  const dataString = JSON.stringify(data);
  const length = dataString.length;

  return `"${timestamp}-${length}"`;
}

/**
 * Check cache using idempotency key
 * @param {string} toolName - Name of the tool
 * @param {string} idempotencyKey - Idempotency key for the operation
 * @param {string|null} ifNoneMatch - ETag for conditional requests
 * @returns {Promise<Object|null>} Cached response or null if not found
 */
export async function checkIdempotencyCache(toolName, idempotencyKey, ifNoneMatch = null) {
  const cacheKey = generateCacheKey(toolName, `idempotency:${idempotencyKey}`);
  return await checkCache(cacheKey, ifNoneMatch);
}

/**
 * Cache response using idempotency key
 * @param {string} toolName - Name of the tool
 * @param {string} idempotencyKey - Idempotency key for the operation
 * @param {Object} response - Response object to cache
 * @param {number} ttlSeconds - Time to live in seconds (default: 3600 for idempotency)
 * @returns {Promise<boolean>} True if cached successfully
 */
export async function cacheIdempotencyResponse(toolName, idempotencyKey, response, ttlSeconds = 3600) {
  const cacheKey = generateCacheKey(toolName, `idempotency:${idempotencyKey}`);
  return await cacheResponse(cacheKey, response, ttlSeconds);
}

/**
 * Flush all cache data
 * @returns {Promise<Object>} Result of flush operation
 */
export async function flushAllCache() {
  if (!isMomentoEnabled()) {
    return {
      success: false,
      message: 'Momento cache not enabled',
      momento_enabled: false
    };
  }

  try {
    const momentoClient = getMomentoClient();
    await momentoClient.flushCache(getCacheName());
    return {
      success: true,
      message: 'Cache flushed successfully',
      momento_enabled: true
    };
  } catch (error) {
    console.warn('Cache flush failed:', error.message);
    return {
      success: false,
      message: `Cache flush failed: ${error.message}`,
      momento_enabled: true,
      error: error.message
    };
  }
}

/**
 * Simple cache operations for tool handlers
 * This provides the inline caching pattern described in the design
 */
export class SimpleCache {
  /**
   * Get cached response or execute function and cache result
   * @param {string} toolName - Name of the tool
   * @param {string} identifier - Unique identifier (e.g., order_id)
   * @param {Function} fetchFunction - Function to execute if cache miss
   * @param {Object} options - Options including ifNoneMatch
   * @returns {Promise<Object>} Response object
   */
  static async getOrSet(toolName, identifier, fetchFunction, options = {}) {
    const { ifNoneMatch, ttlSeconds = 300 } = options;
    const cacheKey = generateCacheKey(toolName, identifier);

    // Check cache first
    const cached = await checkCache(cacheKey, ifNoneMatch);
    if (cached) {
      return cached;
    }

    // Cache miss - execute function
    const result = await fetchFunction();

    // Add ETag if not present
    if (result.meta && !result.meta.etag) {
      result.meta.etag = generateEtag(result);
    }

    // Cache the result
    await cacheResponse(cacheKey, result, ttlSeconds);

    return result;
  }

  /**
   * Get cached response using idempotency key or execute function and cache result
   * @param {string} toolName - Name of the tool
   * @param {string} idempotencyKey - Idempotency key for the operation
   * @param {Function} fetchFunction - Function to execute if cache miss
   * @param {Object} options - Options including ifNoneMatch
   * @returns {Promise<Object>} Response object
   */
  static async getOrSetIdempotent(toolName, idempotencyKey, fetchFunction, options = {}) {
    const { ifNoneMatch, ttlSeconds = 3600 } = options;

    // Check idempotency cache first
    const cached = await checkIdempotencyCache(toolName, idempotencyKey, ifNoneMatch);
    if (cached) {
      // Mark as idempotent response
      if (cached.meta) {
        cached.meta.idempotent_response = true;
      }
      return cached;
    }

    // Cache miss - execute function
    const result = await fetchFunction();

    // Add ETag if not present
    if (result.meta && !result.meta.etag) {
      result.meta.etag = generateEtag(result);
    }

    // Cache the result using idempotency key
    await cacheIdempotencyResponse(toolName, idempotencyKey, result, ttlSeconds);

    return result;
  }
}
