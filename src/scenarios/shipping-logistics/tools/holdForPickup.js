/**
 * Hold order at carrier facility for customer pickup
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.order_id - Order ID to hold
 * @param {string} parameters.reason - Brief justification for holding
 * @param {Object} parameters.meta - Required metadata for write operations
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Hold action result
 */
export async function holdForPickup(parameters, context) {
  const { order_id, reason, meta } = parameters;

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
      'holdForPickup'
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
      'Use format: action_orderid_timestamp (e.g., hold_b456_001)',
      'holdForPickup'
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
      'Use format: req_ followed by 6-12 alphanumeric characters (e.g., req_789012)',
      'holdForPickup'
    );
  }

  // Validate reason length
  if (!reason || reason.length < 10 || reason.length > 500) {
    return createErrorResponse(
      '/errors/validation',
      'Invalid Reason Length',
      400,
      `reason must be between 10 and 500 characters. Received: ${reason?.length || 0} characters`,
      'Provide a brief justification between 10-500 characters explaining why holding is needed',
      'holdForPickup'
    );
  }

  // 2. Rate limiting check
  const rateLimitResult = await checkRateLimit();
  if (rateLimitResult.exceeded) {
    return createRateLimitError(rateLimitResult, 'holdForPickup');
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
      return HandlerUtils.handleIdempotencyConflict(existingAction, 'holdForPickup');
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
        'holdForPickup'
      );
    }

    // Create action record with idempotency tracking
    const actionId = HandlerUtils.generateId('HOLD');
    const timestamp = new Date().toISOString();
    const actionData = {
      actionId,
      orderId: order_id,
      actionType: 'hold',
      reason,
      timestamp,
      status: 'confirmed',
      idempotencyKey: meta.idempotency_key,
      requestId: meta.request_id
    };

    await HandlerUtils.saveToStorage(db, 'actions', actionData);

    // Update order status
    orderData.status = 'held_for_pickup';
    orderData.lastAction = actionId;
    orderData.updated = timestamp;
    await HandlerUtils.saveToStorage(db, 'orders', orderData);

    // 5. Build response with action confirmation details
    const response = {
      success: true,
      action_id: actionId,
      order_id: order_id,
      status: 'held_for_pickup',
      facility_information: {
        pickup_location: 'RegionalExpress Depot - 1547 Commerce Dr, Springfield, OR',
        pickup_hours: '8am-8pm daily',
        pickup_code: `P${Date.now().toString().slice(-6)}`,
        phone_number: '(555) 123-4567',
        special_instructions: 'Bring valid ID and pickup code'
      },
      pickup_instructions: [
        'Visit the pickup location during business hours',
        'Provide pickup code and valid identification',
        'Package will be held for 5 business days',
        'Contact facility if you need assistance'
      ],
      confirmation: 'Order held for pickup, customer notified',
      expiration_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      next_steps: [
        'Customer notification sent via email and SMS',
        'Package secured at pickup facility',
        'Pickup reminder will be sent in 3 days if not collected'
      ],
      meta: HandlerUtils.createResponseMeta({
        etag: generateEtag({ actionId, order_id, timestamp }),
        timestamp: timestamp,
        rateLimitInfo: rateLimitResult.info,
        includePaging: HandlerUtils.shouldIncludePaging('holdForPickup', 'create'),
        nextSteps: "Hold for pickup action completed successfully"
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
      `Failed to hold for pickup: ${error.message}`,
      'Please try again or contact support if the problem persists',
      'holdForPickup'
    );
  }
}
