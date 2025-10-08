/**
 * Execute expedited shipping for an order
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.orderId - Order ID to expedite
 * @param {string} parameters.speed - Expedite speed (overnight or same-day)
 * @param {string} parameters.reason - Brief justification for expediting
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Expedite action result
 */
export async function expediteShipment(parameters, context) {
  const { orderId, speed, reason } = parameters;

  // Import handler utilities
  const { HandlerUtils } = await import('./handlerUtils.js');

  // Initialize storage
  const db = await HandlerUtils.initializeStorage();

  try {
    const orderData = await HandlerUtils.getFromStorage(db, 'orders', orderId);
    if (!orderData) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Get the quote to include in response
    const { getExpediteQuote } = await import('./expediteQuote.js');
    const quote = await getExpediteQuote({ orderId, speed }, context);

    // Create action record
    const actionId = HandlerUtils.generateId('EXP');
    const actionData = {
      actionId,
      orderId,
      actionType: 'expedite',
      speed,
      reason,
      cost: quote.cost,
      newETA: quote.eta,
      timestamp: new Date().toISOString(),
      status: 'confirmed'
    };

    await HandlerUtils.saveToStorage(db, 'actions', actionData);

    // Update order status
    orderData.status = 'expedited';
    orderData.lastAction = actionId;
    orderData.updated = new Date().toISOString();
    await HandlerUtils.saveToStorage(db, 'orders', orderData);

    return {
      success: true,
      actionId,
      orderId,
      actionType: 'expedite',
      newTrackingNumber: `PA-${speed === 'overnight' ? 'OVN' : 'SD'}-${quote.carrier}-${Date.now().toString().slice(-8)}`,
      newCarrier: quote.carrier,
      newETA: quote.eta,
      cost: quote.cost,
      reason,
      timestamp: actionData.timestamp,
      confirmation: `Expedited ${speed} shipping confirmed`,
      temperatureControlled: true,
      nextSteps: [
        'Package will be picked up within 1 hour',
        'Customer will receive tracking update',
        'Temperature monitoring enabled'
      ]
    };
  } catch (error) {
    throw new Error(`Failed to expedite shipment: ${error.message}`);
  }
}
