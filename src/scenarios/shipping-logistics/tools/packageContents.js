/**
 * Get package contents and hazard classification
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.order_id - Order ID to query
 * @param {Object} parameters.meta - Optional metadata for read operations
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Package contents and classification with enterprise meta fields
 */
export async function getPackageContents(parameters, context) {
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
    return createRateLimitError(rateLimitResult, 'getPackageContents');
  }

  // 3. Cache check
  const cacheKey = `shipping:package_contents:${order_id}`;
  const cached = await checkCache(cacheKey, meta?.if_none_match);
  if (cached) {
    return cached; // 304 or cached response
  }

  // 4. Business logic (existing logic preserved)
  try {
    const db = await HandlerUtils.initializeStorage();
    const packageData = await HandlerUtils.getFromStorage(db, 'packages', order_id);

    if (!packageData) {
      return createErrorResponse(
        '/errors/not_found',
        'Package Not Found',
        404,
        `Package data for order ${order_id} does not exist in the system`,
        'Verify the order ID and ensure the package exists in the system',
        'getPackageContents'
      );
    }

    // 5. Build response with standardized meta fields and proper validation
    const businessResult = {
      order_id: order_id,
      contents: packageData.contents,
      classification: {
        is_perishable: packageData.isPerishable,
        is_hazmat: packageData.isHazmat,
        requires_refrigeration: packageData.requiresRefrigeration
      },
      physical_properties: {
        weight: {
          value: packageData.weight,
          unit: "kg"
        },
        declared_value: {
          amount: packageData.declaredValue,
          currency: "USD"
        }
      }
    };

    const response = {
      ...businessResult,
      meta: HandlerUtils.createResponseMeta({
        etag: generateEtag(businessResult),
        rateLimitInfo: rateLimitResult.info,
        includePaging: HandlerUtils.shouldIncludePaging('packageContents', 'get'),
        nextSteps: "Package contents retrieved successfully"
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
      `Failed to retrieve package contents: ${error.message}`,
      'Please try again or contact support if the issue persists',
      'getPackageContents'
    );
  }
}
