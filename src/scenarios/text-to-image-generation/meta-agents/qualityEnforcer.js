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
    this.systemPrompt = `You are a STRICT image style enforcer. Your ONLY job is to determine if images are photorealistic or not.

🚫 YOU MUST RESPOND WITH "REJECT" IF THE IMAGE HAS ANY OF THESE:
- Cartoon, anime, manga, or comic book style
- Illustration, digital art, or drawing appearance
- Simplified, stylized, or exaggerated features
- Flat colors, bold outlines, or cell-shading
- Non-photorealistic rendering
- Vector graphics or logo-like appearance
- Fantasy, fictional, or imaginary elements
- Artistic interpretation rather than realistic depiction

✅ ONLY RESPOND WITH "ACCEPT" IF:
- The image looks like a genuine photograph
- It has photorealistic quality that could fool someone into thinking it's real
- Natural lighting, realistic textures, and proportions
- No artistic stylization whatsoever

🔍 DETECTION RULES:
1. Look at the image FIRST - ignore the prompt
2. If you see ANY non-photorealistic elements → REJECT
3. If uncertain whether it's a photo or art → REJECT
4. Only if it's clearly photorealistic → ACCEPT
5. Be EXTREMELY strict - err on the side of rejection

CRITICAL: Your recommendation field MUST be either "ACCEPT" or "REJECT" - no other values allowed.

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
    console.log(`[QualityEnforcer] Analyzing image for prompt: "${imageResult.prompt}"`);

    const analysisPrompt = `Evaluate the quality of this generated image:

ORIGINAL PROMPT: "${imageResult.prompt}"

MODEL USED: ${imageResult.modelId}

GENERATION PARAMETERS: ${JSON.stringify(imageResult.parameters || {}, null, 2)}

STEP 1 - STYLE CHECK (MOST IMPORTANT):
Look at this image and determine: Is this a photograph or is it art/cartoon/illustration?

If you see ANY of these → IMMEDIATELY set recommendation to "REJECT":
- Cartoon/anime/manga style
- Digital art or illustration appearance
- Stylized, simplified, or exaggerated features
- Non-photorealistic rendering
- Artistic interpretation

If it looks like a genuine photograph → set recommendation to "ACCEPT" and continue with quality assessment.

STEP 2 - Quality Assessment (only if ACCEPT from Step 1):

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

MANDATORY RESPONSE FORMAT:
- If ANY non-photorealistic elements detected → recommendation: "REJECT"
- If genuinely photorealistic → recommendation: "ACCEPT"
- NO OTHER VALUES ALLOWED (not "WARNING", not "MAYBE", only "ACCEPT" or "REJECT")

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

      console.log('ANDRESSS', result);
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

      // Trust the AI model's recommendation - no code overrides
      let recommendation = parsed.recommendation || 'WARNING';

      console.log(`[QualityEnforcer] AI Model Decision: ${recommendation}, Quality Score: ${parsed.qualityScore}, Analysis: ${(parsed.analysis || '').substring(0, 100)}...`);

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