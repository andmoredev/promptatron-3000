/**
 * Image Model Registry
 * Centralized registry for supported image generation models with capabilities and configuration
 */

export class ImageModelRegistry {
  constructor() {
    this.models = new Map();
    this.providers = new Map();
    this.capabilities = new Map();
    this.initializeRegistry();
  }

  /**
   * Initialize the model registry with supported models
   */
  initializeRegistry() {
    // Amazon Nova Canvas - the only supported image generation model
    this.registerModel({
      id: 'amazon.nova-canvas-v1:0',
      name: 'Amazon Nova Canvas',
      provider: 'Amazon',
      category: 'general',
      description: 'High-quality image generation with excellent prompt adherence',
      version: '1.0',
      capabilities: {
        maxPromptLength: 1024,
        supportedDimensions: [
          { width: 512, height: 512, label: '512×512 (Square)', aspectRatio: '1:1' },
          { width: 768, height: 768, label: '768×768 (Square)', aspectRatio: '1:1' },
          { width: 1024, height: 1024, label: '1024×1024 (Square)', aspectRatio: '1:1' },
          { width: 1152, height: 896, label: '1152×896 (Landscape)', aspectRatio: '9:7' },
          { width: 896, height: 1152, label: '896×1152 (Portrait)', aspectRatio: '7:9' }
        ],
        supportedQualities: ['standard', 'premium'],
        supportsNegativePrompt: true,
        supportsStyleSettings: false,
        supportsBatchGeneration: true,
        maxBatchSize: 4,
        supportsSeeds: true,
        outputFormats: ['png'],
        estimatedGenerationTime: {
          '512x512': 3000,
          '1024x1024': 5000,
          '1152x896': 4500
        }
      },
      parameters: {
        required: ['prompt'],
        optional: ['width', 'height', 'quality', 'numberOfImages', 'seed', 'negativePrompt'],
        defaults: {
          width: 512,
          height: 512,
          quality: 'standard',
          numberOfImages: 1
        },
        constraints: {
          width: { min: 512, max: 1152, step: 64 },
          height: { min: 512, max: 1152, step: 64 },
          numberOfImages: { min: 1, max: 4 },
          seed: { min: 0, max: 858993459 }
        }
      },
      pricing: {
        currency: 'USD',
        unit: 'per_image',
        standard: 0.04,
        premium: 0.08
      },
      apiConfig: {
        requestFormat: 'nova_canvas',
        responseFormat: 'nova_canvas',
        useInvokeModel: true,
        useConverse: false
      }
    });

    // Initialize provider information
    this.initializeProviders();
  }

  /**
   * Initialize provider information
   */
  initializeProviders() {
    this.providers.set('Amazon', {
      name: 'Amazon',
      description: 'Amazon Web Services Bedrock Foundation Models',
      website: 'https://aws.amazon.com/bedrock/',
      models: ['amazon.nova-canvas-v1:0'],
      strengths: ['Reliability', 'Integration', 'Prompt Adherence'],
      categories: ['general']
    });
  }

  /**
   * Register a new model in the registry
   * @param {Object} modelConfig - Model configuration
   */
  registerModel(modelConfig) {
    if (!modelConfig.id) {
      throw new Error('Model ID is required');
    }

    // Validate required fields
    const requiredFields = ['name', 'provider', 'capabilities', 'parameters'];
    for (const field of requiredFields) {
      if (!modelConfig[field]) {
        throw new Error(`Model configuration missing required field: ${field}`);
      }
    }

    this.models.set(modelConfig.id, modelConfig);
    this.capabilities.set(modelConfig.id, modelConfig.capabilities);
  }

  /**
   * Get model configuration by ID
   * @param {string} modelId - Model ID
   * @returns {Object|null} Model configuration or null if not found
   */
  getModel(modelId) {
    return this.models.get(modelId) || null;
  }

  /**
   * Get all registered models
   * @returns {Array} Array of all model configurations
   */
  getAllModels() {
    return Array.from(this.models.values());
  }

