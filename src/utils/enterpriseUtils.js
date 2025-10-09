/**
 * Enterprise-grade utilities for error handling and rate limiting
 * Following RFC 7807 standard and Momento integration patterns
 */

let momentoClient = null;
const MOMENTO_ENABLED = !!(import.meta.env?.VITE_MOMENTO_API_KEY || process.env.VITE_MOMENTO_API_KEY);

// Initialize Momento client if API key is available
if (MOMENTO_ENABLED) {
  try {
    const { CacheClient, Configurations, CredentialProvider } = await import('@gomomento/sdk-web');
    momentoClient = new CacheClient({
      configuration: Configurations.Laptop.v1(),
      credentialProvider: CredentialProvider.fromString({
        apiKey: import.meta.env?.VITE_MOMENTO_API_KEY || process.env.VITE_MOMENTO_API_KEY
      }),
      defaultTtlSeconds: 300
    });
  } catch (error) {
    console.warn('Failed to initialize Momento client:', error);
  }
}

/**
 * Get the configured cache name from environment variable
 * @returns {string} Cache name to use for Momento operations
 */
function getCacheName() {
  return import.meta.env?.VITE_CACHE_NAME || process.env.CACHE_NAME || 'promptatron';
}

/**
 * RFC 7807 Error Types
 */
export const RFC7807_ERROR_TYPES = {
  VALIDATION: '/errors/validation',
  RATE_LIMIT: '/errors/rate_limit',
  NOT_FOUND: '/errors/not_found',
  CONFLICT: '/errors/conflict',
  INTERNAL_ERROR: '/errors/internal_error',
  SERVICE_UNAVAILABLE: '/errors/service_unavailable'
};

/**
 * Create RFC 7807 compliant error response
 * @param {string} type - Error type URI
 * @param {string} title - Short, human-readable summary
 * @param {number} status - HTTP status code
 * @param {string} detail - Human-readable explanation
 * @param {string} nextSteps - Actionable guidance for resolution
 * @param {string} instance - URI reference that identifies the specific occurrence
 * @returns {Object} RFC 7807 compliant error object
 */
export function createErrorResponse(type, title, status, detail, nextSteps, instance = null) {
  const errorInstance = instance || `/shipping/${getCurrentToolName()}/${Date.now()}`;

  return {
    type,
    title,
    status,
    detail,
    instance: errorInstance,
    next_steps: nextSteps
  };
}

/**
 * Create validation error response
 * @param {string} field - Field that failed validation
 * @param {string} value - Invalid value
 * @param {string} pattern - Expected pattern or format
 * @param {string} example - Example of valid format
 * @returns {Object} RFC 7807 validation error
 */
export function createValidationError(field, value, pattern, example) {
  return createErrorResponse(
    RFC7807_ERROR_TYPES.VALIDATION,
    'Request Validation Failed',
    400,
    `${field} must match pattern ${pattern}. Received: ${value}`,
    `Provide ${field} in format: ${example} (e.g., ${example})`
  );
}

/**
 * Create rate limit error response
 * @param {Object} rateLimitInfo - Rate limit information
 * @returns {Object} RFC 7807 rate limit error
 */
export function createRateLimitError(rateLimitInfo) {
  const currentUsage = rateLimitInfo.limit - rateLimitInfo.remaining;

  return createErrorResponse(
    RFC7807_ERROR_TYPES.RATE_LIMIT,
    'Rate Limit Exceeded',
    429,
    `Exceeded ${rateLimitInfo.limit} requests per minute limit. Current: ${currentUsage}`,
    `Wait ${rateLimitInfo.reset_seconds} seconds before retrying`
  );
}

/**
 * Create not found error response
 * @param {string} resource - Resource that was not found
 * @param {string} identifier - Resource identifier
 * @returns {Object} RFC 7807 not found error
 */
export function createNotFoundError(resource, identifier) {
  return createErrorResponse(
    RFC7807_ERROR_TYPES.NOT_FOUND,
    `${resource} Not Found`,
    404,
    `${resource} ${identifier} does not exist in the system`,
    `Verify the ${resource.toLowerCase()} ID and ensure it exists in the system`
  );
}

/**
 * Create conflict error response
 * @param {string} reason - Reason for the conflict
 * @param {string} currentState - Current state information
 * @returns {Object} RFC 7807 conflict error
 */
export function createConflictError(reason, currentState) {
  return createErrorResponse(
    RFC7807_ERROR_TYPES.CONFLICT,
    'Request Conflict',
    409,
    reason,
    `Check current resource state: ${currentState}`
  );
}

/**
 * Check rate limit using Momento increment API
 * @param {string} keyPrefix - Prefix for the rate limit key (e.g., 'shipping')
 * @param {number} limit - Rate limit (default: 100 requests per minute)
 * @returns {Promise<Object>} Rate limit check result
 */
export async function checkRateLimit(keyPrefix = 'shipping', limit = 100) {
  if (!MOMENTO_ENABLED || !momentoClient) {
    return {
      exceeded: false,
      info: null
    };
  }

  try {
    const currentMinute = getCurrentMinute();
    const key = `rate_limit:${keyPrefix}:${currentMinute}`;

    const result = await momentoClient.increment(getCacheName(), key);

    const count = result.value() || 0;
    const exceeded = count > limit;
    const remaining = Math.max(0, limit - count);
    const resetSeconds = Math.ceil(60 - (Date.now() % 60000) / 1000);

    return {
      exceeded,
      info: {
        limit,
        remaining,
        reset_seconds: resetSeconds
      }
    };
  } catch (error) {
    console.warn('Rate limit check failed, allowing request:', error);
    return {
      exceeded: false,
      info: null
    };
  }
}

