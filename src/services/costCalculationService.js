import { analyzeError, handleError, ErrorTypes } from '../utils/errorHandling.js';

/**
 * AWS Bedrock pricing data structure
 * Prices are per 1000 tokens in USD
 * Data as of January 2025 - should be updated regularly
 */
const AWS_BEDROCK_PRICING = {
  lastUpdated: '2025-01-15T00:00:00Z',
  version: '1.0.0',
  regions: {
    'us-east-1': {
      models: {
        // Anthropic Claude Models
        'anthropic.claude-3-5-sonnet-20241022-v2:0': {
          inputPrice: 0.003,   // $3.00 per 1M tokens
          outputPrice: 0.015,  // $15.00 per 1M tokens
          currency: 'USD',
          provider: 'Anthropic'
        },
        'anthropic.claude-3-5-haiku-20241022-v1:0': {
          inputPrice: 0.00025, // $0.25 per 1M tokens
          outputPrice: 0.00125, // $1.25 per 1M tokens
          currency: 'USD',
          provider: 'Anthropic'
        },
        'anthropic.claude-3-sonnet-20240229-v1:0': {
          inputPrice: 0.003,   // $3.00 per 1M tokens
          outputPrice: 0.015,  // $15.00 per 1M tokens
          currency: 'USD',
          provider: 'Anthropic'
        },
        'anthropic.claude-3-haiku-20240307-v1:0': {
          inputPrice: 0.00025, // $0.25 per 1M tokens
          outputPrice: 0.00125, // $1.25 per 1M tokens
          currency: 'USD',
          provider: 'Anthropic'
        },
        'anthropic.claude-3-opus-20240229-v1:0': {
          inputPrice: 0.015,   // $15.00 per 1M tokens
          outputPrice: 0.075,  // $75.00 per 1M tokens
          currency: 'USD',
          provider: 'Anthropic'
        },

        // Amazon Nova Models
        'amazon.nova-pro-v1:0': {
          inputPrice: 0.0008,  // $0.80 per 1M tokens
          outputPrice: 0.0032, // $3.20 per 1M tokens
          currency: 'USD',
          provider: 'Amazon'
        },
        'amazon.nova-lite-v1:0': {
          inputPrice: 0.00006, // $0.06 per 1M tokens
          outputPrice: 0.00024, // $0.24 per 1M tokens
          currency: 'USD',
          provider: 'Amazon'
        },
        'amazon.nova-micro-v1:0': {
          inputPrice: 0.000035, // $0.035 per 1M tokens
          outputPrice: 0.00014,  // $0.14 per 1M tokens
          currency: 'USD',
          provider: 'Amazon'
        },

        // Meta Llama Models
        'meta.llama3-2-90b-instruct-v1:0': {
          inputPrice: 0.00265, // $2.65 per 1M tokens
          outputPrice: 0.00265, // $2.65 per 1M tokens
          currency: 'USD',
          provider: 'Meta'
        },
        'meta.llama3-2-11b-instruct-v1:0': {
          inputPrice: 0.00035, // $0.35 per 1M tokens
          outputPrice: 0.00035, // $0.35 per 1M tokens
          currency: 'USD',
          provider: 'Meta'
        },
        'meta.llama3-2-3b-instruct-v1:0': {
          inputPrice: 0.0001,  // $0.10 per 1M tokens
          outputPrice: 0.0001, // $0.10 per 1M tokens
          currency: 'USD',
          provider: 'Meta'
        },
        'meta.llama3-2-1b-instruct-v1:0': {
          inputPrice: 0.0001,  // $0.10 per 1M tokens
          outputPrice: 0.0001, // $0.10 per 1M tokens
          currency: 'USD',
          provider: 'Meta'
        },
        'meta.llama3-1-70b-instruct-v1:0': {
          inputPrice: 0.00265, // $2.65 per 1M tokens
          outputPrice: 0.00265, // $2.65 per 1M tokens
          currency: 'USD',
          provider: 'Meta'
        },
        'meta.llama3-1-8b-instruct-v1:0': {
          inputPrice: 0.0003,  // $0.30 per 1M tokens
          outputPrice: 0.0003, // $0.30 per 1M tokens
          currency: 'USD',
          provider: 'Meta'
        },

        // Mistral Models
        'mistral.mistral-7b-instruct-v0:2': {
          inputPrice: 0.00015, // $0.15 per 1M tokens
          outputPrice: 0.0002, // $0.20 per 1M tokens
          currency: 'USD',
          provider: 'Mistral'
        },
        'mistral.mixtral-8x7b-instruct-v0:1': {
          inputPrice: 0.00045, // $0.45 per 1M tokens
          outputPrice: 0.0007, // $0.70 per 1M tokens
          currency: 'USD',
          provider: 'Mistral'
        },
        'mistral.mistral-large-2402-v1:0': {
          inputPrice: 0.004,   // $4.00 per 1M tokens
          outputPrice: 0.012,  // $12.00 per 1M tokens
          currency: 'USD',
          provider: 'Mistral'
        }
      }
    },
    // Additional regions can be added here with region-specific pricing
    'us-west-2': {
      // Same pricing structure, potentially different rates
      models: {} // Would contain region-specific pricing if different
    },
    'eu-west-1': {
      models: {} // Would contain region-specific pricing if different
    }
  }
};

