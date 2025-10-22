import { guardrailService } from './guardrailService.js';
import { UpdateGuardrailCommand } from "@aws-sdk/client-bedrock";

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
      TOPIC_POLICY: 'topicPolicy',
      CONTENT_POLICY: 'contentPolicy',
      WORD_POLICY: 'wordPolicy',
      SENSITIVE_INFORMATION: 'sensitiveInformationPolicy',
      CONTEXTUAL_GROUNDING: 'contextualGroundingPolicy',
      AUTOMATED_REASONING: 'automatedReasoningPolicy'
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

      // Update configuration state
      const updatedConfig = this.updateConfigurationState(currentConfig, configurationType, isActive);

      // Call AWS UpdateGuardrailCommand to persist the change
      const updateCommand = new UpdateGuardrailCommand({
        guardrailIdentifier: guardrailId,
        name: updatedConfig.name,
        description: updatedConfig.description,
        blockedInputMessaging: updatedConfig.blockedInputMessaging,
        blockedOutputsMessaging: updatedConfig.blockedOutputsMessaging,
        ...(updatedConfig.contentPolicyConfig && { contentPolicyConfig: updatedConfig.contentPolicyConfig }),
        ...(updatedConfig.wordPolicyConfig && { wordPolicyConfig: updatedConfig.wordPolicyConfig }),
        ...(updatedConfig.sensitiveInformationPolicyConfig && { sensitiveInformationPolicyConfig: updatedConfig.sensitiveInformationPolicyConfig }),
        ...(updatedConfig.topicPolicyConfig && { topicPolicyConfig: updatedConfig.topicPolicyConfig }),
        ...(updatedConfig.contextualGroundingPolicyConfig && { contextualGroundingPolicyConfig: updatedConfig.contextualGroundingPolicyConfig }),
        ...(updatedConfig.automatedReasoningPolicyConfig && { automatedReasoningPolicyConfig: updatedConfig.automatedReasoningPolicyConfig })
      });

      const updateResponse = await this.guardrailService.managementClient.send(updateCommand);

      // Update in-memory state with the actual response
      this.updateInMemoryState(guardrailId, configurationType, isActive);

      // Sync configuration states to ensure consistency
      await this.syncConfigurationStates(guardrailId);

      return {
        success: true,
        guardrailId,
        configurationType,
        isActive,
        version: updateResponse.version,
        updatedAt: updateResponse.updatedAt || new Date().toISOString()
      };
    } catch (error) {
      // Revert optimistic update on error
      this.updateInMemoryState(guardrailId, configurationType, !isActive);
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
   * Sync configuration states with AWS using GetGuardrailCommand
   * @param {string} guardrailId - The guardrail ID
   * @returns {Promise<Object>} Synced configuration states
   */
  async syncConfigurationStates(guardrailId) {
    try {
      // Use GetGuardrailCommand to get the latest configuration
      const guardrailConfig = await this.guardrailService.getGuardrail(guardrailId);
      const states = this.extractConfigurationStates(guardrailConfig);

      // Update cache with fresh data
      this.configurationStates.set(guardrailId, states);
      this.lastSyncTime.set(guardrailId, new Date().toISOString());

      console.log(`Configuration states synced for guardrail ${guardrailId}:`, states);

      return states;
    } catch (error) {
      console.error(`Failed to sync configuration states for ${guardrailId}:`, error);
      throw new Error(`Failed to sync configuration states: ${error.message}`);
    }
  }

  /**
   * Extract configuration states from guardrail configuration
   * @param {Object} guardrailConfig - Full guardrail configuration
   * @returns {Object} Configuration states
   */
  extractConfigurationStates(guardrailConfig) {
    const states = {
      guardrailId: guardrailConfig.guardrailId,
      configurations: {},
      lastSyncTime: new Date().toISOString()
    };

    // Check each configuration type
    Object.entries(this.configurationTypes).forEach(([type, configKey]) => {
      const config = guardrailConfig[configKey];
      const isActive = this.isConfigurationActive(config, type);
      const hasConfiguration = !!config;

      states.configurations[type] = {
        isActive: isActive,
        lastUpdated: guardrailConfig.updatedAt || new Date().toISOString(),
        hasConfiguration: hasConfiguration
      };
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
        return config.topics && config.topics.length > 0 &&
          config.topics.some(topic => topic.inputEnabled || topic.outputEnabled);

      case 'CONTENT_POLICY':
        return config.filters && config.filters.length > 0 &&
          config.filters.some(filter => filter.inputEnabled || filter.outputEnabled);

      case 'WORD_POLICY':
        return (config.words && config.words.length > 0 &&
          config.words.some(word => word.inputEnabled || word.outputEnabled)) ||
          (config.managedWordLists && config.managedWordLists.length > 0 &&
            config.managedWordLists.some(list => list.inputEnabled || list.outputEnabled));

      case 'SENSITIVE_INFORMATION':
        return (config.piiEntities && config.piiEntities.length > 0 &&
          config.piiEntities.some(entity => entity.inputEnabled || entity.outputEnabled)) ||
          (config.regexes && config.regexes.length > 0 &&
            config.regexes.some(regex => regex.inputEnabled || regex.outputEnabled));

      case 'CONTEXTUAL_GROUNDING':
        return config.filters && config.filters.length > 0 &&
          config.filters.some(filter => filter.enabled);

      case 'AUTOMATED_REASONING':
        return config && config.policies && config.policies.length > 0;

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
    const updatedConfig = JSON.parse(JSON.stringify(currentConfig)); // Deep clone

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
        if (updatedConfig[configKey].topics) {
          for (const topic of updatedConfig[configKey].topics) {
            topic.inputEnabled = isActive;
            topic.outputEnabled = isActive;
          }
        }
        break;

      case 'CONTENT_POLICY':
        if (updatedConfig[configKey].filters) {
          for (const filter of updatedConfig[configKey].filters) {
            filter.inputEnabled = isActive;
            filter.outputEnabled = isActive;
          }
        }
        break;

      case 'WORD_POLICY':
        if (updatedConfig[configKey].words) {
          for (const word of updatedConfig[configKey].words) {
            word.inputEnabled = isActive;
            word.outputEnabled = isActive;
          }
        }
        if (updatedConfig[configKey].managedWordLists) {
          for (const list of updatedConfig[configKey].managedWordLists) {
            list.inputEnabled = isActive;
            list.outputEnabled = isActive;
          }
        }
        break;

      case 'SENSITIVE_INFORMATION':
        if (updatedConfig[configKey].piiEntities) {
          for (const entity of updatedConfig[configKey].piiEntities) {
            entity.inputEnabled = isActive;
            entity.outputEnabled = isActive;
          }
        }
        if (updatedConfig[configKey].regexes) {
          for (const regex of updatedConfig[configKey].regexes) {
            regex.inputEnabled = isActive;
            regex.outputEnabled = isActive;
          }
        }
        break;

      case 'CONTEXTUAL_GROUNDING':
        if (updatedConfig[configKey].filters) {
          for (const filter of updatedConfig[configKey].filters) {
            filter.enabled = isActive;
          }
        }
        break;

      case 'AUTOMATED_REASONING':
        // For automated reasoning, we can't easily toggle without removing policies
        // This might need special handling based on requirements
        if (!isActive && updatedConfig[configKey].policies) {
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

  /**
   * Force refresh configuration states from AWS, bypassing cache
   * @param {string} guardrailId - The guardrail ID
   * @returns {Promise<Object>} Fresh configuration states
   */
  async refreshConfigurationStates(guardrailId) {
    // Clear cache for this guardrail to force fresh fetch
    this.clearCache(guardrailId);

    // Fetch fresh states
    return await this.syncConfigurationStates(guardrailId);
  }
}

// Export singleton instance
export const guardrailConfigurationManager = new GuardrailConfigurationManager();