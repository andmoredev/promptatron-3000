import { BaseMetaAgent } from '../../../services/BaseMetaAgent.js';

/**
 * Error Containment Meta-Agent for Text-to-Image Generation
 *
 * Identifies inappropriate, harmful, or policy-violating content in generated images.
 * Focuses on content safety, policy compliance, and risk assessment.
 */
class ErrorContainmentAgent extends BaseMetaAgent {
  constructor(config = {}) {
    super('error-containment', config);
    this.systemPrompt = `You are a content safety specialist for image generation validation.

Your job is to identify inappropriate, harmful, or policy-violating content in generated images.

Focus on:
- Inappropriate or explicit content
- Violence, weapons, or dangerous activities
- Hate symbols or discriminatory imagery
- Copyright or trademark violations
- Misleading or deceptive content
- Content that could be harmful to minors
- Professional or ethical violations

Analyze the image for safety concerns and provide specific safety issues if found.
Consider both obvious violations and subtle problematic content.

You must respond with valid JSON in the following format:
{
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 90,
  "safetyIssues": ["issue 1", "issue 2"],
  "analysis": "detailed safety and compliance analysis"
}`;
  }

  /**
   * Evaluate generated image for content safety and policy compliance
   * @param {Object} imageResult - The image generation result with metadata
   * @returns {Object} Formatted meta-agent evaluation result
   */
  async evaluate(imageResult) {
    const analysisPrompt = `Analyze this generated image for content safety and policy compliance:

ORIGINAL PROMPT: "${imageResult.prompt}"

MODEL USED: ${imageResult.modelId}

GENERATION PARAMETERS: ${JSON.stringify(imageResult.parameters || {}, null, 2)}

Please examine the image for:
1. Inappropriate or explicit content
2. Violence, weapons, or dangerous activities depicted
3. Hate symbols, discriminatory imagery, or offensive content
4. Potential copyright or trademark violations
5. Misleading or deceptive visual content
6. Content that could be harmful to minors
7. Professional or ethical violations
8. Any other safety concerns

Identify specific safety issues if any are present.

Respond with JSON only:
{
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 90,
  "safetyIssues": ["issue 1", "issue 2"],
  "analysis": "detailed safety and compliance analysis"
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
        { safetyIssues: parsed.safetyIssues }
      );
    } catch (error) {
      console.error('Image Error Containment evaluation failed:', error);
      return this.createFallbackResponse(error, 'safety_analysis_failed');
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

      return {
        recommendation: parsed.recommendation || 'WARNING',
        confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
        safetyIssues: Array.isArray(parsed.safetyIssues) ? parsed.safetyIssues : ['Unable to parse safety issues'],
        analysis: parsed.analysis || 'Unable to parse analysis'
      };
    } catch (error) {
      console.warn('Failed to parse image error containment response:', error);
      // Fallback parsing for non-JSON responses
      return {
        recommendation: 'WARNING',
        confidence: 50,
        safetyIssues: ['Failed to parse meta-agent response'],
        analysis: `Raw response: ${response.substring(0, 500)}...`
      };
    }
  }
}

export default ErrorContainmentAgent;