/**
 * Service class for cost calculation
 * Handles pricing calculations based on AWS Bedrock pricing data
 */
export class CostCalculationService {
  constructor() {
    this.pricingData = new Map(); // Model pricing cache
    this.lastUpdated = null;
    this.isInitialized = false;
    this.lastError = null;
    this.defaultRegion = 'us-east-1';
  }

  /**
   * Initialize the cost calculation service
   * Loads pricing data into memory cache
   */
  async initialize() {
    try {
      await this.loadPricingData();
      this.isInitialized = true;
      this.lastError = null;

      return {
        success: true,
        message: 'Cost calculation service initialized successfully',
        modelsLoaded: this.pricingData.size,
        lastUpdated: this.lastUpdated
      };
    } catch (error) {
      this.isInitialized = false;
      this.lastError = error;

      return {
        success: false,
        message: `Cost calculation service initialization failed: ${error.message}`,
        error: error
      };
    }
  }

  /**
   * Load AWS Bedrock pricing data into cache
   * @param {string} region - AWS region for pricing lookup
   */
  async loadPricingData(region = this.defaultRegion) {
    try {
      this.pricingData.clear();

      // Load pricing data for the specified region
      const regionData = AWS_BEDROCK_PRICING.regions[region];
      if (!regionData) {
        // Fallback to default region if specified region not found
        const fallbackData = AWS_BEDROCK_PRICING.regions[this.defaultRegion];
        if (!fallbackData) {
          throw new Error(`No pricing data available for region ${region} or default region ${this.defaultRegion}`);
        }

        console.warn(`Pricing data not found for region ${region}, using ${this.defaultRegion} pricing`);
        Object.entries(fallbackData.models).forEach(([modelId, pricing]) => {
          this.pricingData.set(modelId, { ...pricing, region: this.defaultRegion });
        });
      } else {
        Object.entries(regionData.models).forEach(([modelId, pricing]) => {
          this.pricingData.set(modelId, { ...pricing, region });
        });
      }

      this.lastUpdated = AWS_BEDROCK_PRICING.lastUpdated;

      console.log(`Loaded pricing data for ${this.pricingData.size} models in region ${region}`);
    } catch (error) {
      console.error('Failed to load pricing data:', error.message);
      this.lastError = error;
      throw error;
    }
  }

  /**
   * Get pricing information for a specific model
   * @param {string} modelId - The model identifier
   * @param {string} region - AWS region (optional)
   * @returns {Object|null} - Pricing information or null if not found
   */
  getModelPricing(modelId, region = this.defaultRegion) {
    try {
      // First try to get pricing from cache
      if (this.pricingData.has(modelId)) {
        return this.pricingData.get(modelId);
      }

      // If not in cache and region is different, try to load for that region
      if (region !== this.defaultRegion) {
        const regionData = AWS_BEDROCK_PRICING.regions[region];
        if (regionData && regionData.models[modelId]) {
          const pricing = { ...regionData.models[modelId], region };
          this.pricingData.set(modelId, pricing);
          return pricing;
        }
      }

      return null;
    } catch (error) {
      console.warn(`Failed to get pricing for model ${modelId}:`, error.message);
      this.lastError = error;
      return null;
    }
  }

