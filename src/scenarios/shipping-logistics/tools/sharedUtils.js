/**
 * Shared utilities for shipping logistics enterprise refactor
 * Provides error handling, rate limiting, and caching utilities
 */

// Momento client setup
let momentoClient = null;
const MOMENTO_ENABLED = !!(import.meta?.env?.VITE_MOMENTO_API_KEY || process.env.MOMENTO_API_KEY);

if (MOMENTO_ENABLED) {
  try {
    // Dynamic import for Momento SDK
    const { CacheClient, Configurations, CredentialProvider } = await import('@gomomento/sdk-web');
    const apiKey = import.meta?.env?.VITE_MOMENTO_API_KEY || process.env.MOMENTO_API_KEY;
    momentoClient = new CacheClient({
      configuration: Configurations.Laptop.v1(),
      credentialProvider: CredentialProvider.fromString({
        apiKey: apiKey
      }),
      defaultTtlSeconds: 300
    });
  } catch (error) {
    console.warn('Failed to initialize Momento client:', error.message);
  }
}

// Simple in-memory rate limiting for when Momento is not available
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100;

/**
 * Get the configured cache name from environment variable
 * @returns {string} Cache name to use for Momento operations
 */
function getCacheName() {
  return import.meta?.env?.VITE_CACHE_NAME || process.env.CACHE_NAME || 'promptatron';
}

/**
 * Create RFC 7807 compliant error response
 * @param {string} type - Error type URI
 * @param {string} title - Short error title
 * @param {number} status - HTTP status code
 * @param {string} detail - Detailed error description
 * @param {string} nextSteps - Actionable guidance
 * @param {string} toolName - Current tool name for instance URI
 * @returns {Object} RFC 7807 error response
 */
export function createErrorResponse(type, title, status, detail, nextSteps, toolName = 'unknown') {
  return {
    type: type,
    title: title,
    status: status,
    detail: detail,
    instance: `/shipping/${toolName}/${Date.now()}`,
    next_steps: nextSteps
  };
}

/**
 * Create rate limit exceeded error response
 * @param {Object} rateLimitInfo - Rate limit information
 * @param {string} toolName - Current tool name
 * @returns {Object} Rate limit error response
 */
export function createRateLimitError(rateLimitInfo, toolName = 'unknown') {
  const currentUsage = rateLimitInfo.limit - rateLimitInfo.remaining;
  const resetTime = rateLimitInfo.reset_seconds;

  return createErrorResponse(
    '/errors/rate_limit',
    'Rate Limit Exceeded',
    429,
    `Exceeded ${rateLimitInfo.limit} requests per minute limit. Current usage: ${currentUsage}/${rateLimitInfo.limit}. Reset in ${resetTime} seconds.`,
    `Wait ${resetTime} seconds before retrying. Consider implementing exponential backoff: retry after ${resetTime}s, then ${resetTime * 2}s, then ${resetTime * 4}s.`,
    toolName
  );
}

/**
 * Create enhanced rate limit error with detailed usage information
 * @param {Object} rateLimitInfo - Rate limit information
 * @param {string} toolName - Current tool name
 * @param {Object} options - Additional options
 * @returns {Object} Enhanced rate limit error response
 */
export function createDetailedRateLimitError(rateLimitInfo, toolName = 'unknown', options = {}) {
  const currentUsage = rateLimitInfo.limit - rateLimitInfo.remaining;
  const resetTime = rateLimitInfo.reset_seconds;
  const { requestId, timestamp } = options;

  // Calculate exponential backoff suggestions
  const backoffSequence = [resetTime, resetTime * 2, resetTime * 4, resetTime * 8];
  const backoffSuggestion = backoffSequence.slice(0, 3).join('s, ') + 's';

  let detail = `Rate limit exceeded for shipping logistics API. `;
  detail += `Current usage: ${currentUsage}/${rateLimitInfo.limit} requests per minute. `;
  detail += `Limit resets in ${resetTime} seconds at ${new Date(Date.now() + resetTime * 1000).toISOString()}.`;

  if (requestId) {
    detail += ` Request ID: ${requestId}.`;
  }

  let nextSteps = `Implement retry logic with exponential backoff: ${backoffSuggestion}. `;
  nextSteps += `Monitor your request rate to stay within the ${rateLimitInfo.limit} RPM limit. `;
  nextSteps += `Consider caching responses to reduce API calls.`;

  return createErrorResponse(
    '/errors/rate_limit',
    'Rate Limit Exceeded',
    429,
    detail,
    nextSteps,
    toolName
  );
}

