import { BedrockClient, CreateGuardrailCommand, DeleteGuardrailCommand, ListGuardrailsCommand, GetGuardrailCommand } from "@aws-sdk/client-bedrock";
import { BedrockRuntimeClient, ApplyGuardrailCommand } from "@aws-sdk/client-bedrock-runtime";
import { analyzeError, handleError, ErrorTypes, retryWithBackoff } from '../utils/errorHandling.js';
import { GuardrailSchemaTranslator } from './guardrailSchemaTranslator.js';

/**
 * Service class for AWS Bedrock Guardrails integration
 * Handles guardrail lifecycle management, validation, and evaluation
 */
export class GuardrailService {
  constructor() {
    this.runtimeClient = null;
    this.managementClient = null;
    this.isInitialized = false;
    this.credentialsValid = false;
    this.lastError = null;
    this.lastSuccessfulCall = null;
  }

  /**
   * Detect available credential sources and provide helpful feedback
   */
  detectCredentialSources() {
    const sources = [];

    // Check for VITE_ prefixed environment variables (from .env.local or build process)
    if (import.meta.env.VITE_AWS_ACCESS_KEY_ID) {
      sources.push({
        type: 'vite-env',
        description: 'Vite environment variables (VITE_AWS_*)',
        hasSessionToken: !!import.meta.env.VITE_AWS_SESSION_TOKEN,
        region: import.meta.env.VITE_AWS_REGION,
        source: '.env.local or build environment'
      });
    }

    return sources;
  }

  /**
   * Initialize the Guardrail service with AWS credentials
   * Attempts to detect credentials from various sources
   */
  async initialize() {
    try {
      // Check for available credential sources
      const credentialSources = this.detectCredentialSources();

      if (credentialSources.length === 0) {
        throw new Error('No AWS credentials found. Please run your local-setup.sh script or create a .env.local file with VITE_AWS_* variables.');
      }

      const region = import.meta.env.VITE_AWS_REGION || 'us-east-1';

      const clientConfig = {
        region: region,
        // In a browser environment, credentials need to be provided explicitly
        // or through Cognito Identity Pool. For development, we'll try to use
        // environment variables if available
        ...(import.meta.env.VITE_AWS_ACCESS_KEY_ID && {
          credentials: {
            accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
            secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
            ...(import.meta.env.VITE_AWS_SESSION_TOKEN && {
              sessionToken: import.meta.env.VITE_AWS_SESSION_TOKEN
            })
          }
        })
      };

      // Initialize both Bedrock clients
      this.runtimeClient = new BedrockRuntimeClient(clientConfig);
      this.managementClient = new BedrockClient(clientConfig);

      // Test credentials by attempting to list guardrails
      await this.validateCredentials();

      this.isInitialized = true;
      this.credentialsValid = true;
      this.lastSuccessfulCall = new Date().toISOString();

      return { success: true, message: 'AWS Bedrock Guardrails service initialized successfully' };
    } catch (error) {
      this.isInitialized = false;
      this.credentialsValid = false;
      this.lastError = error.message;

      return {
        success: false,
        message: this.getCredentialErrorMessage(error),
        error: error
      };
    }
  }

  /**
   * Validate AWS credentials by making a test API call
   */
  async validateCredentials() {
    if (!this.managementClient) {
      throw new Error('Bedrock client not initialized');
    }

    try {
      // Make a simple API call to test credentials
      const command = new ListGuardrailsCommand({
        maxResults: 1
      });

      await this.managementClient.send(command);
      this.credentialsValid = true;
      return true;
    } catch (error) {
      this.credentialsValid = false;
      throw error;
    }
  }

  /**
   * Check if the service is ready for use
   */
  isReady() {
    return this.isInitialized && this.credentialsValid;
  }

  /**
   * Create a new guardrail in AWS Bedrock
   * @param {Object} config - GuardrailConfig instance or configuration object
   * @returns {Promise<Object>} Creation result with ARN and version
   */
  async createGuardrail(config) {
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    return await this.executeWithErrorHandling(
      async () => {
        // Convert config to AWS format if it's a GuardrailConfig instance
        const awsConfig = config.toAWSFormat ? config.toAWSFormat() : config;

        const command = new CreateGuardrailCommand(awsConfig);
        const response = await this.managementClient.send(command);

        this.lastSuccessfulCall = new Date().toISOString();

        return {
          success: true,
          guardrailId: response.guardrailId,
          guardrailArn: response.guardrailArn,
          version: response.version,
          createdAt: response.createdAt
        };
      },
      {
        operationName: 'create guardrail',
        context: { configName: config.name || 'unnamed' },
        maxRetries: 2 // Limited retries for creation operations
      }
    );
  }

