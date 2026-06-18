/**
 * Unified Image Service
 * Provides a single interface for all image generation functionality
 * Integrates ImageService, ImageVerificationService, and ImageModelRegistry
 */

import { imageService } from './imageService.js';
import { imageVerificationService } from './imageVerificationService.js';
import { imageModelRegistry } from './imageModelRegistry.js';
import { handleError } from '../utils/errorHandling.js';

export class UnifiedImageService {
  constructor() {
    this.imageService = imageService;
    this.verificationService = imageVerificationService;
    this.modelRegistry = imageModelRegistry;
    this.isInitialized = false;
  }

  /**
   * Initialize the unified image service
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        return {
          success: true,
          message: 'UnifiedImageService already initialized'
        };
      }

      // Initialize core services
      const imageServiceInit = await this.imageService.initialize();
      if (!imageServiceInit.success) {
        return imageServiceInit;
      }

      const verificationServiceInit = await this.verificationService.initialize();
      if (!verificationServiceInit.success) {
        return verificationServiceInit;
      }

      this.isInitialized = true;

      return {
        success: true,
        message: 'UnifiedImageService initialized successfully',
        services: {
          imageService: imageServiceInit.success,
          verificationService: verificationServiceInit.success,
          modelRegistry: true
        }
      };
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'UnifiedImageService',
        operation: 'initialize'
      });

      return {
        success: false,
        message: errorInfo.userMessage
      };
    }
  }

  /**
   * Check if service is ready
   * @returns {boolean} True if all services are ready
   */
  isReady() {
    return this.isInitialized &&
           this.imageService.isReady() &&
           this.verificationService.isReady();
  }

  // ===== MODEL MANAGEMENT =====

  /**
   * Get all supported image generation models
   * @returns {Array} Array of supported models with registry information
   */
  getSupportedModels() {
    return this.modelRegistry.getAllModels();
  }

  /**
   * Get available image generation models from Bedrock
   * @returns {Promise<Array>} Array of available models
   */
  async getAvailableModels() {
    try {
      const availableModels = await this.imageService.getAvailableImageModels();

      // Enhance with registry information
      return availableModels.map(model => {
        const registryInfo = this.modelRegistry.getModel(model.id);
        return {
          ...model,
          ...registryInfo,
          available: model.available
        };
      });
    } catch (error) {
      console.warn('Failed to get available models, returning supported models:', error.message);
      return this.getSupportedModels().map(model => ({
        ...model,
        available: false,
        error: 'Could not verify availability'
      }));
    }
  }

  /**
   * Get model information with capabilities
   * @param {string} modelId - Model ID
   * @returns {Object|null} Enhanced model information
   */
  getModelInfo(modelId) {
    const registryInfo = this.modelRegistry.getModel(modelId);
    const serviceInfo = this.imageService.getModelInfo(modelId);

    if (!registryInfo && !serviceInfo) {
      return null;
    }

    return {
      ...registryInfo,
      ...serviceInfo,
      constraints: this.modelRegistry.getParameterConstraints(modelId),
      capabilities: this.modelRegistry.getModelCapabilities(modelId),
      pricing: this.modelRegistry.getPricing(modelId),
      apiConfig: this.modelRegistry.getApiConfig(modelId)
    };
  }

  /**
   * Check if model supports image generation
   * @param {string} modelId - Model ID
   * @returns {boolean} True if model supports image generation
   */
  isImageGenerationModel(modelId) {
    return this.imageService.isImageGenerationModel(modelId) ||
           this.modelRegistry.getModel(modelId) !== null;
  }

  /**
   * Get models by provider
   * @param {string} providerName - Provider name
   * @returns {Array} Array of models from provider
   */
  getModelsByProvider(providerName) {
    return this.modelRegistry.getModelsByProvider(providerName);
  }

  /**
   * Search models by criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array} Array of matching models
   */
  searchModels(criteria) {
    return this.modelRegistry.searchModels(criteria);
  }

  // ===== IMAGE GENERATION =====

  /**
   * Generate image with comprehensive validation and error handling
   * @param {string} modelId - Model ID
   * @param {string} prompt - Text prompt
   * @param {Object} parameters - Generation parameters
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Image generation result
   */
  async generateImage(modelId, prompt, parameters = {}, options = {}) {
    try {
      if (!this.isReady()) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          throw new Error(initResult.message);
        }
      }

      // Validate model exists in registry
      const modelInfo = this.getModelInfo(modelId);
      if (!modelInfo) {
        throw new Error(`Unsupported image generation model: ${modelId}`);
      }

      // Merge parameters with model defaults
      const defaultParams = this.modelRegistry.getDefaultParameters(modelId);
      const mergedParams = { ...defaultParams, ...parameters };

      // Validate parameters against model constraints
      const paramValidation = this.validateAllParameters(modelId, mergedParams);
      if (!paramValidation.valid) {
        throw new Error(paramValidation.error);
      }

      // Generate image
      const result = await this.imageService.generateImage(modelId, prompt, mergedParams);

      // Add registry information to result
      result.modelInfo = modelInfo;
      result.estimatedTime = this.modelRegistry.getEstimatedGenerationTime(
        modelId,
        mergedParams.width,
        mergedParams.height
      );
      result.pricing = this.modelRegistry.getPricing(modelId, mergedParams.quality);