/**
 * Create rate limit warning when approaching limit
 * @param {Object} rateLimitInfo - Rate limit information
 * @param {number} warningThreshold - Percentage threshold for warning (default 80%)
 * @returns {Object|null} Warning object or null if not needed
 */
export function createRateLimitWarning(rateLimitInfo, warningThreshold = 0.8) {
  const usagePercentage = (rateLimitInfo.limit - rateLimitInfo.remaining) / rateLimitInfo.limit;

  if (usagePercentage >= warningThreshold) {
    const remaining = rateLimitInfo.remaining;
    const resetTime = rateLimitInfo.reset_seconds;

    return {
      type: 'rate_limit_warning',
      message: `Approaching rate limit: ${remaining} requests remaining`,
      usage_percentage: Math.round(usagePercentage * 100),
      remaining_requests: remaining,
      reset_in_seconds: resetTime,
      recommendation: remaining <= 5
        ? 'Consider pausing requests until reset to avoid rate limit errors'
        : 'Monitor request rate to avoid exceeding limit'
    };
  }

  return null;
}

/**
 * Get current minute key for rate limiting
 * @returns {string} Current minute key
 */
function getCurrentMinute() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
}

/**
 * Check rate limit using Momento increment API or in-memory fallback
 * @returns {Promise<Object>} Rate limit check result
 */
