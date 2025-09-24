/**
 * Service for grading determinism evaluation responses using LLM
 * Handles grader prompt generation, response parsing, and fallback analysis
 * PRIORITY: Tool usage consistency is the highest priority for determinism evaluation
 */

import { bedrockService } from './bedrockService.js';
import { analyzeError } from '../utils/errorHandling.js';

/**
 * Enhanced grader system prompt with tool usage consistency as highest priority
 * Focuses on outcome determinism through tool usage patterns and functional equivalence
 */
export const GRADER_SYSTEM_PROMPT = `You are an expert evaluator of LLM response determinism. Analyze the provided responses to evaluate how deterministic the model's behavior is.

CRITICAL: Tool usage consistency is the HIGHEST PRIORITY for determinism evaluation since it determines actual outcomes and functional behavior.

Evaluation Criteria (in priority order):
1. **Tool usage consistency (HIGHEST PRIORITY)** - Same tools used for same situations, consistent tool selection patterns
2. **Functional equivalence** - Same practical outcomes and actionable results
3. **Decision consistency** - Same conclusions, recommendations, and judgments
4. **Semantic equivalence** - Same meaning expressed through different wording
5. **Structure consistency** - Similar response format and organization (LOWEST PRIORITY)

For responses with tool usage:
- Identical tool selection patterns = HIGH determinism
- Similar tools with consistent logic = GOOD determinism
- Mixed tool usage without clear pattern = LOW determinism
- Random or contradictory tool selection = NON-deterministic

For responses without tool usage:
- Focus on functional outcomes and decision consistency
- Semantic variations are acceptable if outcomes are consistent

Assign grades based on OUTCOME determinism:
- A: Highly deterministic (>90% consistent outcomes/tool usage)
- B: Good determinism (70-90% consistent outcomes/tool usage)
- C: Moderate determinism (50-70% consistent outcomes/tool usage)
- D: Low determinism (30-50% consistent outcomes/tool usage)
- F: Non-deterministic (<30% consistent outcomes/tool usage)

Required JSON response format:
{
  "grade": "A",
  "score": 95,
  "reasoning": "Detailed explanation focusing on tool usage and outcome consistency",
  "metrics": {
    "toolUsageConsistency": 0.96,
    "decisionConsistency": 0.94,
    "semanticSimilarity": 0.92,
    "structureConsistency": 0.88,
    "responseCount": 10,
    "uniqueResponses": 3,
    "exactMatches": 2
  },
  "notable_variations": [
    "Different tool selection patterns",
    "Varied explanation depth but same conclusion"
  ]
}

Responses to analyze (excluding throttled responses):`;

/**
 * Grader service class for determinism evaluation
 */
export class GraderService {
  constructor() {
    this.graderModel = 'amazon.nova-pro-v1:0';
    this.maxResponsesPerRequest = 30;
    this.maxPromptLength = 100000;
  }

  /**
   * Grade responses using grader LLM with tool usage priority
   * @param {Array<string|Object>} responses - Array of responses to grade
   * @param {Object} config - Evaluation configuration
   * @param {string} customGraderPrompt - Optional custom grader prompt
   * @returns {Promise<Object>} Grading result with tool usage as primary metric
   */
  async gradeResponses(responses, config, customGraderPrompt = null) {
    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      throw new Error('No responses provided for grading');
    }

    try {
      // Filter out throttled/abandoned responses for grading analysis
      const responsesForGrading = responses.filter(response => {
        if (typeof response === 'string') return true;
        return !response.wasThrottled && !response.wasAbandoned;
      });

      console.log(`Grading ${responsesForGrading.length} responses (excluded ${responses.length - responsesForGrading.length} throttled/abandoned)`);

      if (responsesForGrading.length === 0) {
        throw new Error('No valid responses available for grading after filtering throttled responses');
      }

      // Prepare grader prompt with tool usage emphasis
      const graderPrompt = this.buildGraderPrompt(responsesForGrading, config, customGraderPrompt);

      // Use Nova Pro for grading
      const graderResult = await this.invokeGrader(this.graderModel, graderPrompt);

      // Parse grader response with tool usage priority
      const parsedResult = this.parseGraderResponse(graderResult.text, responsesForGrading, responses, config);

      return {
        ...parsedResult,
        graderModel: graderResult.graderModel,
        graderUsage: graderResult.usage,
        responsesAnalyzed: responsesForGrading.length,
        responsesExcluded: responses.length - responsesForGrading.length,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Grading failed completely, using enhanced fallback analysis:', error);
      return this.performEnhancedFallbackAnalysis(responses, config, error);
    }
  }

