/**
 * GuardrailSchemaTranslator Service
 *
 * Translates simplified guardrail schema format to AWS CreateGuardrailCommand format
 * and provides validation for simplified schema configurations.
 */

/**
 * Service for translating simplified guardrail schemas to AWS format
 */
export class GuardrailSchemaTranslator {

  /**
   * Translates simplified schema to AWS CreateGuardrailCommand format
   * @param {Object} simplifiedConfig - The simplified guardrail configuration
   * @param {string} scenarioName - The scenario name for tagging
   * @returns {Object} AWS CreateGuardrailCommand format configuration
   */
  static translateToAWSFormat(simplifiedConfig, scenarioName) {
    const awsConfig = {
      name: simplifiedConfig.name || `${scenarioName}-guardrail`,
      description: simplifiedConfig.description || `Guardrail for ${scenarioName} scenario`,
      tags: [
        { key: 'source', value: 'promptatron' },
        { key: 'scenario', value: scenarioName }
      ]
    };

    // Add blocked messaging
    if (simplifiedConfig.blockedMessages) {
      awsConfig.blockedInputMessaging = simplifiedConfig.blockedMessages.input;
      awsConfig.blockedOutputsMessaging = simplifiedConfig.blockedMessages.output;
    }

    // Translate topic policy
    if (simplifiedConfig.topicPolicy) {
      awsConfig.topicPolicyConfig = this.translateTopicPolicy(simplifiedConfig.topicPolicy);
    }

    // Translate content policy
    if (simplifiedConfig.contentPolicy) {
      awsConfig.contentPolicyConfig = this.translateContentPolicy(simplifiedConfig.contentPolicy);
    }

    // Translate word policy
    if (simplifiedConfig.wordPolicy) {
      awsConfig.wordPolicyConfig = this.translateWordPolicy(simplifiedConfig.wordPolicy);
    }

    // Translate sensitive information policy
    if (simplifiedConfig.sensitiveInformationPolicy) {
      awsConfig.sensitiveInformationPolicyConfig = this.translateSensitiveInformationPolicy(
        simplifiedConfig.sensitiveInformationPolicy
      );
    }

    // Translate contextual grounding policy
    if (simplifiedConfig.contextualGroundingPolicy) {
      awsConfig.contextualGroundingPolicyConfig = this.translateContextualGroundingPolicy(
        simplifiedConfig.contextualGroundingPolicy
      );
    }

    return awsConfig;
  }

  /**
   * Translates topic policy to AWS format
   * @param {Object} topicPolicy - Simplified topic policy configuration
   * @returns {Object} AWS topic policy configuration
   */
  static translateTopicPolicy(topicPolicy) {
    return {
      topicsConfig: [
        {
          name: 'restricted-topics',
          definition: topicPolicy.definition,
          examples: topicPolicy.examples || [],
          type: 'DENY',
          inputAction: 'BLOCK',
          outputAction: 'BLOCK',
          inputEnabled: true,
          outputEnabled: true
        }
      ],
      tierConfig: {
        tierName: 'CLASSIC'
      }
    };
  }

  /**
   * Translates content policy to AWS format
   * @param {Object} contentPolicy - Simplified content policy configuration
   * @returns {Object} AWS content policy configuration
   *
   * Note: AWS requires PROMPT_ATTACK filters to have NONE output strength.
   * This is automatically enforced regardless of the configured output strength.
   */
  static translateContentPolicy(contentPolicy) {
    const filtersConfig = contentPolicy.filters.map(filterType => {
      const inputConfig = contentPolicy.input || {};
      const outputConfig = contentPolicy.output || {};

      // AWS requirement: PROMPT_ATTACK filter must have NONE output strength
      const outputStrength = filterType === 'PROMPT_ATTACK'
        ? 'NONE'
        : (outputConfig.strength || 'LOW');

      return {
        type: filterType,
        inputStrength: inputConfig.strength || 'HIGH',
        outputStrength: outputStrength,
        inputModalities: ['TEXT'],
        outputModalities: ['TEXT'],
        inputAction: inputConfig.action || 'BLOCK',
        outputAction: outputConfig.action || 'NONE',
        inputEnabled: true,
        outputEnabled: true
      };
    });

    return {
      filtersConfig,
      tierConfig: {
        tierName: 'CLASSIC'
      }
    };
  }

