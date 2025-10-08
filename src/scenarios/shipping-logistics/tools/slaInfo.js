/**
 * Get SLA deadline and penalty information
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.orderId - Order ID to query
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} SLA information
 */
export async function getSLA(parameters, context) {
  const { orderId } = parameters;

  // Import handler utilities
  const { HandlerUtils } = await import('./handlerUtils.js');

  // Initialize storage
  const db = await HandlerUtils.initializeStorage();

  try {
    const slaData = await HandlerUtils.getFromStorage(db, 'slas', orderId);
    if (!slaData) {
      throw new Error(`No SLA data found for order ${orderId}`);
    }

    return {
      orderId,
      slaTier: slaData.tier,
      promisedDeliveryBy: slaData.promisedDeliveryBy,
      hoursUntilDeadline: slaData.hoursUntilDeadline,
      penaltyPerDay: slaData.penaltyPerDay,
      status: slaData.currentStatus
    };
  } catch (error) {
    throw new Error(`Failed to get SLA information: ${error.message}`);
  }
}
