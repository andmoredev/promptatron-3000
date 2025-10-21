/**
 * GuardrailConfig class for managing guardrail configurations
 * Handles validation, AWS format conversion, and scenario integration
 * Supports both simplified and AWS format configurations
 */
import { GuardrailSchemaTranslator } from '../services/guardrailSchemaTranslator.js';

export class GuardrailConfig {
  constructor(config = {}, scenarioName = null) {
    this.scenarioName = scenarioName;

    // Detect if this is simplified format and translate if needed
    if (this.isSimplifiedFormat(config)) {
      const translatedConfig = GuardrailSchemaTranslator.translateToAWSFormat(config, scenarioName || 'default');
      this.initializeFromAWSFormat(translatedConfig);
      this.originalSimplifiedConfig = config; // Store original for reference
    } else {
      this.initializeFromAWSFormat(config);
    }

    // Validation state
    this.validationErrors = [];
    this.isValid = false;

    // Validate configuration on construction
    this.validate();
  }

  /**
   * Initialize from AWS format configuration
   * @param {Object} config - AWS format configuration
   */
  initializeFromAWSFormat(config) {
    this.name = config.name || '';
    this.description = config.description || '';
    this.blockedInputMessaging = config.blockedInputMessaging || 'This content violates our content policy.';
    this.blockedOutputsMessaging = config.blockedOutputsMessaging || 'I cannot provide that type of content.';

    // Policy configurations
    this.contentPolicyConfig = config.contentPolicyConfig || null;
    this.wordPolicyConfig = config.wordPolicyConfig || null;
    this.sensitiveInformationPolicyConfig = config.sensitiveInformationPolicyConfig || null;
    this.topicPolicyConfig = config.topicPolicyConfig || null;
    this.contextualGroundingPolicyConfig = config.contextualGroundingPolicyConfig || null;

    // AWS resource information (set after creation)
    this.arn = config.arn || null;
    this.guardrailId = config.guardrailId || null;
    this.version = config.version || 'DRAFT';
    this.status = config.status || 'pending'; // pending, creating, ready, error
    this.createdAt = config.createdAt || null;
    this.updatedAt = config.updatedAt || null;
  }

  /**
   * Detect if configuration uses simplified format
   * @param {Object} config - Configuration to check
   * @returns {boolean} True if simplified format is detected
   */
  isSimplifiedFormat(config) {
    return GuardrailSchemaTranslator.isSimplifiedFormat(config);
  }

  /**
   * Validate the guardrail configuration
   * @returns {boolean} True if configuration is valid
   */
  validate() {
    this.validationErrors = [];

    // If we have original simplified config, validate that first
    if (this.originalSimplifiedConfig) {
      const simplifiedValidation = GuardrailSchemaTranslator.validateSimplifiedSchema(this.originalSimplifiedConfig);
      if (!simplifiedValidation.isValid) {
        this.validationErrors = simplifiedValidation.errors.map(error => ({
          field: 'simplified',
          message: error
        }));
        this.isValid = false;
        return false;
      }
    }

    // Validate AWS format
    return this.validateAWSFormat();
  }