  /**
   * Translates word policy to AWS format
   * @param {Object} wordPolicy - Simplified word policy configuration
   * @returns {Object} AWS word policy configuration
   */
  static translateWordPolicy(wordPolicy) {
    const config = {};

    // Handle managed word lists
    if (wordPolicy.managedLists) {
      config.managedWordListsConfig = wordPolicy.managedLists.map(listType => ({
        type: listType,
        inputAction: wordPolicy.input?.action || 'BLOCK',
        outputAction: wordPolicy.output?.action || 'NONE',
        inputEnabled: true,
        outputEnabled: true
      }));
    }

    // Handle custom words
    if (wordPolicy.words) {
      config.wordsConfig = wordPolicy.words.map(word => ({
        text: word,
        inputAction: wordPolicy.input?.action || 'BLOCK',
        outputAction: wordPolicy.output?.action || 'NONE',
        inputEnabled: true,
        outputEnabled: true
      }));
    }

    return config;
  }

  /**
   * Translates sensitive information policy to AWS format
   * @param {Object} sensitiveInfoPolicy - Simplified sensitive information policy configuration
   * @returns {Object} AWS sensitive information policy configuration
   */
  static translateSensitiveInformationPolicy(sensitiveInfoPolicy) {
    const config = {};

    // Handle PII entities
    if (sensitiveInfoPolicy.pii) {
      config.piiEntitiesConfig = sensitiveInfoPolicy.pii.map(piiType => ({
        type: piiType,
        action: 'NONE', // Default to NONE, rely on input/output actions
        inputAction: sensitiveInfoPolicy.input?.action || 'BLOCK',
        outputAction: sensitiveInfoPolicy.output?.action || 'ANONYMIZE',
        inputEnabled: true,
        outputEnabled: true
      }));
    }

    // Handle regex patterns
    if (sensitiveInfoPolicy.regexes) {
      config.regexesConfig = sensitiveInfoPolicy.regexes.map(regex => ({
        name: regex.name,
        description: regex.description || `Custom pattern: ${regex.name}`,
        pattern: regex.pattern,
        action: 'NONE', // Default to NONE, rely on input/output actions
        inputAction: sensitiveInfoPolicy.input?.action || 'BLOCK',
        outputAction: sensitiveInfoPolicy.output?.action || 'ANONYMIZE',
        inputEnabled: true,
        outputEnabled: true
      }));
    }

    return config;
  }

  /**
   * Translates contextual grounding policy to AWS format
   * @param {Object} groundingPolicy - Simplified contextual grounding policy configuration
   * @returns {Object} AWS contextual grounding policy configuration
   */
  static translateContextualGroundingPolicy(groundingPolicy) {
    const filtersConfig = [];

    // Add grounding filter if threshold specified
    if (groundingPolicy.groundingThreshold !== undefined) {
      filtersConfig.push({
        type: 'GROUNDING',
        threshold: groundingPolicy.groundingThreshold,
        action: 'BLOCK',
        enabled: true
      });
    }

    // Add relevance filter if threshold specified
    if (groundingPolicy.relevanceThreshold !== undefined) {
      filtersConfig.push({
        type: 'RELEVANCE',
        threshold: groundingPolicy.relevanceThreshold,
        action: 'BLOCK',
        enabled: true
      });
    }

    return {
      filtersConfig
    };
  }

  /**
   * Validates simplified schema structure
   * @param {Object} config - The simplified guardrail configuration
   * @returns {Object} Validation result with isValid and errors array
   */
  static validateSimplifiedSchema(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
      errors.push('Configuration must be an object');
      return { isValid: false, errors };
    }

    // Validate topic policy
    if (config.topicPolicy) {
      const topicErrors = this.validateTopicPolicy(config.topicPolicy);
      errors.push(...topicErrors);
    }

    // Validate content policy
    if (config.contentPolicy) {
      const contentErrors = this.validateContentPolicy(config.contentPolicy);
      errors.push(...contentErrors);
    }

    // Validate word policy
    if (config.wordPolicy) {
      const wordErrors = this.validateWordPolicy(config.wordPolicy);
      errors.push(...wordErrors);
    }

    // Validate sensitive information policy
    if (config.sensitiveInformationPolicy) {
      const piiErrors = this.validateSensitiveInformationPolicy(config.sensitiveInformationPolicy);
      errors.push(...piiErrors);
    }

    // Validate contextual grounding policy
    if (config.contextualGroundingPolicy) {
      const groundingErrors = this.validateContextualGroundingPolicy(config.contextualGroundingPolicy);
      errors.push(...groundingErrors);
    }