export async function checkRateLimit() {
  try {
    const currentMinute = getCurrentMinute();

    // Try Momento first if available
    if (MOMENTO_ENABLED && momentoClient) {
      try {
        const key = `rate_limit:shipping:${currentMinute}`;
        const result = await momentoClient.increment(getCacheName(), key);
        const count = result.value() || 0;
        const exceeded = count > RATE_LIMIT_MAX;

        return {
          exceeded,
          info: {
            limit: RATE_LIMIT_MAX,
            remaining: Math.max(0, RATE_LIMIT_MAX - count),
            reset_seconds: Math.ceil(60 - (Date.now() % 60000) / 1000)
          }
        };
      } catch (error) {
        console.warn('Momento rate limit check failed, falling back to in-memory:', error.message);
      }
    }

    // Fallback to in-memory rate limiting
    const now = Date.now();
    const windowStart = Math.floor(now / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;

    // Clean up old entries
    for (const [key, data] of rateLimitStore.entries()) {
      if (data.window < windowStart) {
        rateLimitStore.delete(key);
      }
    }

    // Get or create current window data
    const key = `shipping:${windowStart}`;
    let windowData = rateLimitStore.get(key);
    if (!windowData) {
      windowData = { window: windowStart, count: 0 };
      rateLimitStore.set(key, windowData);
    }

    // Increment counter
    windowData.count++;

    const exceeded = windowData.count > RATE_LIMIT_MAX;
    const resetSeconds = Math.ceil((windowStart + RATE_LIMIT_WINDOW - now) / 1000);

    return {
      exceeded,
      info: {
        limit: RATE_LIMIT_MAX,
        remaining: Math.max(0, RATE_LIMIT_MAX - windowData.count),
        reset_seconds: resetSeconds
      }
    };
  } catch (error) {
    // Ultimate fallback - always return a valid structure
    console.warn('Rate limit check failed completely, using safe defaults:', error.message);
    return {
      exceeded: false,
      info: {
        limit: RATE_LIMIT_MAX,
        remaining: RATE_LIMIT_MAX - 1,
        reset_seconds: 60
      }
    };
  }
}

/**
 * Check cache for existing response
 * @param {string} key - Cache key
 * @param {string} ifNoneMatch - ETag for conditional requests
 * @returns {Promise<Object|null>} Cached response or null
 */
export async function checkCache(key, ifNoneMatch) {
  if (!MOMENTO_ENABLED || !momentoClient) {
    return null;
  }

  try {
    const result = await momentoClient.get(getCacheName(), key);
    if (!result.value) {
      return null;
    }

    const cached = JSON.parse(result.value);

    // Handle conditional requests
    if (ifNoneMatch && ifNoneMatch === cached.meta.etag) {
      return { status: 304, meta: cached.meta };
    }

    cached.meta.from_cache = true;
    return cached;
  } catch (error) {
    console.warn('Cache check failed:', error.message);
    return null;
  }
}

/**
 * Cache response data
 * @param {string} key - Cache key
 * @param {Object} response - Response to cache
 * @param {number} ttlSeconds - TTL in seconds (default 300)
 * @returns {Promise<void>}
 */
export async function cacheResponse(key, response, ttlSeconds = 300) {
  if (!MOMENTO_ENABLED || !momentoClient) {
    return;
  }

  try {
    await momentoClient.set(getCacheName(), key, JSON.stringify(response), ttlSeconds);
  } catch (error) {
    console.warn('Cache set failed:', error.message);
  }
}

/**
 * Flush all cache data
 * @returns {Promise<Object>} Result of flush operation
 */
export async function flushCache() {
  if (!MOMENTO_ENABLED || !momentoClient) {
    // Clear in-memory rate limit store as well
    rateLimitStore.clear();
    return {
 success: false,
      message: 'Momento cache not enabled. Cleared in-memory rate limit store.',
      momento_enabled: false
    };
  }

  try {
    await momentoClient.flushCache(getCacheName());
    // Also clear in-memory rate limit store
    rateLimitStore.clear();
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
 * Check if caching is enabled and available
 * @returns {boolean} Whether caching is enabled
 */
export function isCacheEnabled() {
  return MOMENTO_ENABLED && momentoClient !== null;
}

/**
 * Generate ETag for response
 * @param {Object} data - Response data
 * @returns {string} ETag value
 */
export function generateEtag(data) {
  const content = JSON.stringify(data);
  return `"${Date.now()}-${content.length}"`;
}

/**
 * Validate order ID format
 * @param {string} orderId - Order ID to validate
 * @returns {Object} Validation result
 */
export function validateOrderId(orderId) {
  if (!orderId) {
    return {
      valid: false,
      error: createValidationError(
        'Missing Order ID',
        'The order_id parameter is required',
        'Provide a valid order_id in the request'
      )
    };
  }

  const pattern = /^[A-Z][0-9]{3,6}$/;
  if (!pattern.test(orderId)) {
    return {
      valid: false,
      error: createValidationError(
        'Invalid Order ID Format',
        `order_id must match pattern ^[A-Z][0-9]{3,6}$. Received: ${orderId}`,
        'Provide order_id in format: one letter + 3-6 digits (e.g., B456)'
      )
    };
  }

  return { valid: true };
}

/**
 * Create validation error response for invalid order IDs and field validation
 * @param {string} title - Error title
 * @param {string} detail - Detailed error description
 * @param {string} nextSteps - Actionable guidance
 * @param {string} toolName - Current tool name
 * @returns {Object} Validation error response
 */
export function createValidationError(title, detail, nextSteps, toolName = 'unknown') {
  return createErrorResponse(
    '/errors/validation',
    title,
    400,
    detail,
    nextSteps,
    toolName
  );
}

/**
 * Validate required field with specific error messages
 * @param {string} fieldName - Name of the field being validated
 * @param {any} value - Field value to validate
 * @param {string} toolName - Current tool name
 * @returns {Object} Validation result
 */
export function validateRequiredField(fieldName, value, toolName = 'unknown') {
  if (value === undefined || value === null || value === '') {
    return {
      valid: false,
      error: createValidationError(
        'Missing Required Field',
        `The ${fieldName} parameter is required`,
        `Provide a valid ${fieldName} in the request`,
        toolName
      )
    };
  }
  return { valid: true };
}

/**
 * Validate field against pattern with example format
 * @param {string} fieldName - Name of the field being validated
 * @param {string} value - Field value to validate
 * @param {RegExp} pattern - Validation pattern
 * @param {string} exampleFormat - Example of correct format
 * @param {string} toolName - Current tool name
 * @returns {Object} Validation result
 */
export function validateFieldPattern(fieldName, value, pattern, exampleFormat, toolName = 'unknown') {
  if (!pattern.test(value)) {
    return {
      valid: false,
      error: createValidationError(
        'Invalid Field Format',
        `${fieldName} must match pattern ${pattern.source}. Received: ${value}`,
        `Provide ${fieldName} in format: ${exampleFormat}`,
        toolName
      )
    };
  }
  return { valid: true };
}

/**
 * Validate idempotency key format for write operations
 * @param {string} idempotencyKey - Idempotency key to validate
 * @param {string} toolName - Current tool name
 * @returns {Object} Validation result
 */
export function validateIdempotencyKey(idempotencyKey, toolName = 'unknown') {
  const requiredCheck = validateRequiredField('idempotency_key', idempotencyKey, toolName);
  if (!requiredCheck.valid) {
    return requiredCheck;
  }

  const pattern = /^[a-z_]+_[A-Z][0-9]{3,6}_[0-9]+$/;
  return validateFieldPattern(
    'idempotency_key',
    idempotencyKey,
    pattern,
    'action_orderid_timestamp (e.g., exp_b456_001)',
    toolName
  );
}

/**
 * Validate request ID format for write operations
 * @param {string} requestId - Request ID to validate
 * @param {string} toolName - Current tool name
 * @returns {Object} Validation result
 */
export function validateRequestId(requestId, toolName = 'unknown') {
  const requiredCheck = validateRequiredField('request_id', requestId, toolName);
  if (!requiredCheck.valid) {
    return requiredCheck;
  }

  const pattern = /^req_[a-zA-Z0-9]{6,12}$/;
  return validateFieldPattern(
    'request_id',
    requestId,
    pattern,
    'req_ followed by 6-12 alphanumeric characters (e.g., req_123456)',
    toolName
  );
}

/**
 * Validate string length constraints
 * @param {string} fieldName - Name of the field being validated
 * @param {string} value - Field value to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @param {string} toolName - Current tool name
 * @returns {Object} Validation result
 */
export function validateStringLength(fieldName, value, minLength, maxLength, toolName = 'unknown') {
  if (typeof value !== 'string') {
    return {
      valid: false,
      error: createValidationError(
        'Invalid Field Type',
        `${fieldName} must be a string. Received: ${typeof value}`,
        `Provide ${fieldName} as a string value`,
        toolName
      )
    };
  }

  if (value.length < minLength) {
    return {
      valid: false,
      error: createValidationError(
        'Field Too Short',
        `${fieldName} must be at least ${minLength} characters. Current length: ${value.length}`,
        `Provide ${fieldName} with at least ${minLength} characters`,
        toolName
      )
    };
  }

  if (value.length > maxLength) {
    return {
      valid: false,
      error: createValidationError(
        'Field Too Long',
        `${fieldName} must be at most ${maxLength} characters. Current length: ${value.length}`,
        `Provide ${fieldName} with at most ${maxLength} characters`,
        toolName
      )
    };
  }

  return { valid: true };
}

/**
 * Validate enum value
 * @param {string} fieldName - Name of the field being validated
 * @param {any} value - Field value to validate
 * @param {Array} allowedValues - Array of allowed values
 * @param {string} toolName - Current tool name
 * @returns {Object} Validation result
 */
export function validateEnum(fieldName, value, allowedValues, toolName = 'unknown') {
  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      error: createValidationError(
        'Invalid Field Value',
        `${fieldName} must be one of: ${allowedValues.join(', ')}. Received: ${value}`,
        `Provide ${fieldName} as one of the allowed values: ${allowedValues.join(', ')}`,
        toolName
      )
    };
  }
  return { valid: true };
}
/**
 * Create order not found error response
 * @param {string} orderId - Order ID that was not found
 * @param {string} toolName - Current tool name
 * @param {Object} options - Additional options
 * @returns {Object} Not found error response
 */
export function createOrderNotFoundError(orderId, toolName = 'unknown', options = {}) {
  const { systemStatus, suggestedActions } = options;

  let detail = `Order ${orderId} does not exist in the system.`;
  if (systemStatus) {
    detail += ` System status: ${systemStatus}.`;
  }

  let nextSteps = `Verify the order ID format and ensure it exists in the system. `;
  nextSteps += `Check that the order ID follows the pattern: one letter + 3-6 digits (e.g., B456). `;

  if (suggestedActions) {
    nextSteps += suggestedActions.join(' ');
  } else {
    nextSteps += `Try searching for similar order IDs or contact customer service for assistance.`;
  }

  return createErrorResponse(
    '/errors/not_found',
    'Order Not Found',
    404,
    detail,
    nextSteps,
    toolName
  );
}

/**
 * Create resource not found error response
 * @param {string} resourceType - Type of resource (e.g., 'carrier', 'customer', 'package')
 * @param {string} resourceId - Resource ID that was not found
 * @param {string} toolName - Current tool name
 * @param {Object} options - Additional options
 * @returns {Object} Not found error response
 */
export function createResourceNotFoundError(resourceType, resourceId, toolName = 'unknown', options = {}) {
  const { systemStatus, availabilityCheck } = options;

  let detail = `${resourceType} with ID ${resourceId} does not exist or is not available.`;
  if (systemStatus) {
    detail += ` System status: ${systemStatus}.`;
  }

  let nextSteps = `Verify the ${resourceType} ID and ensure it exists in the system. `;

  if (availabilityCheck) {
    nextSteps += `Check resource availability: ${availabilityCheck}. `;
  }

  nextSteps += `Contact support if you believe this ${resourceType} should exist.`;

  return createErrorResponse(
    '/errors/not_found',
    `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} Not Found`,
    404,
    detail,
    nextSteps,
    toolName
  );
}

/**
 * Create data not found error with verification guidance
 * @param {string} dataType - Type of data being searched
 * @param {string} searchCriteria - Search criteria used
 * @param {string} toolName - Current tool name
 * @param {Object} options - Additional options
 * @returns {Object} Not found error response
 */
export function createDataNotFoundError(dataType, searchCriteria, toolName = 'unknown', options = {}) {
  const { verificationSteps, systemHealth } = options;

  let detail = `No ${dataType} found matching criteria: ${searchCriteria}.`;
  if (systemHealth) {
    detail += ` System health: ${systemHealth}.`;
  }

  let nextSteps = `Verify your search criteria and try the following: `;

  if (verificationSteps && verificationSteps.length > 0) {
    nextSteps += verificationSteps.map((step, index) => `${index + 1}. ${step}`).join(' ');
  } else {
    nextSteps += `1. Check spelling and format of search terms. `;
    nextSteps += `2. Verify the ${dataType} exists in the system. `;
    nextSteps += `3. Try broader search criteria. `;
    nextSteps += `4. Contact support if the issue persists.`;
  }

  return createErrorResponse(
    '/errors/not_found',
    `${dataType.charAt(0).toUpperCase() + dataType.slice(1)} Not Found`,
    404,
    detail,
    nextSteps,
    toolName
  );
}
/**
 * Create metadata object for responses
 * @param {Object} options - Metadata options
 * @returns {Object} Standardized metadata object
 */
export function createResponseMeta(options = {}) {
  const {
    etag,
    timestamp = new Date().toISOString(),
    fromCache = false,
    rateLimitInfo = null,
    includePaging = false,
    nextCursor = null,
    hasMore = false,
    nextSteps = null
  } = options;

  const meta = {
    etag: etag || generateEtag({ timestamp }),
    last_modified: timestamp,
    from_cache: fromCache,
    rate_limit: rateLimitInfo,
    next_steps: nextSteps
  };

  // Only include paging for list operations
  if (includePaging) {
    meta.paging = {
      next_cursor: nextCursor,
      has_more: hasMore
    };
  }

  return meta;
}

/**
 * Determine if an operation should include paging metadata
 * @param {string} toolName - Name of the tool
 * @param {string} operation - Type of operation (get, list, create, update, delete)
 * @returns {boolean} Whether to include paging metadata
 */
export function shouldIncludePaging(toolName, operation = 'get') {
  // Only list operations should include paging
  const listOperations = ['list', 'search', 'query'];
  const listTools = ['listOrders'];

  return listOperations.includes(operation) || listTools.includes(toolName);
}

/**
 * Handle idempotency key conflict by returning existing result
 * @param {Object} existingAction - The existing action record
 * @param {string} toolName - Current tool name
 * @returns {Object} The existing action result
 */
export function handleIdempotencyConflict(existingAction, toolName = 'unknown') {
  // Return the existing result with updated meta to indicate it's from cache
  const result = {
    ...existingAction.result,
    meta: {
      ...existingAction.result.meta,
      from_cache: true,
      idempotent_response: true,
      original_timestamp: existingAction.timestamp
    }
  };

  return result;
}

/**
 * Create idempotency key conflict error response (deprecated - use handleIdempotencyConflict instead)
 * @param {string} idempotencyKey - Conflicting idempotency key
 * @param {string} toolName - Current tool name
 * @param {Object} options - Additional options
 * @returns {Object} Conflict error response
 */
export function createIdempotencyConflictError(idempotencyKey, toolName = 'unknown', options = {}) {
  const { existingOperation, currentState } = options;

  let detail = `Idempotency key ${idempotencyKey} has already been used for a previous operation.`;
  if (existingOperation) {
    detail += ` Previous operation: ${existingOperation}.`;
  }

  let nextSteps = `Use a unique idempotency key for each operation. `;
  nextSteps += `Format: action_orderid_timestamp (e.g., exp_b456_${Date.now()}). `;

  if (currentState) {
    nextSteps += `Current resource state: ${currentState}. `;
  }

  nextSteps += `If you intended to retry the same operation, check the previous response.`;

  return createErrorResponse(
    '/errors/conflict',
    'Idempotency Key Conflict',
    409,
    detail,
    nextSteps,
    toolName
  );
}

/**
 * Create state conflict error response
 * @param {string} resourceType - Type of resource in conflict
 * @param {string} resourceId - ID of the conflicting resource
 * @param {string} currentState - Current state of the resource
 * @param {string} requiredState - Required state for the operation
 * @param {string} toolName - Current tool name
 * @param {Object} options - Additional options
 * @returns {Object} Conflict error response
 */
export function createStateConflictError(resourceType, resourceId, currentState, requiredState, toolName = 'unknown', options = {}) {
  const { resolutionSteps, stateTransitions } = options;

  let detail = `${resourceType} ${resourceId} is in state '${currentState}' but operation requires state '${requiredState}'.`;

  let nextSteps = `Resolve the state conflict by: `;

  if (resolutionSteps && resolutionSteps.length > 0) {
    nextSteps += resolutionSteps.map((step, index) => `${index + 1}. ${step}`).join(' ');
  } else {
    nextSteps += `1. Verify the current ${resourceType} state. `;
    nextSteps += `2. Wait for state transition to '${requiredState}' if in progress. `;
    nextSteps += `3. Perform required actions to change state to '${requiredState}'. `;
    nextSteps += `4. Retry the operation once the correct state is achieved.`;
  }

  if (stateTransitions) {
    nextSteps += ` Valid state transitions: ${stateTransitions}.`;
  }

  return createErrorResponse(
    '/errors/conflict',
    'Resource State Conflict',
    409,
    detail,
    nextSteps,
    toolName
  );
}

/**
 * Create concurrent modification conflict error response
 * @param {string} resourceType - Type of resource being modified
 * @param {string} resourceId - ID of the resource
 * @param {string} toolName - Current tool name
 * @param {Object} options - Additional options
 * @returns {Object} Conflict error response
 */
export function createConcurrentModificationError(resourceType, resourceId, toolName = 'unknown', options = {}) {
  const { lastModified, currentEtag, providedEtag } = options;

  let detail = `${resourceType} ${resourceId} has been modified by another process.`;
  if (lastModified) {
    detail += ` Last modified: ${lastModified}.`;
  }
  if (currentEtag && providedEtag) {
    detail += ` Expected ETag: ${providedEtag}, Current ETag: ${currentEtag}.`;
  }

  let nextSteps = `Resolve the concurrent modification conflict by: `;
  nextSteps += `1. Retrieve the latest version of the ${resourceType}. `;
  nextSteps += `2. Review the changes made by the other process. `;
  nextSteps += `3. Merge your changes with the latest version if appropriate. `;
  nextSteps += `4. Retry the operation with the updated ETag.`;

  return createErrorResponse(
    '/errors/conflict',
    'Concurrent Modification Conflict',
    409,
    detail,
    nextSteps,
    toolName
  );
}

/**
 * Create business rule conflict error response
 * @param {string} ruleName - Name of the violated business rule
 * @param {string} ruleDescription - Description of the business rule
 * @param {string} toolName - Current tool name
 * @param {Object} options - Additional options
 * @returns {Object} Conflict error response
 */
export function createBusinessRuleConflictError(ruleName, ruleDescription, toolName = 'unknown', options = {}) {
  const { violationDetails, allowedActions } = options;

  let detail = `Operation violates business rule: ${ruleName}. ${ruleDescription}`;
  if (violationDetails) {
    detail += ` Violation details: ${violationDetails}.`;
  }

  let nextSteps = `Resolve the business rule conflict by: `;

  if (allowedActions && allowedActions.length > 0) {
    nextSteps += allowedActions.map((action, index) => `${index + 1}. ${action}`).join(' ');
  } else {
    nextSteps += `1. Review the business rule requirements. `;
    nextSteps += `2. Modify your request to comply with the rule. `;
    nextSteps += `3. Contact support if you believe the rule should not apply. `;
    nextSteps += `4. Retry the operation with compliant parameters.`;
  }

  return createErrorResponse(
    '/errors/conflict',
    'Business Rule Violation',
    409,
    detail,
    nextSteps,
    toolName
  );
}
