/**
 * Bedrock guardrail configuration and result parsing
 */
export class GuardrailManager {
  /**
   * Format guardrail configuration for Bedrock API
   */
  formatGuardrailConfigForAPI(guardrailConfig) {
    if (!guardrailConfig) return null;

    console.log('[GuardrailManager] Formatting guardrail config:', guardrailConfig);

    const formatted = {
      guardrailIdentifier: guardrailConfig.guardrailIdentifier || guardrailConfig.guardrailId,
      guardrailVersion: guardrailConfig.guardrailVersion || guardrailConfig.version || 'DRAFT'
    };

    console.log('[GuardrailManager] Formatted guardrail config:', formatted);
    return formatted;
  }

  /**
   * Parse guardrail results from Bedrock response
   */
  parseGuardrailResults(response) {
    console.log('[GuardrailManager v2] Parsing guardrail results from response:', {
      stopReason: response.stopReason,
      hasTrace: !!response.trace,
      hasGuardrailTrace: !!response.trace?.guardrail
    });

    if (!response.output?.message?.content) {
      console.log('[GuardrailManager] No message content in response');
      return { hasViolations: false, violations: [], outputText: null };
    }

    // Check if guardrail intervened based on stopReason
    const guardrailIntervened = response.stopReason === 'guardrail_intervened';
    console.log('[GuardrailManager] Guardrail intervened (stopReason):', guardrailIntervened);

    const guardrailTrace = response.trace?.guardrail;
    console.log('[GuardrailManager] Guardrail trace:', guardrailTrace);

    // If no trace but stopReason indicates intervention, create basic result
    if (!guardrailTrace && guardrailIntervened) {
      console.log('[GuardrailManager] No trace found but stopReason indicates intervention');
      return {
        hasViolations: true,
        action: 'INTERVENED',
        violations: [{
          type: 'guardrail_policy',
          category: 'content_blocked',
          action: 'BLOCKED',
          message: 'Content was blocked by guardrail policy',
          guardrailIndex: 0
        }],
        outputText: response.output.message.content[0]?.text || null
      };
    }

    if (!guardrailTrace) {
      console.log('[GuardrailManager] No guardrail trace found and no intervention');
      return { hasViolations: false, violations: [], outputText: null };
    }

    const violations = [];
    let hasViolations = false;
    let outputText = null;

    // Check for guardrail intervention
    if (guardrailTrace.action === 'INTERVENED') {
      hasViolations = true;
      console.log('[GuardrailManager] Guardrail intervened');

      // Extract output text if available
      if (guardrailTrace.outputs && guardrailTrace.outputs.length > 0) {
        outputText = guardrailTrace.outputs[0].text;
        console.log('[GuardrailManager] Guardrail output text:', outputText);
      }

      // Parse input assessments
      if (guardrailTrace.inputAssessments) {
        const inputViolations = this.parseAssessments(guardrailTrace.inputAssessments, 'input');
        violations.push(...inputViolations);
      }

      // Parse output assessments
      if (guardrailTrace.outputAssessments) {
        const outputViolations = this.parseAssessments(guardrailTrace.outputAssessments, 'output');
        violations.push(...outputViolations);
      }
    }

    console.log('[GuardrailManager] Final guardrail results:', {
      hasViolations,
      violationCount: violations.length,
      outputText
    });

    return {
      hasViolations,
      violations,
      outputText,
      action: guardrailTrace.action,
      trace: guardrailTrace
    };
  }

  /**
   * Parse guardrail assessments into violation objects
   */
  parseAssessments(assessments, type) {
    const violations = [];

    for (let guardrailIndex = 0; guardrailIndex < assessments.length; guardrailIndex++) {
      const assessment = assessments[guardrailIndex];
      const guardrailPrefix = `[${type.toUpperCase()}] `;

      if (assessment.contentPolicy) {
        for (const filter of assessment.contentPolicy.filters || []) {
          violations.push({
            type: 'content_policy',
            category: filter.type,
            confidence: filter.confidence,
            action: filter.action,
            message: `${guardrailPrefix}${filter.type} content detected (${filter.confidence} confidence)`,
            guardrailIndex: guardrailIndex
          });
        }
      }

      if (assessment.wordPolicy) {
        for (const match of assessment.wordPolicy.customWords || []) {
          violations.push({
            type: 'word_policy',
            category: 'custom_words',
            match: match.match,
            action: 'BLOCKED',
            message: `${guardrailPrefix}Blocked word detected: ${match.match}`,
            guardrailIndex: guardrailIndex
          });
        }

        for (const match of assessment.wordPolicy.managedWordLists || []) {
          violations.push({
            type: 'word_policy',
            category: 'managed_list',
            match: match.match,
            action: 'BLOCKED',
            message: `${guardrailPrefix}Profanity detected: ${match.match}`,
            guardrailIndex: guardrailIndex
          });
        }
      }

      if (assessment.sensitiveInformationPolicy) {
        for (const pii of assessment.sensitiveInformationPolicy.piiEntities || []) {
          violations.push({
            type: 'pii_policy',
            category: pii.type,
            match: pii.match,
            action: pii.action,
            message: `${guardrailPrefix}${pii.type} detected and ${pii.action.toLowerCase()}`,
            guardrailIndex: guardrailIndex
          });
        }

        for (const regex of assessment.sensitiveInformationPolicy.regexes || []) {
          violations.push({
            type: 'regex_policy',
            category: regex.name,
            match: regex.match,
            action: regex.action,
            message: `${guardrailPrefix}Pattern "${regex.name}" matched and ${regex.action.toLowerCase()}`,
            guardrailIndex: guardrailIndex
          });
        }
      }

      if (assessment.topicPolicy) {
        for (const topic of assessment.topicPolicy.topics || []) {
          violations.push({
            type: 'topic_policy',
            category: topic.name,
            action: topic.action,
            message: `${guardrailPrefix}Topic "${topic.name}" violation detected`,
            guardrailIndex: guardrailIndex
          });
        }
      }
    }

    return violations;
  }
}
