/**
 * Get carrier status and exception notes for an order
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.orderId - Order ID to query
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Carrier status information
 */
export async function getCarrierStatus(parameters, context) {
  const { orderId } = parameters;

  // Import handler utilities
  const { HandlerUtils } = await import('./handlerUtils.js');

  // Initialize storage
  const db = await HandlerUtils.initializeStorage();

  try {
    const carrierData = await HandlerUtils.getFromStorage(db, 'carriers', orderId);
    if (!carrierData) {
      throw new Error(`No carrier data found for order ${orderId}`);
    }

    return {
      orderId,
      carrier: carrierData.name,
      trackingNumber: carrierData.trackingNumber,
      status: carrierData.status,
      exceptionNote: carrierData.exceptionNote,
      lastUpdate: carrierData.lastUpdate,
      attemptsRemaining: carrierData.attemptsRemaining
    };
  } catch (error) {
    throw new Error(`Failed to get carrier status: ${error.message}`);
  }
}
