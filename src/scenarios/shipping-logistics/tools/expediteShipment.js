/**
 * Execute expedited shipping for an order
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.order_id - Order ID to expedite
 * @param {string} parameters.speed - Expedite speed (overnight or same_day)
 * @param {string} parameters.reason - Brief justification for expediting
 * @param {Object} parameters.meta - Required metadata for write operations
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Expedite action result
 */
export async function expediteShipment(parameters, context) {
  const { order_id, speed, reason, meta } = parameters;

  // Import shared utilities
  const {
    validateOrderId,
    checkRateLimit,
    createErrorResponse,
    createRateLimitError,
    generateEtag
  } = await import('./sharedUtils.js');

  // Import handler utilities
  const { HandlerUtils } = await import('./handlerUtils.js');

  // 1. Basic parameter validation
  const orderValidation = validateOrderId(order_id);
  if (!orderValidation.valid) {
    return orderValidation.error;
  }

  // Validate required meta fields for write operations
  if (!meta || !meta.idempotency_key || !meta.request_id) {
    return createErrorResponse(
      '/errors/validation',
      'Missing Required Meta Fields',
      400,
      'Write operations require meta.idempotency_key and meta.request_id',
      'Provide both idempotency_key and request_id in the meta object',
      'expediteShipment'
    );
  }

  // Validate idempotency key format
  const idempotencyPattern = /^[a-z_]+_[A-Z][0-9]{3,6}_[0-9]+$/;
  if (!idempotencyPattern.test(meta.idempotency_key)) {
    return createErrorResponse(
      '/errors/validation',
      'Invalid Idempotency Key Format',
      400,
      `idempotency_key must match pattern ^[a-z_]+_[A-Z][0-9]{3,6}_[0-9]+$. Received: ${meta.idempotency_key}`,
      'Use format: action_orderid_timestamp (e.g., exp_b456_001)',
      'expediteShipment'
    );
  }

  // Validate request ID format
  const requestIdPattern = /^req_[a-zA-Z0-9]{6,12}$/;
  if (!requestIdPattern.test(meta.request_id)) {
    return createErrorResponse(
      '/errors/validation',
      'Invalid Request ID Format',
      400,
      `request_id must match pattern ^req_[a-zA-Z0-9]{6,12}$. Received: ${meta.request_id}`,
      'Use format: req_ followed by 6-12 alphanumeric characters (e.g., req_123456)',
      'expediteShipment'
    );
  }

  // Validate speed enum
  if (!['overnight', 'same_day'].includes(speed)) {
    return createErrorResponse(
      '/errors/validation',
      'Invalid Speed Option',
      400,
      `speed must be either 'overnight' or 'same_day'. Received: ${speed}`,
      'Use either "overnight" for next business day or "same_day" for within hours',
      'expediteShipment'
    );
  }

  // Validate reason length
  if (!reason || reason.length < 10 || reason.length > 500) {
    return createErrorResponse(
      '/errors/validation',
      'Invalid Reason Length',
      400,
      `reason must be between 10 and 500 characters. Received: ${reason?.length || 0} characters`,
      'Provide a brief justification between 10-500 characters explaining why expediting is needed',
      'expediteShipment'
    );
  }

  // 2. Rate limiting check
  const rateLimitResult = await checkRateLimit();
  if (rateLimitResult.exceeded) {
    return createRateLimitError(rateLimitResult, 'expediteShipment');
  }

  // 3. Initialize storage and check for idempotency
  const db = await HandlerUtils.initializeStorage();

  try {
    // Check for existing action with same idempotency key
    const existingActions = await HandlerUtils.getOrderActions(db, order_id);
    const existingAction = existingActions.find(action =>
      action.idempotencyKey === meta.idempotency_key
    );

    if (existingAction) {
      // Return existing result for idempotent request
      return HandlerUtils.handleIdempotencyConflict(existingAction, 'expediteShipment');
    }

    // 4. Business logic - check if order exists
    const orderData = await HandlerUtils.getFromStorage(db, 'orders', order_id);
    if (!orderData) {
      return createErrorResponse(
        '/errors/not_found',
        'Order Not Found',
        404,
        `Order ${order_id} does not exist in the system`,
        'Verify the order ID and ensure it exists in the system',
        'expediteShipment'
      );
    }

    // Get the quote to include in response
    const { getExpediteQuote } = await import('./expediteQuote.js');
    const quoteResponse = await getExpediteQuote({ order_id, speed }, context);

    // Handle error response from getExpediteQuote
    if (!quoteResponse.success && quoteResponse.error) {
      return quoteResponse;
    }

    // Create action record with idempotency tracking
    const actionId = HandlerUtils.generateId('EXP');
    const actionData = {
      actionId,
      orderId: order_id,
      actionType: 'expedite',
      speed,
      reason,
      cost: quoteResponse.quote.cost,
      newETA: quoteResponse.quote.eta,
      timestamp: new Date().toISOString(),
      status: 'confirmed',
      idempotencyKey: meta.idempotency_key,
      requestId: meta.request_id
    };

    await HandlerUtils.saveToStorage(db, 'actions', actionData);

    // Update order status
    orderData.status = 'expedited';
    orderData.lastAction = actionId;
    orderData.updated = new Date().toISOString();
    await HandlerUtils.saveToStorage(db, 'orders', orderData);

    // 5. Build response with standardized meta
    const response = {
      success: true,
      action_id: actionId,
      order_id: order_id,
      shipping_details: {
        new_tracking_number: `PA-${speed === 'overnight' ? 'OVN' : 'SD'}-${quoteResponse.quote.carrier.name}-${Date.now().toString().slice(-8)}`,
        new_carrier: quoteResponse.quote.carrier.name,
        new_eta: quoteResponse.quote.eta,
        cost: {
          amount: quoteResponse.quote.cost.amount,
          currency: quoteResponse.quote.cost.currency
        },
        temperature_controlled: true
      },
      confirmation: `Expedited ${speed} shipping confirmed`,
      next_steps: [
        'Package will be picked up within 1 hour',
        'Customer will receive tracking update',
        'Temperature monitoring enabled'
      ],
      meta: HandlerUtils.createResponseMeta({
        etag: generateEtag({ actionId, order_id, timestamp: actionData.timestamp }),
        timestamp: actionData.timestamp,
        rateLimitInfo: rateLimitResult.info,
        includePaging: HandlerUtils.shouldIncludePaging('expediteShipment', 'create'),
        nextSteps: "Expedited shipping action completed successfully"
      })
    };

    // Update the stored action record with the complete result for idempotency
    actionData.result = response;
    await HandlerUtils.saveToStorage(db, 'actions', actionData);

    return response;

  } catch (error) {
    return createErrorResponse(
      '/errors/internal',
      'Internal Server Error',
      500,
      `Failed to expedite shipment: ${error.message}`,
      'Please try again or contact support if the problem persists',
      'expediteShipment'
    );
  }
}
