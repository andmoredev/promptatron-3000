/**
 * Utility functions for mapping dataset types to their corresponding tool services
 */

import { shippingToolsService } from '../services/shippingToolsService.js'
import { fraudToolsService } from '../services/fraudToolsService.js'

/**
 * Get the tool service for a specific dataset type
 * @param {string} datasetType - The dataset type
 * @returns {Object|null} The tool service instance or null if not found
 */
export function getToolServiceForDatasetType(datasetType) {
  const serviceMap = {
    'shipping-logistics': shippingToolsService,
    'fraud-detection': fraudToolsService
    // Add more mappings as needed for other dataset types
  }

  return serviceMap[datasetType] || null
}

/**
 * Check if a dataset type has an associated tool service
 * @param {string} datasetType - The dataset type
 * @returns {boolean} True if a tool service exists for this dataset type
 */
export function hasToolServiceForDatasetType(datasetType) {
  return getToolServiceForDatasetType(datasetType) !== null
}

/**
 * Initialize tool service for a dataset type
 * @param {string} datasetType - The dataset type
 * @param {Object} toolConfig - Optional tool configuration
 * @returns {Promise<Object>} Initialization result
 */
export async function initializeToolServiceForDatasetType(datasetType, toolConfig = null) {
  const result = {
    success: false,
    service: null,
    message: 'Tool service initialization failed',
    datasetType: datasetType
  }

  try {
    const toolService = getToolServiceForDatasetType(datasetType)

    if (!toolService) {
      result.message = `No tool service available for dataset type: ${datasetType}`
      return result
    }

    // Initialize the service
    if (typeof toolService.initialize === 'function') {
      await toolService.initialize(toolConfig)
    }

    result.success = true
    result.service = toolService
    result.message = `Tool service initialized for ${datasetType}`

    return result

  } catch (error) {
    result.message = `Tool service initialization failed: ${error.message}`
    return result
  }
}
