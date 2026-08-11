/**
 * Get carrier status and exception notes for an order
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.order_id - Order ID to query
 * @param {Object} parameters.meta - Optional metadata for read operations
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Carrier status information with enterprise meta fields
 */
export async function getCarrierStatus(parameters, context) {
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
    createErrorResponse,
    createOrderNotFoundError
  } = await import('./sharedUtils.js');

  // 1. Basic parameter validation
  const validation = validateOrderId(order_id);
  if (!validation.valid) {
    return validation.error;
  }

  // 2. Rate limiting check
  const rateLimitResult = await checkRateLimit();
  if (rateLimitResult.exceeded) {
    return createRateLimitError(rateLimitResult, 'getCarrierStatus');
  }

  // 3. Cache check
  const cacheKey = `shipping:carrier_status:${order_id}`;
  const cached = await checkCache(cacheKey, meta?.if_none_match);
  if (cached) {
    return cached; // 304 or cached response
  }

  // 4. Business logic (existing logic preserved)
  try {
    const db = await HandlerUtils.initializeStorage();
    const carrierData = await HandlerUtils.getFromStorage(db, 'carriers', order_id);

    if (!carrierData) {
      return createOrderNotFoundError(order_id, 'getCarrierStatus', {
        systemStatus: 'operational',
        suggestedActions: [
          'Check if the order was recently created and may not be in the system yet.',
          'Verify the order exists in the customer portal.',
          'Contact customer service if the order should exist.'
        ]
      });
    }

    // 5. Build response with standardized meta fields
    const businessResult = {
      order_id: order_id,
      carrier: {
        name: carrierData.name,
        tracking_number: carrierData.trackingNumber,
        status: carrierData.status,
        exception_note: carrierData.exceptionNote,
        last_update: carrierData.lastUpdate,
        attempts_remaining: carrierData.attemptsRemaining
      }
    };

    const response = {
      ...businessResult,
      meta: HandlerUtils.createResponseMeta({
        etag: generateEtag(businessResult),
        rateLimitInfo: rateLimitResult.info,
        includePaging: HandlerUtils.shouldIncludePaging('carrierStatus', 'get'),
        nextSteps: "Carrier status retrieved successfully"
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
      `Failed to retrieve carrier status: ${error.message}`,
      'Please try again or contact support if the issue persists',
      'getCarrierStatus'
    );
  }
}
