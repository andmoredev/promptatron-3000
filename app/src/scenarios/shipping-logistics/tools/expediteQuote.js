/**
 * Get cost and ETA for expedited shipping options
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.order_id - Order ID to query
 * @param {string} parameters.speed - Expedite speed (overnight or same_day)
 * @param {Object} parameters.meta - Optional metadata for read operations
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Expedite quote information with enterprise meta fields
 */
export async function getExpediteQuote(parameters, context) {
  const { order_id, speed, meta } = parameters;

  // Import utilities
  const { HandlerUtils } = await import('./handlerUtils.js');
  const {
    validateOrderId,
    checkRateLimit,
    createRateLimitError,
    checkCache,
    cacheResponse,
    generateEtag,
    createErrorResponse
  } = await import('./sharedUtils.js');

  // 1. Basic parameter validation
  const validation = validateOrderId(order_id);
  if (!validation.valid) {
    return validation.error;
  }

  // Validate speed parameter
  if (!speed || !['overnight', 'same_day'].includes(speed)) {
    return createErrorResponse(
      '/errors/validation',
      'Invalid Speed Option',
      400,
      `speed must be either 'overnight' or 'same_day'. Received: ${speed}`,
      'Provide speed as either "overnight" or "same_day"',
      'getExpediteQuote'
    );
  }

  // 2. Rate limiting check
  const rateLimitResult = await checkRateLimit();
  if (rateLimitResult.exceeded) {
    return createRateLimitError(rateLimitResult, 'getExpediteQuote');
  }

  // 3. Cache check
  const cacheKey = `shipping:expedite_quote:${order_id}:${speed}`;
  const cached = await checkCache(cacheKey, meta?.if_none_match);
  if (cached) {
    return cached; // 304 or cached response
  }

  // 4. Business logic (existing logic preserved)
  try {
    const db = await HandlerUtils.initializeStorage();
    const orderData = await HandlerUtils.getFromStorage(db, 'orders', order_id);

    if (!orderData) {
      return createErrorResponse(
        '/errors/not_found',
        'Order Not Found',
        404,
        `Order ${order_id} does not exist in the system`,
        'Verify the order ID and ensure it exists in the system',
        'getExpediteQuote'
      );
    }

    const quotes = {
      overnight: {
        cost: 47,
        eta: '2025-10-01T18:00:00Z', // RFC3339 format
        carrier: 'PremiumAir',
        service: 'Next-Flight-Out'
      },
      same_day: {
        cost: 95,
        eta: '2025-09-30T15:00:00Z', // RFC3339 format
        carrier: 'PremiumAir',
        service: 'Rush-Direct'
      }
    };

    const quote = quotes[speed];

    // 5. Build response with standardized meta fields and proper formatting
    const businessResult = {
      order_id: order_id,
      quote: {
        speed: speed,
        cost: {
          amount: quote.cost,
          currency: "USD"
        },
        eta: quote.eta, // RFC3339 timestamp format
        carrier: {
          name: quote.carrier,
          service: quote.service
        },
        features: {
          temperature_controlled: true,
          tracking_enabled: true,
          signature_required: true
        }
      }
    };

    const response = {
      ...businessResult,
      meta: HandlerUtils.createResponseMeta({
        etag: generateEtag(businessResult),
        rateLimitInfo: rateLimitResult.info,
        includePaging: HandlerUtils.shouldIncludePaging('expediteQuote', 'get'),
        nextSteps: "Expedite quote retrieved successfully"
      })
    };

    // 6. Cache the response
    await cacheResponse(cacheKey, response);

    return response;

  } catch (error) {
    return createErrorResponse(
      '/errors/internal',
      'Internal Server Error',
      500,
      `Failed to retrieve expedite quote: ${error.message}`,
      'Please try again or contact support if the issue persists',
      'getExpediteQuote'
    );
  }
}