  /**
   * Grade responses with graceful degradation for partial data
   * @param {Array} responses - Responses to grade
   * @param {Object} config - Configuration
   * @param {string} customGraderPrompt - Custom prompt
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Grading result
   */
  async gradeResponsesWithGracefulDegradation(responses, config, customGraderPrompt = null, options = {}) {
    const {
      allowPartialAnalysis = true,
      minResponsesForGrading = 3,
      preferFallbackForSmallSets = false
    } = options;

    // Check if we have sufficient data
    const validResponses = responses.filter(r => {
      if (typeof r === 'string') return r.trim().length > 0;
      return r && !r.wasAbandoned && r.text && r.text.trim().length > 0;
    });

    if (validResponses.length < minResponsesForGrading) {
      if (allowPartialAnalysis && validResponses.length > 0) {
        console.log(`Insufficient responses for full analysis (${validResponses.length} < ${minResponsesForGrading}), using fallback`);
        return this.performEnhancedFallbackAnalysis(responses, config,
          new Error(`Insufficient responses: ${validResponses.length} < ${minResponsesForGrading}`));
      } else {
        throw new Error(`Insufficient responses for analysis: ${validResponses.length} responses available, minimum ${minResponsesForGrading} required`);
      }
    }

    // Use fallback for very small datasets if preferred
    if (preferFallbackForSmallSets && validResponses.length <= 5) {
      console.log('Using fallback analysis for small dataset');
      return this.performEnhancedFallbackAnalysis(responses, config,
        new Error('Small dataset - using statistical analysis'));
    }

    // Attempt normal grading with fallback on failure
    try {
      return await this.gradeResponses(responses, config, customGraderPrompt);
    } catch (error) {
      if (allowPartialAnalysis) {
        console.log('Grading failed, falling back to statistical analysis');
        return this.performEnhancedFallbackAnalysis(responses, config, error);
      } else {
        throw error;
      }
    }
  }

  /**
   * Build grader prompt with tool usage emphasis
   * @param {Array<string|Object>} responses - Responses to analyze
   * @param {Object} config - Evaluation configuration
   * @param {string} customGraderPrompt - Optional custom grader prompt
   * @returns {string} Complete grader prompt
   */
  buildGraderPrompt(responses, config, customGraderPrompt = null) {
    // Use custom prompt if provided, otherwise use tool usage focused default
    const systemPrompt = customGraderPrompt || GRADER_SYSTEM_PROMPT;

    // Build context information
    let contextInfo = '';
    if (config && config.systemPrompt) {
      contextInfo += `\nContext - System Prompt: ${config.systemPrompt.substring(0, 200)}${config.systemPrompt.length > 200 ? '...' : ''}`;
    }
    if (config && config.userPrompt) {
      contextInfo += `\nContext - User Prompt: ${config.userPrompt.substring(0, 200)}${config.userPrompt.length > 200 ? '...' : ''}`;
    }

    // Detect if any responses have tool usage
    const hasToolUsage = responses.some(r =>
      typeof r === 'object' && r.toolUsage && r.toolUsage.hasToolUsage
    );

    // Build responses section with enhanced tool usage formatting
    const responsesText = responses.map((r, index) => {
      if (typeof r === 'string') {
        return `\n--- Response ${index + 1} ---\n${r}\n\nTOOL USAGE: None`;
      } else {
        let responseText = `\n--- Response ${index + 1} ---\n${r.text || ''}`;

        // Enhanced tool usage formatting
        if (r.toolUsage && r.toolUsage.hasToolUsage && r.toolUsage.toolCalls && r.toolUsage.toolCalls.length > 0) {
          responseText += `\n\nTOOL USAGE:`;
          r.toolUsage.toolCalls.forEach((call, callIndex) => {
            responseText += `\n  Tool ${callIndex + 1}: ${call.toolName}`;
            responseText += `\n    Input: ${JSON.stringify(call.input)}`;
            if (call.output) {
              responseText += `\n    Output: ${JSON.stringify(call.output)}`;
            }
          });
        } else {
          responseText += `\n\nTOOL USAGE: None`;
        }

        return responseText;
      }
    }).join('\n');

    const prompt = `${contextInfo}

Analyze these ${responses.length} responses for determinism:${responsesText}

${hasToolUsage ?
        '\n🔧 CRITICAL: These responses include TOOL USAGE. Tool usage consistency is the PRIMARY determinant of response determinism. Focus your analysis on:\n- Whether the same tools are selected for the same situations\n- Consistency in tool input parameters\n- Patterns in tool selection logic\n- Functional outcome equivalence through tool usage' :
        '\n📝 NOTE: These responses do not include tool usage. Focus on functional outcomes, decision consistency, and semantic equivalence.'
      }

Prioritize OUTCOME determinism over text similarity. Analyze meaningful functional variations that affect results.`;

    // Check total prompt length and truncate if necessary
    if (prompt.length > this.maxPromptLength) {
      console.warn(`Grader prompt too long (${prompt.length} chars), truncating responses`);
      return prompt.substring(0, this.maxPromptLength);
    }

    return prompt;
  }

