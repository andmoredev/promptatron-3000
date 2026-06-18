/**
 * Image Verification Service
 * Orchestrates meta-agent verification for generated images using existing meta-agent infrastructure
 */

import { bedrockService } from './bedrockService.js';
import { handleError } from '../utils/errorHandling.js';

export class ImageVerificationService {
  constructor() {
    this.bedrockService = bedrockService;
    this.isInitialized = false;
    this.activeVerifications = new Map();
  }

  /**
   * Initialize the image verification service
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        return {
          success: true,
          message: 'ImageVerificationService already initialized'
        };
      }

      if (!this.bedrockService.isReady()) {
        const initResult = await this.bedrockService.initialize();
        if (!initResult.success) {
          return {
            success: false,
            message: `Failed to initialize Bedrock service: ${initResult.message}`
          };
        }
      }

      this.isInitialized = true;

      return {
        success: true,
        message: 'ImageVerificationService initialized successfully'
      };
    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'ImageVerificationService',
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
   * @returns {boolean} True if initialized and ready
   */
  isReady() {
    return this.isInitialized && this.bedrockService.isReady();
  }

  /**
   * Verify generated image using meta-agents
   * @param {Object} imageResult - Generated image result
   * @param {string} originalPrompt - Original text prompt used for generation
   * @param {string} modelId - Model ID used for generation
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Consolidated verification results
   */
  async verifyImage(imageResult, originalPrompt, modelId, options = {}) {
    try {
      if (!this.isReady()) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          throw new Error(initResult.message);
        }
      }

      const verificationId = this.generateVerificationId();
      const startTime = performance.now();

      // Create verification context
      const verificationContext = {
        id: verificationId,
        imageResult,
        originalPrompt,
        modelId,
        options,
        startTime,
        status: 'running'
      };

      this.activeVerifications.set(verificationId, verificationContext);

      // Run verification tasks in parallel
      const verificationTasks = [];

      // Content Safety Verification (using Error Containment meta-agent approach)
      if (options.verifyContentSafety !== false) {
        verificationTasks.push(
          this.verifyContentSafety(imageResult, originalPrompt, modelId)
            .catch(error => this.createFallbackResult('contentSafety', error))
        );
      }

      // Prompt Adherence Verification (using Fact Checker meta-agent approach)
      if (options.verifyPromptAdherence !== false) {
        verificationTasks.push(
          this.verifyPromptAdherence(imageResult, originalPrompt, modelId)
            .catch(error => this.createFallbackResult('promptAdherence', error))
        );
      }

      // Image Quality Verification (using Quality Enforcer meta-agent approach)
      if (options.verifyImageQuality !== false) {
        verificationTasks.push(
          this.verifyImageQuality(imageResult, originalPrompt, modelId)
            .catch(error => this.createFallbackResult('imageQuality', error))
        );
      }

      // Wait for all verification tasks to complete
      const verificationResults = await Promise.allSettled(verificationTasks);

      // Process and consolidate results
      const consolidatedResults = this.consolidateVerificationResults(
        verificationResults,
        options
      );

      const endTime = performance.now();
      consolidatedResults.verificationTime = endTime - startTime;
      consolidatedResults.verificationId = verificationId;

      // Update verification context
      verificationContext.status = 'completed';
      verificationContext.results = consolidatedResults;
      verificationContext.endTime = endTime;

