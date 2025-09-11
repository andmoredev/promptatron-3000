/**
 * Service for grading determinism evaluation responses using LLM
 * Handles grader prompt generation, response parsing, and fallback analysis
 */

import { bedrockService } from './bedrockService.js';
import { analyzeError } from '../utils/errorHandling.js';

/**
 * Default grader system prompt template with placeholder for user customization
 */
export const GRADER_SYSTEM_PROMPT = `ROLE: You are an evaluation engine that grades the determinism of an LLM system-prompt & user-prompt combo across multiple repeated runs.

GOAL: Output a single letter grade (A-F) for determinism, plus concise evidence. Determinism = how consistently the model makes the same decisions and meaning under identical settings.

Do not use outside knowledge. Judge only with the data provided.

INPUTS
---
* context: optional task/ground-truth notes (what success means).
* runs[]: array of runs in random order

NORMALIZATION
---

1. Trim whitespace; collapse multiple spaces/newlines.
2. Lowercase for exact-match checks (keep originals for reporting).
3. Ignore volatile substrings (timestamps, UUIDs, request IDs)

COMPARISON RULES IN ORDER OF IMPORTANCE
---
1. Action/Decision Consistency
   * Same tools called? Same order? Same arguments after normalization?
   * If no tools: same structured decisions (e.g., same "freeze account: yes/no").
2. Semantic Equivalence
   * Are the answers meaning-equivalent given context?
   * Treat paraphrases and rephrasings as equivalent if they preserve all task-relevant facts and directives.
3. Schema/Structure Consistency
   * JSON/object shape identical? All required fields present? Types stable?

SCORING METHOD
---

Compare each run to a reference (the first normalized run) and compute majority consistency across all pairs when helpful. Tally these rates:

* decision_consistency_rate - % of runs with identical decisions/tool sequences & normalized args
* structure_consistency_rate - % with identical schema/object shape
* semantic_equivalence_rate - % meaning-equivalent given context
* exact_text_rate - % exact matches after normalization

Also record the worst deviation you observe (e.g., tool skipped/added, field missing, contradictory instruction).

GRADE DEFINITIONS
---

* A (Very High):
  decision_consistency_rate ≥ 0.98 AND structure_consistency_rate ≥ 0.98 AND semantic_equivalence_rate ≥ 0.98.
  Text may vary slightly; numbers may differ within tolerances in <2%
* B (High):
  All three rates ≥ 0.95, no contradictory decisions; variations are paraphrases or harmless ordering.
* C (Moderate):
  All three rates ≥ 0.85; occasional minor structural drift (optional fields), no harmful decision flips.
* D (Low):
  Any of the three rates ≥ 0.60 and < 0.85; noticeable decision or structure drift, intermittent schema failures.
* F (Unstable):
  Any rate < 0.60 or any harmful decision flip (e.g., tool call yes/no toggles), missing critical fields, or contradictions.

OUTPUT FORMAT - STRICT JSON
---

Return **only** this JSON object:

{
  "grade": "A|B|C|D|F",
  "metrics": {
    "decision_consistency_rate": 0.0,
    "structure_consistency_rate": 0.0,
    "semantic_equivalence_rate": 0.0,
    "exact_text_rate": 0.0,
    "n_runs": 0
  },
  "notable_variations": [
    "short bullet on the most significant inconsistency, if any"
  ],
  "notes": "≤300 chars explaining the grade boundaries crossed or not"
}

PROCEDURE
---

1. Normalize all runs (apply rules above).
2. For each run, compute:

   * same decision signature? (boolean)
   * same structure? (boolean)
   * meaning-equivalent given context? (boolean)
   * exact-text match? (boolean)
3. Aggregate rates; assign grade using the thresholds.
4. Emit JSON exactly as specified.

GUARDRAILS
---

* Temperature of your grading is conceptually 0: be strict and repeatable.
* No chain-of-thought; include only short factual notes.
* Don't invent facts; judge only from inputs.
`;

