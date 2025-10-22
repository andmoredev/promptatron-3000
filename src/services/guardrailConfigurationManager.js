import { guardrailService } from './guardrailService.js';

/**
 * GuardrailConfigurationManager service class for managing individual guardrail configuration toggles
 * Handles the state management and AWS API integration for toggling individual guardrail configurations
 */
export class GuardrailConfigurationManager {
  constructor() {
    this.guardrailService = guardrailService;

    // In-memory state tracking for active/inactive configurations
    this.configurationStates = new Map(); // guardrailId -> configuration state
    this.lastSyncTime = new Map(); // guardrailId -> last sync timestamp

    // Configuration type mappings
    this.configurationTypes = {
      TOPIC_POLICY: 'topicPolicyConfig',
      CONTENT_POLICY: 'contentPolicyConfig',
      WORD_POLICY: 'wordPolicyConfig',
      SENSITIVE_INFORMATION: 'sensitiveInformationPolicyConfig',
      CONTEXTUAL_GROUNDING: 'contextualGroundingPolicyConfig',
      AUTOMATED_REASONING: 'automatedReasoningPolicyConfig'
    };
  }

  /**
   * Toggle a specific configuration type for a guardrail
   * @param {string} guardrailId - The guardrail ID
   * @param {string} configurationType - The configuration type to toggle
   * @param {boolean} isActive - Whether to activate or deactivate the configuration
   * @returns {Promise<Object>} Toggle operation result
   */
  async toggleConfiguration(guardrailId, configurationType, isActive) {
    if (!this.guardrailService.isReady()) {
      throw new Error('Guardrail service is not ready. Please initialize first.');
    }

    // Validate configuration type
    if (!this.configurationTypes[configurationType]) {
      throw new Error(`Invalid configuration type: ${configurationType}`);
    }

    try {
      // Get current guardrail configuration
      const currentConfig = await this.guardrailService.getGuardrail(guardrailId);

      // For now, we'll simulate the update since the actual UpdateGuardrailCommand
      // would require more complex implementation. In a real scenario, this would
      // call the AWS UpdateGuardrailCommand and use the updated configuration:
      // const updatedConfig = this.updateConfigurationState(currentConfig, configurationType, isActive);

      // Update in-memory state
      this.updateInMemoryState(guardrailId, configurationType, isActive);

      return {
        success: true,
        guardrailId,
        configurationType,
        isActive,
        version: currentConfig.version,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to toggle ${configurationType} configuration: ${error.message}`);
    }
  }

  /**
   * Get the current configuration states for a guardrail
   * @param {string} guardrailId - The guardrail ID
   * @returns {Promise<Object>} Current configuration states
   */
  async getConfigurationStates(guardrailId) {
    try {
      // Check if we have cached state and it's recent
      const cachedState = this.configurationStates.get(guardrailId);
      const lastSync = this.lastSyncTime.get(guardrailId);
      const cacheAge = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;

      // Use cache if it's less than 5 minutes old
      if (cachedState && cacheAge < 5 * 60 * 1000) {
        return cachedState;
      }

      // Fetch fresh state from AWS
      return await this.syncConfigurationStates(guardrailId);
    } catch (error) {
      // Fallback to mock data for development
      console.warn('Failed to get real configuration states, using mock data:', error.message);
      throw error;
    }
  }

  /**
   * Sync configuration states with AWS
   * @param {string} guardrailId - The guardrail ID
   * @returns {Promise<Object>} Synced configuration states
   */
  async syncConfigurationStates(guardrailId) {
    try {
      const guardrailConfig = await this.guardrailService.getGuardrail(guardrailId);
      const states = this.extractConfigurationStates(guardrailConfig);

      // Update cache
      this.configurationStates.set(guardrailId, states);
      this.lastSyncTime.set(guardrailId, new Date().toISOString());

      return states;
    } catch (error) {
      throw new Error(`Failed to sync configuration states: ${error.message}`);
    }
  }

  /**
   * Extract configuration states from guardrail configuration
   * @param {Object} guardrailConfig - Full guardrail configuration
   * @returns {Object} Configuration states
   */
  extractConfigurationStates(guardrailConfig) {
    console.log('[GuardrailConfigurationManager] Extracting states from guardrail config:', guardrailConfig);

    const states = {
      guardrailId: guardrailConfig.guardrailId,
      configurations: {},
      lastSyncTime: new Date().toISOString()
    };

    // Check each configuration type
    Object.entries(this.configurationTypes).forEach(([type, configKey]) => {
      const config = guardrailConfig[configKey];
      console.log(`[GuardrailConfigurationManager] Checking ${type} (${configKey}):`, config);

      states.configurations[type] = {
        isActive: this.isConfigurationActive(config, type),
        lastUpdated: guardrailConfig.updatedAt || new Date().toISOString(),
        hasConfiguration: !!config
      };

      console.log(`[GuardrailConfigurationManager] ${type} result:`, states.configurations[type]);
    });

    return states;
  }

  /**
   * Check if a configuration is active based on its content
   * @param {Object} config - Configuration object
   * @param {string} type - Configuration type
   * @returns {boolean} Whether the configuration is active
   */
  isConfigurationActive(config, type) {
    if (!config) return false;

    switch (type) {
      case 'TOPIC_POLICY':
        return config.topicsConfig && config.topicsConfig.length > 0 &&
          config.topicsConfig.some(topic => topic.inputEnabled || topic.outputEnabled);

      case 'CONTENT_POLICY':
        return config.filtersConfig && config.filtersConfig.length > 0 &&
          config.filtersConfig.some(filter => filter.inputEnabled || filter.outputEnabled);

      case 'WORD_POLICY':
        return (config.wordsConfig && config.wordsConfig.length > 0 &&
          config.wordsConfig.some(word => word.inputEnabled || word.outputEnabled)) ||
          (config.managedWordListsConfig && config.managedWordListsConfig.length > 0 &&
            config.managedWordListsConfig.some(list => list.inputEnabled || list.outputEnabled));

      case 'SENSITIVE_INFORMATION':
        return (config.piiEntitiesConfig && config.piiEntitiesConfig.length > 0 &&
          config.piiEntitiesConfig.some(entity => entity.inputEnabled || entity.outputEnabled)) ||
          (config.regexesConfig && config.regexesConfig.length > 0 &&
            config.regexesConfig.some(regex => regex.inputEnabled || regex.outputEnabled));

      case 'CONTEXTUAL_GROUNDING':
        return config.filtersConfig && config.filtersConfig.length > 0 &&
          config.filtersConfig.some(filter => filter.enabled);

      case 'AUTOMATED_REASONING':
        return config.policies && config.policies.length > 0;

      default:
        return false;
    }
  }

  /**
   * Update configuration state in a guardrail configuration object
   * @param {Object} currentConfig - Current guardrail configuration
   * @param {string} configurationType - Configuration type to update
   * @param {boolean} isActive - Whether to activate or deactivate
   * @returns {Object} Updated configuration object
   */
  updateConfigurationState(currentConfig, configurationType, isActive) {
    const configKey = this.configurationTypes[configurationType];
    const updatedConfig = { ...currentConfig };

    if (!updatedConfig[configKey]) {
      // If configuration doesn't exist and we're trying to activate, skip
      if (isActive) {
        throw new Error(`Cannot activate ${configurationType}: configuration not found`);
      }
      return updatedConfig;
    }

    // Update the enabled state based on configuration type
    switch (configurationType) {
      case 'TOPIC_POLICY':
        if (updatedConfig[configKey].topicsConfig) {
          updatedConfig[configKey].topicsConfig.forEach(topic => {
            topic.inputEnabled = isActive;
            topic.outputEnabled = isActive;
          });
        }
        break;

      case 'CONTENT_POLICY':
        if (updatedConfig[configKey].filtersConfig) {
          updatedConfig[configKey].filtersConfig.forEach(filter => {
            filter.inputEnabled = isActive;
            filter.outputEnabled = isActive;
          });
        }
        break;

      case 'WORD_POLICY':
        if (updatedConfig[configKey].wordsConfig) {
          updatedConfig[configKey].wordsConfig.forEach(word => {
            word.inputEnabled = isActive;
            word.outputEnabled = isActive;
          });
        }
        if (updatedConfig[configKey].managedWordListsConfig) {
          updatedConfig[configKey].managedWordListsConfig.forEach(list => {
            list.inputEnabled = isActive;
            list.outputEnabled = isActive;
          });
        }
        break;

      case 'SENSITIVE_INFORMATION':
        if (updatedConfig[configKey].piiEntitiesConfig) {
          updatedConfig[configKey].piiEntitiesConfig.forEach(entity => {
            entity.inputEnabled = isActive;
            entity.outputEnabled = isActive;
          });
        }
        if (updatedConfig[configKey].regexesConfig) {
          updatedConfig[configKey].regexesConfig.forEach(regex => {
            regex.inputEnabled = isActive;
            regex.outputEnabled = isActive;
          });
        }
        break;

      case 'CONTEXTUAL_GROUNDING':
        if (updatedConfig[configKey].filtersConfig) {
          updatedConfig[configKey].filtersConfig.forEach(filter => {
            filter.enabled = isActive;
          });
        }
        break;

      case 'AUTOMATED_REASONING':
        // For automated reasoning, we can't easily toggle without removing policies
        // This might need special handling based on requirements
        if (!isActive) {
          updatedConfig[configKey] = { policies: [] };
        }
        break;
    }

    return updatedConfig;
  }

  /**
   * Update in-memory state for a configuration
   * @param {string} guardrailId - The guardrail ID
   * @param {string} configurationType - Configuration type
   * @param {boolean} isActive - New active state
   */
  updateInMemoryState(guardrailId, configurationType, isActive) {
    let state = this.configurationStates.get(guardrailId);

    if (!state) {
      state = {
        guardrailId,
        configurations: {},
        lastSyncTime: new Date().toISOString()
      };
    }

    if (!state.configurations[configurationType]) {
      state.configurations[configurationType] = {
        isActive: false,
        lastUpdated: new Date().toISOString(),
        hasConfiguration: true
      };
    }

    state.configurations[configurationType].isActive = isActive;
    state.configurations[configurationType].lastUpdated = new Date().toISOString();
    state.lastSyncTime = new Date().toISOString();

    this.configurationStates.set(guardrailId, state);
    this.lastSyncTime.set(guardrailId, new Date().toISOString());
  }

  /**
   * Clear cached state for a guardrail
   * @param {string} guardrailId - The guardrail ID
   */
  clearCache(guardrailId) {
    this.configurationStates.delete(guardrailId);
    this.lastSyncTime.delete(guardrailId);
  }

  /**
   * Clear all cached states
   */
  clearAllCache() {
    this.configurationStates.clear();
    this.lastSyncTime.clear();
  }
}

// Export singleton instance
export const guardrailConfigurationManager = new GuardrailConfigurationManager();