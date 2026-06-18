import { BaseMetaAgent } from '../../../services/BaseMetaAgent.js';

/**
 * Fact Checker Meta-Agent for Text-to-Image Generation
 *
 * Validates that generated images accurately reflect the original text prompt.
 * Focuses on visual elements, style requirements, and prompt adherence.
 */
class FactCheckerAgent extends BaseMetaAgent {
  constructor(config = {}) {
    super('fact-checker', config);
    this.systemPrompt = `You are a fact-checking specialist for image generation validation.

Your job is to verify that generated images accurately reflect the original text prompt.

Focus on:
- Visual elements mentioned in the prompt (objects, people, settings)
- Style and aesthetic requirements (artistic style, mood, composition)
- Technical specifications (if mentioned - colors, lighting, perspective)
- Logical consistency within the image
- Completeness of prompt requirements

Analyze the image and compare it to the original prompt to identify:
- Missing elements that were specifically requested
- Incorrect interpretations of the prompt
- Additional elements not requested that may detract from the prompt

Provide specific findings about what matches and what doesn't match the prompt.

You must respond with valid JSON in the following format:
{
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 85,
  "findings": ["specific finding 1", "specific finding 2"],
  "analysis": "detailed explanation of prompt adherence assessment"
}`;
  }

  /**
   * Evaluate generated image for prompt adherence and accuracy
   * @param {Object} imageResult - The image generation result with metadata
   * @returns {Object} Formatted meta-agent evaluation result
   */
  async evaluate(imageResult) {
    const analysisPrompt = `Analyze this generated image for prompt adherence and accuracy:

ORIGINAL PROMPT: "${imageResult.prompt}"

MODEL USED: ${imageResult.modelId}

GENERATION PARAMETERS: ${JSON.stringify(imageResult.parameters || {}, null, 2)}

Please examine the image and verify:
1. Are all visual elements mentioned in the prompt present in the image?
2. Does the style/aesthetic match what was requested?
3. Are there any incorrect interpretations of the prompt?
4. Are there missing elements that were specifically requested?
5. Does the overall composition match the prompt's intent?
6. Are there any additional elements that weren't requested and detract from the prompt?

Provide specific findings about prompt adherence.

Respond with JSON only:
{
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 85,
  "findings": ["specific finding 1", "specific finding 2"],
  "analysis": "detailed explanation of prompt adherence assessment"
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
        { findings: parsed.findings }
      );
    } catch (error) {
      console.error('Image Fact Checker evaluation failed:', error);
      return this.createFallbackResponse(error, 'image_analysis_failed');
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
        findings: Array.isArray(parsed.findings) ? parsed.findings : ['Unable to parse findings'],
        analysis: parsed.analysis || 'Unable to parse analysis'
      };
    } catch (error) {
      console.warn('Failed to parse image fact checker response:', error);
      // Fallback parsing for non-JSON responses
      return {
        recommendation: 'WARNING',
        confidence: 50,
        findings: ['Failed to parse meta-agent response'],
        analysis: `Raw response: ${response.substring(0, 500)}...`
      };
    }
  }
}

export default FactCheckerAgent;