/**
 * Grader service class for determinism evaluation
 */
export class GraderService {
  constructor() {
    this.defaultGraderModel = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    this.fallbackGraderModel = 'amazon.nova-pro-v1:0';
    this.maxResponsesPerRequest = 30;
    this.maxPromptLength = 100000;
  }

  /**
   * Grade responses using grader LLM
   * @param {Array<string>} responses - Array of responses to grade
   * @param {Object} config - Evaluation configuration
   * @param {string} customGraderPrompt - Optional custom grader prompt
   * @returns {Promise<Object>} Grading result with grade, score, reasoning, and variance
   */
  async gradeResponses(responses, config) {


    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      throw new Error('No responses provided for grading');
    }

    try {
      // Prepare grader prompt
      const graderPrompt = this.buildGraderPrompt(responses);

      // Use Nova Pro only (reliable and good for reasoning)
      const graderResult = await this.invokeGrader('amazon.nova-pro-v1:0', graderPrompt);

      // Parse grader response
      const parsedResult = this.parseGraderResponse(graderResult.text, responses, config);

      return {
        ...parsedResult,
        graderModel: graderResult.graderModel,
        graderUsage: graderResult.usage,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Grading failed completely, using fallback analysis:', error);
      return this.performFallbackAnalysis(responses, config, error);
    }
  }

