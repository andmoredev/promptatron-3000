/**
 * Utilities for meta-agent configuration loading and validation
 * Follows the established patterns in the codebase
 */

/**
 * Default meta-agent configuration
 */
export const DEFAULT_META_AGENT_CONFIG = {
  enabled: false,
  agents: {
    factChecker: {
      enabled: false,
      config: {
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        strictMode: true,
        confidenceThreshold: 80
      }
    },
    errorContainment: {
      enabled: false,
      config: {
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        safetyLevel: 'high',
        policyEnforcement: true
      }
    },
    qualityEnforcer: {
      enabled: false,
      config: {
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        minimumScore: 70,
        strictScoring: false
      }
    }
  }
};

/**
 * Load meta-agent configuration from scenario
 * @param {Object} scenario - The scenario object
 * @returns {Object} Meta-agent configuration
 */
export function loadMetaAgentConfig(scenario) {
  if (!scenario || !scenario.metaAgents) {
    return { ...DEFAULT_META_AGENT_CONFIG };
  }

  // Merge scenario config with defaults
  const config = {
    enabled: scenario.metaAgents.enabled !== false,
    agents: {}
  };

  // Process each agent type
  const agentTypes = ['factChecker', 'errorContainment', 'qualityEnforcer'];

  for (const agentType of agentTypes) {
    const scenarioAgentConfig = scenario.metaAgents.agents?.[agentType];
    const defaultAgentConfig = DEFAULT_META_AGENT_CONFIG.agents[agentType];

    config.agents[agentType] = {
      enabled: scenarioAgentConfig?.enabled === true && config.enabled,
      config: {
        ...defaultAgentConfig.config,
        ...(scenarioAgentConfig?.config || {})
      }
    };
  }

  return config;
}

/**
 * Validate meta-agent configuration
 * @param {Object} config - Meta-agent configuration to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateMetaAgentConfig(config) {
  const errors = {};
  const warnings = [];

  if (!config || typeof config !== 'object') {
    return {
      isValid: false,
      errors: { config: 'Meta-agent configuration must be an object' },
      warnings: []
    };
  }

  // Validate enabled flag
  if (typeof config.enabled !== 'boolean') {
    errors.enabled = 'enabled must be a boolean';
  }

  // Validate agents configuration
  if (!config.agents || typeof config.agents !== 'object') {
    errors.agents = 'agents configuration must be an object';
  } else {
    const agentTypes = ['factChecker', 'errorContainment', 'qualityEnforcer'];

    for (const agentType of agentTypes) {
      const agentConfig = config.agents[agentType];

      if (agentConfig) {
        const agentErrors = validateAgentConfig(agentType, agentConfig);
        if (Object.keys(agentErrors).length > 0) {
          errors[`agents.${agentType}`] = agentErrors;
        }
      }
    }

    // Check if at least one agent is enabled when meta-agents are enabled
    if (config.enabled) {
      const enabledAgents = agentTypes.filter(type =>
        config.agents[type]?.enabled === true
      );

      if (enabledAgents.length === 0) {
        warnings.push('Meta-agents are enabled but no individual agents are enabled');
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings
  };
}

/**
 * Validate individual agent configuration
 * @param {string} agentType - The agent type
 * @param {Object} agentConfig - The agent configuration
 * @returns {Object} Validation errors
 */
function validateAgentConfig(agentType, agentConfig) {
  const errors = {};

  if (typeof agentConfig !== 'object') {
    errors.config = 'Agent configuration must be an object';
    return errors;
  }

  // Validate enabled flag
  if (typeof agentConfig.enabled !== 'boolean') {
    errors.enabled = 'enabled must be a boolean';
  }

  // Validate config object
  if (agentConfig.config && typeof agentConfig.config !== 'object') {
    errors.config = 'config must be an object';
  } else if (agentConfig.config) {
    const configErrors = validateAgentSpecificConfig(agentType, agentConfig.config);
    if (Object.keys(configErrors).length > 0) {
      errors.config = configErrors;
    }
  }

  return errors;
}

/**
 * Validate agent-specific configuration parameters
 * @param {string} agentType - The agent type
 * @param {Object} config - The agent-specific configuration
 * @returns {Object} Validation errors
 */