      return result;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'UnifiedImageService',
        operation: 'generateImage',
        modelId,
        promptLength: prompt?.length || 0,
        parameters
      });

      throw new Error(`Image generation failed: ${errorInfo.userMessage}`);
    }
  }

  /**
   * Generate image with automatic verification
   * @param {string} modelId - Model ID
   * @param {string} prompt - Text prompt
   * @param {Object} parameters - Generation parameters
   * @param {Object} verificationOptions - Verification options
   * @returns {Promise<Object>} Image generation result with verification
   */
  async generateImageWithVerification(modelId, prompt, parameters = {}, verificationOptions = {}) {
    try {
      // Generate image
      const imageResult = await this.generateImage(modelId, prompt, parameters);

      // Verify image
      const verificationResult = await this.verificationService.verifyImage(
        imageResult,
        prompt,
        modelId,
        verificationOptions
      );

      return {
        ...imageResult,
        verification: verificationResult,
        verified: true
      };
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'UnifiedImageService',
        operation: 'generateImageWithVerification',
        modelId,
        promptLength: prompt?.length || 0
      });

      throw new Error(`Image generation with verification failed: ${errorInfo.userMessage}`);
    }
  }

  // ===== VALIDATION =====

  /**
   * Validate image prompt for a specific model
   * @param {string} modelId - Model ID
   * @param {string} prompt - Text prompt
   * @returns {Object} Validation result
   */
  validatePrompt(modelId, prompt) {
    return this.imageService.validateImagePrompt(modelId, prompt);
  }

  /**
   * Validate image parameters for a specific model
   * @param {string} modelId - Model ID
   * @param {Object} parameters - Parameters to validate
   * @returns {Object} Validation result
   */
  validateParameters(modelId, parameters) {
    return this.imageService.validateImageParameters(modelId, parameters);
  }

  /**
   * Validate all parameters against model registry constraints
   * @param {string} modelId - Model ID
   * @param {Object} parameters - Parameters to validate
   * @returns {Object} Validation result
   */
  validateAllParameters(modelId, parameters) {
    const errors = [];

    // Validate each parameter against registry constraints
    for (const [paramName, value] of Object.entries(parameters)) {
      const validation = this.modelRegistry.validateParameter(modelId, paramName, value);
      if (!validation.valid) {
        errors.push(validation.error);
      }
    }

    // Validate dimensions specifically
    if (parameters.width && parameters.height) {
      if (!this.modelRegistry.validateDimensions(modelId, parameters.width, parameters.height)) {
        errors.push(`Unsupported dimensions ${parameters.width}×${parameters.height} for this model`);
      }
    }

    return {
      valid: errors.length === 0,
      error: errors.join('; '),
      errors
    };
  }

  /**
   * Get parameter constraints for a model
   * @param {string} modelId - Model ID
   * @returns {Object|null} Parameter constraints
   */
  getParameterConstraints(modelId) {
    return this.modelRegistry.getParameterConstraints(modelId);
  }

  /**
   * Get supported dimensions for a model
   * @param {string} modelId - Model ID
   * @returns {Array} Array of supported dimensions
   */
  getSupportedDimensions(modelId) {
    return this.modelRegistry.getSupportedDimensions(modelId);
  }

  // ===== VERIFICATION =====

  /**
   * Verify existing image result
   * @param {Object} imageResult - Image result to verify
   * @param {string} originalPrompt - Original prompt
   * @param {string} modelId - Model ID
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification results
   */
  async verifyImage(imageResult, originalPrompt, modelId, options = {}) {
    return await this.verificationService.verifyImage(imageResult, originalPrompt, modelId, options);
  }

  /**
   * Get verification status
   * @param {string} verificationId - Verification ID
   * @returns {Object|null} Verification status
   */
  getVerificationStatus(verificationId) {
    return this.verificationService.getVerificationStatus(verificationId);
  }

  // ===== UTILITY METHODS =====

  /**
   * Compare multiple models
   * @param {Array} modelIds - Array of model IDs to compare
   * @returns {Object} Model comparison data
   */
  compareModels(modelIds) {
    return this.modelRegistry.compareModels(modelIds);
  }

  /**
   * Get estimated generation time
   * @param {string} modelId - Model ID
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {number} Estimated time in milliseconds
   */
  getEstimatedGenerationTime(modelId, width = 512, height = 512) {
    return this.modelRegistry.getEstimatedGenerationTime(modelId, width, height);
  }

  /**
   * Get pricing information
   * @param {string} modelId - Model ID
   * @param {string} quality - Quality setting
   * @returns {Object|null} Pricing information
   */
  getPricing(modelId, quality = 'standard') {
    return this.modelRegistry.getPricing(modelId, quality);
  }

  /**
   * Check if model supports specific capability
   * @param {string} modelId - Model ID
   * @param {string} capability - Capability to check
   * @returns {boolean} True if supported
   */
  supportsCapability(modelId, capability) {
    return this.modelRegistry.supportsCapability(modelId, capability);
  }

  /**
   * Get comprehensive service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      unified: {
        initialized: this.isInitialized,
        ready: this.isReady()
      },
      imageService: this.imageService.getStatus(),
      verificationService: this.verificationService.getStatus(),
      modelRegistry: this.modelRegistry.getStatistics()
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    // Clean up verification service
    this.verificationService.cleanupCompletedVerifications();

    console.log('[UnifiedImageService] Cleanup completed');
  }
}

// Export singleton instance
export const unifiedImageService = new UnifiedImageService();