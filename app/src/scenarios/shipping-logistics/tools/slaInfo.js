/**
 * Get SLA deadline and penalty information
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.order_id - Order ID to query
 * @param {Object} parameters.meta - Optional metadata for read operations
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} SLA information with enterprise meta fields
 */
export async function getSLA(parameters, context) {
  const { order_id, meta } = parameters;

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

  // 2. Rate limiting check
  const rateLimitResult = await checkRateLimit();
  if (rateLimitResult.exceeded) {
    return createRateLimitError(rateLimitResult, 'getSLA');
  }

  // 3. Cache check
  const cacheKey = `shipping:sla:${order_id}`;
  const cached = await checkCache(cacheKey, meta?.if_none_match);
  if (cached) {
    return cached; // 304 or cached response
  }

  // 4. Business logic (existing logic preserved)
  try {
    const db = await HandlerUtils.initializeStorage();
    const slaData = await HandlerUtils.getFromStorage(db, 'slas', order_id);

    if (!slaData) {
      return createErrorResponse(
        '/errors/not_found',
        'SLA Data Not Found',
        404,
        `SLA information for order ${order_id} does not exist in the system`,
        'Verify the order ID and ensure SLA data exists in the system',
        'getSLA'
      );
    }

    // 5. Build response with standardized meta fields and proper formatting
    const businessResult = {
      order_id: order_id,
      sla: {
        tier: slaData.tier, // enum: standard, expedited, 2-day, overnight
        promised_delivery_by: slaData.promisedDeliveryBy, // RFC3339 timestamp
        hours_until_deadline: slaData.hoursUntilDeadline,
        status: slaData.currentStatus, // enum: on_track, at_risk, breached
        penalty: {
          amount_per_day: slaData.penaltyPerDay,
          currency: "USD"
        }
      }
    };

    const response = {
      ...businessResult,
      meta: HandlerUtils.createResponseMeta({
        etag: generateEtag(businessResult),
        rateLimitInfo: rateLimitResult.info,
        includePaging: HandlerUtils.shouldIncludePaging('slaInfo', 'get'),
        nextSteps: "SLA information retrieved successfully"
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
      `Failed to retrieve SLA information: ${error.message}`,
      'Please try again or contact support if the issue persists',
      'getSLA'
    );
  }
}
