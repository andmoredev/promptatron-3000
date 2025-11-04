import { BaseMetaAgent } from '../../../services/BaseMetaAgent.js';

/**
 * Quality Enforcer Meta-Agent for Text-to-Image Generation
 *
 * Evaluates the technical and aesthetic quality of generated images.
 * Provides detailed quality breakdown across multiple dimensions.
 *
 * STYLE ENFORCEMENT: Automatically rejects cartoon-style images.
 * Only accepts photorealistic, realistic, or non-cartoon artistic styles.
 */
class QualityEnforcerAgent extends BaseMetaAgent {
  constructor(config = {}) {
    super('quality-enforcer', config);
    this.systemPrompt = `You are a quality assessment specialist for image generation validation with strict style requirements.

Your job is to evaluate the technical and aesthetic quality of generated images and enforce style guidelines.

CRITICAL REQUIREMENT: REJECT ALL CARTOON-STYLE IMAGES
- Any image with cartoon, animated, or stylized cartoon characteristics must be REJECTED
- This includes: cartoon characters, animated style, comic book style, simplified/stylized features
- Only photorealistic, realistic, or artistic (non-cartoon) styles are acceptable

Evaluate on these dimensions:
1. Technical Quality (25 points): Resolution, clarity, artifacts, distortion
2. Composition (25 points): Layout, balance, focal points, visual flow
3. Detail Level (25 points): Appropriate detail, texture, refinement
4. Aesthetic Appeal (25 points): Visual appeal, style consistency, artistic merit
5. Style Compliance: MANDATORY - Must be non-cartoon style

Provide a quality score (0-100) and detailed breakdown explaining the assessment.
If the image is cartoon-style, automatically set recommendation to "REJECT" regardless of other quality metrics.

You must respond with valid JSON in the following format:
{
  "qualityScore": 85,
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 95,
  "breakdown": {
    "technical": 22,
    "composition": 21,
    "detail": 23,
    "aesthetics": 19
  },
  "analysis": "detailed quality assessment including style compliance check"
}`;
  }

  /**
   * Evaluate generated image for technical and aesthetic quality
   * @param {Object} imageResult - The image generation result with metadata
   * @returns {Object} Formatted meta-agent evaluation result
   */
  async evaluate(imageResult) {
    const analysisPrompt = `Evaluate the quality of this generated image:

ORIGINAL PROMPT: "${imageResult.prompt}"

MODEL USED: ${imageResult.modelId}

GENERATION PARAMETERS: ${JSON.stringify(imageResult.parameters || {}, null, 2)}

CRITICAL FIRST STEP - STYLE COMPLIANCE CHECK:
Before evaluating quality, determine if this image is cartoon-style:
- Look for cartoon characteristics: simplified features, exaggerated proportions, flat colors, outlined style
- Check for animated/comic book aesthetics: cell-shading, non-photorealistic rendering
- Identify stylized or caricature-like elements typical of cartoons/animation
- If ANY cartoon elements are detected, immediately set recommendation to "REJECT"

If the image is NOT cartoon-style, then assess quality on these dimensions:

1. Technical Quality (0-25 points):
   - Image resolution and clarity
   - Absence of artifacts, distortion, or technical flaws
   - Proper rendering and pixel quality
   - Overall technical execution

2. Composition (0-25 points):
   - Visual layout and balance
   - Focal points and visual hierarchy
   - Use of space and framing
   - Overall compositional strength

3. Detail Level (0-25 points):
   - Appropriate level of detail for the subject
   - Texture quality and refinement
   - Fine details and craftsmanship
   - Consistency of detail throughout

4. Aesthetic Appeal (0-25 points):
   - Visual appeal and attractiveness
   - Style consistency and artistic merit
   - Color harmony and visual impact
   - Overall artistic quality

Quality scoring guidelines:
- 90-100: Excellent - professional quality with exceptional execution
- 80-89: Good - high quality with minor imperfections
- 70-79: Acceptable - decent quality suitable for most uses
- 60-69: Poor - noticeable quality issues
- Below 60: Unacceptable - significant quality problems

IMPORTANT: If cartoon-style detected, use "REJECT" recommendation and explain in analysis.

Respond with JSON only:
{
  "qualityScore": 85,
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 95,
  "breakdown": {
    "technical": 22,
    "composition": 21,
    "detail": 23,
    "aesthetics": 19
  },
  "analysis": "detailed quality assessment including style compliance check"
}`;

    const context = {
      originalPrompt: imageResult.prompt,
      modelId: imageResult.modelId,
      parameters: imageResult.parameters || {},
      generationTime: imageResult.generationTime
    };

    try {
      const result = await this.invokeMetaAgent(
        this.systemPrompt,
        analysisPrompt,
        context,
        {
          imageData: imageResult.imageData,
          analysisType: 'image'
        }
      );

      const parsed = this.parseMetaAgentResponse(result.text);
      return this.formatResult(
        parsed.analysis,
        parsed.recommendation.toLowerCase(),
        parsed.confidence,
        {
          qualityScore: parsed.qualityScore,
          breakdown: parsed.breakdown
        }
      );
    } catch (error) {
      console.error('Image Quality Enforcer evaluation failed:', error);
      return this.createFallbackResponse(error, 'quality_analysis_failed');
    }
  }