  /**
   * Get models by provider
   * @param {string} providerName - Provider name
   * @returns {Array} Array of models from the specified provider
   */
  getModelsByProvider(providerName) {
    return this.getAllModels().filter(model => model.provider === providerName);
  }

  /**
   * Get models by category
   * @param {string} category - Model category
   * @returns {Array} Array of models in the specified category
   */
  getModelsByCategory(category) {
    return this.getAllModels().filter(model => model.category === category);
  }

  /**
   * Get model capabilities
   * @param {string} modelId - Model ID
   * @returns {Object|null} Model capabilities or null if not found
   */
  getModelCapabilities(modelId) {
    return this.capabilities.get(modelId) || null;
  }

  /**
   * Check if model supports specific capability
   * @param {string} modelId - Model ID
   * @param {string} capability - Capability to check
   * @returns {boolean} True if model supports the capability
   */
  supportsCapability(modelId, capability) {
    const capabilities = this.getModelCapabilities(modelId);
    if (!capabilities) return false;

    switch (capability) {
      case 'negativePrompt':
        return capabilities.supportsNegativePrompt === true;
      case 'styleSettings':
        return capabilities.supportsStyleSettings === true;
      case 'batchGeneration':
        return capabilities.supportsBatchGeneration === true;
      case 'seeds':
        return capabilities.supportsSeeds === true;
      default:
        return capabilities.hasOwnProperty(capability);
    }
  }

  /**
   * Get supported dimensions for a model
   * @param {string} modelId - Model ID
   * @returns {Array} Array of supported dimensions
   */
  getSupportedDimensions(modelId) {
    const capabilities = this.getModelCapabilities(modelId);
    return capabilities?.supportedDimensions || [];
  }

  /**
   * Validate dimensions for a model
   * @param {string} modelId - Model ID
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {boolean} True if dimensions are supported
   */
  validateDimensions(modelId, width, height) {
    const supportedDimensions = this.getSupportedDimensions(modelId);
    return supportedDimensions.some(dim => dim.width === width && dim.height === height);
  }

  /**
   * Get parameter constraints for a model
   * @param {string} modelId - Model ID
   * @returns {Object|null} Parameter constraints or null if not found
   */
  getParameterConstraints(modelId) {
    const model = this.getModel(modelId);
    return model?.parameters || null;
  }

  /**
   * Validate parameter value against constraints
   * @param {string} modelId - Model ID
   * @param {string} parameterName - Parameter name
   * @param {*} value - Parameter value
   * @returns {Object} Validation result
   */
  validateParameter(modelId, parameterName, value) {
    const constraints = this.getParameterConstraints(modelId);
    if (!constraints) {
      return { valid: false, error: 'Model not found' };
    }

    const paramConstraint = constraints.constraints?.[parameterName];
    if (!paramConstraint) {
      return { valid: true }; // No constraints defined
    }

    // Check numeric constraints
    if (typeof value === 'number') {
      if (paramConstraint.min !== undefined && value < paramConstraint.min) {
        return { valid: false, error: `${parameterName} must be at least ${paramConstraint.min}` };
      }
      if (paramConstraint.max !== undefined && value > paramConstraint.max) {
        return { valid: false, error: `${parameterName} must be at most ${paramConstraint.max}` };
      }
      if (paramConstraint.step !== undefined && (value % paramConstraint.step) !== 0) {
        return { valid: false, error: `${parameterName} must be a multiple of ${paramConstraint.step}` };
      }
    }

    return { valid: true };
  }

  /**
   * Get default parameters for a model
   * @param {string} modelId - Model ID
   * @returns {Object} Default parameters
   */
  getDefaultParameters(modelId) {
    const constraints = this.getParameterConstraints(modelId);
    return constraints?.defaults || {};
  }

  /**
   * Get estimated generation time for model and dimensions
   * @param {string} modelId - Model ID
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {number} Estimated generation time in milliseconds
   */
  getEstimatedGenerationTime(modelId, width = 512, height = 512) {
    const capabilities = this.getModelCapabilities(modelId);
    if (!capabilities?.estimatedGenerationTime) {
      return 5000; // Default 5 seconds
    }

    const dimensionKey = `${width}x${height}`;
    return capabilities.estimatedGenerationTime[dimensionKey] ||
           capabilities.estimatedGenerationTime['512x512'] ||
           5000;
  }

