import { guardrailService } from './guardrailService.js';
import { scenarioService } from './scenarioService.js';
import { GuardrailSchemaTranslator } from './guardrailSchemaTranslator.js';
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
   * Normalize a GetGuardrail response into UpdateGuardrail input shape.
   * Ensures ...Config keys exist and map inner arrays to *Config names.
   * @param {Object} cfg - Guardrail config from GetGuardrail
   * @returns {Object} Normalized config suitable for UpdateGuardrailCommand
   */
  normalizeForUpdate(cfg) {
    const out = JSON.parse(JSON.stringify(cfg || {}));

    // Content policy
    if (!out.contentPolicyConfig && out.contentPolicy) {
      const src = out.contentPolicy;
      out.contentPolicyConfig = {
        ...(src.tierConfig ? { tierConfig: src.tierConfig } : (src.tier ? { tierConfig: src.tier } : {})),
        filtersConfig: (src.filters || []).map(f => ({
          type: f.type,
          inputStrength: f.inputStrength,
          outputStrength: f.outputStrength,
          inputModalities: f.inputModalities,
          outputModalities: f.outputModalities,
          inputAction: f.inputAction,
          outputAction: f.outputAction,
          inputEnabled: f.inputEnabled,
          outputEnabled: f.outputEnabled
        }))
      };
    }

    // Topic policy
    if (!out.topicPolicyConfig && out.topicPolicy) {
      const src = out.topicPolicy;
      out.topicPolicyConfig = {
        ...(src.tierConfig ? { tierConfig: src.tierConfig } : (src.tier ? { tierConfig: src.tier } : {})),
        topicsConfig: (src.topics || []).map(t => ({
          name: t.name,
          definition: t.definition,
          examples: t.examples,
          type: t.type,
          inputAction: t.inputAction,
          outputAction: t.outputAction,
          inputEnabled: t.inputEnabled,
          outputEnabled: t.outputEnabled
        }))
      };
    }

    // Word policy
    if (!out.wordPolicyConfig && out.wordPolicy) {
      const src = out.wordPolicy;
      const wordsConfig = src.words || [];
      const managedWordListsConfig = src.managedWordLists || [];
      const wp = {};
      if (Array.isArray(wordsConfig) && wordsConfig.length > 0) wp.wordsConfig = wordsConfig;
      if (Array.isArray(managedWordListsConfig) && managedWordListsConfig.length > 0) wp.managedWordListsConfig = managedWordListsConfig;
      if (Object.keys(wp).length > 0) {
        out.wordPolicyConfig = wp;
      }
    }

    // Sensitive information policy
    if (!out.sensitiveInformationPolicyConfig && out.sensitiveInformationPolicy) {
      const src = out.sensitiveInformationPolicy;
      const piiEntitiesConfig = src.piiEntities || [];
      const regexesConfig = src.regexes || [];
      const sp = {};
      if (Array.isArray(piiEntitiesConfig) && piiEntitiesConfig.length > 0) sp.piiEntitiesConfig = piiEntitiesConfig;
      if (Array.isArray(regexesConfig) && regexesConfig.length > 0) sp.regexesConfig = regexesConfig;
      if (Object.keys(sp).length > 0) {
        out.sensitiveInformationPolicyConfig = sp;
      }
    }

    // Contextual grounding policy
    if (!out.contextualGroundingPolicyConfig && out.contextualGroundingPolicy) {
      const src = out.contextualGroundingPolicy;
      out.contextualGroundingPolicyConfig = {
        filtersConfig: (src.filters || []).map(fl => ({
          type: fl.type,
          threshold: fl.threshold,
          action: fl.action,
          enabled: fl.enabled
        }))
      };
    }

    return out;
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
      // Get current guardrail configuration and normalize it for UpdateGuardrail
      const currentConfig = await this.guardrailService.getGuardrail(guardrailId);
      const normalizedConfig = this.normalizeForUpdate(currentConfig);

      // Update configuration state
      const updatedConfig = this.updateConfigurationState(normalizedConfig, configurationType, isActive);

      // Build update payload including all remaining policies, removing only the unchecked one
      const updatePayload = {
        guardrailIdentifier: guardrailId,
        name: updatedConfig.name,
        description: updatedConfig.description,
        blockedInputMessaging: updatedConfig.blockedInputMessaging,
        blockedOutputsMessaging: updatedConfig.blockedOutputsMessaging
      };

      if (updatedConfig.contentPolicyConfig?.filtersConfig?.length) {
        // prune empty arrays if any sneaked in
        const cp = JSON.parse(JSON.stringify(updatedConfig.contentPolicyConfig));
        if (Array.isArray(cp.filtersConfig) && cp.filtersConfig.length === 0) delete cp.filtersConfig;
        if (cp.filtersConfig) updatePayload.contentPolicyConfig = cp;
      }

      if (updatedConfig.wordPolicyConfig) {
        const wp = JSON.parse(JSON.stringify(updatedConfig.wordPolicyConfig));
        if (Array.isArray(wp.wordsConfig) && wp.wordsConfig.length === 0) delete wp.wordsConfig;
        if (Array.isArray(wp.managedWordListsConfig) && wp.managedWordListsConfig.length === 0) delete wp.managedWordListsConfig;
        if (wp.wordsConfig || wp.managedWordListsConfig) updatePayload.wordPolicyConfig = wp;
      }

      if (updatedConfig.sensitiveInformationPolicyConfig) {
        const sp = JSON.parse(JSON.stringify(updatedConfig.sensitiveInformationPolicyConfig));
        if (Array.isArray(sp.piiEntitiesConfig) && sp.piiEntitiesConfig.length === 0) delete sp.piiEntitiesConfig;
        if (Array.isArray(sp.regexesConfig) && sp.regexesConfig.length === 0) delete sp.regexesConfig;
        if (sp.piiEntitiesConfig || sp.regexesConfig) updatePayload.sensitiveInformationPolicyConfig = sp;
      }

      if (updatedConfig.topicPolicyConfig?.topicsConfig?.length) {
        const tp = JSON.parse(JSON.stringify(updatedConfig.topicPolicyConfig));
        if (Array.isArray(tp.topicsConfig) && tp.topicsConfig.length === 0) delete tp.topicsConfig;
        if (tp.topicsConfig) updatePayload.topicPolicyConfig = tp;
      }

      if (updatedConfig.contextualGroundingPolicyConfig?.filtersConfig?.length) {
        const gp = JSON.parse(JSON.stringify(updatedConfig.contextualGroundingPolicyConfig));
        if (Array.isArray(gp.filtersConfig) && gp.filtersConfig.length === 0) delete gp.filtersConfig;
        if (gp.filtersConfig) updatePayload.contextualGroundingPolicyConfig = gp;
      }
      if (updatedConfig.automatedReasoningPolicyConfig) updatePayload.automatedReasoningPolicyConfig = updatedConfig.automatedReasoningPolicyConfig;

      // Persist the change
      const updateCommand = new UpdateGuardrailCommand(updatePayload);
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
      guardrailData: guardrailConfig, // Include full guardrail data for detailed parsing
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
        return (config.topics && config.topics.length > 0 &&
          config.topics.some(topic => topic.inputEnabled || topic.outputEnabled)) ||
          (config.topicsConfig && config.topicsConfig.length > 0 &&
            config.topicsConfig.some(topic => topic.inputEnabled || topic.outputEnabled));

      case 'CONTENT_POLICY':
        return (config.filters && config.filters.length > 0 &&
          config.filters.some(filter => filter.inputEnabled || filter.outputEnabled)) ||
          (config.filtersConfig && config.filtersConfig.length > 0 &&
            config.filtersConfig.some(filter => filter.inputEnabled || filter.outputEnabled));

      case 'WORD_POLICY':
        return (config.words && config.words.length > 0 &&
          config.words.some(word => word.inputEnabled || word.outputEnabled)) ||
          (config.managedWordLists && config.managedWordLists.length > 0 &&
            config.managedWordLists.some(list => list.inputEnabled || list.outputEnabled)) ||
          (config.wordsConfig && config.wordsConfig.length > 0 &&
            config.wordsConfig.some(word => word.inputEnabled || word.outputEnabled)) ||
          (config.managedWordListsConfig && config.managedWordListsConfig.length > 0 &&
            config.managedWordListsConfig.some(list => list.inputEnabled || list.outputEnabled));

      case 'SENSITIVE_INFORMATION':
        return (config.piiEntities && config.piiEntities.length > 0 &&
          config.piiEntities.some(entity => entity.inputEnabled || entity.outputEnabled)) ||
          (config.regexes && config.regexes.length > 0 &&
            config.regexes.some(regex => regex.inputEnabled || regex.outputEnabled)) ||
          (config.piiEntitiesConfig && config.piiEntitiesConfig.length > 0 &&
            config.piiEntitiesConfig.some(entity => entity.inputEnabled || entity.outputEnabled)) ||
          (config.regexesConfig && config.regexesConfig.length > 0 &&
            config.regexesConfig.some(regex => regex.inputEnabled || regex.outputEnabled));

      case 'CONTEXTUAL_GROUNDING':
        return (config.filters && config.filters.length > 0 &&
          config.filters.some(filter => filter.enabled)) ||
          (config.filtersConfig && config.filtersConfig.length > 0 &&
            config.filtersConfig.some(filter => filter.enabled));

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

    if (!updatedConfig[configKey] && !updatedConfig[`${configKey}Config`]) {
      if (isActive) {
        const rebuilt = this.rebuildPolicyFromScenario(updatedConfig, configurationType);
        if (!rebuilt) {
          throw new Error(`Cannot activate ${configurationType}: configuration template not found in scenario`);
        }
      } else {
        return updatedConfig;
      }
    }

    // If deactivating, remove this configuration from the payload entirely
    if (!isActive) {
      delete updatedConfig[configKey];
      delete updatedConfig[`${configKey}Config`];
      return updatedConfig;
    }

    // Update the enabled state based on configuration type
    switch (configurationType) {
      case 'TOPIC_POLICY':
        if (updatedConfig[configKey]?.topics) {
          for (const topic of updatedConfig[configKey].topics) {
            topic.inputEnabled = isActive;
            topic.outputEnabled = isActive;
          }
        }
        if (updatedConfig[`${configKey}Config`]?.topicsConfig) {
          for (const topic of updatedConfig[`${configKey}Config`].topicsConfig) {
            topic.inputEnabled = isActive;
            topic.outputEnabled = isActive;
          }
        }
        break;

      case 'CONTENT_POLICY':
        if (updatedConfig[configKey]?.filters) {
          for (const filter of updatedConfig[configKey].filters) {
            filter.inputEnabled = isActive;
            filter.outputEnabled = isActive;
          }
        }
        if (updatedConfig[`${configKey}Config`]?.filtersConfig) {
          for (const filter of updatedConfig[`${configKey}Config`].filtersConfig) {
            filter.inputEnabled = isActive;
            filter.outputEnabled = isActive;
          }
        }
        break;

      case 'WORD_POLICY':
        if (updatedConfig[configKey]?.words) {
          for (const word of updatedConfig[configKey].words) {
            word.inputEnabled = isActive;
            word.outputEnabled = isActive;
          }
        }
        if (updatedConfig[configKey]?.managedWordLists) {
          for (const list of updatedConfig[configKey].managedWordLists) {
            list.inputEnabled = isActive;
            list.outputEnabled = isActive;
          }
        }
        if (updatedConfig[`${configKey}Config`]?.managedWordListsConfig) {
          for (const list of updatedConfig[`${configKey}Config`].managedWordListsConfig) {
            list.inputEnabled = isActive;
            list.outputEnabled = isActive;
          }
        }
        if (updatedConfig[`${configKey}Config`]?.wordsConfig) {
          for (const word of updatedConfig[`${configKey}Config`].wordsConfig) {
            word.inputEnabled = isActive;
            word.outputEnabled = isActive;
          }
        }
        break;

      case 'SENSITIVE_INFORMATION':
        if (updatedConfig[configKey]?.piiEntities) {
          for (const entity of updatedConfig[configKey].piiEntities) {
            entity.inputEnabled = isActive;
            entity.outputEnabled = isActive;
          }
        }
        if (updatedConfig[configKey]?.regexes) {
          for (const regex of updatedConfig[configKey].regexes) {
            regex.inputEnabled = isActive;
            regex.outputEnabled = isActive;
          }
        }
        if (updatedConfig[`${configKey}Config`]?.regexesConfig) {
          for (const regex of updatedConfig[`${configKey}Config`].regexesConfig) {
            regex.inputEnabled = isActive;
            regex.outputEnabled = isActive;
          }
        }
        if (updatedConfig[`${configKey}Config`]?.piiEntitiesConfig) {
          for (const entity of updatedConfig[`${configKey}Config`].piiEntitiesConfig) {
            entity.inputEnabled = isActive;
            entity.outputEnabled = isActive;
          }
        }
        break;

      case 'CONTEXTUAL_GROUNDING':
        if (updatedConfig[configKey]?.filters) {
          for (const filter of updatedConfig[configKey].filters) {
            filter.enabled = isActive;
          }
        }
        if (updatedConfig[`${configKey}Config`]?.filtersConfig) {
          for (const filter of updatedConfig[`${configKey}Config`].filtersConfig) {
            filter.enabled = isActive;
          }
        }
        break;

      case 'AUTOMATED_REASONING':
        // Keep as-is for activation; removal handled by early return
        break;
    }

    return updatedConfig;
  }

  /**
   * Rebuild a missing policy from the scenario's simplified guardrail config
   * and attach it to the provided normalized guardrail config.
   * @param {Object} normalizedConfig - The current normalized guardrail config (includes name)
   * @param {string} configurationType - One of configurationTypes keys
   * @returns {boolean} true if rebuilt and attached, false otherwise
   */
  rebuildPolicyFromScenario(normalizedConfig, configurationType) {
    try {
      const guardrailName = normalizedConfig.name || '';
      const scenarioId = guardrailName.endsWith('-guardrail')
        ? guardrailName.slice(0, -'-guardrail'.length)
        : guardrailName;

      const scenario = scenarioService.getScenario(scenarioId);
      if (!scenario || !scenario.guardrails) {
        return false;
      }

      // Build AWS-format config from simplified scenario guardrails
      const awsFromScenario = GuardrailSchemaTranslator.translateToAWSFormat(
        scenario.guardrails,
        scenarioId
      );

      const typeToKey = {
        TOPIC_POLICY: 'topicPolicyConfig',
        CONTENT_POLICY: 'contentPolicyConfig',
        WORD_POLICY: 'wordPolicyConfig',
        SENSITIVE_INFORMATION: 'sensitiveInformationPolicyConfig',
        CONTEXTUAL_GROUNDING: 'contextualGroundingPolicyConfig',
        AUTOMATED_REASONING: 'automatedReasoningPolicyConfig'
      };

      const key = typeToKey[configurationType];
      const rebuiltPolicy = awsFromScenario[key];
      if (!rebuiltPolicy) {
        return false;
      }

      // Attach rebuilt policy into normalized config using *Config keys
      normalizedConfig[key] = rebuiltPolicy;
      return true;
    } catch (e) {
      console.warn('Failed to rebuild policy from scenario:', e);
      return false;
    }
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
