/**
 * Escalate decision to human manager when situation is ambiguous or high-risk
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.order_id - Order ID to escalate
 * @param {string} parameters.reason - Why this requires human judgment
 * @param {string} [parameters.urgency='medium'] - Urgency level for manager review
 * @param {Object} parameters.meta - Required metadata for write operations
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Escalation result
 */
export async function escalateToManager(parameters, context) {
  const { order_id, reason, urgency = 'medium', meta } = parameters;

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
      'escalateToManager'
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
      'Use format: action_orderid_timestamp (e.g., esc_b456_001)',
      'escalateToManager'
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
      'Use format: req_ followed by 6-12 alphanumeric characters (e.g., req_345678)',
      'escalateToManager'
    );
  }

  // Validate urgency level enum
  const validUrgencyLevels = ['low', 'medium', 'high'];
  if (!validUrgencyLevels.includes(urgency)) {
    return createErrorResponse(
      '/errors/validation',
      'Invalid Urgency Level',
      400,
      `urgency must be one of: ${validUrgencyLevels.join(', ')}. Received: ${urgency}`,
      'Use "low" for routine, "medium" for time-sensitive, or "high" for critical situations',
      'escalateToManager'
    );
  }

  // Validate reason length
  if (!reason || reason.length < 10 || reason.length > 500) {
    return createErrorResponse(
      '/errors/validation',
      'Invalid Reason Length',
      400,
      `reason must be between 10 and 500 characters. Received: ${reason?.length || 0} characters`,
      'Provide a detailed explanation between 10-500 characters of why human judgment is needed',
      'escalateToManager'
    );
  }

  // 2. Rate limiting check
  const rateLimitResult = await checkRateLimit();
  if (rateLimitResult.exceeded) {
    return createRateLimitError(rateLimitResult, 'escalateToManager');
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
      return HandlerUtils.handleIdempotencyConflict(existingAction, 'escalateToManager');
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
        'escalateToManager'
      );
    }

    // Create action record with idempotency tracking
    const actionId = HandlerUtils.generateId('ESC');
    const timestamp = new Date().toISOString();
    const actionData = {
      actionId,
      orderId: order_id,
      actionType: 'escalate',
      reason,
      urgency,
      timestamp,
      status: 'pending',
      idempotencyKey: meta.idempotency_key,
      requestId: meta.request_id
    };

    await HandlerUtils.saveToStorage(db, 'actions', actionData);

    // Update order status
    orderData.status = 'escalated';
    orderData.lastAction = actionId;
    orderData.updated = timestamp;
    await HandlerUtils.saveToStorage(db, 'orders', orderData);

    // 5. Build response with escalation tracking information
    const responseTimeMap = {
      high: '30 minutes',
      medium: '2 hours',
      low: '4 hours'
    };

    const managerAssignment = {
      high: 'Senior Manager - Sarah Chen',
      medium: 'Operations Manager - Mike Rodriguez',
      low: 'Supervisor - Alex Johnson'
    };

    const response = {
      success: true,
      action_id: actionId,
      order_id: order_id,
      escalation_tracking: {
        ticket_id: `TICKET-${actionId}`,
        status: 'escalated',
        urgency_level: urgency,
        assigned_manager: managerAssignment[urgency],
        queue_position: urgency === 'high' ? 1 : urgency === 'medium' ? 3 : 7,
        expected_response_time: responseTimeMap[urgency]
      },
      manager_assignment: {
        name: managerAssignment[urgency],
        contact_method: 'Internal escalation system',
        notification_sent: true,
        escalation_time: timestamp
      },
      confirmation: 'Escalated to management for review',
      next_steps: [
        `Manager will review within ${responseTimeMap[urgency]}`,
        'You will receive notification when manager responds',
        'Order processing is paused pending manager decision',
        'Customer will be notified of any delays if resolution takes longer than expected'
      ],
      meta: HandlerUtils.createResponseMeta({
        etag: generateEtag({ actionId, order_id, timestamp }),
        timestamp: timestamp,
        rateLimitInfo: rateLimitResult.info,
        includePaging: HandlerUtils.shouldIncludePaging('escalateToManager', 'create'),
        nextSteps: "Escalation to manager completed successfully"
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
      `Failed to escalate to manager: ${error.message}`,
      'Please try again or contact support if the problem persists',
      'escalateToManager'
    );
  }
}
