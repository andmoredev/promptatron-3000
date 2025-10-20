/**
 * Simple service for managing scenario operations
 */

import { validateScenario, extractScenarioMetadata, migrateScenarioSchema, needsGuardrailsMigration } from '../utils/scenarioModels.js';

// Import manifest and scenario configurations directly
import manifestData from '../scenarios/manifest.json' with { type: 'json' };

const scenarioJsonModules = import.meta.glob('../scenarios/*/scenario.json', { eager: true, import: 'default' });
const jsonDatasetModules = import.meta.glob('../scenarios/*/datasets/*.json', { eager: true, import: 'default' });

/**
 * ScenarioService class for managing scenario operations
 */
export class ScenarioService {
  constructor() {
    this.scenarios = new Map();
    this.scenarioMetadata = new Map();
    this.currentScenario = null;
    this.isInitialized = false;
    this.scanErrors = [];
  }

  /**
   * Initialize the scenario service
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    try {
      // Prevent multiple simultaneous initializations
      if (this.isInitialized) {
        return {
          success: true,
          message: `Scenario service already initialized with ${this.scenarios.size} scenarios`,
          scenarioCount: this.scenarios.size,
          errors: this.scanErrors
        };
      }

      await this.loadScenarios();
      this.isInitialized = true;

      return {
        success: true,
        message: `Scenario service initialized with ${this.scenarios.size} scenarios`,
        scenarioCount: this.scenarios.size,
        errors: this.scanErrors
      };
    } catch (error) {
      console.error('[ScenarioService] Initialization failed:', error);
      this.isInitialized = false;
      return {
        success: false,
        message: error.message,
        error: error.message
      };
    }
  }

  /**
   * Load all scenarios from the scenarios directory
   * @returns {Promise<Object>} Load result with scenario count and errors
   */
  async loadScenarios() {
    try {
      // Clear existing scenarios
      this.scenarios.clear();
      this.scenarioMetadata.clear();
      this.scanErrors = [];

      // Get list of scenario files
      const scenarioFiles = await this.scanScenariosDirectory();

      let successCount = 0;
      let errorCount = 0;

      // Load each scenario file
      for (const file of scenarioFiles) {
        try {
          const result = await this.loadScenarioFile(file);
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
            this.scanErrors.push({
              file: file,
              error: result.error.message,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          errorCount++;
          this.scanErrors.push({
            file: file,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      return {
        success: true,
        totalFiles: scenarioFiles.length,
        successCount: successCount,
        errorCount: errorCount,
        errors: this.scanErrors
      };
    } catch (error) {
      console.error('[ScenarioService] Error loading scenarios:', error);
      throw error;
    }
  }

  /**
   * Scan scenarios directory for available scenario files
   * @returns {Promise<string[]>} Array of scenario filenames
   */
  async scanScenariosDirectory() {
    try {
      // Try to load from manifest first
      const manifestFiles = await this.loadFromManifest();
      if (manifestFiles.length > 0) {
        return manifestFiles;
      }

      // Fallback to checking known files
      return await this.checkKnownFiles();
    } catch (error) {
      console.error('[ScenarioService] Error scanning scenarios directory:', error);
      return [];
    }
  }

  /**
   * Load scenario list from manifest file
   * @returns {Promise<string[]>} Array of scenario paths from manifest
   */
  async loadFromManifest() {
    try {
      // Use imported manifest data instead of HTTP fetch
      const manifest = manifestData;

      if (manifest.scenarios && Array.isArray(manifest.scenarios)) {
        const scenarioPaths = manifest.scenarios
          .filter(scenario => scenario.enabled !== false) // Only include enabled scenarios
          .map(scenario => {
            if (typeof scenario === 'string') {
              return scenario.endsWith('.json') ? scenario : null;
            } else if (typeof scenario === 'object' && scenario.folder) {
              return `${scenario.folder}/scenario.json`;
            } else if (typeof scenario === 'object' && scenario.file) {
              return scenario.file;
            }
            return null;
          }).filter(Boolean);

        return scenarioPaths;
      }
    } catch (error) {
      console.error('[ScenarioService] Error loading manifest:', error);
    }
    return [];
  }

  /**
   * Check for known scenario files (fallback method - now uses manifest data)
   * @returns {Promise<string[]>} Array of existing known scenario files
   */
  async checkKnownFiles() {
    // Since we're using the consolidated structure with manifest,
    // we can directly return the scenarios from the manifest as a fallback
    try {
      return manifestData.scenarios
        .filter(scenario => scenario.enabled !== false)
        .map(scenario => `${scenario.folder}/${scenario.configFile}`);
    } catch (error) {
      console.error('[ScenarioService] Error checking known files:', error);
      return [];
    }
  }

  /**
   * Load a single scenario file
   * @param {string} filename - The scenario filename or path
   * @returns {Promise<Object>} Load result
   */
  async loadScenarioFile(filename) {
    try {
      // Extract folder name from filename (e.g., "fraud-detection/scenario.json" -> "fraud-detection")
      const folderName = filename.includes('/') ? filename.split('/')[0] : filename.replace('.json', '');

      const scenarioInfo = manifestData.scenarios.find(s => s.folder === folderName || s.id === folderName);
      if (!scenarioInfo) {
        throw new Error(`No manifest entry for scenario: ${folderName}`);
      }

      const scenarioModuleKey = `../scenarios/${scenarioInfo.folder}/scenario.json`;
      let scenarioData = scenarioJsonModules[scenarioModuleKey];

      if (!scenarioData) {
        throw new Error(`Scenario data not found: ${filename}`);
      }

      // Migrate scenario schema if needed for backward compatibility
      if (needsGuardrailsMigration(scenarioData)) {
        scenarioData = migrateScenarioSchema(scenarioData);
      }

      // Validate scenario
      const validation = await validateScenario(scenarioData);

      if (!validation.isValid) {
        const errorSummary = Object.entries(validation.errors)
          .map(([field, message]) => `${field}: ${message}`)
          .join('; ');

        return {
          success: false,
          error: new Error(`Invalid scenario structure: ${errorSummary}`),
          filename: filename
        };
      }

      // Validate guardrails configuration if present
      if (scenarioData.guardrails) {
        const guardrailValidation = await this.validateScenarioGuardrails(scenarioData.id, scenarioData);
        if (!guardrailValidation.isValid) {
          console.warn(`[ScenarioService] Guardrail validation warnings for ${scenarioData.id}:`, guardrailValidation.errors);
          // Don't fail loading for guardrail validation issues, just log warnings
        }
      }

      // Extract metadata
      const metadata = extractScenarioMetadata(scenarioData);

      // Store scenario and metadata
      this.scenarios.set(scenarioData.id, {
        ...scenarioData,
        filename: filename,
        loadedAt: new Date().toISOString()
      });

      this.scenarioMetadata.set(scenarioData.id, {
        ...metadata,
        filename: filename,
        loadedAt: new Date().toISOString()
      });

      return {
        success: true,
        scenarioId: scenarioData.id,
        metadata: metadata
      };
    } catch (error) {
      console.error(`[ScenarioService] Error loading scenario file ${filename}:`, error);

      return {
        success: false,
        error: error,
        filename: filename
      };
    }
  }

  /**
   * Get all available scenarios metadata
   * @returns {Array} Array of scenario metadata objects
   */
  getAvailableScenarios() {
    return Array.from(this.scenarioMetadata.values());
  }

  /**
   * Get list of available scenarios (alias for getAvailableScenarios)
   * @returns {Array} Array of scenario metadata objects
   */
  getScenarioList() {
    return this.getAvailableScenarios();
  }

  /**
   * Get a specific scenario by ID
   * @param {string} scenarioId - The scenario ID
   * @returns {Object|null} The scenario object or null if not found
   */
  getScenario(scenarioId) {
    return this.scenarios.get(scenarioId) || null;
  }

  /**
   * Get scenario metadata by ID
   * @param {string} scenarioId - The scenario ID
   * @returns {Object|null} The scenario metadata or null if not found
   */
  getScenarioMetadata(scenarioId) {
    if (!this.isInitialized) {
      return null;
    }
    return this.scenarioMetadata.get(scenarioId) || null;
  }

  /**
   * Set the current active scenario
   * @param {string} scenarioId - The scenario ID to set as current
   * @returns {boolean} True if scenario was found and set, false otherwise
   */
  setCurrentScenario(scenarioId) {
    const scenario = this.scenarios.get(scenarioId);
    if (scenario) {
      this.currentScenario = scenario;
      return true;
    }
    return false;
  }

  /**
   * Get the current active scenario
   * @returns {Object|null} The current scenario or null if none set
   */
  getCurrentScenario() {
    return this.currentScenario;
  }

  /**
   * Get dataset content for a scenario dataset
   * @param {string} scenarioId - The scenario ID
   * @param {string} datasetId - The dataset ID from scenario config
   * @returns {Promise<string>} Dataset content
   */
  async getDatasetContent(scenarioId, datasetId) {
    try {
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario || !scenario.datasets) {
        throw new Error(`Scenario ${scenarioId} not found or has no datasets`);
      }

      const dataset = scenario.datasets.find(d => d.id === datasetId);
      if (!dataset) {
        throw new Error(`Dataset ${datasetId} not found in scenario ${scenarioId}`);
      }

      // Get scenario folder from manifest
      const scenarioInfo = manifestData.scenarios.find(s => s.id === scenarioId);
      if (!scenarioInfo) {
        throw new Error(`Scenario ${scenarioId} not found in manifest`);
      }

      // Construct the dataset keys for the preloaded module maps
      const baseKey = `../scenarios/${scenarioInfo.folder}/${dataset.file}`;

      // Try JSON datasets first
      if (dataset.file.endsWith('.json')) {
        let jsonModule = jsonDatasetModules[baseKey];
        if (!jsonModule) {
          // Fallback: search keys to tolerate minor path/query differences
          const jsonKey = Object.keys(jsonDatasetModules).find(k =>
            k.endsWith(`/${scenarioInfo.folder}/${dataset.file}`)
          );
          if (jsonKey) {
            jsonModule = jsonDatasetModules[jsonKey];
          }
        }
        if (!jsonModule) {
          throw new Error(`Dataset file not found or not accessible: ${dataset.file}. Make sure the file exists in the consolidated structure and is properly configured for import.`);
        }
        return JSON.stringify(jsonModule, null, 2);
      }

      // Then CSV/TSV datasets via URL + fetch to get raw text (no pre-imports)
      if (dataset.file.endsWith('.csv') || dataset.file.endsWith('.tsv')) {
        // Build a stable asset URL that works in dev and build
        let urlString = '';
        try {
          // Let Vite resolve the asset into a served URL when building
          urlString = new URL(`../scenarios/${scenarioInfo.folder}/${dataset.file}`, import.meta.url).toString();
        } catch (e) {
          // Fallback for environments that don't transform the URL
          urlString = `/src/scenarios/${scenarioInfo.folder}/${dataset.file}`;
        }

        // Fetch the asset URL to get the file contents as text
        try {
          const res = await fetch(urlString);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const text = await res.text();
          if (!text || !text.trim()) {
            throw new Error('CSV file is empty');
          }
          return text;
        } catch (e) {
          throw new Error(`Failed to load dataset file: ${dataset.file}`);
        }
      }

      // Unsupported extension
      throw new Error(`Unsupported dataset file format: ${dataset.file}`);
    } catch (error) {
      console.error(`[ScenarioService] Error loading dataset content:`, error);
      throw error;
    }
  }

  /**
   * Check if the service is ready
   * @returns {boolean} True if initialized and ready
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Get service status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      scenarioCount: this.scenarios.size,
      errors: this.scanErrors,
      currentScenario: this.currentScenario?.id || null
    };
  }

  /**
   * Reload scenarios from disk
   * @returns {Promise<Object>} Reload result
   */
  async reloadScenarios() {
    try {
      const result = await this.loadScenarios();

      return {
        success: true,
        message: `Reloaded ${result.successCount} scenarios`,
        scenarioCount: result.successCount,
        errors: result.errors
      };
    } catch (error) {
      console.error('[ScenarioService] Error reloading scenarios:', error);
      return {
        success: false,
        message: error.message,
        error: error.message
      };
    }
  }

  /**
   * Refresh seed data for a specific scenario
   * @param {string} scenarioId - The scenario ID to refresh
   * @returns {Promise<Object>} Refresh result
   */
  async refreshScenarioSeedData(scenarioId) {
    try {
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        throw new Error(`Scenario ${scenarioId} not found`);
      }

      // For scenarios with datasets, we can reload the scenario to refresh any cached data
      // In a more complex system, this might involve:
      // - Re-fetching data from external APIs
      // - Regenerating sample data
      // - Clearing caches
      // - Reloading configuration files

      // Reload the specific scenario
      const scenarioInfo = manifestData.scenarios.find(s => s.id === scenarioId);
      if (scenarioInfo) {
        const filename = `${scenarioInfo.folder}/${scenarioInfo.configFile}`;
        const reloadResult = await this.loadScenarioFile(filename);

        if (reloadResult.success) {
          // If scenario has explicit seed data file, we could reload that too
          if (scenario.seedData?.dataFile) {
            try {
              // In a real implementation, this would reload the seed data file
              // For now, we just log that we would refresh it
              console.log(`[ScenarioService] Would refresh seed data file: ${scenario.seedData.dataFile}`);
            } catch (seedError) {
              console.warn(`[ScenarioService] Could not refresh seed data file:`, seedError);
            }
          }

          return {
            success: true,
            message: `Refreshed seed data for scenario ${scenarioId}`,
            scenarioId: scenarioId,
            hasExplicitSeedData: !!scenario.seedData,
            hasDatasets: !!(scenario.datasets && scenario.datasets.length > 0)
          };
        } else {
          throw new Error(reloadResult.error.message);
        }
      } else {
        throw new Error(`Scenario configuration not found in manifest: ${scenarioId}`);
      }
    } catch (error) {
      console.error(`[ScenarioService] Error refreshing seed data for ${scenarioId}:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
        scenarioId: scenarioId
      };
    }
  }

  /**
   * Validate scenario with enhanced error reporting
   * @param {Object} scenario - The scenario to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Enhanced validation result
   */
  async validateScenarioWithEnhancedErrors(scenario, options = {}) {
    try {
      const validation = await validateScenario(scenario, options);

      // Add enhanced error information
      if (!validation.isValid && validation.errors) {
        const enhancedErrors = {};

        for (const [field, message] of Object.entries(validation.errors)) {
          enhancedErrors[field] = {
            message: message,
            fixable: this.isFixableValidationError(field, message),
            suggestions: this.getValidationSuggestions(field, message)
          };
        }

        validation.enhancedErrors = enhancedErrors;
      }

      return validation;
    } catch (error) {
      return {
        isValid: false,
        errors: { validation: 'Failed to validate scenario' },
        enhancedErrors: {
          validation: {
            message: error.message,
            fixable: false,
            suggestions: []
          }
        }
      };
    }
  }

  /**
   * Attempt error recovery for failed scenarios
   * @param {string} scenarioId - The scenario ID
   * @param {Error} error - The error to recover from
   * @param {Object} options - Recovery options
   * @returns {Promise<Object>} Recovery result
   */
  async attemptErrorRecovery(scenarioId, error, options = {}) {
    const { enableFallback = true, createPlaceholder = true, logRecovery = true } = options;



    try {
      // For now, just return a simple recovery result
      // In a more complex system, this would implement actual recovery strategies
      return {
        success: false,
        method: 'none',
        scenario: null,
        warnings: ['Error recovery not implemented in simplified service'],
        errors: ['Recovery functionality has been simplified']
      };
    } catch (recoveryError) {
      return {
        success: false,
        method: 'failed',
        scenario: null,
        warnings: [],
        errors: [`Recovery failed: ${recoveryError.message}`]
      };
    }
  }

  /**
   * Check if a validation error is fixable
   * @param {string} field - The field with the error
   * @param {string} message - The error message
   * @returns {boolean} True if the error might be fixable
   */
  isFixableValidationError(field, message) {
    const fixableFields = ['name', 'description'];
    const fixableMessages = ['required', 'empty', 'missing'];

    return fixableFields.includes(field) ||
      fixableMessages.some(keyword => message.toLowerCase().includes(keyword));
  }

  /**
   * Get suggestions for fixing validation errors
   * @param {string} field - The field with the error
   * @param {string} message - The error message
   * @returns {Array} Array of suggestion strings
   */
  getValidationSuggestions(field, message) {
    const suggestions = [];

    if (field === 'name' && message.includes('required')) {
      suggestions.push('Add a descriptive name for the scenario');
    }

    if (field === 'description' && message.includes('required')) {
      suggestions.push('Add a description explaining what this scenario does');
    }

    if (field === 'id' && message.includes('format')) {
      suggestions.push('Use lowercase letters, numbers, and hyphens only');
    }

    return suggestions;
  }

  /**
   * Check if a scenario should show the dataset selector
   * @param {string} scenarioId - The scenario ID
   * @returns {boolean} True if scenario has datasets configured
   */
  shouldShowDatasetSelector(scenarioId) {
    try {
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        return false;
      }

      // Check if scenario has datasets configured
      return scenario.datasets && Array.isArray(scenario.datasets) && scenario.datasets.length > 0;
    } catch (error) {
      console.error(`[ScenarioService] Error checking dataset selector visibility for ${scenarioId}:`, error);
      return false;
    }
  }

  /**
   * Get datasets for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Array>} Array of datasets
   */
  async getDatasets(scenarioId) {
    try {
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        throw new Error(`Scenario ${scenarioId} not found`);
      }

      return scenario.datasets || [];
    } catch (error) {
      console.error(`[ScenarioService] Error getting datasets for ${scenarioId}:`, error);
      return [];
    }
  }

  /**
   * Get UI configuration for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Object>} UI configuration object
   */
  async getUIConfiguration(scenarioId) {
    try {
      // Ensure service is initialized
      if (!this.isInitialized) {
        await this.initialize();
      }

      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        throw new Error(`Scenario ${scenarioId} not found`);
      }

      // Determine if dataset selector should be shown
      const showDatasetSelector = this.shouldShowDatasetSelector(scenarioId);

      // Return the configuration from the scenario, or default values
      const baseConfig = scenario.configuration || {
        allowCustomPrompts: true,
        allowDatasetModification: false,
        defaultStreamingEnabled: true,
        maxIterations: 10,
        recommendedModels: []
      };

      return {
        ...baseConfig,
        showDatasetSelector,
        showSystemPromptSelector: scenario.systemPrompts && scenario.systemPrompts.length > 0,
        showUserPromptSelector: scenario.userPrompts && scenario.userPrompts.length > 0,
        showToolSettings: scenario.tools && scenario.tools.length > 0,
        showGuardrailsSection: this.shouldShowGuardrailsSection(scenarioId),
        guardrailsEnabled: this.areGuardrailsEnabled(scenarioId)
      };
    } catch (error) {
      console.error(`[ScenarioService] Error getting UI configuration for ${scenarioId}:`, error);
      // Return default configuration on error
      return {
        allowCustomPrompts: true,
        allowDatasetModification: false,
        defaultStreamingEnabled: true,
        maxIterations: 10,
        recommendedModels: [],
        showDatasetSelector: false,
        showSystemPromptSelector: false,
        showUserPromptSelector: false,
        showToolSettings: false,
        showGuardrailsSection: false,
        guardrailsEnabled: false
      };
    }
  }

  /**
   * Get system prompts for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Array>} Array of system prompts
   */
  async getSystemPrompts(scenarioId) {
    try {
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        throw new Error(`Scenario ${scenarioId} not found`);
      }

      return scenario.systemPrompts || [];
    } catch (error) {
      console.error(`[ScenarioService] Error getting system prompts for ${scenarioId}:`, error);
      return [];
    }
  }

  /**
   * Get user prompts for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Array>} Array of user prompts
   */
  async getUserPrompts(scenarioId) {
    try {
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        throw new Error(`Scenario ${scenarioId} not found`);
      }

      return scenario.userPrompts || [];
    } catch (error) {
      console.error(`[ScenarioService] Error getting user prompts for ${scenarioId}:`, error);
      return [];
    }
  }

  /**
   * Get tool execution mode for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {string} Tool execution mode ('none', 'optional', 'required')
   */
  getToolExecutionMode(scenarioId) {
    try {
      if (!this.isInitialized) {
        return 'none';
      }

      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        return 'none';
      }

      // Check if scenario has tools configured
      if (scenario.tools && Array.isArray(scenario.tools) && scenario.tools.length > 0) {
        // Check if tools are required or optional based on configuration
        if (scenario.toolConfiguration && scenario.toolConfiguration.required) {
          return 'required';
        }
        return 'optional';
      }

      return 'none';
    } catch (error) {
      console.error(`[ScenarioService] Error getting tool execution mode for ${scenarioId}:`, error);
      return 'none';
    }
  }

  /**
   * Get guardrails configuration for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Object|null} Guardrails configuration or null if not found
   */
  getGuardrailsConfiguration(scenarioId) {
    try {
      if (!this.isInitialized) {
        return null;
      }

      const scenario = this.scenarios.get(scenarioId);
      if (!scenario || !scenario.guardrails) {
        return null;
      }

      return scenario.guardrails;
    } catch (error) {
      console.error(`[ScenarioService] Error getting guardrails configuration for ${scenarioId}:`, error);
      return null;
    }
  }

  /**
   * Check if a scenario has guardrails configured
   * @param {string} scenarioId - The scenario ID
   * @returns {boolean} True if scenario has guardrails configured
   */
  hasGuardrails(scenarioId) {
    try {
      const guardrailsConfig = this.getGuardrailsConfiguration(scenarioId);
      return !!(guardrailsConfig && guardrailsConfig.configs && guardrailsConfig.configs.length > 0);
    } catch (error) {
      console.error(`[ScenarioService] Error checking guardrails for ${scenarioId}:`, error);
      return false;
    }
  }

  /**
   * Check if guardrails are enabled for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {boolean} True if guardrails are enabled (default true if configured)
   */
  areGuardrailsEnabled(scenarioId) {
    try {
      const guardrailsConfig = this.getGuardrailsConfiguration(scenarioId);
      if (!guardrailsConfig) {
        return false;
      }

      // Default to enabled if not explicitly disabled
      return guardrailsConfig.enabled !== false;
    } catch (error) {
      console.error(`[ScenarioService] Error checking if guardrails are enabled for ${scenarioId}:`, error);
      return false;
    }
  }

  /**
   * Get guardrail configurations for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Array} Array of guardrail configurations
   */
  getGuardrailConfigs(scenarioId) {
    try {
      const guardrailsConfig = this.getGuardrailsConfiguration(scenarioId);
      if (!guardrailsConfig || !guardrailsConfig.configs) {
        return [];
      }

      return guardrailsConfig.configs;
    } catch (error) {
      console.error(`[ScenarioService] Error getting guardrail configs for ${scenarioId}:`, error);
      return [];
    }
  }

  /**
   * Extract guardrail configurations for AWS resource management
   * @param {string} scenarioId - The scenario ID
   * @returns {Array} Array of guardrail configurations formatted for AWS
   */
  extractGuardrailResourceConfigs(scenarioId) {
    try {
      const guardrailConfigs = this.getGuardrailConfigs(scenarioId);

      return guardrailConfigs.map(config => ({
        name: config.name,
        description: config.description || `Guardrail for scenario ${scenarioId}`,
        blockedInputMessaging: config.blockedInputMessaging || 'This input violates our content policy.',
        blockedOutputsMessaging: config.blockedOutputsMessaging || 'This response was blocked by our content policy.',
        contentPolicyConfig: config.contentPolicyConfig,
        wordPolicyConfig: config.wordPolicyConfig,
        sensitiveInformationPolicyConfig: config.sensitiveInformationPolicyConfig,
        topicPolicyConfig: config.topicPolicyConfig,
        // Add metadata for resource tracking
        scenarioId: scenarioId,
        sourceType: 'scenario'
      }));
    } catch (error) {
      console.error(`[ScenarioService] Error extracting guardrail resource configs for ${scenarioId}:`, error);
      return [];
    }
  }

  /**
   * Validate guardrails configuration for a scenario
   * @param {string} scenarioId - The scenario ID
   * @param {Object} scenarioData - Optional scenario data (for validation during loading)
   * @returns {Object} Validation result with isValid, errors, and warnings
   */
  async validateScenarioGuardrails(scenarioId, scenarioData = null) {
    try {
      const scenario = scenarioData || this.scenarios.get(scenarioId);
      if (!scenario) {
        return {
          isValid: false,
          errors: { scenario: 'Scenario not found' },
          warnings: []
        };
      }

      if (!scenario.guardrails) {
        return {
          isValid: true,
          errors: {},
          warnings: [],
          hasGuardrails: false
        };
      }

      // Use the existing validation function from scenarioModels
      const validation = validateScenario(scenario);

      // Extract only guardrail-related errors
      const guardrailErrors = {};
      if (validation.errors && validation.errors.guardrails) {
        guardrailErrors.guardrails = validation.errors.guardrails;
      }

      return {
        isValid: Object.keys(guardrailErrors).length === 0,
        errors: guardrailErrors,
        warnings: validation.warnings || [],
        hasGuardrails: true
      };
    } catch (error) {
      console.error(`[ScenarioService] Error validating guardrails for ${scenarioId}:`, error);
      return {
        isValid: false,
        errors: { validation: `Validation failed: ${error.message}` },
        warnings: []
      };
    }
  }

  /**
   * Get guardrail summary information for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {Object} Guardrail summary with counts and types
   */
  getGuardrailSummary(scenarioId) {
    try {
      const guardrailConfigs = this.getGuardrailConfigs(scenarioId);

      if (guardrailConfigs.length === 0) {
        return {
          hasGuardrails: false,
          enabled: false,
          totalCount: 0,
          policyTypes: []
        };
      }

      const policyTypes = [];
      let hasContentPolicy = false;
      let hasWordPolicy = false;
      let hasPiiPolicy = false;
      let hasTopicPolicy = false;

      guardrailConfigs.forEach(config => {
        if (config.contentPolicyConfig) {
          hasContentPolicy = true;
        }
        if (config.wordPolicyConfig) {
          hasWordPolicy = true;
        }
        if (config.sensitiveInformationPolicyConfig) {
          hasPiiPolicy = true;
        }
        if (config.topicPolicyConfig) {
          hasTopicPolicy = true;
        }
      });

      if (hasContentPolicy) policyTypes.push('content');
      if (hasWordPolicy) policyTypes.push('word');
      if (hasPiiPolicy) policyTypes.push('pii');
      if (hasTopicPolicy) policyTypes.push('topic');

      return {
        hasGuardrails: true,
        enabled: this.areGuardrailsEnabled(scenarioId),
        totalCount: guardrailConfigs.length,
        policyTypes: policyTypes,
        guardrailNames: guardrailConfigs.map(config => config.name)
      };
    } catch (error) {
      console.error(`[ScenarioService] Error getting guardrail summary for ${scenarioId}:`, error);
      return {
        hasGuardrails: false,
        enabled: false,
        totalCount: 0,
        policyTypes: []
      };
    }
  }

  /**
   * Check if scenario should show guardrails section in UI
   * @param {string} scenarioId - The scenario ID
   * @returns {boolean} True if guardrails section should be shown
   */
  shouldShowGuardrailsSection(scenarioId) {
    return this.hasGuardrails(scenarioId);
  }

  /**
   * Prepare guardrail configurations for AWS resource creation
   * @param {string} scenarioId - The scenario ID
   * @returns {Promise<Array>} Array of guardrail configurations ready for AWS creation
   */
  async prepareGuardrailResourceConfigs(scenarioId) {
    try {
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario || !scenario.guardrails || !scenario.guardrails.configs) {
        return [];
      }

      return scenario.guardrails.configs.map(config => ({
        name: config.name,
        description: config.description || `Guardrail for scenario ${scenarioId}`,
        blockedInputMessaging: config.blockedInputMessaging || 'This input violates our content policy.',
        blockedOutputsMessaging: config.blockedOutputsMessaging || 'This response was blocked by our content policy.',
        contentPolicyConfig: config.contentPolicyConfig,
        wordPolicyConfig: config.wordPolicyConfig,
        sensitiveInformationPolicyConfig: config.sensitiveInformationPolicyConfig,
        topicPolicyConfig: config.topicPolicyConfig,
        // Add metadata for resource tracking
        scenarioId: scenarioId,
        sourceType: 'scenario'
      }));
    } catch (error) {
      console.error(`[ScenarioService] Error preparing guardrail resource configs for ${scenarioId}:`, error);
      return [];
    }
  }

  /**
   * Manage guardrail resources for a scenario lifecycle event
   * @param {string} scenarioId - The scenario ID
   * @param {string} event - The lifecycle event ('load', 'unload', 'update')
   * @param {Object} options - Options for resource management
   * @returns {Promise<Object>} Resource management result
   */
  async manageGuardrailResources(scenarioId, event, options = {}) {
    const { autoCreate = true, guardrailService = null } = options;

    try {
      if (!guardrailService) {
        return {
          success: false,
          message: 'GuardrailService not provided',
          event: event,
          scenarioId: scenarioId
        };
      }

      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        return {
          success: false,
          message: `Scenario ${scenarioId} not found`,
          event: event,
          scenarioId: scenarioId
        };
      }

      switch (event) {
        case 'load':
          return await this.handleScenarioLoadGuardrails(scenarioId, scenario, guardrailService, autoCreate);

        case 'unload':
          return await this.handleScenarioUnloadGuardrails(scenarioId, scenario, guardrailService);

        case 'update':
          return await this.handleScenarioUpdateGuardrails(scenarioId, scenario, guardrailService);

        default:
          return {
            success: false,
            message: `Unknown lifecycle event: ${event}`,
            event: event,
            scenarioId: scenarioId
          };
      }
    } catch (error) {
      console.error(`[ScenarioService] Error managing guardrail resources for ${scenarioId} (${event}):`, error);
      return {
        success: false,
        message: error.message,
        event: event,
        scenarioId: scenarioId,
        error: error
      };
    }
  }

  /**
   * Handle guardrail resources when a scenario is loaded
   * @param {string} scenarioId - The scenario ID
   * @param {Object} scenario - The scenario data
   * @param {Object} guardrailService - The GuardrailService instance
   * @param {boolean} autoCreate - Whether to automatically create missing guardrails
   * @returns {Promise<Object>} Load result
   */
  async handleScenarioLoadGuardrails(scenarioId, scenario, guardrailService, autoCreate) {
    try {
      if (!scenario.guardrails || !scenario.guardrails.configs || scenario.guardrails.configs.length === 0) {
        return {
          success: true,
          message: `No guardrails configured for scenario ${scenarioId}`,
          event: 'load',
          scenarioId: scenarioId,
          hasGuardrails: false
        };
      }

      if (!autoCreate) {
        return {
          success: true,
          message: `Auto-create disabled, skipping guardrail resource management for ${scenarioId}`,
          event: 'load',
          scenarioId: scenarioId,
          hasGuardrails: true,
          autoCreateDisabled: true
        };
      }

      // Prepare guardrail configurations for AWS
      const guardrailConfigs = await this.prepareGuardrailResourceConfigs(scenarioId);

      if (guardrailConfigs.length === 0) {
        return {
          success: true,
          message: `No valid guardrail configurations found for scenario ${scenarioId}`,
          event: 'load',
          scenarioId: scenarioId,
          hasGuardrails: false
        };
      }

      // Ensure guardrails exist in AWS
      const ensureResult = await guardrailService.ensureGuardrailsExist(guardrailConfigs);

      return {
        success: ensureResult.success,
        message: `Guardrail resources managed for scenario ${scenarioId}: ${ensureResult.created.length} created, ${ensureResult.existing.length} existing`,
        event: 'load',
        scenarioId: scenarioId,
        hasGuardrails: true,
        guardrailsCreated: ensureResult.created,
        guardrailsExisting: ensureResult.existing,
        guardrailsErrors: ensureResult.errors,
        totalGuardrails: ensureResult.guardrails.length
      };
    } catch (error) {
      console.error(`[ScenarioService] Error handling scenario load guardrails for ${scenarioId}:`, error);
      return {
        success: false,
        message: `Failed to manage guardrail resources for scenario ${scenarioId}: ${error.message}`,
        event: 'load',
        scenarioId: scenarioId,
        error: error
      };
    }
  }

  /**
   * Handle guardrail resources when a scenario is unloaded
   * @param {string} scenarioId - The scenario ID
   * @param {Object} scenario - The scenario data
   * @param {Object} guardrailService - The GuardrailService instance
   * @returns {Promise<Object>} Unload result
   */
  async handleScenarioUnloadGuardrails(scenarioId, scenario, guardrailService) {
    try {
      // For now, we don't automatically delete guardrails when scenarios are unloaded
      // This prevents accidental deletion of shared resources
      // Users can manually manage guardrails through the settings interface

      return {
        success: true,
        message: `Scenario ${scenarioId} unloaded, guardrail resources preserved`,
        event: 'unload',
        scenarioId: scenarioId,
        action: 'preserve'
      };
    } catch (error) {
      console.error(`[ScenarioService] Error handling scenario unload guardrails for ${scenarioId}:`, error);
      return {
        success: false,
        message: `Failed to handle guardrail resources for scenario unload ${scenarioId}: ${error.message}`,
        event: 'unload',
        scenarioId: scenarioId,
        error: error
      };
    }
  }

  /**
   * Handle guardrail resources when a scenario is updated
   * @param {string} scenarioId - The scenario ID
   * @param {Object} scenario - The scenario data
   * @param {Object} guardrailService - The GuardrailService instance
   * @returns {Promise<Object>} Update result
   */
  async handleScenarioUpdateGuardrails(scenarioId, scenario, guardrailService) {
    try {
      if (!scenario.guardrails || !scenario.guardrails.configs || scenario.guardrails.configs.length === 0) {
        return {
          success: true,
          message: `No guardrails configured for updated scenario ${scenarioId}`,
          event: 'update',
          scenarioId: scenarioId,
          hasGuardrails: false
        };
      }

      // For scenario updates, we'll re-ensure guardrails exist
      // This handles cases where guardrail configurations have changed
      const guardrailConfigs = await this.prepareGuardrailResourceConfigs(scenarioId);

      if (guardrailConfigs.length === 0) {
        return {
          success: true,
          message: `No valid guardrail configurations found for updated scenario ${scenarioId}`,
          event: 'update',
          scenarioId: scenarioId,
          hasGuardrails: false
        };
      }

      const ensureResult = await guardrailService.ensureGuardrailsExist(guardrailConfigs);

      return {
        success: ensureResult.success,
        message: `Guardrail resources updated for scenario ${scenarioId}: ${ensureResult.created.length} created, ${ensureResult.existing.length} existing`,
        event: 'update',
        scenarioId: scenarioId,
        hasGuardrails: true,
        guardrailsCreated: ensureResult.created,
        guardrailsExisting: ensureResult.existing,
        guardrailsErrors: ensureResult.errors,
        totalGuardrails: ensureResult.guardrails.length
      };
    } catch (error) {
      console.error(`[ScenarioService] Error handling scenario update guardrails for ${scenarioId}:`, error);
      return {
        success: false,
        message: `Failed to update guardrail resources for scenario ${scenarioId}: ${error.message}`,
        event: 'update',
        scenarioId: scenarioId,
        error: error
      };
    }
  }

  /**
   * Get all scenarios that have guardrails configured
   * @returns {Array} Array of scenario IDs with guardrails
   */
  getScenariosWithGuardrails() {
    try {
      const scenariosWithGuardrails = [];

      for (const [scenarioId, scenario] of this.scenarios.entries()) {
        if (scenario.guardrails && scenario.guardrails.configs && scenario.guardrails.configs.length > 0) {
          scenariosWithGuardrails.push({
            scenarioId: scenarioId,
            scenarioName: scenario.name || scenarioId,
            guardrailCount: scenario.guardrails.configs.length,
            guardrailsEnabled: scenario.guardrails.enabled !== false
          });
        }
      }

      return scenariosWithGuardrails;
    } catch (error) {
      console.error('[ScenarioService] Error getting scenarios with guardrails:', error);
      return [];
    }
  }

  /**
   * Get aggregated guardrail resource requirements across all scenarios
   * @returns {Object} Aggregated guardrail requirements
   */
  getAggregatedGuardrailRequirements() {
    try {
      const requirements = {
        totalScenarios: 0,
        totalGuardrails: 0,
        uniqueGuardrailNames: new Set(),
        policyTypes: new Set(),
        scenarios: []
      };

      for (const [scenarioId, scenario] of this.scenarios.entries()) {
        if (scenario.guardrails && scenario.guardrails.configs && scenario.guardrails.configs.length > 0) {
          requirements.totalScenarios++;
          requirements.totalGuardrails += scenario.guardrails.configs.length;

          const scenarioInfo = {
            scenarioId: scenarioId,
            scenarioName: scenario.name || scenarioId,
            guardrails: []
          };

          scenario.guardrails.configs.forEach(config => {
            requirements.uniqueGuardrailNames.add(config.name);
            scenarioInfo.guardrails.push(config.name);

            // Track policy types
            if (config.contentPolicyConfig) requirements.policyTypes.add('content');
            if (config.wordPolicyConfig) requirements.policyTypes.add('word');
            if (config.sensitiveInformationPolicyConfig) requirements.policyTypes.add('pii');
            if (config.topicPolicyConfig) requirements.policyTypes.add('topic');
          });

          requirements.scenarios.push(scenarioInfo);
        }
      }

      return {
        totalScenarios: requirements.totalScenarios,
        totalGuardrails: requirements.totalGuardrails,
        uniqueGuardrailCount: requirements.uniqueGuardrailNames.size,
        uniqueGuardrailNames: Array.from(requirements.uniqueGuardrailNames),
        policyTypes: Array.from(requirements.policyTypes),
        scenarios: requirements.scenarios
      };
    } catch (error) {
      console.error('[ScenarioService] Error getting aggregated guardrail requirements:', error);
      return {
        totalScenarios: 0,
        totalGuardrails: 0,
        uniqueGuardrailCount: 0,
        uniqueGuardrailNames: [],
        policyTypes: [],
        scenarios: []
      };
    }
  }

  /**
   * Initialize guardrails for all scenarios with guardrail configurations
   * This method integrates with GuardrailService to ensure AWS resources exist
   * @param {Object} guardrailService - Instance of GuardrailService
   * @returns {Promise<Object>} Initialization results
   */
  async initializeGuardrailsForAllScenarios(guardrailService) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Get all scenarios with guardrail configurations
      const scenariosWithGuardrails = [];

      for (const [scenarioId, scenario] of this.scenarios.entries()) {
        if (scenario.guardrails && scenario.guardrails.enabled !== false) {
          scenariosWithGuardrails.push({
            name: scenarioId,
            guardrails: scenario.guardrails
          });
        }
      }

      if (scenariosWithGuardrails.length === 0) {
        return {
          success: true,
          message: 'No scenarios with guardrails found',
          processed: 0,
          created: [],
          existing: [],
          errors: []
        };
      }

      // Use GuardrailService to initialize guardrails
      const results = await guardrailService.initializeGuardrailsForScenarios(scenariosWithGuardrails);

      return {
        success: results.success,
        message: `Processed ${results.processed} scenarios with guardrails`,
        processed: results.processed,
        created: results.created,
        existing: results.existing,
        errors: results.errors,
        skipped: results.skipped
      };
    } catch (error) {
      console.error('[ScenarioService] Error initializing guardrails for scenarios:', error);
      return {
        success: false,
        message: error.message,
        processed: 0,
        created: [],
        existing: [],
        errors: [{ scenarioName: 'initialization', error: error.message }]
      };
    }
  }

  /**
   * Get guardrail ARN for a scenario from GuardrailService
   * @param {string} scenarioId - The scenario ID
   * @param {Object} guardrailService - Instance of GuardrailService
   * @returns {Promise<string|null>} Guardrail ARN or null if not found
   */
  async getGuardrailArnForScenario(scenarioId, guardrailService) {
    try {
      // First check if scenario has guardrails configured
      if (!this.hasGuardrails(scenarioId)) {
        return null;
      }

      // Check stored guardrail information
      const storedGuardrail = guardrailService.getStoredGuardrailForScenario(scenarioId);
      if (storedGuardrail) {
        return storedGuardrail.arn;
      }

      // If not stored, try to discover existing guardrail
      const status = await guardrailService.getGuardrailStatus(scenarioId);
      if (status.exists) {
        // Store for future use
        guardrailService.storeGuardrailForScenario(
          scenarioId,
          status.guardrail.arn,
          status.guardrail.id
        );
        return status.guardrail.arn;
      }

      return null;
    } catch (error) {
      console.error(`[ScenarioService] Error getting guardrail ARN for scenario ${scenarioId}:`, error);
      return null;
    }
  }

  /**
   * Ensure guardrail exists for a specific scenario
   * @param {string} scenarioId - The scenario ID
   * @param {Object} guardrailService - Instance of GuardrailService
   * @returns {Promise<Object>} Result of guardrail creation/discovery
   */
  async ensureGuardrailForScenario(scenarioId, guardrailService) {
    try {
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        throw new Error(`Scenario ${scenarioId} not found`);
      }

      if (!scenario.guardrails || scenario.guardrails.enabled === false) {
        return {
          success: true,
          action: 'skipped',
          reason: 'No guardrails configured or disabled',
          scenarioId: scenarioId
        };
      }

      // Use GuardrailService to ensure guardrail exists
      const result = await guardrailService.ensureGuardrailExists(scenarioId, scenario.guardrails);

      return {
        ...result,
        scenarioId: scenarioId
      };
    } catch (error) {
      console.error(`[ScenarioService] Error ensuring guardrail for scenario ${scenarioId}:`, error);
      return {
        success: false,
        action: 'error',
        error: error.message,
        scenarioId: scenarioId
      };
    }
  }
}

// Create and export singleton instance
export const scenarioService = new ScenarioService();
