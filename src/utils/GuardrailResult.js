/**
 * GuardrailResult class for managing guardrail evaluation results
 * Handles violation detection, formatting, and result analysis
 */
export class GuardrailResult {
  constructor(result = {}) {
    // Core result data from AWS ApplyGuardrail API
    this.action = result.action || 'NONE'; // GUARDRAIL_INTERVENED or NONE
    this.output = result.output || null; // Filtered content
    this.assessments = result.assessments || []; // Detailed assessment results
    this.usage = result.usage || null; // Token usage information

    // Metadata
    this.timestamp = result.timestamp || new Date().toISOString();
    this.guardrailId = result.guardrailId || null;
    this.guardrailName = result.guardrailName || null;
    this.source = result.source || 'INPUT'; // INPUT or OUTPUT
    this.originalContent = result.originalContent || null;

    // Processing metadata
    this.processingTime = result.processingTime || 0;
    this.evaluationId = result.evaluationId || this.generateEvaluationId();

    // Derived properties
    this.hasViolations = this.action === 'GUARDRAIL_INTERVENED';
    this.violationSummary = this.extractViolationSummary();
    this.violationCount = this.countViolations();
  }

  /**
   * Generate a unique evaluation ID
   * @returns {string} Unique evaluation ID
   */
  generateEvaluationId() {
    return `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if the guardrail evaluation resulted in violations
   * @returns {boolean} True if violations were detected
   */
  hasViolations() {
    return this.action === 'GUARDRAIL_INTERVENED';
  }

  /**
   * Get the filtered content from the guardrail evaluation
   * @returns {string|null} Filtered content or null if no filtering occurred
   */
  getFilteredContent() {
    if (this.output && this.output.length > 0) {
      // AWS returns output as an array of content blocks
      return this.output.map(block => {
        if (block.text) {
          return block.text;
        }
        return '';
      }).join('');
    }
    return null;
  }

  /**
   * Extract violation summary from assessments
   * @returns {Object} Violation summary with categorized violations
   */
  extractViolationSummary() {
    const summary = {
      contentPolicy: [],
      wordPolicy: [],
      sensitiveInformation: [],
      topicPolicy: [],
      totalViolatio0
    };

    if (!this.assessments || !Array.isArray(this.assessments)) {
      return summary;
    }

    this.assessments.forEach(assessment => {
      if (assessment.contentPolicy) {
        assessment.contentPolicy.filters?.forEach(filter => {
          if (filter.action === 'BLOCKED') {
            summary.contentPolicy.push({
              type: filter.type,
              confidence: filter.confidence,
              action: filter.action,
              message: this.getContentPolicyMessage(filter.type)
            });
            summary.totalViolations++;
          }
        });
      }

      if (assessment.wordPolicy) {
        assessment.wordPolicy.customWords?.forEach(word => {
          if (word.action === 'BLOCKED') {
            summary.wordPolicy.push({
              type: 'CUSTOM_WORD',
              match: word.match,
              action: word.action,
              message: `Blocked custom word: ${word.match}`
            });
            summary.totalViolations++;
          }
        });

        assessment.wordPolicy.managedWordLists?.forEach(list => {
          if (list.action === 'BLOCKED') {
            summary.wordPolicy.push({
              type: 'MANAGED_WORD_LIST',
              listType: list.type,
              match: list.match,
              action: list.action,
              message: `Blocked word from ${list.type} list: ${list.match}`
            });
            summary.totalViolations++;
          }
        });
      }

      if (assessment.sensitiveInformationPolicy) {
        assessment.sensitiveInformationPolicy.piiEntities?.forEach(entity => {
          if (entity.action === 'BLOCKED' || entity.action === 'ANONYMIZED') {
            summary.sensitiveInformation.push({
              type: 'PII_ENTITY',
              entityType: entity.type,
              match: entity.match,
              action: entity.action,
              message: `${entity.action === 'BLOCKED' ? 'Blocked' : 'Anonymized'} ${entity.type}: ${entity.match}`
            });
            summary.totalViolations++;
          }
        });

        assessment.sensitiveInformationPolicy.regexes?.forEach(regex => {
          if (regex.action === 'BLOCKED' || regex.action === 'ANONYMIZED') {
            summary.sensitiveInformation.push({
              type: 'REGEX_PATTERN',
              name: regex.name,
              match: regex.match,
              action: regex.action,
              message: `${regex.action === 'BLOCKED' ? 'Blocked' : 'Anonymized'} pattern "${regex.name}": ${regex.match}`
            });
            summary.totalViolations++;
          }
        });
      }

      if (assessment.topicPolicy) {
        assessment.topicPolicy.topics?.forEach(topic => {
          if (topic.action === 'BLOCKED') {
            summary.topicPolicy.push({
              type: 'TOPIC',
              name: topic.name,
              action: topic.action,
              confidence: topic.confidence,
              message: `Blocked topic: ${topic.name}`
            });
            summary.totalViolations++;
          }
        });
      }
    });

    return summary;
  }

  /**
   * Count total number of violations
   * @returns {number} Total violation count
   */
  countViolations() {
    return this.violationSummary.totalViolations;
  }

  /**
   * Get user-friendly message for content policy violations
   * @param {string} filterType - The content filter type
   * @returns {string} User-friendly message
   */
  getContentPolicyMessage(filterType) {
    const messages = {
      'SEXUAL': 'Content contains sexual material',
      'VIOLENCE': 'Content contains violent material',
      'HATE': 'Content contains hate speech',
      'INSULTS': 'Content contains insulting language',
      'MISCONDUCT': 'Content promotes misconduct',
      'PROMPT_ATTACK': 'Content appears to be a prompt injection attack'
    };

    return messages[filterType] || `Content violates ${filterType} policy`;
  }

  /**
   * Get detailed violation explanations
   * @returns {Array} Array of detailed violation explanations
   */
  getDetailedViolations() {
    const violations = [];

    // Content policy violations
    this.violationSummary.contentPolicy.forEach(violation => {
      violations.push({
        category: 'Content Policy',
        type: violation.type,
        severity: this.getSeverityFromConfidence(violation.confidence),
        message: violation.message,
        action: violation.action,
        recommendation: this.getContentPolicyRecommendation(violation.type)
      });
    });

    // Word policy violations
    this.violationSummary.wordPolicy.forEach(violation => {
      violations.push({
        category: 'Word Policy',
        type: violation.type,
        severity: 'HIGH',
        message: violation.message,
        action: violation.action,
        recommendation: 'Remove or replace the flagged word with appropriate alternatives'
      });
    });

    // Sensitive information violations
    this.violationSummary.sensitiveInformation.forEach(violation => {
      violations.push({
        category: 'Sensitive Information',
        type: violation.type,
        severity: 'HIGH',
        message: violation.message,
        action: violation.action,
        recommendation: violation.action === 'BLOCKED'
          ? 'Remove the sensitive information from your content'
          : 'The sensitive information has been automatically anonymized'
      });
    });

    // Topic policy violations
    this.violationSummary.topicPolicy.forEach(violation => {
      violations.push({
        category: 'Topic Policy',
        type: violation.type,
        severity: this.getSeverityFromConfidence(violation.confidence),
        message: violation.message,
        action: violation.action,
        recommendation: 'Modify your content to avoid discussing restricted topics'
      });
    });

    return violations;
  }

  /**
   * Convert confidence score to severity level
   * @param {number} confidence - Confidence score (0-1)
   * @returns {string} Severity level
   */
  getSeverityFromConfidence(confidence) {
    if (confidence >= 0.8) return 'HIGH';
    if (confidence >= 0.6) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get recommendation for content policy violations
   * @param {string} filterType - The content filter type
   * @returns {string} Recommendation message
   */
  getContentPolicyRecommendation(filterType) {
    const recommendations = {
      'SEXUAL': 'Remove sexual content and use appropriate, professional language',
      'VIOLENCE': 'Remove violent content and use non-threatening language',
      'HATE': 'Remove hate speech and use respectful, inclusive language',
      'INSULTS': 'Remove insulting language and use respectful communication',
      'MISCONDUCT': 'Remove content that promotes harmful or illegal activities',
      'PROMPT_ATTACK': 'Rephrase your request to avoid appearing like a prompt injection attempt'
    };

    return recommendations[filterType] || 'Modify your content to comply with content policies';
  }

  /**
   * Get a summary of the evaluation result
   * @returns {Object} Result summary
   */
  getSummary() {
    return {
      evaluationId: this.evaluationId,
      guardrailId: this.guardrailId,
      guardrailName: this.guardrailName,
      timestamp: this.timestamp,
      source: this.source,
      hasViolations: this.hasViolations,
      action: this.action,
      violationCount: this.violationCount,
      processingTime: this.processingTime,
      categories: {
        contentPolicy: this.violationSummary.contentPolicy.length,
        wordPolicy: this.violationSummary.wordPolicy.length,
        sensitiveInformation: this.violationSummary.sensitiveInformation.length,
        topicPolicy: this.violationSummary.topicPolicy.length
      },
      usage: this.usage ? {
        inputTokens: this.usage.inputTokens || 0,
        outputTokens: this.usage.outputTokens || 0
      } : null
    };
  }

  /**
   * Get formatted result for display
   * @returns {Object} Formatted result for UI display
   */
  getFormattedResult() {
    const result = {
      success: !this.hasViolations,
      action: this.action,
      message: this.hasViolations
        ? `Guardrail detected ${this.violationCount} violation(s)`
        : 'Content passed all guardrail checks',
      violations: this.getDetailedViolations(),
      filteredContent: this.getFilteredContent(),
      originalContent: this.originalContent,
      metadata: {
        evaluationId: this.evaluationId,
        timestamp: this.timestamp,
        processingTime: this.processingTime,
        guardrailId: this.guardrailId,
        guardrailName: this.guardrailName,
        source: this.source
      }
    };

    if (this.usage) {
      result.metadata.usage = this.usage;
    }

    return result;
  }

  /**
   * Create GuardrailResult from AWS ApplyGuardrail response
   * @param {Object} awsResponse - AWS ApplyGuardrail API response
   * @param {Object} metadata - Additional metadata (guardrailId, originalContent, etc.)
   * @returns {GuardrailResult} New GuardrailResult instance
   */
  static fromAWSResponse(awsResponse, metadata = {}) {
    return new GuardrailResult({
      action: awsResponse.action,
      output: awsResponse.output,
      assessments: awsResponse.assessments,
      usage: awsResponse.usage,
      guardrailId: metadata.guardrailId,
      guardrailName: metadata.guardrailName,
      source: metadata.source || 'INPUT',
      originalContent: metadata.originalContent,
      processingTime: metadata.processingTime || 0
    });
  }

  /**
   * Create multiple GuardrailResult instances from multiple evaluations
   * @param {Array} awsResponses - Array of AWS ApplyGuardrail responses
   * @param {Object} metadata - Shared metadata
   * @returns {Array<GuardrailResult>} Array of GuardrailResult instances
   */
  static fromMultipleAWSResponses(awsResponses, metadata = {}) {
    if (!Array.isArray(awsResponses)) {
      return [];
    }

    return awsResponses.map((response, index) =>
      GuardrailResult.fromAWSResponse(response, {
        ...metadata,
        evaluationIndex: index
      })
    );
  }

  /**
   * Combine multiple guardrail results into a single summary
   * @param {Array<GuardrailResult>} results - Array of GuardrailResult instances
   * @returns {Object} Combined result summary
   */
  static combineResults(results) {
    if (!Array.isArray(results) || results.length === 0) {
      return {
        hasViolations: false,
        totalViolations: 0,
        results: [],
        summary: 'No guardrail evaluations performed'
      };
    }

    const combined = {
      hasViolations: results.some(r => r.hasViolations),
      totalViolations: results.reduce((sum, r) => sum + r.violationCount, 0),
      results: results.map(r => r.getSummary()),
      categories: {
        contentPolicy: 0,
        wordPolicy: 0,
        sensitiveInformation: 0,
        topicPolicy: 0
      },
      evaluationCount: results.length,
      timestamp: new Date().toISOString()
    };

    // Aggregate category counts
    results.forEach(result => {
      combined.categories.contentPolicy += result.violationSummary.contentPolicy.length;
      combined.categories.wordPolicy += result.violationSummary.wordPolicy.length;
      combined.categories.sensitiveInformation += result.violationSummary.sensitiveInformation.length;
      combined.categories.topicPolicy += result.violationSummary.topicPolicy.length;
    });

    // Generate summary message
    if (combined.hasViolations) {
      combined.summary = `${combined.totalViolations} violation(s) detected across ${combined.evaluationCount} guardrail(s)`;
    } else {
      combined.summary = `Content passed all ${combined.evaluationCount} guardrail check(s)`;
    }

    return combined;
  }

  /**
   * Export result data for storage or transmission
   * @returns {Object} Exportable result data
   */
  toJSON() {
    return {
      action: this.action,
      output: this.output,
      assessments: this.assessments,
      usage: this.usage,
      timestamp: this.timestamp,
      guardrailId: this.guardrailId,
      guardrailName: this.guardrailName,
      source: this.source,
      originalContent: this.originalContent,
      processingTime: this.processingTime,
      evaluationId: this.evaluationId,
      hasViolations: this.hasViolations,
      violationSummary: this.violationSummary,
      violationCount: this.violationCount
    };
  }
}
