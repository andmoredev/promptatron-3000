/**
 * Pricing Data Validation Utilities
 *
 * This module provides validation functions for AWS Bedrock pricing data
 * to ensure data integrity and consistency.
 */

import { PRICING_VALIDATION_SCHEMA } from '../data/aws-bedrock-pricing.js';

/**
 * Validation error class for pricing data issues
 */
export class PricingValidationError extends Error {
  constructor(message, field = null, value = null) {
    super(message);
    this.name = 'PricingValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Validate pricing data structure and values
 * @param {Object} pricingData - The pricing data object to validate
 * @returns {Object} Validation result with success status and errors
 */
export function validatePricingData(pricingData) {
  const errors = [];
  const warnings = [];

  try {
    // Validate metadata
    const metadataValidation = validateMetadata(pricingData.metadata);
    errors.push(...metadataValidation.errors);
    warnings.push(...metadataValidation.warnings);

    // Validate regions
    const regionsValidation = validateRegions(pricingData.regions);
    errors.push(...regionsValidation.errors);
    warnings.push(...regionsValidation.warnings);

    // Validate model categories (optional)
    if (pricingData.modelCategories) {
      const categoriesValidation = validateModelCategories(pricingData.modelCategories, pricingData.regions);
      errors.push(...categoriesValidation.errors);
      warnings.push(...categoriesValidation.warnings);
    }

    // Validate providers (optional)
    if (pricingData.providers) {
      const providersValidation = validateProviders(pricingData.providers, pricingData.regions);
      errors.push(...providersValidation.errors);
      warnings.push(...providersValidation.warnings);
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        regionsValidated: Object.keys(pricingData.regions || {}).length,
        modelsValidated: getTotalModelCount(pricingData.regions || {})
      }
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Validation failed with exception: ${error.message}`],
      warnings: [],
      summary: {
        totalErrors: 1,
        totalWarnings: 0,
        regionsValidated: 0,
        modelsValidated: 0
      }
    };
  }
}

/**
 * Validate metadata section
 * @param {Object} metadata - Metadata object
 * @returns {Object} Validation result
 */
function validateMetadata(metadata) {
  const errors = [];
  const warnings = [];

  if (!metadata) {
    errors.push('Metadata section is missing');
    return { errors, warnings };
  }

  // Check required fields
  const schema = PRICING_VALIDATION_SCHEMA.metadata;
  for (const field of schema.required) {
    if (!metadata[field]) {
      errors.push(`Metadata missing required field: ${field}`);
    } else if (typeof metadata[field] !== schema.types[field]) {
      errors.push(`Metadata field '${field}' should be of type ${schema.types[field]}, got ${typeof metadata[field]}`);
    }
  }

  // Validate version format
  if (metadata.version && !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
    warnings.push(`Version '${metadata.version}' does not follow semantic versioning (x.y.z)`);
  }

  // Validate date formats
  const dateFields = ['lastUpdated', 'effectiveDate', 'nextReviewDate'];
  for (const field of dateFields) {
    if (metadata[field] && !isValidISODate(metadata[field])) {
      errors.push(`Metadata field '${field}' is not a valid ISO date: ${metadata[field]}`);
    }
  }

  // Check if data is recent (within last 6 months)
  if (metadata.lastUpdated) {
    const lastUpdated = new Date(metadata.lastUpdated);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (lastUpdated < sixMonthsAgo) {
      warnings.push(`Pricing data is older than 6 months (last updated: ${metadata.lastUpdated})`);
    }
  }

  return { errors, warnings };
}

/**
 * Validate regions section
 * @param {Object} regions - Regions object
 * @returns {Object} Validalt
 */
function validateRegions(regions) {
  const errors = [];
  const warnings = [];

  if (!regions || typeof regions !== 'object') {
    errors.push('Regions section is missing or invalid');
    return { errors, warnings };
  }

  const regionCodes = Object.keys(regions);
  if (regionCodes.length === 0) {
    errors.push('No regions defined in pricing data');
    return { errors, warnings };
  }

  // Validate each region
  for (const [regionCode, regionData] of Object.entries(regions)) {
    // Validate region code format
    if (!/^[a-z]{2}-[a-z]+-\d+$/.test(regionCode)) {
      warnings.push(`Region code '${regionCode}' does not follow AWS region naming convention`);
    }

    // Validate region data structure
    const regionSchema = PRICING_VALIDATION_SCHEMA.regions;
    for (const field of regionSchema.required) {
      if (!regionData[field]) {
        errors.push(`Region '${regionCode}' missing required field: ${field}`);
      } else if (typeof regionData[field] !== regionSchema.types[field]) {
        errors.push(`Region '${regionCode}' field '${field}' should be of type ${regionSchema.types[field]}`);
      }
    }

    // Validate models in region
    if (regionData.models) {
      const modelsValidation = validateModelsInRegion(regionCode, regionData.models);
      errors.push(...modelsValidation.errors);
      warnings.push(...modelsValidation.warnings);
    }
  }

  // Check for primary regions
  const primaryRegions = ['us-east-1', 'us-west-2', 'eu-west-1'];
  const missingPrimary = primaryRegions.filter(region => !regions[region]);
  if (missingPrimary.length > 0) {
    warnings.push(`Missing pricing data for primary regions: ${missingPrimary.join(', ')}`);
  }

  return { errors, warnings };
}

/**
 * Validate models within a region
 * @param {string} regionCode - Region code
 * @param {Object} models - Models object
 * @returns {Object} Validation result
 */
function validateModelsInRegion(regionCode, models) {
  const errors = [];
  const warnings = [];

  if (!models || typeof models !== 'object') {
    errors.push(`Region '${regionCode}' has invalid models data`);
    return { errors, warnings };
  }

  const modelIds = Object.keys(models);
  if (modelIds.length === 0) {
    warnings.push(`Region '${regionCode}' has no models defined`);
    return { errors, warnings };
  }

  // Validate each model
  for (const [modelId, modelData] of Object.entries(models)) {
    const modelValidation = validateModel(regionCode, modelId, modelData);
    errors.push(...modelValidation.errors);
    warnings.push(...modelValidation.warnings);
  }

  return { errors, warnings };
}

/**
 * Validate individual model data
 * @param {string} regionCode - Region code
 * @param {string} modelId - Model identifier
 * @param {Object} modelData - Model data object
 * @returns {Object} Validation result
 */
function validateModel(regionCode, modelId, modelData) {
  const errors = [];
  const warnings = [];

  if (!modelData || typeof modelData !== 'object') {
    errors.push(`Model '${modelId}' in region '${regionCode}' has invalid data`);
    return { errors, warnings };
  }

  const schema = PRICING_VALIDATION_SCHEMA.model;

  // Check required fields
  for (const field of schema.required) {
    if (modelData[field] === undefined || modelData[field] === null) {
      errors.push(`Model '${modelId}' in region '${regionCode}' missing required field: ${field}`);
    } else if (typeof modelData[field] !== schema.types[field]) {
      errors.push(`Model '${modelId}' field '${field}' should be of type ${schema.types[field]}, got ${typeof modelData[field]}`);
    }
  }

  // Validate price constraints
  if (schema.constraints) {
    for (const [field, constraints] of Object.entries(schema.constraints)) {
      if (modelData[field] !== undefined) {
        if (constraints.min !== undefined && modelData[field] < constraints.min) {
          errors.push(`Model '${modelId}' field '${field}' is below minimum value ${constraints.min}`);
        }
        if (constraints.max !== undefined && modelData[field] > constraints.max) {
          warnings.push(`Model '${modelId}' field '${field}' is above expected maximum value ${constraints.max}`);
        }
      }
    }
  }

  // Validate model ID format
  if (!/^[a-z0-9.-]+:[a-z0-9.-]+$/.test(modelId)) {
    warnings.push(`Model ID '${modelId}' does not follow expected format (provider.model-name:version)`);
  }

  // Check for reasonable pricing
  if (modelData.inputPrice !== undefined && modelData.outputPrice !== undefined) {
    if (modelData.outputPrice < modelData.inputPrice) {
      warnings.push(`Model '${modelId}' has output price lower than input price, which is unusual`);
    }

    const priceRatio = modelData.outputPrice / modelData.inputPrice;
    if (priceRatio > 100) {
      warnings.push(`Model '${modelId}' has very high output/input price ratio (${priceRatio.toFixed(1)}x)`);
    }
  }

  // Validate currency
  if (modelData.currency && modelData.currency !== 'USD') {
    warnings.push(`Model '${modelId}' uses non-USD currency: ${modelData.currency}`);
  }

  // Validate last updated date
  if (modelData.lastUpdated && !isValidISODate(modelData.lastUpdated)) {
    errors.push(`Model '${modelId}' has invalid lastUpdated date: ${modelData.lastUpdated}`);
  }

  return { errors, warnings };
}

/**
 * Validate model categories
 * @param {Object} categories - Model categories object
 * @param {Object} regions - Regions data for cross-reference
 * @returns {Object} Validation result
 */
function validateModelCategories(categories, regions) {
  const errors = [];
  const warnings = [];

  if (!categories || typeof categories !== 'object') {
    errors.push('Model categories section is invalid');
    return { errors, warnings };
  }

  // Get all model IDs from all regions
  const allModelIds = new Set();
  for (const regionData of Object.values(regions || {})) {
    if (regionData.models) {
      Object.keys(regionData.models).forEach(modelId => allModelIds.add(modelId));
    }
  }

  // Validate each category
  for (const [categoryId, categoryData] of Object.entries(categories)) {
    if (!categoryData.name) {
      errors.push(`Category '${categoryId}' missing name`);
    }

    if (!categoryData.models || !Array.isArray(categoryData.models)) {
      errors.push(`Category '${categoryId}' missing or invalid models array`);
      continue;
    }

    // Check if referenced models exist
    for (const modelId of categoryData.models) {
      if (!allModelIds.has(modelId)) {
        warnings.push(`Category '${categoryId}' references unknown model: ${modelId}`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate providers section
 * @param {Object} providers - Providers object
 * @param {Object} regions - Regions data for cross-reference
 * @returns {Object} Validation result
 */
function validateProviders(providers, regions) {
  const errors = [];
  const warnings = [];

  if (!providers || typeof providers !== 'object') {
    errors.push('Providers section is invalid');
    return { errors, warnings };
  }

  // Get all providers from model data
  const modelProviders = new Set();
  for (const regionData of Object.values(regions || {})) {
    if (regionData.models) {
      Object.values(regionData.models).forEach(model => {
        if (model.provider) modelProviders.add(model.provider);
      });
    }
  }

  // Check if all model providers are defined
  for (const provider of modelProviders) {
    if (!providers[provider]) {
      warnings.push(`Provider '${provider}' is used in models but not defined in providers section`);
    }
  }

  // Validate provider data
  for (const [providerId, providerData] of Object.entries(providers)) {
    if (!providerData.name) {
      errors.push(`Provider '${providerId}' missing name`);
    }

    if (providerData.website && !isValidUrl(providerData.website)) {
      warnings.push(`Provider '${providerId}' has invalid website URL: ${providerData.website}`);
    }
  }

  return { errors, warnings };
}

/**
 * Validate pricing data consistency across regions
 * @param {Object} pricingData - Complete pricing data object
 * @returns {Object} Consistency validation result
 */
export function validatePricingConsistency(pricingData) {
  const errors = [];
  const warnings = [];

  if (!pricingData.regions) {
    return { errors: ['No regions data to validate'], warnings: [] };
  }

  const regions = Object.keys(pricingData.regions);
  const modelPricing = new Map(); // modelId -> { region -> pricing }

  // Collect all model pricing across regions
  for (const [regionCode, regionData] of Object.entries(pricingData.regions)) {
    if (!regionData.models) continue;

    for (const [modelId, modelData] of Object.entries(regionData.models)) {
      if (!modelPricing.has(modelId)) {
        modelPricing.set(modelId, new Map());
      }
      modelPricing.get(modelId).set(regionCode, modelData);
    }
  }

  // Check for pricing inconsistencies
  for (const [modelId, regionPricing] of modelPricing.entries()) {
    const regions = Array.from(regionPricing.keys());
    if (regions.length < 2) continue; // Skip models in only one region

    const prices = Array.from(regionPricing.values());
    const inputPrices = prices.map(p => p.inputPrice).filter(p => p !== undefined);
    const outputPrices = prices.map(p => p.outputPrice).filter(p => p !== undefined);

    // Check for significant price variations (>10% difference)
    if (inputPrices.length > 1) {
      const minInput = Math.min(...inputPrices);
      const maxInput = Math.max(...inputPrices);
      const variation = (maxInput - minInput) / minInput;

      if (variation > 0.1) {
        warnings.push(`Model '${modelId}' has significant input price variation across regions (${(variation * 100).toFixed(1)}%)`);
      }
    }

    if (outputPrices.length > 1) {
      const minOutput = Math.min(...outputPrices);
      const maxOutput = Math.max(...outputPrices);
      const variation = (maxOutput - minOutput) / minOutput;

      if (variation > 0.1) {
        warnings.push(`Model '${modelId}' has significant output price variation across regions (${(variation * 100).toFixed(1)}%)`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Helper function to validate ISO date strings
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid ISO date
 */
function isValidISODate(dateString) {
  if (typeof dateString !== 'string') return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString.includes('T');
}

/**
 * Helper function to validate URLs
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper function to count total models across all regions
 * @param {Object} regions - Regions object
 * @returns {number} Total model count
 */
function getTotalModelCount(regions) {
  let count = 0;
  for (const regionData of Object.values(regions)) {
    if (regionData.models) {
      count += Object.keys(regionData.models).length;
    }
  }
  return count;
}

/**
 * Generate a pricing data health report
 * @param {Object} pricingData - Pricing data to analyze
 * @returns {Object} Health report with statistics and recommendations
 */
export function generatePricingHealthReport(pricingData) {
  const validation = validatePricingData(pricingData);
  const consistency = validatePricingConsistency(pricingData);

  const regions = Object.keys(pricingData.regions || {});
  const totalModels = getTotalModelCount(pricingData.regions || {});

  // Calculate provider distribution
  const providerCounts = new Map();
  for (const regionData of Object.values(pricingData.regions || {})) {
    if (regionData.models) {
      for (const model of Object.values(regionData.models)) {
        if (model.provider) {
          providerCounts.set(model.provider, (providerCounts.get(model.provider) || 0) + 1);
        }
      }
    }
  }

  // Calculate age of data
  let dataAge = null;
  if (pricingData.metadata?.lastUpdated) {
    const lastUpdated = new Date(pricingData.metadata.lastUpdated);
    const now = new Date();
    dataAge = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24)); // days
  }

  return {
    summary: {
      version: pricingData.metadata?.version || 'Unknown',
      lastUpdated: pricingData.metadata?.lastUpdated || 'Unknown',
      dataAge: dataAge ? `${dataAge} days` : 'Unknown',
      totalRegions: regions.length,
      totalModels: totalModels,
      totalProviders: providerCounts.size
    },
    validation: {
      isValid: validation.success,
      errors: validation.errors,
      warnings: validation.warnings,
      consistencyIssues: consistency.warnings
    },
    statistics: {
      regionDistribution: regions,
      providerDistribution: Object.fromEntries(providerCounts),
      averageModelsPerRegion: regions.length > 0 ? Math.round(totalModels / regions.length) : 0
    },
    recommendations: generateRecommendations(validation, consistency, dataAge, regions.length, totalModels)
  };
}

/**
 * Generate recommendations based on validation results
 * @param {Object} validation - Validation results
 * @param {Object} consistency - Consistency check results
 * @param {number} dataAge - Age of data in days
 * @param {number} regionCount - Number of regions
 * @param {number} modelCount - Total number of models
 * @returns {Array} Array of recommendation strings
 */
function generateRecommendations(validation, consistency, dataAge, regionCount, modelCount) {
  const recommendations = [];

  if (!validation.success) {
    recommendations.push('Fix validation errors before using pricing data in production');
  }

  if (validation.warnings.length > 0) {
    recommendations.push('Review and address validation warnings to improve data quality');
  }

  if (consistency.warnings.length > 0) {
    recommendations.push('Investigate pricing inconsistencies across regions');
  }

  if (dataAge && dataAge > 90) {
    recommendations.push('Update pricing data - current data is over 90 days old');
  } else if (dataAge && dataAge > 30) {
    recommendations.push('Consider updating pricing data - current data is over 30 days old');
  }

  if (regionCount < 3) {
    recommendations.push('Add pricing data for more AWS regions to improve coverage');
  }

  if (modelCount < 10) {
    recommendations.push('Consider adding more model pricing data to improve service coverage');
  }

  if (recommendations.length === 0) {
    recommendations.push('Pricing data appears to be in good condition');
  }

  return recommendations;
}