  /**
   * Delete a guardrail from AWS Bedrock
   * @param {string} guardrailId - The guardrail ID to delete
   * @param {string} guardrailVersion - The guardrail version to delete (optional, defaults to DRAFT)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteGuardrail(guardrailId, guardrailVersion = 'DRAFT') {
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    try {
      const command = new DeleteGuardrailCommand({
        guardrailIdentifier: guardrailId,
        guardrailVersion: guardrailVersion
      });

      await this.managementClient.send(command);
      this.lastSuccessfulCall = new Date().toISOString();

      return {
        success: true,
        message: `Guardrail ${guardrailId} deleted successfully`
      };
    } catch (error) {
      this.lastError = error.message;
      throw new Error(`Failed to delete guardrail ${guardrailId}: ${error.message}`);
    }
  }

  /**
   * List all guardrails in the AWS account
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Promise<Array>} Array of guardrail summaries
   */
  async listGuardrails(maxResults = 50) {
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    try {
      const command = new ListGuardrailsCommand({
        maxResults: maxResults
      });

      const response = await this.managementClient.send(command);
      this.lastSuccessfulCall = new Date().toISOString();

      return response.guardrails || [];
    } catch (error) {
      this.lastError = error.message;
      throw new Error(`Failed to list guardrails: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a specific guardrail
   * @param {string} guardrailId - The guardrail ID
   * @param {string} guardrailVersion - The guardrail version (optional, defaults to DRAFT)
   * @returns {Promise<Object>} Detailed guardrail information
   */
  async getGuardrail(guardrailId, guardrailVersion = 'DRAFT') {
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    try {
      const command = new GetGuardrailCommand({
        guardrailIdentifier: guardrailId,
        guardrailVersion: guardrailVersion
      });

      const response = await this.managementClient.send(command);
      this.lastSuccessfulCall = new Date().toISOString();

      return response;
    } catch (error) {
      this.lastError = error.message;
      throw new Error(`Failed to get guardrail ${guardrailId}: ${error.message}`);
    }
  }

  /**
   * Apply a guardrail to evaluate content
   * @param {string} guardrailIdentifier - The guardrail ID or ARN
   * @param {string} content - The content to evaluate
   * @param {string} source - The source of the content ('INPUT' or 'OUTPUT')
   * @returns {Promise<Object>} Guardrail evaluation result
   */
  async applyGuardrail(guardrailIdentifier, content, source = 'INPUT') {
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    return await this.executeWithErrorHandling(
      async () => {
        const command = new ApplyGuardrailCommand({
          guardrailIdentifier: guardrailIdentifier,
          guardrailVersion: 'DRAFT',
          source: source,
          content: [
            {
              text: {
                text: content
              }
            }
          ]
        });

        const response = await this.runtimeClient.send(command);
        this.lastSuccessfulCall = new Date().toISOString();

        return response;
      },
      {
        operationName: 'apply guardrail',
        context: {
          guardrailIdentifier,
          source,
          contentLength: content.length
        },
        maxRetries: 3 // More retries for evaluation operations
      }
    );
  }

  /**
   * Create a guardrail specifically for a scenario with proper tagging
   * @param {string} scenarioName - Name of the scenario
   * @param {Object} guardrailConfig - Guardrail configuration object
   * @returns {Promise<Object>} Creation result with ARN and version
   */
  async createGuardrailForScenario(scenarioName, guardrailConfig, options = {}) {
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    return await this.executeWithErrorHandling(
      async () => {
        // Check if the config is in simplified format and translate it
        let createParams;

        if (GuardrailSchemaTranslator.isSimplifiedFormat(guardrailConfig)) {
          // Translate simplified format to AWS format
          console.log(`[GuardrailService] Translating simplified guardrail config for scenario: ${scenarioName}`);
          createParams = GuardrailSchemaTranslator.translateToAWSFormat(guardrailConfig, scenarioName);
          console.log(`[GuardrailService] Translation completed. Config has ${Object.keys(createParams).length} properties`);
        } else {
          // Already in AWS format, use as-is but ensure required fields
          const guardrailName = `${scenarioName}-guardrail`;
          createParams = {
            name: guardrailName,
            description: guardrailConfig.description || `Guardrail for ${scenarioName} scenario`,
            blockedInputMessaging: guardrailConfig.blockedInputMessaging || 'This content violates our content policy.',
            blockedOutputsMessaging: guardrailConfig.blockedOutputsMessaging || 'I cannot provide that type of content.',
            tags: this.generateGuardrailTags(scenarioName),
            ...guardrailConfig
          };

          // Add policy configurations if they exist
          if (guardrailConfig.contentPolicyConfig) {
            createParams.contentPolicyConfig = guardrailConfig.contentPolicyConfig;
          }

          if (guardrailConfig.wordPolicyConfig) {
            createParams.wordPolicyConfig = guardrailConfig.wordPolicyConfig;
          }

          if (guardrailConfig.sensitiveInformationPolicyConfig) {
            createParams.sensitiveInformationPolicyConfig = guardrailConfig.sensitiveInformationPolicyConfig;
          }

          if (guardrailConfig.topicPolicyConfig) {
            createParams.topicPolicyConfig = guardrailConfig.topicPolicyConfig;
          }
        }

        console.log(`[GuardrailService] Creating guardrail with params:`, JSON.stringify(createParams, null, 2));

        const command = new CreateGuardrailCommand(createParams);
        const response = await this.managementClient.send(command);

        this.lastSuccessfulCall = new Date().toISOString();

        const { waitForReady = true } = options;

        if (waitForReady) {
          // Poll for guardrail to become ready
          console.log(`[GuardrailService] Guardrail created with ID: ${response.guardrailId}, polling for ready status...`);
          const readyGuardrail = await this.waitForGuardrailReady(response.guardrailId, response.version, {
            maxAttempts: 20,     // Reduce max attempts for faster feedback
            intervalMs: 3000,    // 3 second intervals
            timeoutMs: 60000     // 1 minute timeout
          });

          return {
            success: true,
            guardrailId: response.guardrailId,
            guardrailArn: response.guardrailArn,
            version: response.version,
            createdAt: response.createdAt,
            scenarioName: scenarioName,
            status: readyGuardrail.status,
            pollingCompleted: true
          };
        } else {
          // Return immediately without polling
          console.log(`[GuardrailService] Guardrail created with ID: ${response.guardrailId}, skipping polling (will be in DRAFT status)`);
          return {
            success: true,
            guardrailId: response.guardrailId,
            guardrailArn: response.guardrailArn,
            version: response.version,
            createdAt: response.createdAt,
            scenarioName: scenarioName,
            status: 'CREATING', // Assume it's still creating
            pollingCompleted: false
          };
        }
      },
      {
        operationName: 'create guardrail for scenario',
        context: {
          scenarioName,
          guardrailName: `${scenarioName}-guardrail`,
          hasContentPolicy: !!guardrailConfig.contentPolicyConfig,
          hasWordPolicy: !!guardrailConfig.wordPolicyConfig,
          hasPiiPolicy: !!guardrailConfig.sensitiveInformationPolicyConfig,
          hasTopicPolicy: !!guardrailConfig.topicPolicyConfig
        },
        maxRetries: 2
      }
    );
  }

  /**
   * Generate standardized tags for guardrails created by this application
   * @param {string} scenarioName - Name of the scenario
   * @returns {Array} Array of tag objects for AWS API
   */
  generateGuardrailTags(scenarioName) {
    return [
      {
        key: 'source',
        value: 'promptatron'
      },
      {
        key: 'scenario',
        value: scenarioName
      },
      {
        key: 'created-by',
        value: 'bedrock-llm-analyzer'
      },
      {
        key: 'created-at',
        value: new Date().toISOString()
      }
    ];
  }

  /**
   * Parse tags from a guardrail to extract scenario information
   * @param {Object} guardrail - Guardrail object from AWS API
   * @returns {Object} Parsed tag information
   */
  parseGuardrailTags(guardrail) {
    const tags = guardrail.tags || [];
    const tagMap = {};

    tags.forEach(tag => {
      tagMap[tag.key] = tag.value;
    });

    return {
      source: tagMap.source,
      scenario: tagMap.scenario,
      createdBy: tagMap['created-by'],
      createdAt: tagMap['created-at'],
      isPromptatronGuardrail: tagMap.source === 'promptatron'
    };
  }

  /**
   * Discover existing guardrails created by this application
   * Uses name-based matching to identify guardrails following the pattern: {scenarioName}-guardrail
   * @returns {Promise<Array>} Array of Promptatron guardrails
   */
  async discoverExistingGuardrails() {
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    try {
      // Get all guardrails from AWS
      const allGuardrails = await this.listGuardrails();

      // Filter for guardrails created by Promptatron based on naming pattern
      const promptatronGuardrails = [];

      for (const guardrail of allGuardrails) {
        // Check if the guardrail name follows our naming pattern: {scenarioName}-guardrail
        if (guardrail.name && guardrail.name.endsWith('-guardrail')) {
          // Extract scenario name from guardrail name
          const scenarioName = guardrail.name.replace('-guardrail', '');

          // Only include if the scenario name looks valid (no spaces, reasonable length, valid characters)
          if (scenarioName &&
              scenarioName.length > 0 &&
              scenarioName.length < 100 &&
              !scenarioName.includes(' ') &&
              /^[a-z0-9-]+$/.test(scenarioName)) { // Only lowercase letters, numbers, and hyphens
            promptatronGuardrails.push({
              ...guardrail,
              scenarioName: scenarioName,
              createdBy: 'promptatron', // Assume it's ours based on naming pattern
              createdAt: guardrail.createdAt || new Date().toISOString()
            });

            console.log(`[GuardrailService] Found Promptatron guardrail: ${guardrail.name} -> scenario: ${scenarioName}`);
          }
        }
      }

      console.log(`[GuardrailService] Discovered ${promptatronGuardrails.length} Promptatron guardrails`);
      this.lastSuccessfulCall = new Date().toISOString();
      return promptatronGuardrails;
    } catch (error) {
      this.lastError = error.message;
      throw new Error(`Failed to discover existing guardrails: ${error.message}`);
    }
  }

  /**
   * Map discovered guardrails to scenarios based on tags
   * @param {Array} guardrails - Array of guardrails from discoverExistingGuardrails
   * @param {Array} scenarios - Array of scenario names or objects
   * @returns {Promise<Object>} Mapping of scenario names to guardrail information
   */
  async mapGuardrailsToScenarios(guardrails, scenarios) {
    const mapping = new Map();

    // Initialize mapping with all scenarios
    const scenarioNames = scenarios.map(scenario =>
      typeof scenario === 'string' ? scenario : scenario.name
    );

    scenarioNames.forEach(scenarioName => {
      mapping.set(scenarioName, {
        scenarioName,
        hasGuardrail: false,
        guardrail: null
      });
    });

    // Map existing guardrails to scenarios
    guardrails.forEach(guardrail => {
      if (guardrail.scenarioName && mapping.has(guardrail.scenarioName)) {
        mapping.set(guardrail.scenarioName, {
          scenarioName: guardrail.scenarioName,
          hasGuardrail: true,
          guardrail: {
            id: guardrail.id,
            arn: guardrail.arn,
            version: guardrail.version,
            name: guardrail.name,
            description: guardrail.description,
            status: guardrail.status,
            createdAt: guardrail.createdAt,
            updatedAt: guardrail.updatedAt
          }
        });
      }
    });

    return Object.fromEntries(mapping);
  }

  /**
   * Get guardrail status for a specific scenario
   * @param {string} scenarioName - Name of the scenario
   * @returns {Promise<Object>} Guardrail status information
   */
  async getGuardrailStatus(scenarioName) {
    try {
      const existingGuardrails = await this.discoverExistingGuardrails();
      const scenarioGuardrail = existingGuardrails.find(g => g.scenarioName === scenarioName);

      if (scenarioGuardrail) {
        return {
          exists: true,
          guardrail: {
            id: scenarioGuardrail.id,
            arn: scenarioGuardrail.arn,
            version: scenarioGuardrail.version,
            name: scenarioGuardrail.name,
            status: scenarioGuardrail.status,
            createdAt: scenarioGuardrail.createdAt
          }
        };
      } else {
        return {
          exists: false,
          guardrail: null
        };
      }
    } catch (error) {
      throw new Error(`Failed to get guardrail status for scenario '${scenarioName}': ${error.message}`);
    }
  }

  /**
   * Ensure a guardrail exists for a specific scenario
   * Creates the guardrail if it doesn't exist, or returns existing one
   * @param {string} scenarioName - Name of the scenario
   * @param {Object} guardrailConfig - Guardrail configuration object
   * @returns {Promise<Object>} Guardrail information (existing or newly created)
   */
  async ensureGuardrailExists(scenarioName, guardrailConfig, options = {}) {
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    try {
      // First, check if a guardrail already exists for this scenario
      const status = await this.getGuardrailStatus(scenarioName);

      if (status.exists) {
        // Guardrail exists, return its information
        return {
          success: true,
          action: 'found_existing',
          guardrail: {
            id: status.guardrail.id,
            arn: status.guardrail.arn,
            version: status.guardrail.version,
            name: status.guardrail.name,
            status: status.guardrail.status,
            scenarioName: scenarioName
          }
        };
      } else {
        // Guardrail doesn't exist, create it
        const createResult = await this.createGuardrailForScenario(scenarioName, guardrailConfig, options);

        return {
          success: true,
          action: 'created_new',
          guardrail: {
            id: createResult.guardrailId,
            arn: createResult.guardrailArn,
            version: createResult.version,
            name: `${scenarioName}-guardrail`,
            status: createResult.status || 'CREATING', // Use actual status from creation
            scenarioName: scenarioName,
            createdAt: createResult.createdAt,
            pollingCompleted: createResult.pollingCompleted
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        action: 'error',
        error: error.message,
        scenarioName: scenarioName
      };
    }
  }

  /**
   * Wait for a guardrail to become ready by polling its status
   * @param {string} guardrailId - The guardrail ID to poll
   * @param {string} version - The guardrail version (usually 'DRAFT')
   * @param {Object} options - Polling options
   * @returns {Promise<Object>} Final guardrail status
   */
  async waitForGuardrailReady(guardrailId, version = 'DRAFT', options = {}) {
    const {
      maxAttempts = 30,        // Maximum polling attempts
      intervalMs = 2000,       // Polling interval in milliseconds
      timeoutMs = 60000        // Total timeout in milliseconds
    } = options;

    const startTime = Date.now();
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        attempts++;

        // Check if we've exceeded the timeout
        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Timeout waiting for guardrail ${guardrailId} to become ready after ${timeoutMs}ms`);
        }

        console.log(`[GuardrailService] Polling guardrail ${guardrailId} status (attempt ${attempts}/${maxAttempts})...`);

        const guardrailDetails = await this.getGuardrail(guardrailId, version);

        if (guardrailDetails.status === 'READY') {
          console.log(`[GuardrailService] Guardrail ${guardrailId} is now READY after ${attempts} attempts`);
          return guardrailDetails;
        } else if (guardrailDetails.status === 'FAILED') {
          throw new Error(`Guardrail ${guardrailId} creation failed with status: FAILED`);
        }

        console.log(`[GuardrailService] Guardrail ${guardrailId} status: ${guardrailDetails.status}, waiting ${intervalMs}ms...`);

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, intervalMs));

      } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
          console.log(`[GuardrailService] Guardrail ${guardrailId} not found yet, continuing to poll...`);
          await new Promise(resolve => setTimeout(resolve, intervalMs));
          continue;
        }

        // For other errors, rethrow
        throw error;
      }
    }

    // If we get here, we've exceeded max attempts
    throw new Error(`Guardrail ${guardrailId} did not become ready after ${maxAttempts} attempts`);
  }

  /**
   * Store guardrail ARN for a scenario (in-memory storage for now)
   * In a production system, this might be stored in a database or configuration file
   * @param {string} scenarioName - Name of the scenario
   * @param {string} guardrailArn - ARN of the guardrail
   * @param {string} guardrailId - ID of the guardrail
   */
  storeGuardrailForScenario(scenarioName, guardrailArn, guardrailId) {
    if (!this.scenarioGuardrailMap) {
      this.scenarioGuardrailMap = new Map();
    }

    this.scenarioGuardrailMap.set(scenarioName, {
      arn: guardrailArn,
      id: guardrailId,
      storedAt: new Date().toISOString()
    });
  }

  /**
   * Retrieve stored guardrail information for a scenario
   * @param {string} scenarioName - Name of the scenario
   * @returns {Object|null} Stored guardrail information or null if not found
   */
  getStoredGuardrailForScenario(scenarioName) {
    if (!this.scenarioGuardrailMap) {
      return null;
    }

    return this.scenarioGuardrailMap.get(scenarioName) || null;
  }

  /**
   * Initialize guardrails for multiple scenarios
   * This method is designed to be called during application startup
   * @param {Array} scenarios - Array of scenario objects with guardrail configurations
   * @returns {Promise<Object>} Results of guardrail initialization
   */
  async initializeGuardrailsForScenarios(scenarios) {
    const results = {
      success: true,
      processed: 0,
      created: [],
      existing: [],
      errors: [],
      skipped: []
    };

    for (const scenario of scenarios) {
      results.processed++;

      // Skip scenarios without guardrail configuration
      if (!scenario.guardrails || !scenario.guardrails.enabled) {
        results.skipped.push({
          scenarioName: scenario.name,
          reason: 'No guardrail configuration or disabled'
        });
        continue;
      }

      try {
        const ensureResult = await this.ensureGuardrailExists(scenario.name, scenario.guardrails);

        if (ensureResult.success) {
          // Store the guardrail information for quick access
          this.storeGuardrailForScenario(
            scenario.name,
            ensureResult.guardrail.arn,
            ensureResult.guardrail.id
          );

          if (ensureResult.action === 'created_new') {
            results.created.push({
              scenarioName: scenario.name,
              guardrailId: ensureResult.guardrail.id,
              guardrailArn: ensureResult.guardrail.arn
            });
          } else {
            results.existing.push({
              scenarioName: scenario.name,
              guardrailId: ensureResult.guardrail.id,
              guardrailArn: ensureResult.guardrail.arn
            });
          }
        } else {
          results.errors.push({
            scenarioName: scenario.name,
            error: ensureResult.error
          });
          results.success = false;
        }
      } catch (error) {
        results.errors.push({
          scenarioName: scenario.name,
          error: error.message
        });
        results.success = false;
      }
    }

    return results;
  }

  /**
   * Ensure that all guardrails from configurations exist in AWS
   * Creates missing guardrails and returns their ARNs
   * @param {Array} configs - Array of guardrail configurations
   * @returns {Promise<Object>} Results of guardrail creation/discovery
   */
  async ensureGuardrailsExist(configs) {
    if (!Array.isArray(configs) || configs.length === 0) {
      return { success: true, guardrails: [], created: [], existing: [] };
    }

    const results = {
      success: true,
      guardrails: [],
      created: [],
      existing: [],
      errors: []
    };

    try {
      // Get existing guardrails
      const existingGuardrails = await this.listGuardrails();

      for (const config of configs) {
        try {
          // Check if guardrail already exists by name
          const existing = existingGuardrails.find(g => g.name === config.name);

          if (existing) {
            // Guardrail exists, use it
            results.existing.push({
              name: config.name,
              guardrailId: existing.id,
              guardrailArn: existing.arn,
              version: existing.version
            });

            results.guardrails.push({
              name: config.name,
              guardrailId: existing.id,
              guardrailArn: existing.arn,
              version: existing.version,
              status: 'existing'
            });
          } else {
            // Create new guardrail
            const createResult = await this.createGuardrail(config);

            results.created.push({
              name: config.name,
              guardrailId: createResult.guardrailId,
              guardrailArn: createResult.guardrailArn,
              version: createResult.version
            });

            results.guardrails.push({
              name: config.name,
              guardrailId: createResult.guardrailId,
              guardrailArn: createResult.guardrailArn,
              version: createResult.version,
              status: 'created'
            });
          }
        } catch (configError) {
          results.errors.push({
            name: config.name,
            error: configError.message
          });
          results.success = false;
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to ensure guardrails exist: ${error.message}`);
    }
  }

  /**
   * Remove all application-created guardrails from AWS account
   * @param {Array} guardrailIds - Optional array of specific guardrail IDs to remove
   * @returns {Promise<Object>} Removal results
   */
  async removeAllApplicationGuardrails(guardrailIds = null) {
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(initResult.message);
      }
    }

    const results = {
      success: true,
      removed: [],
      errors: [],
      totalProcessed: 0
    };

    try {
      let guardrailsToRemove;

      if (guardrailIds && Array.isArray(guardrailIds)) {
        // Remove specific guardrails
        guardrailsToRemove = guardrailIds.map(id => ({ id }));
      } else {
        // Get all guardrails and filter for application-created ones
        const allGuardrails = await this.listGuardrails();
        // For now, we'll remove all guardrails. In a production system,
        // you might want to add tags or naming conventions to identify
        // application-created guardrails
        guardrailsToRemove = allGuardrails;
      }

      for (const guardrail of guardrailsToRemove) {
        results.totalProcessed++;

        try {
          await this.deleteGuardrail(guardrail.id);
          results.removed.push({
            id: guardrail.id,
            name: guardrail.name || 'Unknown'
          });
        } catch (deleteError) {
          results.errors.push({
            id: guardrail.id,
            name: guardrail.name || 'Unknown',
            error: deleteError.message
          });
          results.success = false;
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to remove guardrails: ${error.message}`);
    }
  }

  /**
   * Get service status information
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      credentialsValid: this.credentialsValid,
      ready: this.isReady(),
      lastError: this.lastError,
      lastSuccessfulCall: this.lastSuccessfulCall,
      degradedMode: this.isDegradedMode(),
      degradationReason: this.degradationReason
    };
  }

  /**
   * Check if the service is running in degraded mode
   * @returns {boolean} True if running in degraded mode
   */
  isDegradedMode() {
    return !this.isReady() || this.degradedMode === true;
  }

  /**
   * Enable degraded mode with a specific reason
   * @param {string} reason - Reason for degradation
   * @param {Object} context - Additional context
   */
  enableDegradedMode(reason, context = {}) {
    this.degradedMode = true;
    this.degradationReason = reason;
    this.degradationContext = context;
    this.degradationTimestamp = new Date().toISOString();

    console.warn(`Guardrail service entering degraded mode: ${reason}`, context);
  }

  /**
   * Disable degraded mode and return to normal operation
   */
  disableDegradedMode() {
    this.degradedMode = false;
    this.degradationReason = null;
    this.degradationContext = null;
    this.degradationTimestamp = null;

    console.info('Guardrail service returning to normal operation');
  }

  /**
   * Get degradation status information
   * @returns {Object} Degradation status
   */
  getDegradationStatus() {
    return {
      isDegraded: this.isDegradedMode(),
      reason: this.degradationReason,
      context: this.degradationContext,
      timestamp: this.degradationTimestamp,
      canRecover: this.canRecoverFromDegradation()
    };
  }

  /**
   * Check if the service can recover from current degradation
   * @returns {boolean} True if recovery is possible
   */
  canRecoverFromDegradation() {
    if (!this.isDegradedMode()) {
      return true;
    }

    // Check if the degradation reason is recoverable
    const recoverableReasons = [
      'NETWORK_ERROR',
      'THROTTLING',
      'SERVICE_UNAVAILABLE',
      'TEMPORARY_FAILURE'
    ];

    return recoverableReasons.includes(this.degradationReason);
  }

  /**
   * Attempt to recover from degraded mode
   * @returns {Promise<Object>} Recovery result
   */
  async attemptRecovery() {
    if (!this.isDegradedMode()) {
      return { success: true, message: 'Service is not in degraded mode' };
    }

    if (!this.canRecoverFromDegradation()) {
      return {
        success: false,
        message: `Cannot recover from degradation: ${this.degradationReason}`
      };
    }

    try {
      // Attempt to reinitialize the service
      const initResult = await this.initialize();

      if (initResult.success) {
        this.disableDegradedMode();
        return {
          success: true,
          message: 'Successfully recovered from degraded mode'
        };
      } else {
        return {
          success: false,
          message: `Recovery failed: ${initResult.message}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Recovery failed: ${error.message}`
      };
    }
  }

  /**
   * Execute an operation with graceful degradation
   * If the operation fails, the service will continue without guardrails
   * @param {Function} operation - The guardrail operation to execute
   * @param {Object} options - Options for graceful degradation
   * @returns {Promise<Object>} Operation result with degradation info
   */
  async executeWithGracefulDegradation(operation, options = {}) {
    const {
      operationName = 'guardrail operation',
      fallbackValue = null,
      enableDegradationOnFailure = true,
      context = {}
    } = options;

    // If already in degraded mode, return fallback immediately
    if (this.isDegradedMode()) {
      return {
        success: false,
        degraded: true,
        result: fallbackValue,
        message: `Guardrail service is in degraded mode: ${this.degradationReason}`,
        degradationInfo: this.getDegradationStatus()
      };
    }

    try {
      const result = await operation();

      return {
        success: true,
        degraded: false,
        result: result,
        message: `${operationName} completed successfully`
      };
    } catch (error) {
      const errorInfo = this.categorizeGuardrailError(error, { ...context, operationName });

      // Determine if this error should trigger degraded mode
      const shouldDegrade = enableDegradationOnFailure && this.shouldTriggerDegradation(errorInfo);

      if (shouldDegrade) {
        this.enableDegradedMode(errorInfo.type, {
          originalError: error.message,
          operationName,
          context
        });
      }

      return {
        success: false,
        degraded: shouldDegrade,
        result: fallbackValue,
        message: errorInfo.userMessage,
        error: errorInfo,
        degradationInfo: shouldDegrade ? this.getDegradationStatus() : null
      };
    }
  }

  /**
   * Determine if an error should trigger degraded mode
   * @param {Object} errorInfo - Structured error information
   * @returns {boolean} True if degraded mode should be enabled
   */
  shouldTriggerDegradation(errorInfo) {
    const degradationTriggers = [
      'GUARDRAIL_CREDENTIALS',
      'GUARDRAIL_PERMISSIONS',
      'GUARDRAIL_SERVICE_ERROR',
      'GUARDRAIL_THROTTLING'
    ];

    return degradationTriggers.includes(errorInfo.type);
  }

  /**
   * Apply guardrail with graceful degradation
   * If guardrail evaluation fails, returns a result indicating no violations
   * @param {string} guardrailIdentifier - The guardrail ID or ARN
   * @param {string} content - The content to evaluate
   * @param {string} source - The source of the content ('INPUT' or 'OUTPUT')
   * @returns {Promise<Object>} Guardrail evaluation result or fallback
   */
  async applyGuardrailWithGracefulDegradation(guardrailIdentifier, content, source = 'INPUT') {
    const fallbackResult = {
      action: 'NONE',
      output: content,
      assessments: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      degraded: true
    };

    return await this.executeWithGracefulDegradation(
      () => this.applyGuardrail(guardrailIdentifier, content, source),
      {
        operationName: 'apply guardrail with graceful degradation',
        fallbackValue: fallbackResult,
        context: { guardrailIdentifier, source, contentLength: content.length }
      }
    );
  }

  /**
   * Create guardrail with graceful degradation
   * If creation fails, logs the error but allows the application to continue
   * @param {string} scenarioName - Name of the scenario
   * @param {Object} guardrailConfig - Guardrail configuration object
   * @returns {Promise<Object>} Creation result or fallback
   */
  async createGuardrailForScenarioWithGracefulDegradation(scenarioName, guardrailConfig) {
    const fallbackResult = {
      success: false,
      guardrailId: null,
      guardrailArn: null,
      version: null,
      scenarioName: scenarioName,
      degraded: true
    };

    return await this.executeWithGracefulDegradation(
      () => this.createGuardrailForScenario(scenarioName, guardrailConfig),
      {
        operationName: 'create guardrail for scenario with graceful degradation',
        fallbackValue: fallbackResult,
        enableDegradationOnFailure: false, // Don't degrade on creation failures
        context: { scenarioName }
      }
    );
  }

  /**
   * Initialize guardrails with graceful degradation
   * Continues even if some guardrails fail to initialize
   * @param {Array} scenarios - Array of scenario objects with guardrail configurations
   * @returns {Promise<Object>} Results with degradation information
   */
  async initializeGuardrailsWithGracefulDegradation(scenarios) {
    const results = {
      success: true,
      processed: 0,
      created: [],
      existing: [],
      errors: [],
      skipped: [],
      degraded: false,
      degradationInfo: null
    };

    // Check if service is available
    if (!this.isReady()) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        this.enableDegradedMode('INITIALIZATION_FAILED', {
          error: initResult.message
        });

        results.degraded = true;
        results.degradationInfo = this.getDegradationStatus();
        results.success = false;

        // Skip all scenarios but don't fail completely
        scenarios.forEach(scenario => {
          results.skipped.push({
            scenarioName: scenario.name,
            reason: 'Guardrail service initialization failed - running without guardrails'
          });
        });

        return results;
      }
    }

    for (const scenario of scenarios) {
      results.processed++;

      // Skip scenarios without guardrail configuration
      if (!scenario.guardrails || !scenario.guardrails.enabled) {
        results.skipped.push({
          scenarioName: scenario.name,
          reason: 'No guardrail configuration or disabled'
        });
        continue;
      }

      try {
        const ensureResult = await this.createGuardrailForScenarioWithGracefulDegradation(
          scenario.name,
          scenario.guardrails
        );

        if (ensureResult.success && ensureResult.result) {
          // Store the guardrail information for quick access
          this.storeGuardrailForScenario(
            scenario.name,
            ensureResult.result.guardrailArn,
            ensureResult.result.guardrailId
          );

          results.created.push({
            scenarioName: scenario.name,
            guardrailId: ensureResult.result.guardrailId,
            guardrailArn: ensureResult.result.guardrailArn
          });
        } else {
          // Log error but continue processing
          results.errors.push({
            scenarioName: scenario.name,
            error: ensureResult.message || 'Unknown error',
            degraded: ensureResult.degraded
          });

          if (ensureResult.degraded) {
            results.degraded = true;
          }
        }
      } catch (error) {
        results.errors.push({
          scenarioName: scenario.name,
          error: error.message,
          degraded: false
        });
      }
    }

    // Update degradation info if service is degraded
    if (this.isDegradedMode()) {
      results.degraded = true;
      results.degradationInfo = this.getDegradationStatus();
    }

    return results;
  }

  /**
   * Categorize guardrail-specific errors and provide structured error information
   * @param {Error} error - The error object
   * @param {Object} context - Additional context about the operation
   * @returns {Object} Structured error information
   */
  categorizeGuardrailError(error, context = {}) {
    const errorCode = error.name || error.code || 'UNKNOWN_ERROR';
    const errorMessage = error.message || '';

    // Define guardrail-specific error categories
    const guardrailErrorCategories = {
      'AccessDeniedException': {
        type: 'GUARDRAIL_PERMISSIONS',
        severity: 'HIGH',
        userMessage: 'AWS credentials lack permission to access Bedrock Guardrails. Please ensure your credentials have bedrock:CreateGuardrail, bedrock:ListGuardrails, and bedrock:ApplyGuardrail permissions.',
        actions: [
          'Check your IAM permissions for Bedrock Guardrails',
          'Ensure your AWS account has access to Amazon Bedrock',
          'Try using administrator credentials temporarily',
          'Contact your AWS administrator for proper permissions'
        ],
        recoverable: true,
        retryable: false
      },
      'ValidationException': {
        type: 'GUARDRAIL_VALIDATION',
        severity: 'MEDIUM',
        userMessage: 'Guardrail configuration is invalid. Please check your scenario configuration.',
        actions: [
          'Review your guardrail configuration in the scenario file',
          'Ensure all required fields are properly formatted',
          'Check that policy configurations follow AWS Bedrock requirements',
          'Refer to AWS Bedrock Guardrails documentation for valid configurations'
        ],
        recoverable: true,
        retryable: false
      },
      'ServiceQuotaExceededException': {
        type: 'GUARDRAIL_QUOTA',
        severity: 'HIGH',
        userMessage: 'You have reached the maximum number of guardrails for your account.',
        actions: [
          'Delete unused guardrails from your AWS account',
          'Request a quota increase through AWS Support',
          'Consider consolidating multiple scenarios to use fewer guardrails',
          'Review your guardrail usage in the AWS Console'
        ],
        recoverable: false,
        retryable: false
      },
      'ThrottlingException': {
        type: 'GUARDRAIL_THROTTLING',
        severity: 'MEDIUM',
        userMessage: 'AWS API rate limit exceeded. The system will automatically retry.',
        actions: [
          'Wait for automatic retry - no action needed',
          'Reduce the frequency of guardrail operations',
          'Consider implementing request batching',
          'Contact AWS Support if throttling persists'
        ],
        recoverable: true,
        retryable: true
      },
      'ResourceNotFoundException': {
        type: 'GUARDRAIL_NOT_FOUND',
        severity: 'MEDIUM',
        userMessage: 'Guardrail not found in your AWS account. It may have been deleted.',
        actions: [
          'The system will automatically create a new guardrail',
          'Check if the guardrail was manually deleted from AWS Console',
          'Verify you are using the correct AWS region',
          'Refresh the application to discover existing guardrails'
        ],
        recoverable: true,
        retryable: false
      },
      'ConflictException': {
        type: 'GUARDRAIL_CONFLICT',
        severity: 'MEDIUM',
        userMessage: 'A guardrail with this name already exists or is being modified.',
        actions: [
          'Wait a moment and try again',
          'Check if another process is modifying the same guardrail',
          'Use a different name for the guardrail',
          'Delete the existing guardrail if it is no longer needed'
        ],
        recoverable: true,
        retryable: true
      },
      'InternalServerException': {
        type: 'GUARDRAIL_SERVICE_ERROR',
        severity: 'HIGH',
        userMessage: 'AWS Bedrock Guardrails service is experiencing issues.',
        actions: [
          'Wait a few minutes and try again',
          'Check AWS service health dashboard',
          'Try using a different AWS region',
          'Contact AWS Support if the issue persists'
        ],
        recoverable: true,
        retryable: true
      },
      'CredentialsProviderError': {
        type: 'GUARDRAIL_CREDENTIALS',
        severity: 'HIGH',
        userMessage: 'AWS credentials not found or invalid.',
        actions: [
          'Run the local-setup.sh script to configure AWS SSO',
          'Create a .env.local file with VITE_AWS_* variables',
          'Check that your AWS credentials are valid and not expired',
          'Ensure you have configured the correct AWS region'
        ],
        recoverable: true,
        retryable: false
      }
    };

    // Get error category or use default
    const category = guardrailErrorCategories[errorCode] || {
      type: 'GUARDRAIL_UNKNOWN',
      severity: 'MEDIUM',
      userMessage: `Guardrail operation failed: ${errorMessage}`,
      actions: [
        'Try the operation again',
        'Check your AWS credentials and permissions',
        'Verify your internet connection',
        'Contact support if the issue persists'
      ],
      recoverable: true,
      retryable: true
    };

    return {
      ...category,
      originalError: error,
      errorCode,
      originalMessage: errorMessage,
      context,
      timestamp: new Date().toISOString(),
      id: `guardrail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * Execute a guardrail operation with comprehensive error handling and retry logic
   * @param {Function} operation - The operation to execute
   * @param {Object} options - Options for error handling and retry
   * @returns {Promise} Promise that resolves with the operation result
   */
  async executeWithErrorHandling(operation, options = {}) {
    const {
      operationName = 'guardrail operation',
      context = {},
      maxRetries = 3,
      baseDelay = 1000,
      onError = null,
      onRetry = null
    } = options;

    try {
      // For retryable operations, use retry with backoff
      return await retryWithBackoff(operation, {
        maxRetries,
        baseDelay,
        onRetry: (error, attempt, delay) => {
          const errorInfo = this.categorizeGuardrailError(error, { ...context, attempt, operationName });

          // Only retry if the error is retryable
          if (!errorInfo.retryable) {
            throw error;
          }

          console.warn(`Retrying ${operationName} (attempt ${attempt}/${maxRetries + 1}) after ${delay}ms:`, errorInfo.userMessage);

          if (onRetry) {
            onRetry(errorInfo, attempt, delay);
          }
        }
      });
    } catch (error) {
      const errorInfo = this.categorizeGuardrailError(error, { ...context, operationName });

      // Log the error
      console.error(`${operationName} failed:`, errorInfo);

      // Store error for debugging
      this.lastError = errorInfo;

      // Call error handler if provided
      if (onError) {
        onError(errorInfo);
      }

      // Re-throw with enhanced error information
      const enhancedError = new Error(errorInfo.userMessage);
      enhancedError.guardrailErrorInfo = errorInfo;
      throw enhancedError;
    }
  }

  /**
   * Get user-friendly error message for credential-related errors
   * @param {Error} error - The error object
   * @returns {string} User-friendly error message
   */
  getCredentialErrorMessage(error) {
    const errorInfo = this.categorizeGuardrailError(error, { operation: 'initialization' });
    return errorInfo.userMessage;
  }

  /**
   * Check if an error is recoverable and the operation should be retried
   * @param {Error} error - The error object
   * @returns {boolean} True if the error is recoverable
   */
  isRecoverableError(error) {
    const errorInfo = this.categorizeGuardrailError(error);
    return errorInfo.recoverable;
  }

  /**
   * Get troubleshooting guidance for a specific error
   * @param {Error} error - The error object
   * @param {Object} context - Additional context
   * @returns {Object} Troubleshooting guidance
   */
  getTroubleshootingGuidance(error, context = {}) {
    const errorInfo = this.categorizeGuardrailError(error, context);

    return {
      errorType: errorInfo.type,
      severity: errorInfo.severity,
      userMessage: errorInfo.userMessage,
      suggestedActions: errorInfo.actions,
      recoverable: errorInfo.recoverable,
      retryable: errorInfo.retryable,
      context: errorInfo.context,
      timestamp: errorInfo.timestamp,
      errorId: errorInfo.id
    };
  }
}

// Export singleton instance
export const guardrailService = new GuardrailService();