  /**
   * Calculate cost based on token usage and model pricing
   * @param {Object} usage - Token usage data
   * @param {string} modelId - The model identifier
   * @param {string} region - AWS region (optional)
   * @returns {Object} - Cost calculation result
   */
  calculateCost(usage, modelId, region = this.defaultRegion) {
    try {
      if (!usage || typeof usage !== 'object') {
        return {
          inputCost: 0,
          outputCost: 0,
          toolCost: 0,
          totalCost: 0,
          currency: 'USD',
          isEstimated: true,
          error: 'Invalid usage data provided'
        };
      }

      const pricing = this.getModelPricing(modelId, region);
      if (!pricing) {
        return {
          inputCost: null,
          outputCost: null,
          toolCost: null,
          totalCost: null,
          currency: 'USD',
          isEstimated: true,
          error: `Pricing data not available for model ${modelId}`,
          modelId,
          region
        };
      }

      // Extract token counts, defaulting to 0 if not provided
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const toolTokens = usage.tool_tokens || 0;

      // Calculate costs (pricing is per 1000 tokens)
      const inputCost = (inputTokens / 1000) * pricing.inputPrice;
      const outputCost = (outputTokens / 1000) * pricing.outputPrice;

      // Tool tokens typically use input pricing if no specific tool pricing
      const toolPrice = pricing.toolTokenPrice || pricing.inputPrice;
      const toolCost = (toolTokens / 1000) * toolPrice;

      const totalCost = inputCost + outputCost + toolCost;

      // Determine if this is an estimate based on token source
      const isEstimated = usage.tokens_source === 'estimated' || usage.tokens_source === 'api';

      return {
        inputCost: Math.round(inputCost * 1000000) / 1000000, // Round to 6 decimal places
        outputCost: Math.round(outputCost * 1000000) / 1000000,
        toolCost: Math.round(toolCost * 1000000) / 1000000,
        totalCost: Math.round(totalCost * 1000000) / 1000000,
        currency: pricing.currency,
        isEstimated,
        pricingDate: this.lastUpdated,
        modelId,
        region: pricing.region,
        provider: pricing.provider,
        error: null
      };
    } catch (error) {
      console.error(`Cost calculation failed for model ${modelId}:`, error.message);
      this.lastError = error;

      return {
        inputCost: null,
        outputCost: null,
        toolCost: null,
        totalCost: null,
        currency: 'USD',
        isEstimated: true,
        error: error.message,
        modelId,
        region
      };
    }
  }

  /**
   * Update pricing data (for future use when pricing data source becomes dynamic)
   * Currently returns the static data version info
   */
  async updatePricingData() {
    try {
      // In a real implementation, this would fetch from an external source
      // For now, we just reload the static data
      await this.loadPricingData();

      return {
        success: true,
        message: 'Pricing data updated successfully',
        version: AWS_BEDROCK_PRICING.version,
        lastUpdated: this.lastUpdated,
        modelsCount: this.pricingData.size
      };
    } catch (error) {
      this.lastError = error;
      return {
        success: false,
        message: `Failed to update pricing data: ${error.message}`,
        error: error
      };
    }
  }

  /**
   * Get all available models with pricing information
   * @param {string} region - AWS region (optional)
   * @returns {Array} - Array of models with pricing info
   */
  getAvailableModels(region = this.defaultRegion) {
    try {
      const models = [];

      for (const [modelId, pricing] of this.pricingData.entries()) {
        if (!region || pricing.region === region) {
          models.push({
            modelId,
            provider: pricing.provider,
            inputPrice: pricing.inputPrice,
            outputPrice: pricing.outputPrice,
            toolPrice: pricing.toolTokenPrice || pricing.inputPrice,
            currency: pricing.currency,
            region: pricing.region
          });
        }
      }

      return models.sort((a, b) => {
        // Sort by provider first, then by model name
        if (a.provider !== b.provider) {
          return a.provider.localeCompare(b.provider);
        }
        return a.modelId.localeCompare(b.modelId);
      });
    } catch (error) {
      console.error('Failed to get available models:', error.message);
      this.lastError = error;
      return [];
    }
  }

  /**
   * Check if the service is ready to use
   * @returns {boolean} - True if service is initialized and has pricing data
   */
  isReady() {
    return this.isInitialized && this.pricingData.size > 0;
  }

  /**
   * Get service status information
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      ready: this.isReady(),
      modelsLoaded: this.pricingData.size,
      lastUpdated: this.lastUpdated,
      pricingVersion: AWS_BEDROCK_PRICING.version,
      defaultRegion: this.defaultRegion,
      lastError: this.lastError?.message || null,
      supportedRegions: Object.keys(AWS_BEDROCK_PRICING.regions)
    };
  }

  /**
   * Clear pricing data cache
   */
  clearCache() {
    this.pricingData.clear();
  }

  /**
   * Cleanup resources when service is no longer needed
   */
  cleanup() {
    this.clearCache();
    this.isInitialized = false;
    this.lastError = null;
    this.lastUpdated = null;
  }
}

// Export a singleton instance
export const costCalculationService = new CostCalculationService();
