/**
 * Get customer tier and account standing
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.order_id - Order ID to query
 * @param {Object} parameters.meta - Optional metadata for read operations
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Customer tier and account information with enterprise meta fields
 */
export async function getCustomerTier(parameters, context) {
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
    return createRateLimitError(rateLimitResult, 'getCustomerTier');
  }

  // 3. Cache check
  const cacheKey = `shipping:customer_tier:${order_id}`;
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
        'getCustomerTier'
      );
    }

    const customerData = await HandlerUtils.getFromStorage(db, 'customers', orderData.customerId);
    if (!customerData) {
      return createErrorResponse(
        '/errors/not_found',
        'Customer Data Not Found',
        404,
        `Customer data not found for order ${order_id}`,
        'Contact support to resolve customer data inconsistency',
        'getCustomerTier'
      );
    }

    // 5. Build response with standardized meta fields and proper validation
    const businessResult = {
      order_id: order_id,
      customer: {
        customer_id: customerData.customerId,
        name: customerData.name,
        tier: customerData.tier, // enum: standard, premium, VIP
        account_value: {
          amount: customerData.accountValue,
          currency: "USD"
        },
        satisfaction_score: customerData.satisfactionScore, // 0.0-5.0
        member_since: customerData.joinDate
      }
    };

    const response = {
      ...businessResult,
      meta: HandlerUtils.createResponseMeta({
        etag: generateEtag(businessResult),
        rateLimitInfo: rateLimitResult.info,
        includePaging: HandlerUtils.shouldIncludePaging('customerTier', 'get'),
        nextSteps: "Customer tier information retrieved successfully"
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
      `Failed to retrieve customer tier: ${error.message}`,
      'Please try again or contact support if the issue persists',
      'getCustomerTier'
    );
  }
}