  /**
   * Validate AWS format configuration
   * @returns {boolean} True if configuration is valid
   */
  validateAWSFormat() {
    // Validate required fields
    if (!this.name || typeof this.name !== 'string' || this.name.trim().length === 0) {
      this.validationErrors.push({
        field: 'name',
        message: 'Guardrail name is required and must be a non-empty string'
      });
    }

    // Validate name format (AWS requirements)
    if (this.name && !/^[a-zA-Z0-9_-]+$/.test(this.name)) {
      this.validationErrors.push({
        field: 'name',
        message: 'Guardrail name can only contain letters, numbers, hyphens, and underscores'
      });
    }

    // Validate name length
    if (this.name && (this.name.length < 1 || this.name.length > 50)) {
      this.validationErrors.push({
        field: 'name',
        message: 'Guardrail name must be between 1 and 50 characters'
      });
    }

    // Validate description length
    if (this.description && this.description.length > 200) {
      this.validationErrors.push({
        field: 'description',
        message: 'Description must be 200 characters or less'
      });
    }

    // Validate blocked messaging length
    if (this.blockedInputMessaging && this.blockedInputMessaging.length > 500) {
      this.validationErrors.push({
        field: 'blockedInputMessaging',
        message: 'Blocked input messaging must be 500 characters or less'
      });
    }

    if (this.blockedOutputsMessaging && this.blockedOutputsMessaging.length > 500) {
      this.validationErrors.push({
        field: 'blockedOutputsMessaging',
        message: 'Blocked outputs messaging must be 500 characters or less'
      });
    }

    // Validate that at least one policy is configured
    const hasPolicies = !!(
      this.contentPolicyConfig ||
      this.wordPolicyConfig ||
      this.sensitiveInformationPolicyConfig ||
      this.topicPolicyConfig ||
      this.contextualGroundingPolicyConfig
    );

    if (!hasPolicies) {
      this.validationErrors.push({
        field: 'policies',
        message: 'At least one policy configuration (content, word, sensitive information, topic, or contextual grounding) is required'
      });
    }

    // Validate individual policy configurations
    if (this.contentPolicyConfig) {
      this.validateContentPolicyConfig();
    }

    if (this.wordPolicyConfig) {
      this.validateWordPolicyConfig();
    }

    if (this.sensitiveInformationPolicyConfig) {
      this.validateSensitiveInformationPolicyConfig();
    }

    if (this.topicPolicyConfig) {
      this.validateTopicPolicyConfig();
    }

    if (this.contextualGroundingPolicyConfig) {
      this.validateContextualGroundingPolicyConfig();
    }

    this.isValid = this.validationErrors.length === 0;
    return this.isValid;
  }

  /**
   * Validate content policy configuration
   */
  validateContentPolicyConfig() {
    if (!this.contentPolicyConfig.filtersConfig || !Array.isArray(this.contentPolicyConfig.filtersConfig)) {
      this.validationErrors.push({
        field: 'contentPolicyConfig.filtersConfig',
        message: 'Content policy must have a filtersConfig array'
      });
      return;
    }

    const validTypes = ['SEXUAL', 'VIOLENCE', 'HATE', 'INSULTS', 'MISCONDUCT', 'PROMPT_ATTACK'];
    const validStrengths = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];

