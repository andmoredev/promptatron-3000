/**
 * Image Generation Service
 * Handles multi-model image generation with validation and error handling
 */

import { bedrockService } from './bedrockService.js';
import { handleError, ErrorTypes } from '../utils/errorHandling.js';
import {
  retryImageGeneration,
  handleImageGenerationError,
  isRetryableError,
  errorPatternTracker
} from '../utils/imageErrorRecovery.js';

export class ImageService {
  constructor() {
    this.bedrockService = bedrockService;
    this.supportedModels = [
      'amazon.nova-canvas-v1:0'
    ];
  }

  /**
   * Initialize the image service
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    try {
      if (!this.bedrockService.isReady()) {
        const initResult = await this.bedrockService.initialize();
        if (!initResult.success) {
          return {
            success: false,
            message: `Failed to initialize Bedrock service: ${initResult.message}`
          };
        }
      }

      return {
        success: true,
        message: 'ImageService initialized successfully'
      };
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'ImageService',
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
   * @returns {boolean} True if ready
   */
  isReady() {
    return this.bedrockService.isReady();
  }

  /**
   * Check if a model supports image generation
   * @param {string} modelId - Model ID to check
   * @returns {boolean} True if model supports image generation
   */
  isImageGenerationModel(modelId) {
    return this.supportedModels.includes(modelId);
  }

  /**
   * Get all supported image generation models with their capabilities
   * @returns {Array} Array of supported image models with metadata
   */
  getSupportedImageModels() {
    return [
      {
        id: 'amazon.nova-canvas-v1:0',
        name: 'Amazon Nova Canvas',
        provider: 'Amazon',
        maxPromptLength: 1024,
        supportedDimensions: [
          { width: 512, height: 512, label: '512×512 (Square)' },
          { width: 768, height: 768, label: '768×768 (Square)' },
          { width: 1024, height: 1024, label: '1024×1024 (Square)' },
          { width: 1152, height: 896, label: '1152×896 (Landscape)' },
          { width: 896, height: 1152, label: '896×1152 (Portrait)' }
        ],
        supportedQualities: ['standard', 'premium'],
        supportsNegativePrompt: true,
        supportsStyleSettings: false,
        defaultParameters: {
          width: 512,
          height: 512,
          quality: 'standard',
          numberOfImages: 1
        }
      }
    ];
  }

  /**
   * Get model-specific information
   * @param {string} modelId - Model ID
   * @returns {Object|null} Model information or null if not found
   */
  getModelInfo(modelId) {
    return this.getSupportedImageModels().find(model => model.id === modelId) || null;
  }