  /**
   * Build the complete grader prompt with responses
   * @param {Array<string>} responses - Responses to analyze
   * @param {Object} config - Evaluation configuration
   * @param {string} customGraderPrompt - Custom grader prompt
   * @returns {string} Complete grader prompt
   */
  buildGraderPrompt(responses) {
    const prompt = `Determine the level of determinism in these ${responses.length} responses: ${responses.map((r, index) => {
      return `\n--- Response ${index + 1} --- \n${r}`;
    }).join('\n')}`;

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
   * Parse grader LLM response to extract structured results
   * @param {string} graderResponse - Raw grader response
   * @param {Array<string>} responses - Original responses for fallback calculation
   * @param {Object} config - Evaluation configuration
   * @returns {Object} Parsed grading result
   */
  parseGraderResponse(graderResponse, responses, config) {
    if (!graderResponse || typeof graderResponse !== 'string') {
      throw new Error('Invalid grader response: empty or non-string response');
    }

    try {
      // Try to extract JSON from the response
      console.log('Raw grader response:', graderResponse);
      const jsonMatch = this.extractJsonFromResponse(graderResponse);
      console.log('Extracted JSON:', jsonMatch);

      if (!jsonMatch) {
        throw new Error('No valid JSON found in grader response');
      }

      const parsed = JSON.parse(jsonMatch);
      console.log('Parsed grader JSON:', parsed);

      // Validate required fields
      const validatedResult = this.validateGraderResult(parsed, responses, config);
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
        return this.parseGraderResponseFallback(graderResponse, responses, config);
      } catch (fallbackError) {
        console.warn('All parsing methods failed, using statistical analysis');
        return this.performFallbackAnalysis(responses, config, parseError);
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
      variance: this.calculateStatisticalVariance(responses),
      parseMethod: 'regex_fallback',
      rawResponse: response,
      fallbackAnalysis: !gradeMatch && !scoreMatch // Set fallback flag if no regex matches
    };
  }

  /**
   * Validate and sanitize grader result
   * @param {Object} result - Parsed grader result
   * @param {Array<string>} responses - Original responses
   * @param {Object} config - Evaluation configuration
   * @returns {Object} Validated result
   */
  validateGraderResult(result, responses, config) {
    const validated = {};

    // Validate grade
    if (result.grade && typeof result.grade === 'string' && /^[A-F]$/.test(result.grade.toUpperCase())) {
      validated.grade = result.grade.toUpperCase();
    } else {
      validated.grade = this.calculateStatisticalGrade(responses);
    }

    // Validate score
    if (typeof result.score === 'number' && result.score >= 0 && result.score <= 100) {
      validated.score = Math.round(result.score);
    } else {
      validated.score = this.calculateStatisticalScore(responses);
    }

    // Validate reasoning (keep for backward compatibility)
    if (result.reasoning && typeof result.reasoning === 'string' && result.reasoning.trim().length > 0) {
      validated.reasoning = result.reasoning.trim();
    } else {
      validated.reasoning = `Evaluated ${responses.length} responses with ${validated.grade} grade (${validated.score}% consistency)`;
    }

    // Validate variance object
    if (result.variance && typeof result.variance === 'object') {
      validated.variance = this.validateVarianceObject(result.variance, responses);
    } else {
      validated.variance = this.calculateStatisticalVariance(responses);
    }

    // Validate metrics object (new grader format)
    if (result.metrics && typeof result.metrics === 'object') {
      validated.metrics = {
        decision_consistency_rate: typeof result.metrics.decision_consistency_rate === 'number' ? result.metrics.decision_consistency_rate : 0,
        structure_consistency_rate: typeof result.metrics.structure_consistency_rate === 'number' ? result.metrics.structure_consistency_rate : 0,
        semantic_equivalence_rate: typeof result.metrics.semantic_equivalence_rate === 'number' ? result.metrics.semantic_equivalence_rate : 0,
        exact_text_rate: typeof result.metrics.exact_text_rate === 'number' ? result.metrics.exact_text_rate : 0,
        n_runs: typeof result.metrics.n_runs === 'number' ? result.metrics.n_runs : responses.length
      };
    }

    // Validate notable variations
    if (result.notable_variations && Array.isArray(result.notable_variations)) {
      validated.notable_variations = result.notable_variations.filter(v => typeof v === 'string' && v.trim().length > 0);
    }

    // Validate notes - prioritize 'notes' field, fallback to 'reasoning' for important LLM analysis
    if (result.notes && typeof result.notes === 'string' && result.notes.trim().length > 0) {
      validated.notes = result.notes.trim();
    } else if (result.reasoning && typeof result.reasoning === 'string' && result.reasoning.trim().length > 0) {
      // Map reasoning to notes since that's where the important LLM analysis is
      validated.notes = result.reasoning.trim();
    }

    return validated;
  }

  /**
   * Validate variance object from grader response
   * @param {Object} variance - Variance object from grader
   * @param {Array<string>} responses - Original responses
   * @returns {Object} Validated variance object
   */
  validateVarianceObject(variance, responses) {
    const statistical = this.calculateStatisticalVariance(responses);

    return {
      responseCount: typeof variance.responseCount === 'number' ? variance.responseCount : statistical.responseCount,
      uniqueResponses: typeof variance.uniqueResponses === 'number' ? variance.uniqueResponses : statistical.uniqueResponses,
      averageLength: typeof variance.averageLength === 'number' ? Math.round(variance.averageLength) : statistical.averageLength,
      lengthVariance: typeof variance.lengthVariance === 'number' ? Math.round(variance.lengthVariance * 100) / 100 : statistical.lengthVariance,
      semanticSimilarity: typeof variance.semanticSimilarity === 'number' ? Math.round(variance.semanticSimilarity * 100) / 100 : statistical.semanticSimilarity,
      actionConsistency: typeof variance.actionConsistency === 'number' ? Math.round(variance.actionConsistency * 100) / 100 : statistical.actionConsistency
    };
  }

  /**
   * Perform fallback statistical analysis when grader LLM is unavailable
   * @param {Array<string>} responses - Responses to analyze
   * @param {Object} config - Evaluation configuration
   * @param {Error} originalError - Original error that caused fallback
   * @returns {Object} Statistical analysis result
   */
  performFallbackAnalysis(responses, config, originalError = null) {
    console.log('Performing fallback statistical analysis for determinism evaluation');

    const variance = this.calculateStatisticalVariance(responses);
    const score = this.calculateStatisticalScore(responses);
    const grade = this.calculateStatisticalGrade(responses);

    let reasoning = `Statistical analysis of ${responses.length} responses. `;
    reasoning += `Found ${variance.uniqueResponses} unique variations. `;
    reasoning += `Average length: ${variance.averageLength} characters. `;
    reasoning += `Length variance: ${variance.lengthVariance}. `;

    if (originalError) {
      reasoning += `Note: Grader LLM was unavailable (${originalError.message}), so this analysis is based on statistical measures only.`;
    } else {
      reasoning += 'Analysis based on response length and uniqueness patterns.';
    }

    return {
      grade,
      score,
      reasoning,
      variance,
      fallbackAnalysis: true,
      originalError: originalError?.message,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate statistical variance metrics
   * @param {Array<string>} responses - Responses to analyze
   * @returns {Object} Variance metrics
   */
  calculateStatisticalVariance(responses) {
    const responseCount = responses.length;
    const uniqueResponses = new Set(responses.map(r => r.trim())).size;

    const lengths = responses.map(r => r.length);
    const averageLength = Math.round(lengths.reduce((sum, len) => sum + len, 0) / lengths.length);

    const lengthVariance = Math.round(Math.sqrt(
      lengths.reduce((sum, len) => sum + Math.pow(len - averageLength, 2), 0) / lengths.length
    ) * 100) / 100;

    // Simple heuristics for semantic similarity and action consistency
    const uniquenessRatio = uniqueResponses / responseCount;
    const semanticSimilarity = Math.round((1 - uniquenessRatio) * 100) / 100;
    const actionConsistency = Math.round((1 - (uniquenessRatio * 0.8)) * 100) / 100;

    return {
      responseCount,
      uniqueResponses,
      averageLength,
      lengthVariance,
      semanticSimilarity: Math.max(0, Math.min(1, semanticSimilarity)),
      actionConsistency: Math.max(0, Math.min(1, actionConsistency))
    };
  }

  /**
   * Calculate statistical score based on response consistency
   * @param {Array<string>} responses - Responses to analyze
   * @returns {number} Consistency score (0-100)
   */
  calculateStatisticalScore(responses) {
    const uniqueResponses = new Set(responses.map(r => r.trim())).size;
    const consistencyRatio = 1 - ((uniqueResponses - 1) / responses.length);
    return Math.round(Math.max(0, Math.min(100, consistencyRatio * 100)));
  }

  /**
   * Calculate statistical grade based on score
   * @param {Array<string>} responses - Responses to analyze
   * @returns {string} Letter grade (A-F)
   */
  calculateStatisticalGrade(responses) {
    const score = this.calculateStatisticalScore(responses);

    if (score >= 90) return 'A';
    if (score >= 70) return 'B';
    if (score >= 50) return 'C';
    if (score >= 30) return 'D';
    return 'F';
  }

  /**
   * Get grader prompt template for user customization
   * @returns {string} Grader prompt template
   */
  getGraderPromptTemplate() {
    return DEFAULT_GRADER_PROMPT;
  }

  /**
   * Validate custom grader prompt
   * @param {string} customPrompt - Custom grader prompt to validate
   * @returns {Object} Validation result
   */
  validateCustomGraderPrompt(customPrompt) {
    if (!customPrompt || typeof customPrompt !== 'string') {
      return { isValid: true, warnings: [] };
    }

    const warnings = [];

    if (customPrompt.length > 5000) {
      warnings.push('Custom prompt is very long and may cause grader requests to fail');
    }

    if (customPrompt.toLowerCase().includes('json') && !customPrompt.includes('{')) {
      warnings.push('Custom prompt mentions JSON but may not provide proper format example');
    }

    return {
      isValid: true,
      warnings
    };
  }
}

// Export singleton instance
export const graderService = new GraderService();
