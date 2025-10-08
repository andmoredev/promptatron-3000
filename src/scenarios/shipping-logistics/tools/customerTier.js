/**
 * Get customer tier and account standing
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.orderId - Order ID to query
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Customer tier and account information
 */
export async function getCustomerTier(parameters, context) {
  const { orderId } = parameters;

  // Import handler utilities
  const { HandlerUtils } = await import('./handlerUtils.js');

  // Initialize storage
  const db = await HandlerUtils.initializeStorage();

  try {
    const orderData = await HandlerUtils.getFromStorage(db, 'orders', orderId);
    if (!orderData) {
      throw new Error(`Order ${orderId} not found`);
    }

    const customerData = await HandlerUtils.getFromStorage(db, 'customers', orderData.customerId);
    if (!customerData) {
      throw new Error(`Customer data not found for order ${orderId}`);
    }

    return {
      orderId,
      customerId: customerData.customerId,
      customerName: customerData.name,
      tier: customerData.tier,
      accountValue: customerData.accountValue,
      satisfactionScore: customerData.satisfactionScore,
      memberSince: customerData.joinDate
    };
  } catch (error) {
    throw new Error(`Failed to get customer tier: ${error.message}`);
  }
}