    this.contentPolicyConfig.filtersConfig.forEach((filter, index) => {
      if (!validTypes.includes(filter.type)) {
        this.validationErrors.push({
          field: `contentPolicyConfig.filtersConfig[${index}].type`,
          message: `Invalid filter type. Must be one of: ${validTypes.join(', ')}`
        });
      }

      if (!validStrengths.includes(filter.inputStrength)) {
        this.validationErrors.push({
          field: `contentPolicyConfig.filtersConfig[${index}].inputStrength`,
          message: `Invalid input strength. Must be one of: ${validStrengths.join(', ')}`
        });
      }

      if (!validStrengths.includes(filter.outputStrength)) {
        this.validationErrors.push({
          field: `contentPolicyConfig.filtersConfig[${index}].outputStrength`,
          message: `Invalid output strength. Must be one of: ${validStrengths.join(', ')}`
        });
      }
    });
  }

  /**
   * Validate word policy configuration
   */
  validateWordPolicyConfig() {
    if (this.wordPolicyConfig.wordsConfig && !Array.isArray(this.wordPolicyConfig.wordsConfig)) {
      this.validationErrors.push({
        field: 'wordPolicyConfig.wordsConfig',
        message: 'Word policy wordsConfig must be an array'
      });
    }

    if (this.wordPolicyConfig.managedWordListsConfig && !Array.isArray(this.wordPolicyConfig.managedWordListsConfig)) {
      this.validationErrors.push({
        field: 'wordPolicyConfig.managedWordListsConfig',
        message: 'Word policy managedWordListsConfig must be an array'
      });
    }

    // Validate managed word lists
    if (this.wordPolicyConfig.managedWordListsConfig) {
      const validManagedTypes = ['PROFANITY'];
      this.wordPolicyConfig.managedWordListsConfig.forEach((list, index) => {
        if (!validManagedTypes.includes(list.type)) {
          this.validationErrors.push({
            field: `wordPolicyConfig.managedWordListsConfig[${index}].type`,
            message: `Invalid managed word list type. Must be one of: ${validManagedTypes.join(', ')}`
          });
        }
      });
    }
  }

  /**
   * Validate sensitive information policy configuration
   */
  validateSensitiveInformationPolicyConfig() {
    if (this.sensitiveInformationPolicyConfig.piiEntitiesConfig && !Array.isArray(this.sensitiveInformationPolicyConfig.piiEntitiesConfig)) {
      this.validationErrors.push({
        field: 'sensitiveInformationPolicyConfig.piiEntitiesConfig',
        message: 'PII entities config must be an array'
      });
    }

    if (this.sensitiveInformationPolicyConfig.regexesConfig && !Array.isArray(this.sensitiveInformationPolicyConfig.regexesConfig)) {
      this.validationErrors.push({
        field: 'sensitiveInformationPolicyConfig.regexesConfig',
        message: 'Regexes config must be an array'
      });
    }

    // Validate PII entities
    if (this.sensitiveInformationPolicyConfig.piiEntitiesConfig) {
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
      const validActions = ['BLOCK', 'ANONYMIZE'];

      this.sensitiveInformationPolicyConfig.piiEntitiesConfig.forEach((entity, index) => {
        if (!validPiiTypes.includes(entity.type)) {
          this.validationErrors.push({
            field: `sensitiveInformationPolicyConfig.piiEntitiesConfig[${index}].type`,
            message: `Invalid PII entity type. Must be one of the supported PII types`
          });
        }

        if (!validActions.includes(entity.action)) {
          this.validationErrors.push({
            field: `sensitiveInformationPolicyConfig.piiEntitiesConfig[${index}].action`,
            message: `Invalid PII action. Must be one of: ${validActions.join(', ')}`
          });
        }
      });
    }

    // Validate regex configurations
    if (this.sensitiveInformationPolicyConfig.regexesConfig) {
      const validActions = ['BLOCK', 'ANONYMIZE'];

      this.sensitiveInformationPolicyConfig.regexesConfig.forEach((regex, index) => {
        if (!regex.name || typeof regex.name !== 'string') {
          this.validationErrors.push({
            field: `sensitiveInformationPolicyConfig.regexesConfig[${index}].name`,
            message: 'Regex configuration must have a name'
          });
        }

        if (!regex.pattern || typeof regex.pattern !== 'string') {
          this.validationErrors.push({
            field: `sensitiveInformationPolicyConfig.regexesConfig[${index}].pattern`,
            message: 'Regex configuration must have a pattern'
          });
        }

        if (!validActions.includes(regex.action)) {
          this.validationErrors.push({
            field: `sensitiveInformationPolicyConfig.regexesConfig[${index}].action`,
            message: `Invalid regex action. Must be one of: ${validActions.join(', ')}`
          });
        }

        // Validate regex pattern
        if (regex.pattern) {
          try {
            new RegExp(regex.pattern);
          } catch (regexError) {
            this.validationErrors.push({
              field: `sensitiveInformationPolicyConfig.regexesConfig[${index}].pattern`,
              message: `Invalid regex pattern: ${regexError.message}`
            });
          }
        }
      });
    }
  }

  /**
   * Validate topic policy configuration
   */
  validateTopicPolicyConfig() {
    if (!this.topicPolicyConfig.topicsConfig || !Array.isArray(this.topicPolicyConfig.topicsConfig)) {
      this.validationErrors.push({
        field: 'topicPolicyConfig.topicsConfig',
        message: 'Topic policy must have a topicsConfig array'
      });
      return;
    }

    const validTypes = ['DENY'];

    this.topicPolicyConfig.topicsConfig.forEach((topic, index) => {
      if (!topic.name || typeof topic.name !== 'string') {
        this.validationErrors.push({
          field: `topicPolicyConfig.topicsConfig[${index}].name`,
          message: 'Topic must have a name'
        });
      }

      if (!topic.definition || typeof topic.definition !== 'string') {
        this.validationErrors.push({
          field: `topicPolicyConfig.topicsConfig[${index}].definition`,
          message: 'Topic must have a definition'
        });
      }

      if (!validTypes.includes(topic.type)) {
        this.validationErrors.push({
          field: `topicPolicyConfig.topicsConfig[${index}].type`,
          message: `Invalid topic type. Must be one of: ${validTypes.join(', ')}`
        });
      }

      if (topic.examples && !Array.isArray(topic.examples)) {
        this.validationErrors.push({
          field: `topicPolicyConfig.topicsConfig[${index}].examples`,
          message: 'Topic examples must be an array'
        });
      }
    });
  }

  /**
   * Validate contextual grounding policy configuration
   */
  validateContextualGroundingPolicyConfig() {
    if (!this.contextualGroundingPolicyConfig.filtersConfig || !Array.isArray(this.contextualGroundingPolicyConfig.filtersConfig)) {
      this.validationErrors.push({
        field: 'contextualGroundingPolicyConfig.filtersConfig',
        message: 'Contextual grounding policy must have a filtersConfig array'
      });
      return;
    }

    const validTypes = ['GROUNDING', 'RELEVANCE'];
    const validActions = ['BLOCK', 'NONE'];

    this.contextualGroundingPolicyConfig.filtersConfig.forEach((filter, index) => {
      if (!validTypes.includes(filter.type)) {
        this.validationErrors.push({
          field: `contextualGroundingPolicyConfig.filtersConfig[${index}].type`,
          message: `Invalid filter type. Must be one of: ${validTypes.join(', ')}`
        });
      }

      if (typeof filter.threshold !== 'number' || filter.threshold < 0 || filter.threshold > 1) {
        this.validationErrors.push({
          field: `contextualGroundingPolicyConfig.filtersConfig[${index}].threshold`,
          message: 'Threshold must be a number between 0 and 1'
        });
      }

      if (!validActions.includes(filter.action)) {
        this.validationErrors.push({
          field: `contextualGroundingPolicyConfig.filtersConfig[${index}].action`,
          message: `Invalid action. Must be one of: ${validActions.join(', ')}`
        });
      }

      if (typeof filter.enabled !== 'boolean') {
        this.validationErrors.push({
          field: `contextualGroundingPolicyConfig.filtersConfig[${index}].enabled`,
          message: 'Enabled must be a boolean'
        });
      }
    });
  }

  /**
   * Convert configuration to AWS API format
   * @returns {Object} AWS-compatible configuration object
   */
  toAWSFormat() {
    if (!this.isValid) {
      throw new Error('Cannot convert invalid configuration to AWS format. Please fix validation errors first.');
    }

    const awsConfig = {
      name: this.name,
      description: this.description || undefined,
      blockedInputMessaging: this.blockedInputMessaging,
      blockedOutputsMessaging: this.blockedOutputsMessaging
    };

    // Add policy configurations if they exist
    if (this.contentPolicyConfig) {
      awsConfig.contentPolicyConfig = this.contentPolicyConfig;
    }

    if (this.wordPolicyConfig) {
      awsConfig.wordPolicyConfig = this.wordPolicyConfig;
    }

    if (this.sensitiveInformationPolicyConfig) {
      awsConfig.sensitiveInformationPolicyConfig = this.sensitiveInformationPolicyConfig;
    }

    if (this.topicPolicyConfig) {
      awsConfig.topicPolicyConfig = this.topicPolicyConfig;
    }

    if (this.contextualGroundingPolicyConfig) {
      awsConfig.contextualGroundingPolicyConfig = this.contextualGroundingPolicyConfig;
    }

    return awsConfig;
  }

  /**
   * Create GuardrailConfig from scenario configuration
   * @param {Object} scenarioConfig - Scenario guardrail configuration
   * @param {string} scenarioName - Name of the scenario for tagging
   * @returns {GuardrailConfig} New GuardrailConfig instance
   */
  static fromScenarioConfig(scenarioConfig, scenarioName = null) {
    if (!scenarioConfig || typeof scenarioConfig !== 'object') {
      throw new Error('Invalid scenario configuration provided');
    }

    return new GuardrailConfig(scenarioConfig, scenarioName);
  }

  /**
   * Create GuardrailConfig from simplified configuration
   * @param {Object} simplifiedConfig - Simplified guardrail configuration
   * @param {string} scenarioName - Name of the scenario for tagging
   * @returns {GuardrailConfig} New GuardrailConfig instance
   */
  static fromSimplifiedConfig(simplifiedConfig, scenarioName) {
    if (!simplifiedConfig || typeof simplifiedConfig !== 'object') {
      throw new Error('Invalid simplified configuration provided');
    }

    if (!scenarioName || typeof scenarioName !== 'string') {
      throw new Error('Scenario name is required for simplified configuration');
    }

    return new GuardrailConfig(simplifiedConfig, scenarioName);
  }

  /**
   * Create multiple GuardrailConfig instances from scenario guardrails configuration
   * @param {Object} scenarioGuardrails - Scenario guardrails configuration with configs array
   * @returns {Array<GuardrailConfig>} Array of GuardrailConfig instances
   */
  static fromScenarioGuardrails(scenarioGuardrails) {
    if (!scenarioGuardrails || !scenarioGuardrails.configs || !Array.isArray(scenarioGuardrails.configs)) {
      return [];
    }

    return scenarioGuardrails.configs.map(config => GuardrailConfig.fromScenarioConfig(config));
  }

  /**
   * Get validation error summary
   * @returns {Object} Validation summary
   */
  getValidationSummary() {
    return {
      isValid: this.isValid,
      errorCount: this.validationErrors.length,
      errors: this.validationErrors,
      hasContentPolicy: !!this.contentPolicyConfig,
      hasWordPolicy: !!this.wordPolicyConfig,
      hasSensitiveInformationPolicy: !!this.sensitiveInformationPolicyConfig,
      hasTopicPolicy: !!this.topicPolicyConfig
    };
  }

  /**
   * Get a summary of the guardrail configuration
   * @returns {Object} Configuration summary
   */
  getSummary() {
    const policies = [];

    if (this.contentPolicyConfig) {
      const filterCount = this.contentPolicyConfig.filtersConfig?.length || 0;
      policies.push(`Content filtering (${filterCount} filters)`);
    }

    if (this.wordPolicyConfig) {
      const wordCount = this.wordPolicyConfig.wordsConfig?.length || 0;
      const managedCount = this.wordPolicyConfig.managedWordListsConfig?.length || 0;
      policies.push(`Word filtering (${wordCount} custom words, ${managedCount} managed lists)`);
    }

    if (this.sensitiveInformationPolicyConfig) {
      const piiCount = this.sensitiveInformationPolicyConfig.piiEntitiesConfig?.length || 0;
      const regexCount = this.sensitiveInformationPolicyConfig.regexesConfig?.length || 0;
      policies.push(`PII protection (${piiCount} entities, ${regexCount} patterns)`);
    }

    if (this.topicPolicyConfig) {
      const topicCount = this.topicPolicyConfig.topicsConfig?.length || 0;
      policies.push(`Topic restrictions (${topicCount} topics)`);
    }

    if (this.contextualGroundingPolicyConfig) {
      const filterCount = this.contextualGroundingPolicyConfig.filtersConfig?.length || 0;
      policies.push(`Contextual grounding (${filterCount} filters)`);
    }

    return {
      name: this.name,
      description: this.description,
      status: this.status,
      arn: this.arn,
      version: this.version,
      policies: policies,
      policyCount: policies.length,
      isValid: this.isValid,
      errorCount: this.validationErrors.length,
      isSimplified: !!this.originalSimplifiedConfig
    };
  }

  /**
   * Clone the configuration
   * @returns {GuardrailConfig} Cloned configuration
   */
  clone() {
    return new GuardrailConfig({
      name: this.name,
      description: this.description,
      blockedInputMessaging: this.blockedInputMessaging,
      blockedOutputsMessaging: this.blockedOutputsMessaging,
      contentPolicyConfig: this.contentPolicyConfig ? JSON.parse(JSON.stringify(this.contentPolicyConfig)) : null,
      wordPolicyConfig: this.wordPolicyConfig ? JSON.parse(JSON.stringify(this.wordPolicyConfig)) : null,
      sensitiveInformationPolicyConfig: this.sensitiveInformationPolicyConfig ? JSON.parse(JSON.stringify(this.sensitiveInformationPolicyConfig)) : null,
      topicPolicyConfig: this.topicPolicyConfig ? JSON.parse(JSON.stringify(this.topicPolicyConfig)) : null,
      contextualGroundingPolicyConfig: this.contextualGroundingPolicyConfig ? JSON.parse(JSON.stringify(this.contextualGroundingPolicyConfig)) : null,
      arn: this.arn,
      guardrailId: this.guardrailId,
      version: this.version,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    });

    // Copy original simplified config if it exists
    if (this.originalSimplifiedConfig) {
      cloned.originalSimplifiedConfig = JSON.parse(JSON.stringify(this.originalSimplifiedConfig));
    }
  }
}