function validateAgentSpecificConfig(agentType, config) {
  const errors = {};

  // Common validations for all agents
  if (config.modelId && typeof config.modelId !== 'string') {
    errors.modelId = 'modelId must be a string';
  }

  // Agent-specific validations
  switch (agentType) {
    case 'factChecker':
      if (config.strictMode !== undefined && typeof config.strictMode !== 'boolean') {
        errors.strictMode = 'strictMode must be a boolean';
      }
      if (config.confidenceThreshold !== undefined) {
        if (typeof config.confidenceThreshold !== 'number' ||
            config.confidenceThreshold < 0 ||
            config.confidenceThreshold > 100) {
          errors.confidenceThreshold = 'confidenceThreshold must be a number between 0 and 100';
        }
      }
      break;

    case 'errorContainment':
      if (config.safetyLevel !== undefined) {
        const validLevels = ['low', 'medium', 'high'];
        if (!validLevels.includes(config.safetyLevel)) {
          errors.safetyLevel = `safetyLevel must be one of: ${validLevels.join(', ')}`;
        }
      }
      if (config.policyEnforcement !== undefined && typeof config.policyEnforcement !== 'boolean') {
        errors.policyEnforcement = 'policyEnforcement must be a boolean';
      }
      break;

    case 'qualityEnforcer':
      if (config.minimumScore !== undefined) {
        if (typeof config.minimumScore !== 'number' ||
            config.minimumScore < 0 ||
            config.minimumScore > 100) {
          errors.minimumScore = 'minimumScore must be a number between 0 and 100';
        }
      }
      if (config.strictScoring !== undefined && typeof config.strictScoring !== 'boolean') {
        errors.strictScoring = 'strictScoring must be a boolean';
      }
      break;
  }

  return errors;
}

/**
 * Get meta-agent configuration from scenario with validation
 * @param {Object} scenario - The scenario object
 * @returns {Object} Result with config and validation info
 */
export function getValidatedMetaAgentConfig(scenario) {
  const config = loadMetaAgentConfig(scenario);
  const validation = validateMetaAgentConfig(config);

  return {
    config,
    validation,
    isValid: validation.isValid,
    hasWarnings: validation.warnings.length > 0
  };
}

/**
 * Check if meta-agents are available for a scenario
 * @param {string} scenarioId - The scenario ID
 * @returns {Promise<Object>} Availability information
 */
export async function checkMetaAgentAvailability(scenarioId) {
  const availability = {
    factChecker: false,
    errorContainment: false,
    qualityEnforcer: false,
    totalAvailable: 0,
    errors: []
  };

  const agentTypes = ['factChecker', 'errorContainment', 'qualityEnforcer'];

  for (const agentType of agentTypes) {
    try {
      const scenarioPath = `../scenarios/${scenarioId}/meta-agents`;
      await import(`${scenarioPath}/${agentType}.js`);
      availability[agentType] = true;
      availability.totalAvailable++;
    } catch (error) {
      availability.errors.push({
        agentType,
        error: error.message
      });
    }
  }

  return availability;
}

/**
 * Create default meta-agent configuration for a scenario
 * @param {string} scenarioId - The scenario ID
 * @param {Object} options - Configuration options
 * @returns {Object} Default configuration
 */
export function createDefaultMetaAgentConfig(scenarioId, options = {}) {
  const {
    enableAll = false,
    modelId = 'anthropic.claude-3-5-sonnet-20241022-v2:0'
  } = options;

  return {
    enabled: enableAll,
    agents: {
      factChecker: {
        enabled: enableAll,
        config: {
          modelId,
          strictMode: true,
          confidenceThreshold: 80
        }
      },
      errorContainment: {
        enabled: enableAll,
        config: {
          modelId,
          safetyLevel: 'high',
          policyEnforcement: true
        }
      },
      qualityEnforcer: {
        enabled: enableAll,
        config: {
          modelId,
          minimumScore: 70,
          strictScoring: false
        }
      }
    }
  };
}

/**
 * Merge meta-agent configurations
 * @param {Object} baseConfig - Base configuration
 * @param {Object} overrideConfig - Override configuration
 * @returns {Object} Merged configuration
 */
export function mergeMetaAgentConfigs(baseConfig, overrideConfig) {
  if (!overrideConfig) {
    return { ...baseConfig };
  }

  const merged = {
    enabled: overrideConfig.enabled !== undefined ? overrideConfig.enabled : baseConfig.enabled,
    agents: {}
  };

  const agentTypes = ['factChecker', 'errorContainment', 'qualityEnforcer'];

  for (const agentType of agentTypes) {
    const baseAgent = baseConfig.agents?.[agentType] || DEFAULT_META_AGENT_CONFIG.agents[agentType];
    const overrideAgent = overrideConfig.agents?.[agentType];

    merged.agents[agentType] = {
      enabled: overrideAgent?.enabled !== undefined ? overrideAgent.enabled : baseAgent.enabled,
      config: {
        ...baseAgent.config,
        ...(overrideAgent?.config || {})
      }
    };
  }

  return merged;
}