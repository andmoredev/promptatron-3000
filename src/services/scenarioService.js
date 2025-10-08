/**
 * Simple service for managing scenario operations
 */

import { validateScenario, extractScenarioMetadata } from '../utils/scenarioModels.js';

// Import manifest and scenario configurations directly
import manifestData from '../scenarios/manifest.json';

// Create dynamic imports mapping from manifest
const createScenarioImports = () => {
  const imports = {};
  manifestData.scenarios.forEach(scenario => {
    if (scenario.enabled !== false) {
      imports[scenario.folder] = () => import(/* @vite-ignore */ `../scenarios/${scenario.folder}/${scenario.configFile}`);
      // Also map by scenario ID for flexibility
      imports[scenario.id] = () => import(/* @vite-ignore */ `../scenarios/${scenario.folder}/${scenario.configFile}`);
    }
  });
  return imports;
};

const scenarioImports = createScenarioImports();

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

      // Use dynamic import instead of HTTP fetch
      let scenarioData;
      if (scenarioImports[folderName]) {
        const scenarioModule = await scenarioImports[folderName]();
        scenarioData = scenarioModule.default;
      } else {
        // Try to find by scenario ID in manifest
        const scenarioInfo = manifestData.scenarios.find(s => s.folder === folderName || s.id === folderName);
        if (scenarioInfo && scenarioImports[scenarioInfo.id]) {
          const scenarioModule = await scenarioImports[scenarioInfo.id]();
          scenarioData = scenarioModule.default;
        } else {
          throw new Error(`No import configured for scenario: ${folderName}`);
        }
      }

      if (!scenarioData) {
        throw new Error(`Scenario data not found: ${filename}`);
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

      // Construct the dataset path using dynamic import
      const datasetPath = `../scenarios/${scenarioInfo.folder}/${dataset.file}`;

      try {
        // For the consolidated structure, use dynamic imports with explicit paths
        if (dataset.file.endsWith('.json')) {
          // Use dynamic import for JSON files
          const datasetModule = await import(/* @vite-ignore */ `../scenarios/${scenarioInfo.folder}/${dataset.file}`);
          return JSON.stringify(datasetModule.default, null, 2);
        } else {
          // For CSV files, use Vite's ?raw suffix to import as text
          const datasetModule = await import(/* @vite-ignore */ `../scenarios/${scenarioInfo.folder}/${dataset.file}?raw`);
          return datasetModule.default;
        }
      } catch (importError) {
        console.error(`Failed to import dataset ${dataset.file}:`, importError);
        throw new Error(`Dataset file not found or not accessible: ${dataset.file}. Make sure the file exists in the consolidated structure and is properly configured for import.`);
      }
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
        showToolSettings: scenario.tools && scenario.tools.length > 0
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
        showToolSettings: false
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
}

// Create and export singleton instance
export const scenarioService = new ScenarioService();