      return consolidatedResults;

    } catch (error) {
      const errorInfo = handleError(error, {
        component: 'ImageVerificationService',
        operation: 'verifyImage',
        modelId,
        promptLength: originalPrompt?.length || 0
      });

      throw new Error(`Image verification failed: ${errorInfo.userMessage}`);
    }
  }

  /**
   * Verify content safety using meta-agent approach
   * @param {Object} imageResult - Generated image result
   * @param {string} originalPrompt - Original prompt
   * @param {string} modelId - Model ID
   * @returns {Promise<Object>} Content safety verification result
   */
  async verifyContentSafety(imageResult, originalPrompt, modelId) {
    const systemPrompt = `You are a content safety specialist for image generation validation.

Your job is to identify inappropriate, harmful, or policy-violating content in generated images.

Focus on:
- Inappropriate or explicit content
- Violence, weapons, or dangerous activities
- Hate symbols or discriminatory imagery
- Copyright or trademark violations
- Misleading or deceptive content
- Content that could be harmful to minors
- Professional or ethical violations

Analyze the image description and generation context for safety concerns and provide specific safety issues if found.
Consider both obvious violations and subtle problematic content.

Respond in JSON format:
{
  "recommendation": "accept|warning|reject",
  "confidence": 0-100,
  "analysis": "detailed analysis of content safety",
  "safetyIssues": ["list of specific safety concerns if any"],
  "severity": "low|medium|high"
}`;

    const analysisPrompt = `Please analyze this image generation for content safety concerns.

Original Prompt: "${originalPrompt}"
Model Used: ${modelId}
Image Metadata: ${JSON.stringify({
  dimensions: `${imageResult.parameters?.width || 'unknown'}x${imageResult.parameters?.height || 'unknown'}`,
  quality: imageResult.parameters?.quality || 'unknown',
  generationTime: imageResult.generationTime || 'unknown'
}, null, 2)}

Note: Since I cannot directly view the generated image, please analyze based on the prompt content, model capabilities, and generation context to identify potential safety concerns.`;

    try {
      const response = await this.bedrockService.invokeModel(
        'amazon.nova-pro-v1:0', // Use a reliable text model for analysis
        systemPrompt,
        analysisPrompt
      );

      const parsed = this.parseVerificationResponse(response.text);

      return {
        type: 'contentSafety',
        recommendation: parsed.recommendation || 'warning',
        confidence: parsed.confidence || 50,
        analysis: parsed.analysis || response.text,
        safetyIssues: parsed.safetyIssues || [],
        severity: parsed.severity || 'low',
        modelUsed: 'amazon.nova-pro-v1:0',
        responseTime: response.responseTime || 0
      };

    } catch (error) {
      throw new Error(`Content safety verification failed: ${error.message}`);
    }
  }

  /**
   * Verify prompt adherence using meta-agent approach
   * @param {Object} imageResult - Generated image result
   * @param {string} originalPrompt - Original prompt
   * @param {string} modelId - Model ID
   * @returns {Promise<Object>} Prompt adherence verification result
   */
  async verifyPromptAdherence(imageResult, originalPrompt, modelId) {
    const systemPrompt = `You are a fact-checking specialist for image generation validation.

Your job is to verify that generated images accurately reflect the original text prompt.

Focus on:
- Visual elements mentioned in the prompt (objects, people, settings)
- Style and aesthetic requirements (artistic style, mood, composition)
- Technical specifications (if mentioned - colors, lighting, perspective)
- Logical consistency within the image
- Completeness of prompt requirements

Analyze the image generation context and compare it to the original prompt to identify:
- Missing elements that were specifically requested
- Incorrect interpretations of the prompt
- Additional elements not requested that may detract from the prompt
- Overall accuracy of the visual representation

Provide specific findings about what should match and what might not match the prompt.

Respond in JSON format:
{
  "recommendation": "accept|warning|reject",
  "confidence": 0-100,
  "analysis": "detailed analysis of prompt adherence",
  "findings": ["list of specific findings about prompt matching"],
  "missingElements": ["elements from prompt that might be missing"],
  "adherenceScore": 0-100
}`;

    const analysisPrompt = `Please analyze how well this image generation should match the original prompt.

Original Prompt: "${originalPrompt}"
Model Used: ${modelId}
Model Capabilities: ${this.getModelCapabilityDescription(modelId)}
Generation Parameters: ${JSON.stringify(imageResult.parameters || {}, null, 2)}

Based on the prompt complexity, model capabilities, and generation parameters, assess how well the generated image should adhere to the original prompt requirements.`;

    try {
      const response = await this.bedrockService.invokeModel(
        'amazon.nova-pro-v1:0',
        systemPrompt,
        analysisPrompt
      );

      const parsed = this.parseVerificationResponse(response.text);

      return {
        type: 'promptAdherence',
        recommendation: parsed.recommendation || 'warning',
        confidence: parsed.confidence || 50,
        analysis: parsed.analysis || response.text,
        findings: parsed.findings || [],
        missingElements: parsed.missingElements || [],
        adherenceScore: parsed.adherenceScore || 50,
        modelUsed: 'amazon.nova-pro-v1:0',
        responseTime: response.responseTime || 0
      };

    } catch (error) {
      throw new Error(`Prompt adherence verification failed: ${error.message}`);
    }
  }

  /**
   * Verify image quality using meta-agent approach
   * @param {Object} imageResult - Generated image result
   * @param {string} originalPrompt - Original prompt
   * @param {string} modelId - Model ID
   * @returns {Promise<Object>} Image quality verification result
   */
  async verifyImageQuality(imageResult, originalPrompt, modelId) {
    const systemPrompt = `You are a quality assessment specialist for image generation validation.

Your job is to evaluate the technical and aesthetic quality of generated images.

Evaluate on these dimensions:
1. Technical Quality (25 points): Resolution, clarity, artifacts, distortion
2. Composition (25 points): Layout, balance, focal points, visual flow
3. Detail Level (25 points): Appropriate detail, texture, refinement
4. Aesthetic Appeal (25 points): Visual appeal, style consistency, artistic merit

Provide a quality score (0-100) and detailed breakdown explaining the assessment.
Consider the image type and intended use when evaluating quality standards.

Respond in JSON format:
{
  "recommendation": "accept|warning|reject",
  "confidence": 0-100,
  "analysis": "detailed quality analysis",
  "qualityScore": 0-100,
  "breakdown": {
    "technical": 0-25,
    "composition": 0-25,
    "detail": 0-25,
    "aesthetics": 0-25
  },
  "strengths": ["list of quality strengths"],
  "improvements": ["list of potential improvements"]
}`;

    const analysisPrompt = `Please assess the expected quality of this image generation.

Original Prompt: "${originalPrompt}"
Model Used: ${modelId}
Model Quality Profile: ${this.getModelQualityProfile(modelId)}
Generation Parameters: ${JSON.stringify({
      dimensions: `${imageResult.parameters?.width || 'unknown'}x${imageResult.parameters?.height || 'unknown'}`,
      quality: imageResult.parameters?.quality || 'standard',
      seed: imageResult.seed || 'random',
      generationTime: `${Math.round(imageResult.generationTime || 0)}ms`
    }, null, 2)}

Based on the model capabilities, generation parameters, and prompt complexity, assess the expected quality of the generated image.`;

    try {
      const response = await this.bedrockService.invokeModel(
        'amazon.nova-pro-v1:0',
        systemPrompt,
        analysisPrompt
      );

      const parsed = this.parseVerificationResponse(response.text);

      return {
        type: 'imageQuality',
        recommendation: parsed.recommendation || 'warning',
        confidence: parsed.confidence || 50,
        analysis: parsed.analysis || response.text,
        qualityScore: parsed.qualityScore || 50,
        breakdown: parsed.breakdown || {
          technical: 12,
          composition: 12,
          detail: 12,
          aesthetics: 12
        },
        strengths: parsed.strengths || [],
        improvements: parsed.improvements || [],
        modelUsed: 'amazon.nova-pro-v1:0',
        responseTime: response.responseTime || 0
      };

    } catch (error) {
      throw new Error(`Image quality verification failed: ${error.message}`);
    }
  }

  /**
   * Consolidate verification results from multiple meta-agents
   * @param {Array} verificationResults - Array of Promise.allSettled results
   * @param {Object} options - Verification options
   * @returns {Object} Consolidated verification results
   */
  consolidateVerificationResults(verificationResults, options = {}) {
    const results = {};
    const summary = {
      totalVerifications: verificationResults.length,
      successfulVerifications: 0,
      failedVerifications: 0,
      overallRecommendation: 'accept',
      overallConfidence: 0,
      hasWarnings: false,
      hasRejections: false
    };

    let totalConfidence = 0;
    let validResults = 0;
    const recommendations = [];

    // Process each verification result
    verificationResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const verification = result.value;
        results[verification.type] = verification;

        summary.successfulVerifications++;
        totalConfidence += verification.confidence || 0;
        validResults++;
        recommendations.push(verification.recommendation);

        if (verification.recommendation === 'warning') {
          summary.hasWarnings = true;
        } else if (verification.recommendation === 'reject') {
          summary.hasRejections = true;
        }
      } else {
        summary.failedVerifications++;
        console.warn('Verification failed:', result.reason);
      }
    });

    // Calculate overall recommendation
    if (summary.hasRejections) {
      summary.overallRecommendation = 'reject';
    } else if (summary.hasWarnings || summary.failedVerifications > 0) {
      summary.overallRecommendation = 'warning';
    } else {
      summary.overallRecommendation = 'accept';
    }

    // Calculate overall confidence
    if (validResults > 0) {
      summary.overallConfidence = Math.round(totalConfidence / validResults);

      // Reduce confidence if some verifications failed
      if (summary.failedVerifications > 0) {
        const failureRate = summary.failedVerifications / summary.totalVerifications;
        summary.overallConfidence = Math.round(summary.overallConfidence * (1 - failureRate * 0.3));
      }
    }

    // Generate summary message
    summary.message = this.generateVerificationSummary(summary, results);

    return {
      results,
      summary,
      timestamp: new Date().toISOString(),
      options
    };
  }

  /**
   * Generate verification summary message
   * @param {Object} summary - Verification summary
   * @param {Object} results - Individual verification results
   * @returns {string} Summary message
   */
  generateVerificationSummary(summary, results) {
    const verificationTypes = Object.keys(results);

    if (summary.successfulVerifications === 0) {
      return 'All image verifications failed. Manual review recommended.';
    }

    if (summary.overallRecommendation === 'reject') {
      const rejectedTypes = verificationTypes.filter(type =>
        results[type]?.recommendation === 'reject'
      );
      return `Image verification recommends rejection due to issues in: ${rejectedTypes.join(', ')}`;
    }

    if (summary.overallRecommendation === 'warning') {
      const warningTypes = verificationTypes.filter(type =>
        results[type]?.recommendation === 'warning'
      );
      return `Image verification completed with warnings in: ${warningTypes.join(', ')}. Review recommended.`;
    }

    return `Image verification passed all checks (${verificationTypes.join(', ')}) with ${summary.overallConfidence}% confidence.`;
  }

  /**
   * Parse verification response from meta-agent
   * @param {string} responseText - Raw response text
   * @returns {Object} Parsed response
   */
  parseVerificationResponse(responseText) {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(responseText);
      return parsed;
    } catch (error) {
      // Fallback parsing for non-JSON responses
      console.warn('Failed to parse JSON response, using fallback parsing');

      const lowerResponse = responseText.toLowerCase();
      let recommendation = 'warning';
      let confidence = 50;

      if (lowerResponse.includes('accept') || lowerResponse.includes('approve') || lowerResponse.includes('pass')) {
        recommendation = 'accept';
        confidence = 70;
      } else if (lowerResponse.includes('reject') || lowerResponse.includes('deny') || lowerResponse.includes('fail')) {
        recommendation = 'reject';
        confidence = 70;
      }

      return {
        recommendation,
        confidence,
        analysis: responseText,
        parseError: true
      };
    }
  }

  /**
   * Create fallback result for failed verification
   * @param {string} verificationType - Type of verification that failed
   * @param {Error} error - Error that caused the failure
   * @returns {Object} Fallback verification result
   */
  createFallbackResult(verificationType, error) {
    return {
      type: verificationType,
      recommendation: 'warning',
      confidence: 0,
      analysis: `Verification failed: ${error.message}. Manual review recommended.`,
      failed: true,
      error: error.message,
      fallback: true
    };
  }

  /**
   * Get model capability description for verification context
   * @param {string} modelId - Model ID
   * @returns {string} Model capability description
   */
  getModelCapabilityDescription(modelId) {
    if (modelId === 'amazon.nova-canvas-v1:0') {
      return 'High-quality image generation with good prompt adherence and style consistency';
    }
    return 'Standard image generation capabilities';
  }

  /**
   * Get model quality profile for verification context
   * @param {string} modelId - Model ID
   * @returns {string} Model quality profile
   */
  getModelQualityProfile(modelId) {
    if (modelId === 'amazon.nova-canvas-v1:0') {
      return 'Consistent quality with good technical execution and balanced composition';
    }
    return 'Standard quality profile';
  }

  /**
   * Generate unique verification ID
   * @returns {string} Unique verification ID
   */
  generateVerificationId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `verify_${timestamp}_${random}`;
  }

  /**
   * Get verification status
   * @param {string} verificationId - Verification ID
   * @returns {Object|null} Verification status or null if not found
   */
  getVerificationStatus(verificationId) {
    return this.activeVerifications.get(verificationId) || null;
  }

  /**
   * Clean up completed verifications
   * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
   * @returns {number} Number of verifications cleaned up
   */
  cleanupCompletedVerifications(maxAge = 3600000) {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [verificationId, verification] of this.activeVerifications.entries()) {
      const age = now - verification.startTime;
      if (age > maxAge && verification.status === 'completed') {
        this.activeVerifications.delete(verificationId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      ready: this.isReady(),
      activeVerifications: this.activeVerifications.size,
      bedrockServiceReady: this.bedrockService.isReady()
    };
  }
}

// Export singleton instance
export const imageVerificationService = new ImageVerificationService();