  /**
   * Get pricing information for a model
   * @param {string} modelId - Model ID
   * @param {string} quality - Quality setting (optional)
   * @returns {Object|null} Pricing information
   */
  getPricing(modelId, quality = 'standard') {
    const model = this.getModel(modelId);
    if (!model?.pricing) return null;

    const basePrice = model.pricing[quality] || model.pricing.standard || 0;

    return {
      currency: model.pricing.currency,
      unit: model.pricing.unit,
      price: basePrice,
      quality
    };
  }

  /**
   * Get API configuration for a model
   * @param {string} modelId - Model ID
   * @returns {Object|null} API configuration
   */
  getApiConfig(modelId) {
    const model = this.getModel(modelId);
    return model?.apiConfig || null;
  }

  /**
   * Get provider information
   * @param {string} providerName - Provider name
   * @returns {Object|null} Provider information
   */
  getProvider(providerName) {
    return this.providers.get(providerName) || null;
  }

  /**
   * Get all providers
   * @returns {Array} Array of all providers
   */
  getAllProviders() {
    return Array.from(this.providers.values());
  }

  /**
   * Search models by criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array} Array of matching models
   */
  searchModels(criteria = {}) {
    let models = this.getAllModels();

    if (criteria.provider) {
      models = models.filter(model => model.provider === criteria.provider);
    }

    if (criteria.category) {
      models = models.filter(model => model.category === criteria.category);
    }

    if (criteria.capability) {
      models = models.filter(model => this.supportsCapability(model.id, criteria.capability));
    }

    if (criteria.maxPromptLength) {
      models = models.filter(model =>
        model.capabilities.maxPromptLength >= criteria.maxPromptLength
      );
    }

    if (criteria.supportsDimensions) {
      const { width, height } = criteria.supportsDimensions;
      models = models.filter(model => this.validateDimensions(model.id, width, height));
    }

    return models;
  }

  /**
   * Get model comparison data
   * @param {Array} modelIds - Array of model IDs to compare
   * @returns {Object} Comparison data
   */
  compareModels(modelIds) {
    const models = modelIds.map(id => this.getModel(id)).filter(Boolean);

    if (models.length === 0) {
      return { error: 'No valid models provided' };
    }

    const comparison = {
      models: models.map(model => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        category: model.category
      })),
      capabilities: {},
      parameters: {},
      pricing: {}
    };

    // Compare capabilities
    const capabilityKeys = ['maxPromptLength', 'supportsNegativePrompt', 'supportsStyleSettings', 'supportsBatchGeneration'];
    capabilityKeys.forEach(key => {
      comparison.capabilities[key] = models.map(model => model.capabilities[key]);
    });

    // Compare supported dimensions
    comparison.capabilities.supportedDimensions = models.map(model =>
      model.capabilities.supportedDimensions.length
    );

    // Compare default parameters
    comparison.parameters.defaults = models.map(model => model.parameters.defaults);

    // Compare pricing
    comparison.pricing = models.map(model => model.pricing);

    return comparison;
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry statistics
   */
  getStatistics() {
    const models = this.getAllModels();
    const providers = this.getAllProviders();

    return {
      totalModels: models.length,
      totalProviders: providers.length,
      modelsByProvider: providers.map(provider => ({
        name: provider.name,
        count: models.filter(model => model.provider === provider.name).length
      })),
      modelsByCategory: {
        general: models.filter(model => model.category === 'general').length
      },
      capabilities: {
        negativePrompt: models.filter(model => model.capabilities.supportsNegativePrompt).length,
        styleSettings: models.filter(model => model.capabilities.supportsStyleSettings).length,
        batchGeneration: models.filter(model => model.capabilities.supportsBatchGeneration).length
      }
    };
  }
}

// Export singleton instance
export const imageModelRegistry = new ImageModelRegistry();