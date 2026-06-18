import { BaseMetaAgent } from '../../../services/BaseMetaAgent.js';

/**
 * Fact Checker Meta-Agent for Expense Report Validation
 *
 * Validates data consistency and identifies factual errors in expense report analysis.
 * Focuses on numerical accuracy, data consistency, and logical relationships.
 */
class FactCheckerAgent extends BaseMetaAgent {
  constructor(config = {}) {
    super('fact-checker', config);
    this.systemPrompt = `You are a fact-checking specialist for expense report validation.

Your job is to identify data inconsistencies, OCR mismatches, and factual errors in expense report analysis.

Focus on:
- Numerical accuracy (amounts, calculations, totals)
- Data consistency between different fields
- Logical relationships (dates, categories, amounts)
- Missing or contradictory information
- Receipt data validation against submitted amounts

Provide a recommendation: ACCEPT, REJECT, or WARNING
Include confidence score (0-100) and specific findings.

You must respond with valid JSON in the following format:
{
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 85,
  "findings": ["specific issue 1", "specific issue 2"],
  "analysis": "detailed explanation of fact-checking results"
}`;
  }

  /**
   * Evaluate baseline response for factual accuracy and data consistency
   * @param {Object} baselineResult - The baseline LLM response and context
   * @returns {Object} Formatted meta-agent evaluation result
   */
  async evaluate(baselineResult) {
    const analysisPrompt = `Analyze this expense report validation for factual accuracy and data consistency:

BASELINE RESPONSE: ${baselineResult.response}

TOOL CALLS MADE: ${JSON.stringify(baselineResult.toolUsage?.toolCalls || [], null, 2)}

DATASET CONTEXT: ${baselineResult.datasetContent || 'No dataset provided'}

Check for:
1. Mathematical accuracy in calculations
2. Consistency between stated amounts and tool results
3. Logical relationships in the data (dates, categories, amounts)
4. Missing critical information that should have been verified
5. OCR mismatches between receipt data and submitted amounts
6. Data validation completeness

Respond with JSON only:
{
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 85,
  "findings": ["specific issue 1", "specific issue 2"],
  "analysis": "detailed explanation of fact-checking results"
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
        { findings: parsed.findings }
      );
    } catch (error) {
      console.error('Fact Checker evaluation failed:', error);
      return this.formatResult(
        `Fact checking failed: ${error.message}`,
        'warning',
        0,
        { findings: ['Meta-agent evaluation error'] }
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
        findings: Array.isArray(parsed.findings) ? parsed.findings : ['Unable to parse findings'],
        analysis: parsed.analysis || 'Unable to parse analysis'
      };
    } catch (error) {
      console.warn('Failed to parse fact checker response:', error);
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