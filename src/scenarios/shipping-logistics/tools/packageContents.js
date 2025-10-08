/**
 * Get package contents and hazard classification
 * @param {Object} parameters - Tool parameters
 * @param {string} parameters.orderId - Order ID to query
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Package contents and classification
 */
export async function getPackageContents(parameters, context) {
  const { orderId } = parameters;

  // Import handler utilities
  const { HandlerUtils } = await import('./handlerUtils.js');

  // Initialize storage
  const db = await HandlerUtils.initializeStorage();

  try {
    const packageData = await HandlerUtils.getFromStorage(db, 'packages', orderId);
    if (!packageData) {
      throw new Error(`No package data found for order ${orderId}`);
    }

    return {
      orderId,
      isPerishable: packageData.isPerishable,
      isHazmat: packageData.isHazmat,
      requiresRefrigeration: packageData.requiresRefrigeration,
      contents: packageData.contents,
      weight: packageData.weight,
      declaredValue: packageData.declaredValue
    };
  } catch (error) {
    throw new Error(`Failed to get package contents: ${error.message}`);
  }
}