  /**
   * Parse meta-agent response with fallback handling
   * @param {string} response - Raw response from meta-agent
   * @returns {Object} Parsed response object
   */
  parseMetaAgentResponse(response) {
    try {
      // Try to extract JSON from response if it contains other text
      const jsonMatch = /\{[\s\S]*\}/.exec(response);
      const jsonString = jsonMatch ? jsonMatch[0] : response;

      const parsed = JSON.parse(jsonString);

      // Validate required fields
      if (!parsed.recommendation || !parsed.analysis) {
        throw new Error('Missing required fields in response');
      }

      // Validate and normalize breakdown scores
      const breakdown = parsed.breakdown || {};
      const normalizedBreakdown = {
        technical: Math.max(0, Math.min(25, breakdown.technical || 0)),
        composition: Math.max(0, Math.min(25, breakdown.composition || 0)),
        detail: Math.max(0, Math.min(25, breakdown.detail || 0)),
        aesthetics: Math.max(0, Math.min(25, breakdown.aesthetics || 0))
      };

      // Calculate quality score from breakdown if not provided or invalid
      let qualityScore = parsed.qualityScore;
      if (typeof qualityScore !== 'number' || qualityScore < 0 || qualityScore > 100) {
        qualityScore = Object.values(normalizedBreakdown).reduce((sum, score) => sum + score, 0);
      }

      // Force rejection for cartoon-style detection
      let recommendation = parsed.recommendation || 'WARNING';
      if (parsed.analysis && (
        parsed.analysis.toLowerCase().includes('cartoon') ||
        parsed.analysis.toLowerCase().includes('animated') ||
        parsed.analysis.toLowerCase().includes('comic') ||
        recommendation.toUpperCase() === 'REJECT'
      )) {
        recommendation = 'REJECT';
        // Lower quality score for cartoon-style images
        if (qualityScore > 30) {
          qualityScore = Math.min(30, qualityScore);
        }
      }

      return {
        recommendation: recommendation,
        confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
        qualityScore: Math.max(0, Math.min(100, qualityScore)),
        breakdown: normalizedBreakdown,
        analysis: parsed.analysis || 'Unable to parse analysis'
      };
    } catch (error) {
      console.warn('Failed to parse image quality enforcer response:', error);
      // Fallback parsing for non-JSON responses
      return {
        recommendation: 'WARNING',
        confidence: 50,
        qualityScore: 0,
        breakdown: { technical: 0, composition: 0, detail: 0, aesthetics: 0 },
        analysis: `Raw response: ${response.substring(0, 500)}...`
      };
    }
  }
}

export default QualityEnforcerAgent;