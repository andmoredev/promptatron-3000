import { BaseMetaAgent } from '../../../services/BaseMetaAgent.js';

/**
 * Error Containment Meta-Agent for Expense Report Validation
 *
 * Identifies unsafe decisions and policy violations in expense report processing.
 * Focuses on safety, compliance, and risk assessment.
 */
class ErrorContainmentAgent extends BaseMetaAgent {
  constructor(config = {}) {
    super('error-containment', config);
    this.systemPrompt = `You are an error containment specialist for expense report validation.

Your job is to identify unsafe decisions, policy violations, and potentially harmful recommendations.

Focus on:
- Policy compliance violations
- Unsafe financial decisions
- Missing required validations
- Inappropriate approvals or rejections
- Security and fraud concerns
- Risk assessment accuracy

Provide a recommendation: ACCEPT, REJECT, or WARNING
Include confidence score (0-100) and specific safety concerns.

You must respond with valid JSON in the following format:
{
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 90,
  "safetyIssues": ["issue 1", "issue 2"],
  "analysis": "detailed safety and compliance analysis"
}`;
  }

  /**
   * Evaluate baseline response for safety and policy compliance
   * @param {Object} baselineResult - The baseline LLM response and context
   * @returns {Object} Formatted meta-agent evaluation result
   */
  async evaluate(baselineResult) {
    const analysisPrompt = `Analyze this expense report validation for safety and policy compliance:

BASELINE RESPONSE: ${baselineResult.response}

TOOL CALLS MADE: ${JSON.stringify(baselineResult.toolUsage?.toolCalls || [], null, 2)}

DATASET CONTEXT: ${baselineResult.datasetContent || 'No dataset provided'}

Check for:
1. Policy compliance violations
2. Unsafe financial decisions (approving questionable expenses)
3. Missing required policy checks
4. Inappropriate risk assessments
5. Potential fraud indicators ignored
6. Security concerns in expense processing
7. Compliance with expense approval workflows

Respond with JSON only:
{
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 90,
  "safetyIssues": ["issue 1", "issue 2"],
  "analysis": "detailed safety and compliance analysis"
}`;

    const context = {
      baselineResponse: baselineResult.response,
      toolCalls: baselineResult.toolUsage?.toolCalls || [],
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
        { safetyIssues: parsed.safetyIssues }
      );
    } catch (error) {
      console.error('Error Containment evaluation failed:', error);
      return this.formatResult(
        `Error containment analysis failed: ${error.message}`,
        'warning',
        0,
        { safetyIssues: ['Meta-agent evaluation error'] }
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

      return {
        recommendation: parsed.recommendation || 'WARNING',
        confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
        safetyIssues: Array.isArray(parsed.safetyIssues) ? parsed.safetyIssues : ['Unable to parse safety issues'],
        analysis: parsed.analysis || 'Unable to parse analysis'
      };
    } catch (error) {
      console.warn('Failed to parse error containment response:', error);
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