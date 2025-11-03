import { BaseMetaAgent } from '../../../services/BaseMetaAgent.js';

/**
 * Quality Enforcer Meta-Agent for Expense Report Validation
 *
 * Scores reasoning clarity and compliance quality in expense report analysis.
 * Provides detailed quality breakdown across multiple dimensions.
 */
class QualityEnforcerAgent extends BaseMetaAgent {
  constructor(config = {}) {
    super('quality-enforcer', config);
    this.systemPrompt = `You are a quality enforcement specialist for expense report validation.

Your job is to score the reasoning clarity, completeness, and overall quality of expense report analysis.

Evaluate:
- Clarity of reasoning and explanations
- Completeness of analysis
- Appropriate use of available tools
- Professional communication quality
- Compliance with validation standards

Provide a quality score (0-100) and recommendation.

You must respond with valid JSON in the following format:
{
  "qualityScore": 85,
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 95,
  "breakdown": {
    "reasoning": 22,
    "completeness": 20,
    "toolUsage": 23,
    "communication": 20
  },
  "analysis": "detailed quality assessment"
}`;
  }

  /**
   * Evaluate baseline response for quality and completeness
   * @param {Object} baselineResult - The baseline LLM response and context
   * @returns {Object} Formatted meta-agent evaluation result
   */
  async evaluate(baselineResult) {
    const analysisPrompt = `Score the quality of this expense report validation:

BASELINE RESPONSE: ${baselineResult.response}

TOOL CALLS MADE: ${JSON.stringify(baselineResult.toolUsage?.toolCalls || [], null, 2)}

AVAILABLE TOOLS: ${JSON.stringify(baselineResult.toolConfig?.tools?.map(t => t.name) || [], null, 2)}

DATASET CONTEXT: ${baselineResult.datasetContent || 'No dataset provided'}

Rate on:
1. Reasoning clarity (0-25 points): How clear and logical is the analysis?
2. Analysis completeness (0-25 points): Did it cover all necessary aspects?
3. Appropriate tool usage (0-25 points): Were the right tools used effectively?
4. Professional communication (0-25 points): Is the response well-structured and professional?

Quality scoring guidelines:
- 90-100: Excellent - comprehensive, clear, and professional
- 80-89: Good - solid analysis with minor gaps
- 70-79: Acceptable - adequate but could be improved
- 60-69: Poor - significant issues or gaps
- Below 60: Unacceptable - major problems

Respond with JSON only:
{
  "qualityScore": 85,
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 95,
  "breakdown": {
    "reasoning": 22,
    "completeness": 20,
    "toolUsage": 23,
    "communication": 20
  },
  "analysis": "detailed quality assessment"
}`;

    const context = {
      baselineResponse: baselineResult.response,
      toolCalls: baselineResult.toolUsage?.toolCalls || [],
      availableTools: baselineResult.toolConfig?.tools || [],
      datasetContent: baselineResult.datasetContent || null
    };

    try {
      const result = await this.invokeMetaAgent(
        this.systemPrompt,
        analysisPrompt,
        context
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
      console.error('Quality Enforcer evaluation failed:', error);
      return this.formatResult(
        `Quality assessment failed: ${error.message}`,
        'warning',
        0,
        {
          qualityScore: 0,
          breakdown: { reasoning: 0, completeness: 0, toolUsage: 0, communication: 0 }
        }
      );
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
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : response;

      const parsed = JSON.parse(jsonString);

      // Validate required fields
      if (!parsed.recommendation || !parsed.analysis) {
        throw new Error('Missing required fields in response');
      }

      // Validate and normalize breakdown scores
      const breakdown = parsed.breakdown || {};
      const normalizedBreakdown = {
        reasoning: Math.max(0, Math.min(25, breakdown.reasoning || 0)),
        completeness: Math.max(0, Math.min(25, breakdown.completeness || 0)),
        toolUsage: Math.max(0, Math.min(25, breakdown.toolUsage || 0)),
        communication: Math.max(0, Math.min(25, breakdown.communication || 0))
      };

      // Calculate quality score from breakdown if not provided or invalid
      let qualityScore = parsed.qualityScore;
      if (typeof qualityScore !== 'number' || qualityScore < 0 || qualityScore > 100) {
        qualityScore = Object.values(normalizedBreakdown).reduce((sum, score) => sum + score, 0);
      }

      return {
        recommendation: parsed.recommendation || 'WARNING',
        confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
        qualityScore: Math.max(0, Math.min(100, qualityScore)),
        breakdown: normalizedBreakdown,
        analysis: parsed.analysis || 'Unable to parse analysis'
      };
    } catch (error) {
      console.warn('Failed to parse quality enforcer response:', error);
      // Fallback parsing for non-JSON responses
      return {
        recommendation: 'WARNING',
        confidence: 50,
        qualityScore: 0,
        breakdown: { reasoning: 0, completeness: 0, toolUsage: 0, communication: 0 },
        analysis: `Raw response: ${response.substring(0, 500)}...`
      };
    }
  }
}

export default QualityEnforcerAgent;