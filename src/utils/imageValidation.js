/**
 * Image Generation Input Validation and Safety Utilities
 * Comprehensive validation for prompts, parameters, and safety measures
 */

/**
 * Content safety categories and their risk levels
 */
export const SafetyCategories = {
  EXPLICIT_CONTENT: {
    level: 'high',
    keywords: ['explicit', 'nsfw', 'nude', 'naked', 'sexual', 'erotic', 'porn', 'xxx'],
    message: 'Content contains explicit or adult material'
  },
  VIOLENCE: {
    level: 'high',
    keywords: ['violence', 'violent', 'blood', 'gore', 'death', 'kill', 'murder', 'weapon', 'gun', 'knife'],
    message: 'Content contains violent or harmful material'
  },
  HATE_SPEECH: {
    level: 'high',
    keywords: ['hate', 'racist', 'nazi', 'terrorism', 'terrorist', 'extremist'],
    message: 'Content contains hate speech or discriminatory language'
  },
  DRUGS_ALCOHOL: {
    level: 'medium',
    keywords: ['drug', 'cocaine', 'heroin', 'marijuana', 'drunk', 'alcohol abuse'],
    message: 'Content references substance abuse'
  },
  COPYRIGHT: {
    level: 'medium',
    keywords: [
      // Characters and franchises
      'mickey mouse', 'disney', 'marvel', 'superman', 'batman', 'pokemon', 'pikachu',
      'harry potter', 'star wars', 'darth vader', 'luke skywalker', 'spiderman',
      // Brands
      'coca-cola', 'pepsi', 'mcdonald', 'starbucks', 'nike', 'adidas', 'apple logo',
      // Celebrities (common ones)
      'taylor swift', 'elon musk', 'brad pitt', 'angelina jolie'
    ],
    message: 'Content may reference copyrighted material'
  },
  INAPPROPRIATE: {
    level: 'low',
    keywords: ['inappropriate', 'offensive', 'disturbing', 'shocking'],
    message: 'Content may be inappropriate for general audiences'
  }
};

/**
 * Rate limiting configuration
 */
export const RateLimits = {
  REQUESTS_PER_MINUTE: 10,
  REQUESTS_PER_HOUR: 100,
  MAX_CONCURRENT: 3,
  COOLDOWN_AFTER_ERROR: 30000 // 30 seconds
};

/**
 * Parameter validation rules
 */
export const ParameterRules = {
  dimensions: {
    'amazon.nova-canvas-v1:0': [
      { width: 512, height: 512 },
      { width: 768, height: 768 },
      { width: 1024, height: 1024 },
      { width: 1152, height: 896 },
      { width: 896, height: 1152 }
    ]
  },
  quality: {
    'amazon.nova-canvas-v1:0': ['standard', 'premium']
  },
  numberOfImages: {
    min: 1,
    max: 4
  },
  seed: {
    min: 0,
    max: 858993459
  }
};

/**
 * Rate limiter class
 */
class RateLimiter {
  constructor() {
    this.requests = [];
    this.concurrent = 0;
    this.lastError = null;
  }

  /**
   * Check if request is allowed
   * @returns {Object} Rate limit status
   */
  checkRateLimit() {
    const now = Date.now();

    // Clean old requests
    this.requests = this.requests.filter(time => now - time < 60000); // Last minute

    // Check cooldown after error
    if (this.lastError && now - this.lastError < RateLimits.COOLDOWN_AFTER_ERROR) {
      return {
        allowed: false,
        reason: 'Cooldown period after error',
        retryAfter: RateLimits.COOLDOWN_AFTER_ERROR - (now - this.lastError)
      };
    }

    // Check concurrent requests
    if (this.concurrent >= RateLimits.MAX_CONCURRENT) {
      return {
        allowed: false,
        reason: 'Too many concurrent requests',
        retryAfter: 5000 // 5 seconds
      };
    }

    // Check requests per minute
    if (this.requests.length >= RateLimits.REQUESTS_PER_MINUTE) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        retryAfter: 60000 - (now - this.requests[0])
      };
    }

    return { allowed: true };
  }

  /**
   * Record a request
   */
  recordRequest() {
    this.requests.push(Date.now());
    this.concurrent++;
  }

  /**
   * Record request completion
   */
  recordCompletion() {
    this.concurrent = Math.max(0, this.concurrent - 1);
  }

  /**
   * Record an error
   */
  recordError() {
    this.lastError = Date.now();
    this.concurrent = Math.max(0, this.concurrent - 1);
  }

  /**
   * Get current status
   * @returns {Object} Rate limiter status
   */
  getStatus() {
    const now = Date.now();
    const recentRequests = this.requests.filter(time => now - time < 60000);

    return {
      requestsLastMinute: recentRequests.length,
      concurrent: this.concurrent,
      cooldownRemaining: this.lastError ? Math.max(0, RateLimits.COOLDOWN_AFTER_ERROR - (now - this.lastError)) : 0
    };
  }
}