  /**
   * Validate image generation prompt based on model constraints
   * @param {string} modelId - Model ID
   * @param {string} prompt - Text prompt for image generation
   * @returns {Object} Validation result with valid flag and error message
   */
  validateImagePrompt(modelId, prompt) {
    try {
      // Check if model is supported
      const modelInfo = this.getModelInfo(modelId);
      if (!modelInfo) {
        return {
          valid: false,
          error: `Unsupported image generation model: ${modelId}`,
          code: 'UNSUPPORTED_MODEL'
        };
      }

      // Check if prompt is provided
      if (!prompt || typeof prompt !== 'string') {
        return {
          valid: false,
          error: 'Prompt is required and must be a string',
          code: 'MISSING_PROMPT'
        };
      }

      // Check if prompt is not empty after trimming
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        return {
          valid: false,
          error: 'Prompt cannot be empty',
          code: 'EMPTY_PROMPT'
        };
      }

      // Check prompt length against model limits
      if (trimmedPrompt.length > modelInfo.maxPromptLength) {
        return {
          valid: false,
          error: `Prompt too long. Maximum ${modelInfo.maxPromptLength} characters for ${modelInfo.name}. Current length: ${trimmedPrompt.length}`,
          code: 'PROMPT_TOO_LONG',
          maxLength: modelInfo.maxPromptLength,
          currentLength: trimmedPrompt.length
        };
      }

      // Basic content safety check (simple keyword filtering)
      const unsafeKeywords = ['explicit', 'nsfw', 'nude', 'sexual'];
      const lowerPrompt = trimmedPrompt.toLowerCase();
      for (const keyword of unsafeKeywords) {
        if (lowerPrompt.includes(keyword)) {
          return {
            valid: false,
            error: 'Prompt contains potentially inappropriate content',
            code: 'UNSAFE_CONTENT'
          };
        }
      }

      return {
        valid: true,
        trimmedPrompt,
        modelInfo
      };
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error.message}`,
        code: 'VALIDATION_ERROR'
      };
    }
  }

  /**
   * Validate image generation parameters
   * @param {string} modelId - Model ID
   * @param {Object} parameters - Image generation parameters
   * @returns {Object} Validation result
   */
  validateImageParameters(modelId, parameters = {}) {
    try {
      const modelInfo = this.getModelInfo(modelId);
      if (!modelInfo) {
        return {
          valid: false,
          error: `Unsupported model: ${modelId}`,
          code: 'UNSUPPORTED_MODEL'
        };
      }

      const validatedParams = { ...modelInfo.defaultParameters, ...parameters };
      const errors = [];

      // Validate dimensions
      if (validatedParams.width && validatedParams.height) {
        const dimensionSupported = modelInfo.supportedDimensions.some(
          dim => dim.width === validatedParams.width && dim.height === validatedParams.height
        );

        if (!dimensionSupported) {
          errors.push(`Unsupported dimensions ${validatedParams.width}×${validatedParams.height} for ${modelInfo.name}`);
        }
      }

      // Validate quality setting
      if (validatedParams.quality && !modelInfo.supportedQualities.includes(validatedParams.quality)) {
        errors.push(`Unsupported quality setting '${validatedParams.quality}' for ${modelInfo.name}`);
      }

      // Validate number of images
      if (validatedParams.numberOfImages) {
        if (!Number.isInteger(validatedParams.numberOfImages) || validatedParams.numberOfImages < 1 || validatedParams.numberOfImages > 4) {
          errors.push('Number of images must be an integer between 1 and 4');
        }
      }

      // Model-specific validations for Nova Canvas
      if (modelId === 'amazon.nova-canvas-v1:0') {
        // Nova Canvas specific validations can be added here if needed
      }

      if (errors.length > 0) {
        return {
          valid: false,
          error: errors.join('; '),
          code: 'INVALID_PARAMETERS',
          errors
        };
      }

      return {
        valid: true,
        validatedParameters: validatedParams
      };
    } catch (error) {
      return {
        valid: false,
        error: `Parameter validation error: ${error.message}`,
        code: 'VALIDATION_ERROR'
      };
    }
  }

  /**
   * Generate image using specified model and parameters with comprehensive error handling
   * @param {string} modelId - Model ID for image generation
   * @param {string} prompt - Text prompt for image generation
   * @param {Object} parameters - Image generation parameters
   * @param {Object} options - Generation options (retry, timeout, etc.)
   * @returns {Promise<Object>} Image generation result
   */
  async generateImage(modelId, prompt, parameters = {}, options = {}) {
    const context = {
      modelId,
      promptLength: prompt?.length || 0,
      parameters,
      operation: 'generateImage'
    };

    try {
      // Ensure service is ready
      if (!this.isReady()) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          const error = new Error(initResult.message);
          error.code = 'SERVICE_INIT_FAILED';
          throw error;
        }
      }

      // Validate prompt
      const promptValidation = this.validateImagePrompt(modelId, prompt);
      if (!promptValidation.valid) {
        const error = new Error(promptValidation.error);
        error.code = promptValidation.code || 'PROMPT_INVALID';
        throw error;
      }

      // Validate parameters
      const paramValidation = this.validateImageParameters(modelId, parameters);
      if (!paramValidation.valid) {
        const error = new Error(paramValidation.error);
        error.code = paramValidation.code || 'PARAMETERS_INVALID';
        throw error;
      }

      // Create generation function for retry logic
      const generateImageFn = async () => {
        const startTime = performance.now();

        try {
          // Check if model is available before attempting generation
          const modelInfo = this.getModelInfo(modelId);
          if (!modelInfo) {
            const error = new Error(`Image model ${modelId} is not supported`);
            error.code = 'IMAGE_MODEL_UNAVAILABLE';
            throw error;
          }

          // Generate image using BedrockService with timeout
          const result = await this.generateImageWithTimeout(
            modelId,
            promptValidation.trimmedPrompt,
            paramValidation.validatedParameters,
            options.timeout || 120000 // 2 minute default timeout
          );

          const endTime = performance.now();

          // Enhance result with additional metadata
          return {
            ...result,
            id: this.generateImageId(),
            timestamp: new Date().toISOString(),
            generationTime: endTime - startTime,
            modelInfo: promptValidation.modelInfo,
            validation: {
              promptValid: true,
              parametersValid: true
            },
            retryAttempts: 0
          };

        } catch (error) {
          // Enhance error with specific codes for better categorization
          if (error.message.includes('timeout')) {
            error.code = 'IMAGE_TIMEOUT';
          } else if (error.message.includes('throttling') || error.message.includes('rate limit')) {
            error.code = 'IMAGE_RATE_LIMIT';
          } else if (error.message.includes('model not available')) {
            error.code = 'IMAGE_MODEL_UNAVAILABLE';
          } else if (error.message.includes('content policy')) {
            error.code = 'IMAGE_CONTENT_POLICY';
          }

          throw error;
        }
      };

      // Use retry logic for retryable errors
      if (options.enableRetry !== false) {
        return await retryImageGeneration(
          generateImageFn,
          context,
          options.onRetry
        );
      } else {
        return await generateImageFn();
      }

    } catch (error) {
      // Use specialized image error handling
      const errorInfo = handleImageGenerationError(error, context, options.onRecoveryOptions);

      // Create enhanced error with recovery information
      const enhancedError = new Error(errorInfo.userMessage);
      enhancedError.code = error.code || 'IMAGE_GENERATION_FAILED';
      enhancedError.originalError = error;
      enhancedError.errorInfo = errorInfo;
      enhancedError.recoveryOptions = errorInfo.recoveryOptions;
      enhancedError.isRetryable = errorInfo.isRetryable;

      throw enhancedError;
    }
  }

  /**
   * Generate image with timeout protection
   * @param {string} modelId - Model ID
   * @param {string} prompt - Validated prompt
   * @param {Object} parameters - Validated parameters
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Image generation result
   */
  async generateImageWithTimeout(modelId, prompt, parameters, timeout = 120000) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(`Image generation timed out after ${timeout / 1000} seconds`);
        error.code = 'IMAGE_TIMEOUT';
        reject(error);
      }, timeout);

      try {
        const result = await this.bedrockService.generateImage(modelId, prompt, parameters);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Generate unique image ID
   * @returns {string} Unique image ID
   */
  generateImageId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `img_${timestamp}_${random}`;
  }

  /**
   * Get available image generation models from Bedrock
   * @returns {Promise<Array>} Array of available image models
   */
  async getAvailableImageModels() {
    try {
      if (!this.isReady()) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          throw new Error(initResult.message);
        }
      }

      // Get all foundation models from Bedrock
      const allModels = await this.bedrockService.listFoundationModels();

      // Filter for image generation models and enhance with our metadata
      const imageModels = allModels
        .filter(model => this.isImageGenerationModel(model.id))
        .map(model => {
          const modelInfo = this.getModelInfo(model.id);
          return {
            ...model,
            ...modelInfo,
            available: true
          };
        });

      return imageModels;
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'ImageService',
        operation: 'getAvailableImageModels'
      });

      console.warn('Failed to get available image models:', errorInfo.userMessage);

      // Return supported models with availability unknown
      return this.getSupportedImageModels().map(model => ({
        ...model,
        available: false,
        error: 'Could not verify availability'
      }));
    }
  }

  /**
   * Get model-specific parameter constraints and defaults
   * @param {string} modelId - Model ID
   * @returns {Object} Parameter constraints and defaults
   */
  getModelParameterConstraints(modelId) {
    const modelInfo = this.getModelInfo(modelId);
    if (!modelInfo) {
      return null;
    }

    const constraints = {
      modelId,
      modelName: modelInfo.name,
      provider: modelInfo.provider,
      prompt: {
        maxLength: modelInfo.maxPromptLength,
        required: true
      },
      dimensions: {
        supported: modelInfo.supportedDimensions,
        default: {
          width: modelInfo.defaultParameters.width,
          height: modelInfo.defaultParameters.height
        }
      },
      quality: {
        supported: modelInfo.supportedQualities,
        default: modelInfo.defaultParameters.quality || 'standard'
      },
      numberOfImages: {
        min: 1,
        max: 4,
        default: 1
      },
      negativePrompt: {
        supported: modelInfo.supportsNegativePrompt,
        maxLength: modelInfo.maxPromptLength
      },
      styleSettings: {
        supported: modelInfo.supportsStyleSettings
      }
    };

    // Add model-specific constraints
    if (modelId === 'stability.stable-diffusion-xl-v1') {
      constraints.cfgScale = {
        min: 1,
        max: 20,
        default: 7,
        description: 'Controls how closely the image follows the prompt'
      };
      constraints.steps = {
        min: 10,
        max: 50,
        default: 30,
        description: 'Number of denoising steps'
      };
    }

    return constraints;
  }

  /**
   * Check if a specific model is currently available
   * @param {string} modelId - Model ID to check
   * @returns {Promise<Object>} Availability status
   */
  async checkModelAvailability(modelId) {
    try {
      if (!this.isImageGenerationModel(modelId)) {
        return {
          available: false,
          reason: 'Model not supported for image generation',
          code: 'UNSUPPORTED_MODEL'
        };
      }

      // Try to get model info from Bedrock
      const availableModels = await this.bedrockService.listFoundationModels();
      const modelExists = availableModels.some(model => model.id === modelId);

      if (!modelExists) {
        return {
          available: false,
          reason: 'Model not available in current region',
          code: 'MODEL_NOT_AVAILABLE'
        };
      }

      // Check if we've had recent failures with this model
      const recentFailures = errorPatternTracker.shouldSuggestFallback(ErrorTypes.IMAGE_MODEL_UNAVAILABLE, modelId);

      return {
        available: true,
        reliable: !recentFailures,
        warning: recentFailures ? 'Model has had recent availability issues' : null
      };

    } catch (error) {
      return {
        available: false,
        reason: `Unable to verify model availability: ${error.message}`,
        code: 'AVAILABILITY_CHECK_FAILED'
      };
    }
  }

  /**
   * Get comprehensive model health status
   * @returns {Promise<Object>} Model health information
   */
  async getModelHealthStatus() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      models: {},
      overallHealth: 'unknown'
    };

    let availableCount = 0;
    let totalCount = 0;

    for (const modelId of this.supportedModels) {
      totalCount++;
      const availability = await this.checkModelAvailability(modelId);
      healthStatus.models[modelId] = availability;

      if (availability.available) {
        availableCount++;
      }
    }

    // Determine overall health
    const availabilityRatio = availableCount / totalCount;
    if (availabilityRatio >= 0.8) {
      healthStatus.overallHealth = 'good';
    } else if (availabilityRatio >= 0.5) {
      healthStatus.overallHealth = 'degraded';
    } else {
      healthStatus.overallHealth = 'poor';
    }

    healthStatus.summary = {
      available: availableCount,
      total: totalCount,
      ratio: availabilityRatio
    };

    return healthStatus;
  }

  /**
   * Enhanced prompt validation with safety checks
   * @param {string} modelId - Model ID
   * @param {string} prompt - Text prompt for image generation
   * @returns {Object} Enhanced validation result
   */
  validateImagePromptEnhanced(modelId, prompt) {
    const basicValidation = this.validateImagePrompt(modelId, prompt);

    if (!basicValidation.valid) {
      return basicValidation;
    }

    // Additional safety and quality checks
    const enhancedChecks = {
      safetyScore: this.calculatePromptSafetyScore(prompt),
      qualityScore: this.calculatePromptQualityScore(prompt),
      suggestions: this.generatePromptSuggestions(prompt, modelId)
    };

    return {
      ...basicValidation,
      enhanced: enhancedChecks,
      recommendations: this.generatePromptRecommendations(enhancedChecks)
    };
  }

  /**
   * Calculate prompt safety score (0-100)
   * @param {string} prompt - Text prompt
   * @returns {number} Safety score
   */
  calculatePromptSafetyScore(prompt) {
    if (!prompt || typeof prompt !== 'string') return 0;

    const lowerPrompt = prompt.toLowerCase();
    let score = 100;

    // Check for potentially problematic content
    const riskKeywords = [
      'explicit', 'nsfw', 'nude', 'sexual', 'violence', 'weapon', 'blood',
      'gore', 'death', 'suicide', 'drug', 'alcohol', 'hate', 'racist'
    ];

    for (const keyword of riskKeywords) {
      if (lowerPrompt.includes(keyword)) {
        score -= 20;
      }
    }

    // Check for copyright-related terms
    const copyrightKeywords = [
      'disney', 'marvel', 'pokemon', 'nintendo', 'sony', 'microsoft',
      'coca-cola', 'pepsi', 'mcdonald', 'starbucks'
    ];

    for (const keyword of copyrightKeywords) {
      if (lowerPrompt.includes(keyword)) {
        score -= 10;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Calculate prompt quality score (0-100)
   * @param {string} prompt - Text prompt
   * @returns {number} Quality score
   */
  calculatePromptQualityScore(prompt) {
    if (!prompt || typeof prompt !== 'string') return 0;

    let score = 50; // Base score

    // Length considerations
    const length = prompt.trim().length;
    if (length >= 20 && length <= 200) {
      score += 20; // Good length
    } else if (length < 10) {
      score -= 20; // Too short
    } else if (length > 500) {
      score -= 10; // Too long
    }

    // Descriptive words bonus
    const descriptiveWords = [
      'detailed', 'beautiful', 'colorful', 'bright', 'dark', 'light',
      'realistic', 'artistic', 'style', 'composition', 'texture'
    ];

    const foundDescriptive = descriptiveWords.filter(word =>
      prompt.toLowerCase().includes(word)
    ).length;

    score += Math.min(foundDescriptive * 5, 20);

    // Structure bonus (commas, proper grammar)
    if (prompt.includes(',')) score += 5;
    if (prompt.match(/^[A-Z]/)) score += 5; // Starts with capital

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Generate prompt suggestions
   * @param {string} prompt - Original prompt
   * @param {string} modelId - Model ID
   * @returns {Array} Array of suggestions
   */
  generatePromptSuggestions(prompt, modelId) {
    const suggestions = [];

    if (!prompt || prompt.trim().length < 10) {
      suggestions.push({
        type: 'length',
        message: 'Try adding more descriptive details to your prompt',
        example: 'Instead of "cat", try "a fluffy orange cat sitting in a sunny garden"'
      });
    }

    if (prompt.length > 300) {
      suggestions.push({
        type: 'length',
        message: 'Consider shortening your prompt for better results',
        example: 'Focus on the most important visual elements'
      });
    }

    if (!prompt.includes(',') && prompt.length > 20) {
      suggestions.push({
        type: 'structure',
        message: 'Use commas to separate different elements',
        example: 'a red car, sunny day, mountain background'
      });
    }

    const modelInfo = this.getModelInfo(modelId);
    if (modelInfo && prompt.length > modelInfo.maxPromptLength * 0.9) {
      suggestions.push({
        type: 'limit',
        message: `Prompt is close to ${modelInfo.name} limit (${modelInfo.maxPromptLength} chars)`,
        example: 'Consider removing less important details'
      });
    }

    return suggestions;
  }

  /**
   * Generate prompt recommendations based on analysis
   * @param {Object} enhancedChecks - Enhanced validation checks
   * @returns {Array} Array of recommendations
   */
  generatePromptRecommendations(enhancedChecks) {
    const recommendations = [];

    if (enhancedChecks.safetyScore < 80) {
      recommendations.push({
        priority: 'high',
        type: 'safety',
        message: 'Consider revising prompt to avoid potentially inappropriate content'
      });
    }

    if (enhancedChecks.qualityScore < 60) {
      recommendations.push({
        priority: 'medium',
        type: 'quality',
        message: 'Add more descriptive details to improve image quality'
      });
    }

    if (enhancedChecks.suggestions.length > 0) {
      recommendations.push({
        priority: 'low',
        type: 'optimization',
        message: 'See suggestions for prompt improvements'
      });
    }

    return recommendations;
  }

  /**
   * Get service status and statistics
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      ready: this.isReady(),
      supportedModels: this.supportedModels.length,
      bedrockServiceReady: this.bedrockService.isReady(),
      errorPatterns: errorPatternTracker.getFrequentErrors(3),
      modelCapabilities: this.getSupportedImageModels().map(model => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        maxPromptLength: model.maxPromptLength,
        dimensionCount: model.supportedDimensions.length
      }))
    };
  }
}

// Export singleton instance
export const imageService = new ImageService();