  /**
   * Invoke grader LLM with the prepared prompt
   * @param {string} modelId - Grader model ID
   * @param {string} prompt - Grader prompt
   * @returns {Promise<Object>} Grader response
   */
  async invokeGrader(modelId, prompt) {
    try {
      const response = await bedrockService.invokeModel(
        modelId,
        GRADER_SYSTEM_PROMPT,
        prompt
      );

      return {
        ...response,
        graderModel: modelId
      };
    } catch (error) {
      const errorInfo = analyzeError(error, {
        operation: 'grader_invocation',
        modelId,
        promptLength: prompt.length
      });

      throw new Error(`Grader model invocation failed: ${errorInfo.userMessage}`);
    }
  }

  /**
   * Parse grader LLM response with tool usage priority
   * @param {string} graderResponse - Raw grader response
   * @param {Array<string|Object>} responsesForGrading - Responses used for grading
   * @param {Array<string|Object>} allResponses - All responses including throttled ones
   * @param {Object} config - Evaluation configuration
   * @returns {Object} Parsed grading result with tool usage metrics
   */
  parseGraderResponse(graderResponse, responsesForGrading, allResponses, config) {
    if (!graderResponse || typeof graderResponse !== 'string') {
      throw new Error('Invalid grader response: empty or non-string response');
    }

    try {
      // Try to extract JSON from the response
      const jsonMatch = this.extractJsonFromResponse(graderResponse);
      console.log('Extracted grader JSON:', jsonMatch);

      if (!jsonMatch) {
        throw new Error('No valid JSON found in grader response');
      }

      const parsed = JSON.parse(jsonMatch);
      console.log('Parsed grader JSON:', parsed);

      // Validate and enhance the result with tool usage priority
      const validatedResult = this.validateGraderResult(parsed, responsesForGrading, allResponses, config);
      console.log('Validated grader result:', validatedResult);

      return {
        ...validatedResult,
        rawResponse: graderResponse,
        parseMethod: 'json_extraction'
      };

    } catch (parseError) {
      console.warn('Failed to parse grader JSON response:', parseError.message);

      // Try alternative parsing methods
      try {
        return this.parseGraderResponseFallback(graderResponse, responsesForGrading, config);
      } catch (fallbackError) {
        console.warn('All parsing methods failed, using enhanced fallback analysis');
        return this.performEnhancedFallbackAnalysis(allResponses, config, parseError);
      }
    }
  }

  /**
   * Extract JSON from grader response using multiple strategies
   * @param {string} response - Grader response
   * @returns {string|null} Extracted JSON string or null
   */
  extractJsonFromResponse(response) {
    // Strategy 1: Look for JSON block markers
    const jsonBlockMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonBlockMatch) {
      return jsonBlockMatch[1];
    }