    // Validate blocked messages
    if (config.blockedMessages) {
      const blockedErrors = this.validateBlockedMessages(config.blockedMessages);
      errors.push(...blockedErrors);
    }

    // Validate that at least one policy is configured
    const hasPolicies = !!(
      config.topicPolicy ||
      config.contentPolicy ||
      config.wordPolicy ||
      config.sensitiveInformationPolicy ||
      config.contextualGroundingPolicy
    );

    if (!hasPolicies) {
      errors.push('At least one policy configuration (topic, content, word, sensitive information, or contextual grounding) is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates topic policy configuration
   * @param {Object} topicPolicy - Topic policy configuration
   * @returns {Array} Array of error messages
   */
  static validateTopicPolicy(topicPolicy) {
    const errors = [];

    if (!topicPolicy || typeof topicPolicy !== 'object') {
      errors.push('topicPolicy must be an object');
      return errors;
    }

    if (!topicPolicy.definition || typeof topicPolicy.definition !== 'string' || !topicPolicy.definition.trim()) {
      errors.push('topicPolicy.definition is required and must be a non-empty string');
    }

    if (topicPolicy.examples !== undefined) {
      if (!Array.isArray(topicPolicy.examples)) {
        errors.push('topicPolicy.examples must be an array if provided');
      } else {
        topicPolicy.examples.forEach((example, index) => {
          if (typeof example !== 'string' || !example.trim()) {
            errors.push(`topicPolicy.examples[${index}] must be a non-empty string`);
          }
        });
      }
    }

    return errors;
  }

  /**
   * Validates content policy configuration
   * @param {Object} contentPolicy - Content policy configuration
   * @returns {Array} Array of error messages
   */
  static validateContentPolicy(contentPolicy) {
    const errors = [];

    if (!contentPolicy || typeof contentPolicy !== 'object') {
      errors.push('contentPolicy must be an object');
      return errors;
    }

    if (!Array.isArray(contentPolicy.filters)) {
      errors.push('contentPolicy.filters must be an array');
      return errors;
    }

    const validFilters = ['SEXUAL', 'VIOLENCE', 'HATE', 'INSULTS', 'MISCONDUCT', 'PROMPT_ATTACK'];
    const validStrengths = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
    const validActions = ['BLOCK', 'NONE'];

    contentPolicy.filters.forEach((filter, index) => {
      if (!validFilters.includes(filter)) {
        errors.push(`contentPolicy.filters[${index}] must be one of: ${validFilters.join(', ')}`);
      }
    });

    // Validate input configuration
    if (contentPolicy.input) {
      if (typeof contentPolicy.input !== 'object') {
        errors.push('contentPolicy.input must be an object if provided');
      } else {
        if (contentPolicy.input.strength && !validStrengths.includes(contentPolicy.input.strength)) {
          errors.push(`contentPolicy.input.strength must be one of: ${validStrengths.join(', ')}`);
        }
        if (contentPolicy.input.action && !validActions.includes(contentPolicy.input.action)) {
          errors.push(`contentPolicy.input.action must be one of: ${validActions.join(', ')}`);
        }
      }
    }

    // Validate output configuration
    if (contentPolicy.output) {
      if (typeof contentPolicy.output !== 'object') {
        errors.push('contentPolicy.output must be an object if provided');
      } else {
        if (contentPolicy.output.strength && !validStrengths.includes(contentPolicy.output.strength)) {
          errors.push(`contentPolicy.output.strength must be one of: ${validStrengths.join(', ')}`);
        }
        if (contentPolicy.output.action && !validActions.includes(contentPolicy.output.action)) {
          errors.push(`contentPolicy.output.action must be one of: ${validActions.join(', ')}`);
        }
      }
    }

    // AWS-specific validation: PROMPT_ATTACK filter requires NONE output strength
    // Note: This is automatically handled during translation, so we don't add it as an error
    // Just document the behavior for users who might be confused by the automatic override

    return errors;
  }

  /**
   * Validates word policy configuration
   * @param {Object} wordPolicy - Word policy configuration
   * @returns {Array} Array of error messages
   */
  static validateWordPolicy(wordPolicy) {
    const errors = [];

    if (!wordPolicy || typeof wordPolicy !== 'object') {
      errors.push('wordPolicy must be an object');
      return errors;
    }

    const validManagedLists = ['PROFANITY'];
    const validActions = ['BLOCK', 'NONE'];

    // Validate managed lists
    if (wordPolicy.managedLists) {
      if (!Array.isArray(wordPolicy.managedLists)) {
        errors.push('wordPolicy.managedLists must be an array if provided');
      } else {
        wordPolicy.managedLists.forEach((list, index) => {
          if (!validManagedLists.includes(list)) {
            errors.push(`wordPolicy.managedLists[${index}] must be one of: ${validManagedLists.join(', ')}`);
          }
        });
      }
    }

    // Validate custom words
    if (wordPolicy.words) {
      if (!Array.isArray(wordPolicy.words)) {
        errors.push('wordPolicy.words must be an array if provided');
      } else {
        wordPolicy.words.forEach((word, index) => {
          if (typeof word !== 'string' || !word.trim()) {
            errors.push(`wordPolicy.words[${index}] must be a non-empty string`);
          }
        });
      }
    }

    // Validate input configuration
    if (wordPolicy.input) {
      if (typeof wordPolicy.input !== 'object') {
        errors.push('wordPolicy.input must be an object if provided');
      } else {
        if (wordPolicy.input.action && !validActions.includes(wordPolicy.input.action)) {
          errors.push(`wordPolicy.input.action must be one of: ${validActions.join(', ')}`);
        }
      }
    }

    // Validate output configuration
    if (wordPolicy.output) {
      if (typeof wordPolicy.output !== 'object') {
        errors.push('wordPolicy.output must be an object if provided');
      } else {
        if (wordPolicy.output.action && !validActions.includes(wordPolicy.output.action)) {
          errors.push(`wordPolicy.output.action must be one of: ${validActions.join(', ')}`);
        }
      }
    }

    // Validate that at least one word source is configured
    if (!wordPolicy.managedLists && !wordPolicy.words) {
      errors.push('wordPolicy must have at least one of managedLists or words');
    }

    return errors;
  }

  /**
   * Validates sensitive information policy configuration
   * @param {Object} sensitiveInfoPolicy - Sensitive information policy configuration
   * @returns {Array} Array of error messages
   */
  static validateSensitiveInformationPolicy(sensitiveInfoPolicy) {
    const errors = [];

    if (!sensitiveInfoPolicy || typeof sensitiveInfoPolicy !== 'object') {
      errors.push('sensitiveInformationPolicy must be an object');
      return errors;
    }

    const validPiiTypes = [
      'ADDRESS', 'AGE', 'AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'CA_HEALTH_NUMBER',
      'CA_SOCIAL_INSURANCE_NUMBER', 'CREDIT_DEBIT_CARD_CVV', 'CREDIT_DEBIT_CARD_EXPIRY',
      'CREDIT_DEBIT_CARD_NUMBER', 'DRIVER_ID', 'EMAIL', 'INTERNATIONAL_BANK_ACCOUNT_NUMBER',
      'IP_ADDRESS', 'LICENSE_PLATE', 'MAC_ADDRESS', 'NAME', 'PASSWORD', 'PHONE', 'PIN',
      'SWIFT_CODE', 'UK_NATIONAL_HEALTH_SERVICE_NUMBER', 'UK_NATIONAL_INSURANCE_NUMBER',
      'UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER', 'URL', 'USERNAME', 'US_BANK_ACCOUNT_NUMBER',
      'US_BANK_ROUTING_NUMBER', 'US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER',
      'US_PASSPORT_NUMBER', 'US_SOCIAL_SECURITY_NUMBER', 'VEHICLE_IDENTIFICATION_NUMBER'
    ];

    const validActions = ['BLOCK', 'ANONYMIZE', 'NONE'];

    // Validate PII entities
    if (sensitiveInfoPolicy.pii) {
      if (!Array.isArray(sensitiveInfoPolicy.pii)) {
        errors.push('sensitiveInformationPolicy.pii must be an array if provided');
      } else {
        sensitiveInfoPolicy.pii.forEach((piiType, index) => {
          if (!validPiiTypes.includes(piiType)) {
            errors.push(`sensitiveInformationPolicy.pii[${index}] must be one of the valid PII types`);
          }
        });
      }
    }

    // Validate regex patterns
    if (sensitiveInfoPolicy.regexes) {
      if (!Array.isArray(sensitiveInfoPolicy.regexes)) {
        errors.push('sensitiveInformationPolicy.regexes must be an array if provided');
      } else {
        sensitiveInfoPolicy.regexes.forEach((regex, index) => {
          if (!regex || typeof regex !== 'object') {
            errors.push(`sensitiveInformationPolicy.regexes[${index}] must be an object`);
          } else {
            if (!regex.name || typeof regex.name !== 'string' || !regex.name.trim()) {
              errors.push(`sensitiveInformationPolicy.regexes[${index}].name is required and must be a non-empty string`);
            }
            if (!regex.pattern || typeof regex.pattern !== 'string' || !regex.pattern.trim()) {
              errors.push(`sensitiveInformationPolicy.regexes[${index}].pattern is required and must be a non-empty string`);
            }
          }
        });
      }
    }

    // Validate input configuration
    if (sensitiveInfoPolicy.input) {
      if (typeof sensitiveInfoPolicy.input !== 'object') {
        errors.push('sensitiveInformationPolicy.input must be an object if provided');
      } else {
        if (sensitiveInfoPolicy.input.action && !validActions.includes(sensitiveInfoPolicy.input.action)) {
          errors.push(`sensitiveInformationPolicy.input.action must be one of: ${validActions.join(', ')}`);
        }
      }
    }

    // Validate output configuration
    if (sensitiveInfoPolicy.output) {
      if (typeof sensitiveInfoPolicy.output !== 'object') {
        errors.push('sensitiveInformationPolicy.output must be an object if provided');
      } else {
        if (sensitiveInfoPolicy.output.action && !validActions.includes(sensitiveInfoPolicy.output.action)) {
          errors.push(`sensitiveInformationPolicy.output.action must be one of: ${validActions.join(', ')}`);
        }
      }
    }

    // Validate that at least one detection method is configured
    if (!sensitiveInfoPolicy.pii && !sensitiveInfoPolicy.regexes) {
      errors.push('sensitiveInformationPolicy must have at least one of pii or regexes');
    }

    return errors;
  }

  /**
   * Validates contextual grounding policy configuration
   * @param {Object} groundingPolicy - Contextual grounding policy configuration
   * @returns {Array} Array of error messages
   */
  static validateContextualGroundingPolicy(groundingPolicy) {
    const errors = [];

    if (!groundingPolicy || typeof groundingPolicy !== 'object') {
      errors.push('contextualGroundingPolicy must be an object');
      return errors;
    }

    // Validate grounding threshold
    if (groundingPolicy.groundingThreshold !== undefined) {
      if (typeof groundingPolicy.groundingThreshold !== 'number' ||
        groundingPolicy.groundingThreshold < 0 ||
        groundingPolicy.groundingThreshold > 1) {
        errors.push('contextualGroundingPolicy.groundingThreshold must be a number between 0 and 1');
      }
    }

    // Validate relevance threshold
    if (groundingPolicy.relevanceThreshold !== undefined) {
      if (typeof groundingPolicy.relevanceThreshold !== 'number' ||
        groundingPolicy.relevanceThreshold < 0 ||
        groundingPolicy.relevanceThreshold > 1) {
        errors.push('contextualGroundingPolicy.relevanceThreshold must be a number between 0 and 1');
      }
    }

    // Validate that at least one threshold is configured
    if (groundingPolicy.groundingThreshold === undefined && groundingPolicy.relevanceThreshold === undefined) {
      errors.push('contextualGroundingPolicy must have at least one of groundingThreshold or relevanceThreshold');
    }

    return errors;
  }

  /**
   * Validates blocked messages configuration
   * @param {Object} blockedMessages - Blocked messages configuration
   * @returns {Array} Array of error messages
   */
  static validateBlockedMessages(blockedMessages) {
    const errors = [];

    if (!blockedMessages || typeof blockedMessages !== 'object') {
      errors.push('blockedMessages must be an object');
      return errors;
    }

    if (blockedMessages.input !== undefined) {
      if (typeof blockedMessages.input !== 'string' || blockedMessages.input.length > 500) {
        errors.push('blockedMessages.input must be a string of 500 characters or less if provided');
      }
    }

    if (blockedMessages.output !== undefined) {
      if (typeof blockedMessages.output !== 'string' || blockedMessages.output.length > 500) {
        errors.push('blockedMessages.output must be a string of 500 characters or less if provided');
      }
    }

    return errors;
  }

  /**
   * Detects if a configuration uses simplified format
   * @param {Object} config - Configuration to check
   * @returns {boolean} True if simplified format is detected
   */
  static isSimplifiedFormat(config) {
    if (!config || typeof config !== 'object') {
      return false;
    }

    return !!(
      config.topicPolicy ||
      config.contentPolicy ||
      config.wordPolicy ||
      config.sensitiveInformationPolicy ||
      config.contextualGroundingPolicy ||
      config.blockedMessages
    );
  }
}