// Global rate limiter instance
export const rateLimiter = new RateLimiter();

/**
 * Validate image prompt for safety and appropriateness
 * @param {string} prompt - Text prompt to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validatePromptSafety(prompt, options = {}) {
  const result = {
    valid: true,
    safetyScore: 100,
    warnings: [],
    violations: [],
    suggestions: []
  };

  if (!prompt || typeof prompt !== 'string') {
    result.valid = false;
    result.violations.push({
      category: 'format',
      message: 'Prompt must be a non-empty string',
      severity: 'high'
    });
    return result;
  }

  const lowerPrompt = prompt.toLowerCase();

  // Check each safety category
  for (const [categoryName, category] of Object.entries(SafetyCategories)) {
    const foundKeywords = category.keywords.filter(keyword =>
      lowerPrompt.includes(keyword.toLowerCase())
    );

    if (foundKeywords.length > 0) {
      const violation = {
        category: categoryName.toLowerCase(),
        message: category.message,
        severity: category.level,
        keywords: foundKeywords
      };

      if (category.level === 'high') {
        result.valid = false;
        result.violations.push(violation);
        result.safetyScore -= 30;
      } else if (category.level === 'medium') {
        result.warnings.push(violation);
        result.safetyScore -= 15;
      } else {
        result.warnings.push(violation);
        result.safetyScore -= 5;
      }
    }
  }

  // Additional heuristic checks
  const suspiciousPatterns = [
    { pattern: /\b(make|create|generate)\s+(nude|naked|explicit)\b/i, severity: 'high' },
    { pattern: /\b(without|no)\s+(clothes|clothing)\b/i, severity: 'medium' },
    { pattern: /\b(real\s+person|actual\s+person|specific\s+person)\b/i, severity: 'medium' }
  ];

  for (const { pattern, severity } of suspiciousPatterns) {
    if (pattern.test(prompt)) {
      const violation = {
        category: 'pattern_detection',
        message: 'Prompt contains potentially problematic patterns',
        severity,
        pattern: pattern.source
      };

      if (severity === 'high') {
        result.valid = false;
        result.violations.push(violation);
        result.safetyScore -= 25;
      } else {
        result.warnings.push(violation);
        result.safetyScore -= 10;
      }
    }
  }

  // Generate suggestions for improvement
  if (result.violations.length > 0 || result.warnings.length > 0) {
    result.suggestions = generateSafetySuggestions(result.violations, result.warnings);
  }

  result.safetyScore = Math.max(0, result.safetyScore);

  return result;
}

/**
 * Generate safety improvement suggestions
 * @param {Array} violations - Safety violations
 * @param {Array} warnings - Safety warnings
 * @returns {Array} Array of suggestions
 */
function generateSafetySuggestions(violations, warnings) {
  const suggestions = [];

  const hasExplicitContent = violations.some(v => v.category === 'explicit_content') ||
                            warnings.some(w => w.category === 'explicit_content');

  if (hasExplicitContent) {
    suggestions.push({
      type: 'content_replacement',
      message: 'Replace explicit references with appropriate alternatives',
      examples: [
        'Instead of "nude", try "artistic portrait"',
        'Instead of "sexy", try "elegant" or "stylish"'
      ]
    });
  }

  const hasViolence = violations.some(v => v.category === 'violence') ||
                     warnings.some(w => w.category === 'violence');

  if (hasViolence) {
    suggestions.push({
      type: 'tone_adjustment',
      message: 'Consider using less violent or aggressive language',
      examples: [
        'Instead of "bloody battle", try "epic confrontation"',
        'Instead of "weapon", try "tool" or "equipment"'
      ]
    });
  }

  const hasCopyright = violations.some(v => v.category === 'copyright') ||
                      warnings.some(w => w.category === 'copyright');

  if (hasCopyright) {
    suggestions.push({
      type: 'generic_replacement',
      message: 'Use generic descriptions instead of specific copyrighted characters or brands',
      examples: [
        'Instead of "Mickey Mouse", try "cartoon mouse character"',
        'Instead of "Coca-Cola", try "red soda can"'
      ]
    });
  }

  return suggestions;
}

/**
 * Validate image generation parameters
 * @param {string} modelId - Model ID
 * @param {Object} parameters - Parameters to validate
 * @returns {Object} Validation result
 */
