import { getEncoding } from 'js-tiktoken';
import { analyzeError, handleError, ErrorTypes } from '../utils/errorHandling.js';

/**
 * Service class for token estimation
 * Handles token counting when API doesn't provide usage data
 */
export class TokenEstimationService {
  constructor() {
    this.encoders = new Map(); // Cache for tiktoken encoders
    this.isInitialized = false;
    this.lastError = null;
  }

  /**
   * Model to tokenizer mapping for different AI model families
   * Uses tiktoken encoders as approximations for non-OpenAI models
   */
  getModelTokenizerMapping() {
    return {
      // Claude models - use cl100k_base as approximation
      'anthropic.claude-3-sonnet-20240229-v1:0': 'cl100k_base',
      'anthropic.claude-3-5-sonnet-20241022-v2:0': 'cl100k_base',
      'anthropic.claude-3-5-haiku-20241022-v1:0': 'cl100k_base',
      'anthropic.claude-3-haiku-20240307-v1:0': 'cl100k_base',
      'anthropic.claude-3-opus-20240229-v1:0': 'cl100k_base',

      // Nova models - use o200k_base for newer models
      'amazon.nova-pro-v1:0': 'o200k_base',
      'amazon.nova-lite-v1:0': 'o200k_base',
      'amazon.nova-micro-v1:0': 'o200k_base',

      // Llama models - use cl100k_base as approximation
      'meta.llama3-2-90b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-2-11b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-2-3b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-2-1b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-1-70b-instruct-v1:0': 'cl100k_base',
      'meta.llama3-1-8b-instruct-v1:0': 'cl100k_base',

      // Mistral models - use cl100k_base as approximation
      'mistral.mistral-7b-instruct-v0:2': 'cl100k_base',
      'mistral.mixtral-8x7b-instruct-v0:1': 'cl100k_base',
      'mistral.mistral-large-2402-v1:0': 'cl100k_base',

      // Default fallback
      'default': 'cl100k_base'
    };
  }

  /**
   * Initialize the token estimation service
   * Pre-loads commonly used encoders
   */
  async initialize() {
    try {
      // Pre-load the most common encoders
      const commonEncoders = ['cl100k_base', 'o200k_base'];

      for (const encoderName of commonEncoders) {
        try {
          const encoder = getEncoding(encoderName);
          this.encoders.set(encoderName, encoder);
        } catch (error) {
          console.warn(`Failed to load encoder ${encoderName}:`, error.message);
        }
      }

      this.isInitialized = true;
      this.lastError = null;

      return { success: true, message: 'Token estimation service initialized successfully' };
    } catch (error) {
      this.isInitialized = false;
      this.lastError = error;

      return {
        success: false,
        message: `Token estimation service initialization failed: ${error.message}`,
        error: error
      };
    }
  }

  /**
   * Get the appropriate tokenizer for a given model
   * @param {string} modelId - The model identifier
   * @returns {string} - The tokenizer name to use
   */
  getModelTokenizer(modelId) {
    const mapping = this.getModelTokenizerMapping();
    return mapping[modelId] || mapping['default'];
  }

  /**
   * Get or create an encoder for the specified tokenizer
   * @param {string} tokenizerName - The name of the tokenizer
   * @returns {Object|null} - The encoder instance or null if failed
   */
  getEncoder(tokenizerName) {
    try {
      // Check cache first
      if (this.encoders.has(tokenizerName)) {
        return this.encoders.get(tokenizerName);
      }

      // Create new encoder
      const encoder = getEncoding(tokenizerName);
      this.encoders.set(tokenizerName, encoder);
      return encoder;
    } catch (error) {
      console.warn(`Failed to get encoder for ${tokenizerName}:`, error.message);
      this.lastError = error;
      return null;
    }
  }

  /**
   * Estimate token count for a given text and model
   * @param {string} text - The text to count tokens for
   * @param {string} modelId - The model identifier
   * @returns {Object} - Token estimation result
   */
  estimateTokens(text, modelId) {
    try {
      if (!text || typeof text !== 'string') {
        return {
          tokens: 0,
          isEstimated: true,
          method: 'empty-text',
          error: null
        };
      }

      const tokenizerName = this.getModelTokenizer(modelId);
      const encoder = this.getEncoder(tokenizerName);

      if (!encoder) {
        // Fallback to character-based estimation
        const estimatedTokens = Math.ceil(text.length / 4); // Rough approximation: 4 chars per token
        return {
          tokens: estimatedTokens,
          isEstimated: true,
          method: 'character-fallback',
          error: 'Tokenizer unavailable, using character-based estimation'
        };
      }

      const tokens = encoder.encode(text);
      return {
        tokens: tokens.length,
        isEstimated: true,
        method: tokenizerName,
        error: null
      };
    } catch (error) {
      console.warn(`Token estimation failed for model ${modelId}:`, error.message);
      this.lastError = error;

      // Fallback to character-based estimation
      const estimatedTokens = Math.ceil((text?.length || 0) / 4);
      return {
        tokens: estimatedTokens,
        isEstimated: true,
        method: 'error-fallback',
        error: error.message
      };
    }
  }

  /**
   * Estimate tokens for input (system prompt + user prompt + content)
   * @param {string} systemPrompt - The system prompt
   * @param {string} userPrompt - The user prompt
   * @param {string} content - Additional content (dataset, etc.)
   * @param {string} modelId - The model identifier
   * @returns {Object} - Token estimation result
   */
  estimateInputTokens(systemPrompt, userPrompt, content, modelId) {
    try {
      // Combine all input text similar to how BedrockService constructs the request
      let fullInput = '';

      if (systemPrompt?.trim()) {
        fullInput += systemPrompt.trim() + '\n\n';
      }

      if (userPrompt?.trim()) {
        fullInput += userPrompt.trim();
      }

      if (content?.trim()) {
        fullInput += '\n\nData to analyze:\n' + content.trim();
      }

      return this.estimateTokens(fullInput, modelId);
    } catch (error) {
      console.warn('Input token estimation failed:', error.message);
      this.lastError = error;

      return {
        tokens: null,
        isEstimated: true,
        method: 'error',
        error: error.message
      };
    }
  }

  /**
   * Estimate tokens for output (model response)
   * @param {string} responseText - The model response text
   * @param {string} modelId - The model identifier
   * @returns {Object} - Token estimation result
   */
  estimateOutputTokens(responseText, modelId) {
    return this.estimateTokens(responseText, modelId);
  }

  /**
   * Check if the service is ready to use
   * @returns {boolean} - True if service is initialized
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Get service status information
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      ready: this.isReady(),
      encodersLoaded: this.encoders.size,
      lastError: this.lastError?.message || null,
      supportedEncoders: ['cl100k_base', 'o200k_base']
    };
  }

  /**
   * Clear encoder cache to free memory
   */
  clearCache() {
    // Free encoder resources
    for (const encoder of this.encoders.values()) {
      if (encoder && typeof encoder.free === 'function') {
        try {
          encoder.free();
        } catch (error) {
          console.warn('Error freeing encoder:', error.message);
        }
      }
    }

    this.encoders.clear();
  }

  /**
   * Cleanup resources when service is no longer needed
   */
  cleanup() {
    this.clearCache();
    this.isInitialized = false;
    this.lastError = null;
  }
}

// Export a singleton instance
export const tokenEstimationService = new TokenEstimationService();