    // Strategy 2: Look for JSON object boundaries
    const jsonObjectMatch = response.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      return jsonObjectMatch[0];
    }

    // Strategy 3: Try to find JSON-like structure
    const lines = response.split('\n');
    let jsonStart = -1;
    let jsonEnd = -1;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('{') && jsonStart === -1) {
        jsonStart = i;
        braceCount = 1;
      } else if (jsonStart !== -1) {
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;

        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }
    }

    if (jsonStart !== -1 && jsonEnd !== -1) {
      return lines.slice(jsonStart, jsonEnd + 1).join('\n');
    }

    return null;
  }

  /**
   * Fallback parsing for non-JSON grader responses
   * @param {string} response - Grader response
   * @param {Array<string>} responses - Original responses
   * @param {Object} config - Evaluation configuration
   * @returns {Object} Parsed result
   */
  parseGraderResponseFallback(response, responses, config) {
    // Try to extract grade and score using regex patterns
    const gradeMatch = response.match(/grade[:\s]*([A-F])/i);
    const scoreMatch = response.match(/score[:\s]*(\d+)/i);

    const grade = gradeMatch ? gradeMatch[1].toUpperCase() : this.calculateStatisticalGrade(responses);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : this.calculateStatisticalScore(responses);

    // Extract reasoning (look for explanation text)
    let reasoning = 'Grader provided non-standard response format. ';
    const reasoningMatch = response.match(/reasoning[:\s]*(.+?)(?:\n|$)/i);
    if (reasoningMatch) {
      reasoning += reasoningMatch[1];
    } else {
      reasoning += 'Statistical analysis used as fallback.';
    }

    return {
      grade,
      score,
      reasoning,
      metrics: this.calculateEnhancedMetrics(responses),
      notable_variations: this.identifyNotableVariations(responses),
      parseMethod: 'regex_fallback',
      rawResponse: response,
      fallbackAnalysis: !gradeMatch && !scoreMatch
    };
  }

  /**
   * Validate and sanitize grader result with tool usage priority
   * @param {Object} result - Parsed grader result
   * @param {Array<string|Object>} responsesForGrading - Responses used for grading
   * @param {Array<string|Object>} allResponses - All responses including throttled
   * @param {Object} config - Evaluation configuration
   * @returns {Object} Validated result
   */
  validateGraderResult(result, responsesForGrading, allResponses, config) {
    const validated = {};

    // Validate grade
    if (result.grade && typeof result.grade === 'string' && /^[A-F]$/.test(result.grade.toUpperCase())) {
      validated.grade = result.grade.toUpperCase();
    } else {
      validated.grade = this.calculateStatisticalGrade(responsesForGrading);
    }

    // Validate score
    if (typeof result.score === 'number' && result.score >= 0 && result.score <= 100) {
      validated.score = Math.round(result.score);
    } else {
      validated.score = this.calculateStatisticalScore(responsesForGrading);
    }

    // Validate reasoning
    if (result.reasoning && typeof result.reasoning === 'string' && result.reasoning.trim().length > 0) {
      validated.reasoning = result.reasoning.trim();
    } else {
      validated.reasoning = `Evaluated ${responsesForGrading.length} responses with ${validated.grade} grade (${validated.score}% consistency)`;
    }

    // Enhanced metrics validation with tool usage priority
    if (result.metrics && typeof result.metrics === 'object') {
      validated.metrics = {
        toolUsageConsistency: this.validateMetricValue(result.metrics.toolUsageConsistency, 0.0, 1.0),
        decisionConsistency: this.validateMetricValue(result.metrics.decisionConsistency, 0.0, 1.0),
        semanticSimilarity: this.validateMetricValue(result.metrics.semanticSimilarity, 0.0, 1.0),
        structureConsistency: this.validateMetricValue(result.metrics.structureConsistency, 0.0, 1.0),
        responseCount: typeof result.metrics.responseCount === 'number' ? result.metrics.responseCount : responsesForGrading.length,
        uniqueResponses: typeof result.metrics.uniqueResponses === 'number' ? result.metrics.uniqueResponses : this.calculateUniqueResponses(responsesForGrading),
        exactMatches: typeof result.metrics.exactMatches === 'number' ? result.metrics.exactMatches : this.calculateExactMatches(responsesForGrading)
      };
    } else {
      // Generate metrics from statistical analysis with tool usage priority
      validated.metrics = this.calculateEnhancedMetrics(responsesForGrading);
    }

    // Validate notable variations
    if (result.notable_variations && Array.isArray(result.notable_variations)) {
      validated.notable_variations = result.notable_variations.filter(v => typeof v === 'string' && v.trim().length > 0);
    } else {
      validated.notable_variations = this.identifyNotableVariations(responsesForGrading);
    }

    // Add throttling information
    validated.throttlingInfo = {
      totalResponses: allResponses.length,
      responsesAnalyzed: responsesForGrading.length,
      throttledResponses: allResponses.length - responsesForGrading.length,
      excludedFromAnalysis: allResponses.length - responsesForGrading.length > 0
    };

    return validated;
  }

  /**
   * Validate a metric value within bounds
   * @param {*} value - Value to validate
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @returns {number} Validated metric value
   */
  validateMetricValue(value, min = 0.0, max = 1.0) {
    if (typeof value === 'number' && !isNaN(value)) {
      return Math.max(min, Math.min(max, value));
    }
    return min;
  }

  /**
   * Calculate enhanced metrics with tool usage as primary focus
   * @param {Array<string|Object>} responses - Responses to analyze
   * @returns {Object} Enhanced metrics object
   */
  calculateEnhancedMetrics(responses) {
    const responseTexts = responses.map(r =>
      typeof r === 'string' ? r.trim() : (r.text || '').trim()
    );

    const uniqueResponses = this.calculateUniqueResponses(responses);
    const exactMatches = this.calculateExactMatches(responses);

    // Tool usage consistency is the primary metric
    const toolUsageConsistency = this.calculateToolUsageConsistency(responses);
    const decisionConsistency = this.calculateDecisionConsistency(responses);
    const structureConsistency = this.calculateStructureConsistency(responses);

    // Semantic similarity calculation (secondary to tool usage)
    const nonExactResponses = responseTexts.length - exactMatches;
    const semanticSimilarity = nonExactResponses > 0
      ? Math.max(0, 1 - ((uniqueResponses - exactMatches) / nonExactResponses))
      : 1.0;

    return {
      toolUsageConsistency,        // PRIMARY metric (highest priority)
      decisionConsistency,         // Secondary metric (functional outcomes)
      semanticSimilarity: Math.round(semanticSimilarity * 100) / 100,  // Tertiary
      structureConsistency,        // Lowest priority
      responseCount: responses.length,
      uniqueResponses,
      exactMatches
    };
  }

  /**
   * Calculate tool usage consistency with sophisticated analysis
   * @param {Array<string|Object>} responses - Responses to analyze
   * @returns {number} Tool usage consistency score (0.0 to 1.0)
   */
  calculateToolUsageConsistency(responses) {
    const responsesWithToolData = responses.filter(r =>
      typeof r === 'object' && r.toolUsage
    );

    if (responsesWithToolData.length === 0) {
      // No tool data available - assume perfect consistency for non-tool scenarios
      return 1.0;
    }

    const responsesWithTools = responsesWithToolData.filter(r => r.toolUsage.hasToolUsage);
    const toolUsageRate = responsesWithTools.length / responsesWithToolData.length;

    if (responsesWithTools.length === 0) {
      // No tools used consistently - perfect consistency for non-tool scenarios
      return 1.0;
    }

    if (responsesWithTools.length === responsesWithToolData.length) {
      // All responses use tools - analyze tool selection patterns
      const toolPatterns = responsesWithTools.map(r => {
        if (!r.toolUsage.toolCalls || r.toolUsage.toolCalls.length === 0) {
          return 'no-calls';
        }

        // Create a pattern based on tool names and their sequence
        return r.toolUsage.toolCalls
          .map(call => call.toolName || 'unknown')
          .sort()
          .join('|');
      });

      const uniquePatterns = new Set(toolPatterns);
      const patternConsistency = 1 - (uniquePatterns.size - 1) / Math.max(1, toolPatterns.length - 1);

      // Also check for input parameter consistency within same tool patterns
      const patternGroups = {};
      toolPatterns.forEach((pattern, index) => {
        if (!patternGroups[pattern]) patternGroups[pattern] = [];
        patternGroups[pattern].push(responsesWithTools[index]);
      });

      let inputConsistency = 1.0;
      Object.values(patternGroups).forEach(group => {
        if (group.length > 1) {
          // Analyze input parameter consistency within this pattern group
          const inputVariations = group.map(r =>
            JSON.stringify(r.toolUsage.toolCalls?.map(call => call.input) || [])
          );
          const uniqueInputs = new Set(inputVariations).size;
          const groupInputConsistency = 1 - (uniqueInputs - 1) / Math.max(1, inputVariations.length - 1);
          inputConsistency = Math.min(inputConsistency, groupInputConsistency);
        }
      });

      // Combine pattern and input consistency
      return Math.round((patternConsistency * 0.7 + inputConsistency * 0.3) * 100) / 100;
    } else {
      // Mixed tool usage (some use tools, some don't) - lower consistency
      // But not necessarily bad if the context justifies different approaches
      return Math.max(0.1, Math.round((1 - Math.abs(toolUsageRate - 0.5) * 1.5) * 100) / 100);
    }
  }

  /**
   * Calculate decision consistency based on outcomes and conclusions
   * @param {Array<string|Object>} responses - Responses to analyze
   * @returns {number} Decision consistency score (0.0 to 1.0)
   */
  calculateDecisionConsistency(responses) {
    // This is a simplified heuristic - in practice, this would need more sophisticated NLP
    const responseTexts = responses.map(r =>
      typeof r === 'string' ? r.trim() : (r.text || '').trim()
    );

    // Look for decision-indicating words and patterns
    const decisionPatterns = responseTexts.map(text => {
      const decisions = [];

      // Extract recommendations, conclusions, actions
      const recommendMatch = text.match(/recommend[s]?\s+([^.!?]+)/gi);
      if (recommendMatch) decisions.push(...recommendMatch);

      const concludeMatch = text.match(/conclude[s]?\s+([^.!?]+)/gi);
      if (concludeMatch) decisions.push(...concludeMatch);

      const shouldMatch = text.match(/should\s+([^.!?]+)/gi);
      if (shouldMatch) decisions.push(...shouldMatch);

      return decisions.join(' ').toLowerCase();
    });

    // Simple similarity check - in practice would use semantic similarity
    const uniqueDecisionPatterns = new Set(decisionPatterns.filter(p => p.length > 0));

    if (uniqueDecisionPatterns.size === 0) {
      return 0.8; // No clear decisions found - moderate consistency
    }

    return Math.max(0.1, 1 - (uniqueDecisionPatterns.size - 1) / Math.max(1, decisionPatterns.length - 1));
  }

  /**
   * Calculate structure consistency based on response format and organization
   * @param {Array<string|Object>} responses - Responses to analyze
   * @returns {number} Structure consistency score (0.0 to 1.0)
   */
  calculateStructureConsistency(responses) {
    const responseTexts = responses.map(r =>
      typeof r === 'string' ? r.trim() : (r.text || '').trim()
    );

    // Analyze structural patterns
    const structures = responseTexts.map(text => {
      const structure = {
        hasNumberedList: /^\d+\./.test(text) || /\n\d+\./.test(text),
        hasBulletList: /^[-*•]/.test(text) || /\n[-*•]/.test(text),
        hasHeaders: /^#+\s/.test(text) || /\n#+\s/.test(text),
        paragraphCount: text.split(/\n\s*\n/).length,
        avgSentenceLength: text.split(/[.!?]+/).length
      };

      return JSON.stringify(structure);
    });

    const uniqueStructures = new Set(structures);
    return Math.max(0.1, 1 - (uniqueStructures.size - 1) / Math.max(1, structures.length - 1));
  }

  /**
   * Calculate unique responses count
   * @param {Array<string|Object>} responses - Responses to analyze
   * @returns {number} Number of unique responses
   */
  calculateUniqueResponses(responses) {
    const responseTexts = responses.map(r =>
      typeof r === 'string' ? r.trim() : (r.text || '').trim()
    );
    return new Set(responseTexts).size;
  }

  /**
   * Calculate exact matches count
   * @param {Array<string|Object>} responses - Responses to analyze
   * @returns {number} Number of exact matches
   */
  calculateExactMatches(responses) {
    const responseTexts = responses.map(r =>
      typeof r === 'string' ? r.trim() : (r.text || '').trim()
    );

    if (responseTexts.length === 0) return 0;

    const firstResponse = responseTexts[0];
    return responseTexts.filter(text => text === firstResponse).length;
  }

  /**
   * Identify notable variations with focus on tool usage patterns
   * @param {Array<string|Object>} responses - Responses to analyze
   * @returns {Array<string>} Array of notable variation descriptions
   */
  identifyNotableVariations(responses) {
    const variations = [];
    const toolUsageConsistency = this.calculateToolUsageConsistency(responses);

    // Analyze tool usage patterns
    const responsesWithToolData = responses.filter(r =>
      typeof r === 'object' && r.toolUsage
    );

    if (responsesWithToolData.length > 0) {
      const responsesWithTools = responsesWithToolData.filter(r => r.toolUsage.hasToolUsage);
      const toolUsageRate = responsesWithTools.length / responsesWithToolData.length;

      if (toolUsageRate > 0 && toolUsageRate < 1) {
        variations.push(`Mixed tool usage: ${responsesWithTools.length}/${responsesWithToolData.length} responses used tools`);
      }

      if (responsesWithTools.length > 1) {
        const toolPatterns = responsesWithTools.map(r =>
          r.toolUsage.toolCalls?.map(call => call.toolName).sort().join(', ') || 'none'
        );
        const uniquePatterns = [...new Set(toolPatterns)];

        if (uniquePatterns.length > 1) {
          variations.push(`Different tool selection patterns: ${uniquePatterns.join(' vs ')}`);
        }
      }

      if (toolUsageConsistency < 0.7) {
        variations.push('Low tool usage consistency detected');
      }
    }

    // Analyze response diversity
    const responseTexts = responses.map(r =>
      typeof r === 'string' ? r.trim() : (r.text || '').trim()
    );
    const uniqueTexts = new Set(responseTexts);
    const uniqueRatio = uniqueTexts.size / responseTexts.length;

    if (uniqueRatio > 0.7) {
      variations.push(`High response diversity (${Math.round(uniqueRatio * 100)}% unique)`);
    } else if (uniqueRatio < 0.3) {
      variations.push(`Low response diversity (${Math.round(uniqueRatio * 100)}% unique)`);
    }

    // Analyze decision consistency
    const decisionConsistency = this.calculateDecisionConsistency(responses);
    if (decisionConsistency < 0.6) {
      variations.push('Inconsistent decisions or recommendations detected');
    }

    return variations.length > 0 ? variations : ['Responses show consistent patterns'];
  }

  /**
   * Perform enhanced fallback analysis when grader LLM fails
   * @param {Array} responses - All responses (including throttled)
   * @param {Object} config - Evaluation configuration
   * @param {Error} originalError - The error that caused fallback
   * @returns {Object} Fallback analysis result
   */
  performEnhancedFallbackAnalysis(responses, config, originalError) {
    console.log('Performing enhanced fallback analysis for', responses.length, 'responses');

    // Filter valid responses for analysis
    const validResponses = responses.filter(response => {
      if (typeof response === 'string') return response.trim().length > 0;
      return response && !response.wasAbandoned && response.text && response.text.trim().length > 0;
    });

    if (validResponses.length === 0) {
      return {
        grade: 'F',
        score: 0,
        reasoning: 'No valid responses available for analysis',
        metrics: {
          toolUsageConsistency: 0,
          decisionConsistency: 0,
          semanticSimilarity: 0,
          structureConsistency: 0,
          responseCount: responses.length,
          uniqueResponses: 0,
          exactMatches: 0
        },
        notable_variations: ['No valid responses to analyze'],
        isFallbackAnalysis: true,
        fallbackReason: originalError.message,
        responsesAnalyzed: 0,
        responsesExcluded: responses.length
      };
    }

    // Calculate enhanced metrics with tool usage priority
    const metrics = this.calculateEnhancedMetrics(validResponses);

    // Calculate overall score with tool usage as primary factor (50% weight)
    const overallScore = Math.round(
      (metrics.toolUsageConsistency * 0.5 +      // Tool usage is highest priority (50%)
        metrics.decisionConsistency * 0.3 +      // Decision consistency (30%)
        metrics.semanticSimilarity * 0.2) * 100  // Semantic similarity (20%)
    );

    // Determine grade based on tool usage focused scoring
    let grade;
    if (overallScore >= 90) grade = 'A';
    else if (overallScore >= 70) grade = 'B';
    else if (overallScore >= 50) grade = 'C';
    else if (overallScore >= 30) grade = 'D';
    else grade = 'F';

    // Generate analysis notes with tool usage priority
    const variations = [];

    // Tool usage variations (highest priority)
    const responsesWithToolData = validResponses.filter(r =>
      typeof r === 'object' && r.toolUsage
    );

    if (responsesWithToolData.length > 0) {
      const responsesWithTools = responsesWithToolData.filter(r => r.toolUsage.hasToolUsage);
      const toolUsageRate = responsesWithTools.length / responsesWithToolData.length;

      if (toolUsageRate > 0 && toolUsageRate < 1) {
        variations.push(`Mixed tool usage: ${responsesWithTools.length}/${responsesWithToolData.length} responses used tools`);
      }

      if (metrics.toolUsageConsistency < 0.8) {
        variations.push('Inconsistent tool usage patterns detected');
      }
    }

    // Response diversity (secondary)
    const responseTexts = validResponses.map(r =>
      typeof r === 'string' ? r.trim() : (r.text || '').trim()
    );
    const uniqueTexts = new Set(responseTexts);
    const uniqueRatio = uniqueTexts.size / responseTexts.length;

    if (uniqueRatio > 0.5) {
      variations.push(`High response diversity (${Math.round(uniqueRatio * 100)}% unique responses)`);
    }

    // Exact matches (informational)
    if (metrics.exactMatches > 0) {
      variations.push(`${metrics.exactMatches} exact duplicate responses found`);
    }

    return {
      grade,
      score: overallScore,
      reasoning: `Statistical analysis of ${validResponses.length} responses with tool usage priority. ${metrics.toolUsageConsistency >= 0.8 ? 'Good tool usage consistency suggests deterministic behavior.' :
        metrics.toolUsageConsistency >= 0.5 ? 'Moderate tool usage consistency with some variations.' :
          'Low tool usage consistency indicates non-deterministic behavior.'
        } Note: This is a simplified analysis due to grader LLM unavailability.`,
      metrics,
      notable_variations: variations.length > 0 ? variations : ['Responses show consistent patterns'],
      isFallbackAnalysis: true,
      fallbackReason: originalError.message,
      responsesAnalyzed: validResponses.length,
      responsesExcluded: responses.length - validResponses.length
    };
  }

  /**
   * Calculate statistical grade based on response patterns with tool usage priority
   * @param {Array<string|Object>} responses - Responses to analyze
   * @returns {string} Grade (A-F)
   */
  calculateStatisticalGrade(responses) {
    const metrics = this.calculateEnhancedMetrics(responses);

    // Tool usage consistency is primary factor
    const primaryScore = metrics.toolUsageConsistency * 0.5 +
      metrics.decisionConsistency * 0.3 +
      metrics.semanticSimilarity * 0.2;

    if (primaryScore >= 0.9) return 'A';
    if (primaryScore >= 0.7) return 'B';
    if (primaryScore >= 0.5) return 'C';
    if (primaryScore >= 0.3) return 'D';
    return 'F';
  }

  /**
   * Calculate statistical score based on response patterns with tool usage priority
   * @param {Array<string|Object>} responses - Responses to analyze
   * @returns {number} Score (0-100)
   */
  calculateStatisticalScore(responses) {
    const metrics = this.calculateEnhancedMetrics(responses);

    // Tool usage consistency is primary factor
    const primaryScore = metrics.toolUsageConsistency * 0.5 +
      metrics.decisionConsistency * 0.3 +
      metrics.semanticSimilarity * 0.2;

    return Math.round(primaryScore * 100);
  }
}

// Export singleton instance
export const graderService = new GraderService();