export function validateImageParameters(modelId, parameters) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    sanitized: { ...parameters }
  };

  // Validate dimensions
  if (parameters.width !== undefined || parameters.height !== undefined) {
    const width = parseInt(parameters.width);
    const height = parseInt(parameters.height);

    if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) {
      result.valid = false;
      result.errors.push({
        field: 'dimensions',
        message: 'Width and height must be positive integers',
        code: 'INVALID_DIMENSIONS'
      });
    } else {
      const supportedDimensions = ParameterRules.dimensions[modelId] || [];
      const isSupported = supportedDimensions.some(dim =>
        dim.width === width && dim.height === height
      );

      if (!isSupported && supportedDimensions.length > 0) {
        result.valid = false;
        result.errors.push({
          field: 'dimensions',
          message: `Dimensions ${width}×${height} not supported for ${modelId}`,
          code: 'UNSUPPORTED_DIMENSIONS',
          supportedDimensions
        });
      } else {
        result.sanitized.width = width;
        result.sanitized.height = height;
      }
    }
  }

  // Validate quality
  if (parameters.quality !== undefined) {
    const supportedQualities = ParameterRules.quality[modelId] || ['standard'];

    if (!supportedQualities.includes(parameters.quality)) {
      result.valid = false;
      result.errors.push({
        field: 'quality',
        message: `Quality '${parameters.quality}' not supported for ${modelId}`,
        code: 'UNSUPPORTED_QUALITY',
        supportedQualities
      });
    }
  }

  // Validate number of images
  if (parameters.numberOfImages !== undefined) {
    const num = parseInt(parameters.numberOfImages);

    if (Number.isNaN(num) || num < ParameterRules.numberOfImages.min || num > ParameterRules.numberOfImages.max) {
      result.valid = false;
      result.errors.push({
        field: 'numberOfImages',
        message: `Number of images must be between ${ParameterRules.numberOfImages.min} and ${ParameterRules.numberOfImages.max}`,
        code: 'INVALID_NUMBER_OF_IMAGES'
      });
    } else {
      result.sanitized.numberOfImages = num;
    }
  }

  // Validate seed
  if (parameters.seed !== undefined && parameters.seed !== null) {
    const seed = parseInt(parameters.seed);

    if (Number.isNaN(seed) || seed < ParameterRules.seed.min || seed > ParameterRules.seed.max) {
      result.valid = false;
      result.errors.push({
        field: 'seed',
        message: `Seed must be between ${ParameterRules.seed.min} and ${ParameterRules.seed.max}`,
        code: 'INVALID_SEED'
      });
    } else {
      result.sanitized.seed = seed;
    }
  }

  // Performance warnings
  if (parameters.width && parameters.height) {
    const totalPixels = parameters.width * parameters.height;

    if (totalPixels > 1024 * 1024) {
      result.warnings.push({
        field: 'dimensions',
        message: 'Large images may take longer to generate',
        code: 'LARGE_DIMENSIONS'
      });
    }
  }

  if (parameters.numberOfImages && parameters.numberOfImages > 2) {
    result.warnings.push({
      field: 'numberOfImages',
      message: 'Generating multiple images will take longer and use more resources',
      code: 'MULTIPLE_IMAGES'
    });
  }

  return result;
}

/**
 * Comprehensive validation for image generation request
 * @param {string} modelId - Model ID
 * @param {string} prompt - Text prompt
 * @param {Object} parameters - Generation parameters
 * @param {Object} options - Validation options
 * @returns {Object} Complete validation result
 */
export function validateImageGenerationRequest(modelId, prompt, parameters = {}, options = {}) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    suggestions: [],
    safetyScore: 100,
    rateLimit: null
  };

  // Check rate limits first
  const rateLimitCheck = rateLimiter.checkRateLimit();
  result.rateLimit = rateLimitCheck;

  if (!rateLimitCheck.allowed) {
    result.valid = false;
    result.errors.push({
      type: 'rate_limit',
      message: rateLimitCheck.reason,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: rateLimitCheck.retryAfter
    });
    return result;
  }

  // Validate model ID
  if (!modelId || typeof modelId !== 'string') {
    result.valid = false;
    result.errors.push({
      field: 'modelId',
      message: 'Model ID is required',
      code: 'MISSING_MODEL_ID'
    });
  }

  // Validate prompt safety
  const safetyValidation = validatePromptSafety(prompt, options);
  result.safetyScore = safetyValidation.safetyScore;

  if (!safetyValidation.valid) {
    result.valid = false;
    result.errors.push(...safetyValidation.violations.map(v => ({
      field: 'prompt',
      message: v.message,
      code: 'SAFETY_VIOLATION',
      category: v.category,
      severity: v.severity
    })));
  }

  result.warnings.push(...safetyValidation.warnings.map(w => ({
    field: 'prompt',
    message: w.message,
    code: 'SAFETY_WARNING',
    category: w.category,
    severity: w.severity
  })));

  result.suggestions.push(...safetyValidation.suggestions);

  // Validate parameters
  const paramValidation = validateImageParameters(modelId, parameters);

  if (!paramValidation.valid) {
    result.valid = false;
    result.errors.push(...paramValidation.errors);
  }

  result.warnings.push(...paramValidation.warnings);

  // Add usage guidelines if there are issues
  if (result.errors.length > 0 || result.warnings.length > 0) {
    result.usageGuidelines = generateUsageGuidelines(result);
  }

  return result;
}

