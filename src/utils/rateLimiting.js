/**
 * Rate Limiting Utility
 *
 * Simple rate limiting implementation using Momento increment API.
 * Gracefully degrades when Momento is not available.
 */

import { isMomentoEnabled, getMomentoClient, generateRateLimitKey, getCacheName } from './momentoConfig.js';

/**
 * Check rate limit for shipping operations
 * @returns {Promise<Object>} Rate limit result with exceeded flag and info
 */
export async function checkRateLimit() {
  // If Momento is not enabled, skip rate limiting
  if (!isMomentoEnabled()) {
    return {
      exceeded: false,
      info: null
    };
  }

  try {
    const momentoClient = getMomentoClient();
    const key = generateRateLimitKey();

    // Use Momento increment to track requests per minute
    const result = await momentoClient.increment(getCacheName(), key);

    const count = result.value() || 0;
    const exceeded = count > 100; // 100 requests per minute limit

    // Calculate seconds until reset (remaining seconds in current minute)
    const now = new Date();
    const secondsIntoMinute = now.getSeconds();
    const resetSeconds = 60 - secondsIntoMinute;

    return {
      exceeded,
      info: {
        limit: 100,
        remaining: Math.max(0, 100 - count),
        reset_seconds: resetSeconds
      }
    };
  } catch (error) {
    console.warn('Rate limit check failed, allowing request:', error.message);

    // On error, allow the request but return null info
    return {
      exceeded: false,
      info: null
    };
  }
}

/**
 * Create a rate limit exceeded error response
 * @param {Object} rateLimitInfo - Rate limit information
 * @returns {Object} RFC 7807 compliant error response
 */
export function createRateLimitError(rateLimitInfo) {
  return {
    type: '/errors/rate_limit',
    title: 'Rate Limit Exceeded',
    status: 429,
    detail: `Exceeded 100 requests per minute limit. Current usage: ${100 - (rateLimitInfo.info?.remaining || 0)} requests`,
    instance: `/shipping/${getCurrentToolName()}/${Date.now()}`,
    next_steps: `Wait ${rateLimitInfo.info?.reset_seconds || 60} seconds before retrying`
  };
}

/**
 * Get current tool name for error reporting
 * This is a simple implementation that can be enhanced later
 * @returns {string} Current tool name
 */
function getCurrentToolName() {
  // Simple fallback - in a real implementation this would be passed as context
  return 'unknown_tool';
}