/**
 * Get current minute for rate limiting key
 * @returns {string} Current minute in format YYYY-MM-DD-HH-MM
 */
function getCurrentMinute() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}-${hour}-${minute}`;
}

/**
 * Get current tool name from context (placeholder implementation)
 * @returns {string} Current tool name
 */
function getCurrentToolName() {
  // This would be set by the tool handler context
  return 'unknown_tool';
}

/**
 * Common validation patterns for shipping logistics
 */
export const VALIDATION_PATTERNS = {
  ORDER_ID: /^[A-Z][0-9]{3,6}$/,
  TRACKING_NUMBER: /^[A-Z]{2}[0-9]{10}$/,
  CARRIER_CODE: /^[A-Z]{2,4}$/,
  CURRENCY_CODE: /^[A-Z]{3}$/,
  PHONE_NUMBER: /^\+?[1-9]\d{1,14}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  POSTAL_CODE: /^[A-Z0-9\s-]{3,10}$/i
};

/**
 * Validation helper functions
 */
export const ValidationHelpers = {
  /**
   * Validate order ID format
   * @param {string} orderId - Order ID to validate
   * @returns {Object} Validation result
   */
  validateOrderId(orderId) {
    if (!orderId) {
      return {
        valid: false,
        error: createValidationError('order_id', 'null', '^[A-Z][0-9]{3,6}$', 'B456')
      };
    }

    if (!VALIDATION_PATTERNS.ORDER_ID.test(orderId)) {
      return {
        valid: false,
        error: createValidationError('order_id', orderId, '^[A-Z][0-9]{3,6}$', 'B456')
      };
    }

    return { valid: true };
  },

  /**
   * Validate tracking number format
   * @param {string} trackingNumber - Tracking number to validate
   * @returns {Object} Validation result
   */
  validateTrackingNumber(trackingNumber) {
    if (!trackingNumber) {
      return {
        valid: false,
        error: createValidationError('tracking_number', 'null', '^[A-Z]{2}[0-9]{10}$', 'RX8829912847')
      };
    }

    if (!VALIDATION_PATTERNS.TRACKING_NUMBER.test(trackingNumber)) {
      return {
        valid: false,
        error: createValidationError('tracking_number', trackingNumber, '^[A-Z]{2}[0-9]{10}$', 'RX8829912847')
      };
    }

    return { valid: true };
  },

  /**
   * Validate required field
   * @param {string} fieldName - Name of the field
   * @param {any} value - Value to validate
   * @param {string} example - Example of valid value
   * @returns {Object} Validation result
   */
  validateRequired(fieldName, value, example = 'valid_value') {
    if (value === null || value === undefined || value === '') {
      return {
        valid: false,
        error: createErrorResponse(
          RFC7807_ERROR_TYPES.VALIDATION,
          'Missing Required Field',
          400,
          `The ${fieldName} parameter is required`,
          `Provide a valid ${fieldName} in the request (e.g., ${example})`
        )
      };
    }

    return { valid: true };
  },

  /**
   * Validate enum value
   * @param {string} fieldName - Name of the field
   * @param {any} value - Value to validate
   * @param {Array} allowedValues - Array of allowed values
   * @returns {Object} Validation result
   */
  validateEnum(fieldName, value, allowedValues) {
    if (!allowedValues.includes(value)) {
      return {
        valid: false,
        error: createErrorResponse(
          RFC7807_ERROR_TYPES.VALIDATION,
          'Invalid Enum Value',
          400,
          `${fieldName} must be one of: ${allowedValues.join(', ')}. Received: ${value}`,
          `Use one of the allowed values: ${allowedValues.join(', ')}`
        )
      };
    }

    return { valid: true };
  },

  /**
   * Validate string length
   * @param {string} fieldName - Name of the field
   * @param {string} value - Value to validate
   * @param {number} minLength - Minimum length
   * @param {number} maxLength - Maximum length
   * @returns {Object} Validation result
   */
  validateLength(fieldName, value, minLength, maxLength) {
    if (typeof value !== 'string') {
      return {
        valid: false,
        error: createErrorResponse(
          RFC7807_ERROR_TYPES.VALIDATION,
          'Invalid Field Type',
          400,
          `${fieldName} must be a string`,
          `Provide ${fieldName} as a string value`
        )
      };
    }

    if (value.length < minLength || value.length > maxLength) {
      return {
        valid: false,
        error: createErrorResponse(
          RFC7807_ERROR_TYPES.VALIDATION,
          'Invalid Field Length',
          400,
          `${fieldName} must be between ${minLength} and ${maxLength} characters. Current length: ${value.length}`,
          `Provide ${fieldName} with ${minLength}-${maxLength} characters`
        )
      };
    }

    return { valid: true };
  }
};

/**
 * Generate ETag for response caching
 * @param {Object} data - Data to generate ETag for
 * @returns {string} ETag value
 */
export function generateEtag(data) {
  const content = JSON.stringify(data);
  const timestamp = Date.now();
  const hash = content.length;

  return `"${timestamp}-${hash}"`;
}

/**
 * Check if Momento is enabled and available
 * @returns {boolean} True if Momento is available
 */
export function isMomentoEnabled() {
  return MOMENTO_ENABLED && momentoClient !== null;
}

/**
 * Get current tool name from execution context
 * This should be called with the actual tool name during execution
 * @param {string} toolName - Name of the current tool
 */
export function setCurrentToolName(toolName) {
  // Store in a module-level variable or context
  getCurrentToolName = () => toolName;
}
