/**
 * Get cost and ETA for expedited shipping options
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.orderId - Order ID to query
 * @param {string} parameters.speed - Expedite speed (overnight or same-day)
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Expedite quote information
 */
export async function getExpediteQuote(parameters, context) {
  const { orderId, speed } = parameters;

  // Import handler utilities
  const { HandlerUtils } = await import('./handlerUtils.js');

  // Initialize storage
  const db = await HandlerUtils.initializeStorage();

  try {
    const orderData = await HandlerUtils.getFromStorage(db, 'orders', orderId);
    if (!orderData) {
      throw new Error(`Order ${orderId} not found`);
    }

    const quotes = {
      overnight: {
        cost: 47,
        eta: '2025-09-30T18:00:00Z',
        carrier: 'PremiumAir',
        service: 'Next-Flight-Out'
      },
      'same-day': {
        cost: 95,
        eta: '2025-09-30T15:00:00Z',
        carrier: 'PremiumAir',
        service: 'Rush-Direct'
      }
    };

    const quote = quotes[speed];
    if (!quote) {
      throw new Error(`Invalid speed: ${speed}`);
    }

    return {
      orderId,
      speed,
      cost: quote.cost,
      eta: quote.eta,
      carrier: quote.carrier,
      service: quote.service,
      temperatureControlled: true,
      trackingEnabled: true
    };
  } catch (error) {
    throw new Error(`Failed to get expedite quote: ${error.message}`);
  }
}