/**
 * Generate usage guidelines based on validation results
 * @param {Object} validationResult - Validation result
 * @returns {Array} Array of usage guidelines
 */
function generateUsageGuidelines(validationResult) {
  const guidelines = [];

  const hasSafetyIssues = validationResult.errors.some(e => e.code === 'SAFETY_VIOLATION') ||
                         validationResult.warnings.some(w => w.code === 'SAFETY_WARNING');

  if (hasSafetyIssues) {
    guidelines.push({
      category: 'content_policy',
      title: 'Content Policy Guidelines',
      items: [
        'Use family-friendly, appropriate language in prompts',
        'Avoid references to violence, explicit content, or hate speech',
        'Do not attempt to generate images of real people without consent',
        'Respect copyright and trademark restrictions'
      ]
    });
  }

  const hasParameterIssues = validationResult.errors.some(e => e.field !== 'prompt');

  if (hasParameterIssues) {
    guidelines.push({
      category: 'technical',
      title: 'Technical Guidelines',
      items: [
        'Use supported dimensions for your selected model',
        'Choose appropriate quality settings based on your needs',
        'Limit the number of images per request to avoid timeouts',
        'Use valid seed values (0 to 858,993,459) for reproducible results'
      ]
    });
  }

  const hasRateLimit = validationResult.rateLimit && !validationResult.rateLimit.allowed;

  if (hasRateLimit) {
    guidelines.push({
      category: 'usage',
      title: 'Usage Guidelines',
      items: [
        `Limit requests to ${RateLimits.REQUESTS_PER_MINUTE} per minute`,
        `Maximum ${RateLimits.MAX_CONCURRENT} concurrent requests`,
        'Wait for previous requests to complete before starting new ones',
        'Allow cooldown time after errors before retrying'
      ]
    });
  }

  return guidelines;
}

/**
 * Sanitize prompt by removing or replacing problematic content
 * @param {string} prompt - Original prompt
 * @param {Object} options - Sanitization options
 * @returns {Object} Sanitization result
 */
export function sanitizePrompt(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') {
    return {
      sanitized: '',
      changes: ['Prompt was empty or invalid'],
      safe: false
    };
  }

  let sanitized = prompt;
  const changes = [];

  // Remove explicit content keywords
  for (const keyword of SafetyCategories.EXPLICIT_CONTENT.keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, '[removed]');
      changes.push(`Removed explicit content: "${keyword}"`);
    }
  }

  // Replace violence keywords with milder alternatives
  const violenceReplacements = {
    'blood': 'red liquid',
    'gore': 'dramatic scene',
    'death': 'dramatic moment',
    'kill': 'defeat',
    'murder': 'dramatic confrontation',
    'weapon': 'tool',
    'gun': 'device',
    'knife': 'blade'
  };

  for (const [original, replacement] of Object.entries(violenceReplacements)) {
    const regex = new RegExp(`\\b${original}\\b`, 'gi');
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, replacement);
      changes.push(`Replaced "${original}" with "${replacement}"`);
    }
  }

  // Clean up multiple spaces and trim
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  sanitized = sanitized.replace(/\[removed\]\s*/g, '').trim();

  // Validate the sanitized prompt
  const validation = validatePromptSafety(sanitized);

  return {
    sanitized,
    changes,
    safe: validation.valid,
    safetyScore: validation.safetyScore,
    remainingIssues: validation.violations
  };
}

/**
 * Get validation statistics
 * @returns {Object} Validation statistics
 */
export function getValidationStatistics() {
  return {
    rateLimiter: rateLimiter.getStatus(),
    safetyCategories: Object.keys(SafetyCategories).length,
    parameterRules: {
      supportedModels: Object.keys(ParameterRules.dimensions).length,
      totalDimensionOptions: Object.values(ParameterRules.dimensions).reduce((sum, dims) => sum + dims.length, 0)
    }
  };
}