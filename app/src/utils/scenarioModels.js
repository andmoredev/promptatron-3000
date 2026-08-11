/**
 * Scenario data models and validation utilities
 * Provides validation, metadata extraction, and default scenario creation
 */

/**
 * Validate a scenario object against the expected schema
 * @param {Object} scenarioData - The scenario data to validate
 * @returns {Object} Validation result with isValid, errors, warnings, and metadata
 */
export function validateScenario(scenarioData) {
  const errors = {};
  const warnings = [];

  try {
    // Basic structure validation
    if (!scenarioData || typeof scenarioData !== 'object') {
      return {
        isValid: false,
        errors: { general: 'Scenario must be an object' },
        warnings: [],
        metadata: {}
      };
    }

    // Required fields
    if (!scenarioData.id || typeof scenarioData.id !== 'string' || !scenarioData.id.trim()) {
      errors.id = 'Scenario ID is required and must be a non-empty string';
    }

    if (!scenarioData.name || typeof scenarioData.name !== 'string' || !scenarioData.name.trim()) {
      errors.name = 'Scenario name is required and must be a non-empty string';
    }

    if (!scenarioData.description || typeof scenarioData.description !== 'string' || !scenarioData.description.trim()) {
      errors.description = 'Scenario description is required and must be a non-empty string';
    }

    // Validate datasets if present
    if (scenarioData.datasets !== undefined) {
      if (!Array.isArray(scenarioData.datasets)) {
        errors.datasets = 'Datasets must be an array';
      } else {
        const datasetErrors = [];
        scenarioData.datasets.forEach((dataset, index) => {
          const datasetValidation = validateDataset(dataset, index);
          if (!datasetValidation.isValid) {
            datasetErrors.push(`Dataset ${index + 1}: ${datasetValidation.errors.join(', ')}`);
          }
        });

        if (datasetErrors.length > 0) {
          errors.datasets = datasetErrors.join('; ');
        }

        // Check for duplicate dataset IDs
        const datasetIds = scenarioData.datasets.map(d => d.id).filter(Boolean);
        const duplicateIds = datasetIds.filter((id, index) => datasetIds.indexOf(id) !== index);
        if (duplicateIds.length > 0) {
          errors.datasets = (errors.datasets || '') + '; Duplicate dataset IDs: ' + duplicateIds.join(', ');
        }
      }
    }

    // Validate system prompts if present
    if (scenarioData.systemPrompts !== undefined) {
      if (!Array.isArray(scenarioData.systemPrompts)) {
        errors.systemPrompts = 'System prompts must be an array';
      } else {
        const promptErrors = [];
        scenarioData.systemPrompts.forEach((prompt, index) => {
          const promptValidation = validatePrompt(prompt, index, 'system');
          if (!promptValidation.isValid) {
            promptErrors.push(`System prompt ${index + 1}: ${promptValidation.errors.join(', ')}`);
          }
        });

        if (promptErrors.length > 0) {
          errors.systemPrompts = promptErrors.join('; ');
        }

        // Check for duplicate prompt IDs
        const promptIds = scenarioData.systemPrompts.map(p => p.id).filter(Boolean);
        const duplicateIds = promptIds.filter((id, index) => promptIds.indexOf(id) !== index);
        if (duplicateIds.length > 0) {
          errors.systemPrompts = (errors.systemPrompts || '') + '; Duplicate system prompt IDs: ' + duplicateIds.join(', ');
        }
      }
    }

    // Validate user prompts if present
    if (scenarioData.userPrompts !== undefined) {
      if (!Array.isArray(scenarioData.userPrompts)) {
        errors.userPrompts = 'User prompts must be an array';
      } else {
        const promptErrors = [];
        scenarioData.userPrompts.forEach((prompt, index) => {
          const promptValidation = validatePrompt(prompt, index, 'user');
          if (!promptValidation.isValid) {
            promptErrors.push(`User prompt ${index + 1}: ${promptValidation.errors.join(', ')}`);
          }
        });

        if (promptErrors.length > 0) {
          errors.userPrompts = promptErrors.join('; ');
        }

        // Check for duplicate prompt IDs
        const promptIds = scenarioData.userPrompts.map(p => p.id).filter(Boolean);
        const duplicateIds = promptIds.filter((id, index) => promptIds.indexOf(id) !== index);
        if (duplicateIds.length > 0) {
          errors.userPrompts = (errors.userPrompts || '') + '; Duplicate user prompt IDs: ' + duplicateIds.join(', ');
        }
      }
    }

    // Validate tools if present
    if (scenarioData.tools !== undefined) {
      if (!Array.isArray(scenarioData.tools)) {
        errors.tools = 'Tools must be an array';
      } else {
        const toolErrors = [];
        scenarioData.tools.forEach((tool, index) => {
          const toolValidation = validateTool(tool, index);
          if (!toolValidation.isValid) {
            toolErrors.push(`Tool ${index + 1}: ${toolValidation.errors.join(', ')}`);
          }
        });

        if (toolErrors.length > 0) {
          errors.tools = toolErrors.join('; ');
        }

        // Check for duplicate tool names
        const toolNames = scenarioData.tools.map(t => t.name).filter(Boolean);
        const duplicateNames = toolNames.filter((name, index) => toolNames.indexOf(name) !== index);
        if (duplicateNames.length > 0) {
          errors.tools = (errors.tools || '') + '; Duplicate tool names: ' + duplicateNames.join(', ');
        }
      }
    }

    // Validate configuration if present
    if (scenarioData.configuration !== undefined) {
      const configValidation = validateConfiguration(scenarioData.configuration);
      if (!configValidation.isValid) {
        errors.configuration = configValidation.errors.join(', ');
      }
      warnings.push(...configValidation.warnings);
    }

    // Validate examples if present
    if (scenarioData.examples !== undefined) {
      if (!Array.isArray(scenarioData.examples)) {
        errors.examples = 'Examples must be an array';
      } else {
        const exampleErrors = [];
        scenarioData.examples.forEach((example, index) => {
          const exampleValidation = validateExample(example, index);
          if (!exampleValidation.isValid) {
            exampleErrors.push(`Example ${index + 1}: ${exampleValidation.errors.join(', ')}`);
          }
        });

        if (exampleErrors.length > 0) {
          errors.examples = exampleErrors.join('; ');
        }
      }
    }

    // Skip guardrails validation - guardrails are optional
    // Note: Guardrails validation has been removed as requested

    // Extract metadata
    const metadata = extractScenarioMetadata(scenarioData);

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings,
      metadata
    };

  } catch (error) {
    return {
      isValid: false,
      errors: { general: `Validation failed: ${error.message}` },
      warnings: [],
      metadata: {}
    };
  }
}

/**
 * Validate a dataset object
 * @param {Object} dataset - The dataset to validate
 * @param {number} index - The index of the dataset in the array
 * @returns {Object} Validation result
 */
function validateDataset(dataset, index) {
  const errors = [];

  if (!dataset || typeof dataset !== 'object') {
    errors.push('must be an object');
    return { isValid: false, errors };
  }

  if (!dataset.id || typeof dataset.id !== 'string' || !dataset.id.trim()) {
    errors.push('id is required and must be a non-empty string');
  }

  if (!dataset.name || typeof dataset.name !== 'string' || !dataset.name.trim()) {
    errors.push('name is required and must be a non-empty string');
  }

  if (!dataset.description || typeof dataset.description !== 'string' || !dataset.description.trim()) {
    errors.push('description is required and must be a non-empty string');
  }

  if (!dataset.file || typeof dataset.file !== 'string' || !dataset.file.trim()) {
    errors.push('file is required and must be a non-empty string');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate a prompt object
 * @param {Object} prompt - The prompt to validate
 * @param {number} index - The index of the prompt in the array
 * @param {string} type - The type of prompt ('system' or 'user')
 * @returns {Object} Validation result
 */
function validatePrompt(prompt, index, type) {
  const errors = [];

  if (!prompt || typeof prompt !== 'object') {
    errors.push('must be an object');
    return { isValid: false, errors };
  }

  if (!prompt.id || typeof prompt.id !== 'string' || !prompt.id.trim()) {
    errors.push('id is required and must be a non-empty string');
  }

  if (!prompt.name || typeof prompt.name !== 'string' || !prompt.name.trim()) {
    errors.push('name is required and must be a non-empty string');
  }

  if (!prompt.content || typeof prompt.content !== 'string' || !prompt.content.trim()) {
    errors.push('content is required and must be a non-empty string');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate a tool object
 * @param {Object} tool - The tool to validate
 * @param {number} index - The index of the tool in the array
 * @returns {Object} Validation result
 */
function validateTool(tool, index) {
  const errors = [];

  if (!tool || typeof tool !== 'object') {
    errors.push('must be an object');
    return { isValid: false, errors };
  }

  if (!tool.name || typeof tool.name !== 'string' || !tool.name.trim()) {
    errors.push('name is required and must be a non-empty string');
  }

  if (!tool.description || typeof tool.description !== 'string' || !tool.description.trim()) {
    errors.push('description is required and must be a non-empty string');
  }

  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
    errors.push('inputSchema is required and must be an object');
  } else {
    // Basic JSON Schema validation
    if (tool.inputSchema.type && typeof tool.inputSchema.type !== 'string') {
      errors.push('inputSchema.type must be a string if provided');
    }

    if (tool.inputSchema.properties && typeof tool.inputSchema.properties !== 'object') {
      errors.push('inputSchema.properties must be an object if provided');
    }

    if (tool.inputSchema.required && !Array.isArray(tool.inputSchema.required)) {
      errors.push('inputSchema.required must be an array if provided');
    }
  }

  // Handler is optional
  if (tool.handler !== undefined && (typeof tool.handler !== 'string' || !tool.handler.trim())) {
    errors.push('handler must be a non-empty string if provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate configuration object
 * @param {Object} config - The configuration to validate
 * @returns {Object} Validation result
 */
function validateConfiguration(config) {
  const errors = [];
  const warnings = [];

  if (!config || typeof config !== 'object') {
    errors.push('configuration must be an object');
    return { isValid: false, errors, warnings };
  }

  // Validate maxIterations
  if (config.maxIterations !== undefined) {
    if (typeof config.maxIterations !== 'number' || config.maxIterations < 1 || config.maxIterations > 100) {
      errors.push('maxIterations must be a number between 1 and 100');
    }
  }

  // Validate boolean fields
  const booleanFields = ['allowCustomPrompts', 'allowDatasetModification', 'defaultStreamingEnabled'];
  booleanFields.forEach(field => {
    if (config[field] !== undefined && typeof config[field] !== 'boolean') {
      errors.push(`${field} must be a boolean if provided`);
    }
  });

  // Validate recommendedModels
  if (config.recommendedModels !== undefined) {
    if (!Array.isArray(config.recommendedModels)) {
      errors.push('recommendedModels must be an array if provided');
    } else {
      config.recommendedModels.forEach((modelId, index) => {
        if (typeof modelId !== 'string' || !modelId.trim()) {
          errors.push(`recommendedModels[${index}] must be a non-empty string`);
        }
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate example object
 * @param {Object} example - The example to validate
 * @param {number} index - The index of the example in the array
 * @returns {Object} Validation result
 */
function validateExample(example, index) {
  const errors = [];

  if (!example || typeof example !== 'object') {
    errors.push('must be an object');
    return { isValid: false, errors };
  }

  if (!example.name || typeof example.name !== 'string' || !example.name.trim()) {
    errors.push('name is required and must be a non-empty string');
  }

  if (!example.description || typeof example.description !== 'string' || !example.description.trim()) {
    errors.push('description is required and must be a non-empty string');
  }

  // Optional fields validation
  if (example.systemPrompt !== undefined && (typeof example.systemPrompt !== 'string' || !example.systemPrompt.trim())) {
    errors.push('systemPrompt must be a non-empty string if provided');
  }

  if (example.userPrompt !== undefined && (typeof example.userPrompt !== 'string' || !example.userPrompt.trim())) {
    errors.push('userPrompt must be a non-empty string if provided');
  }

  if (example.dataset !== undefined && (typeof example.dataset !== 'string' || !example.dataset.trim())) {
    errors.push('dataset must be a non-empty string if provided');
  }

  if (example.expectedOutcome !== undefined && (typeof example.expectedOutcome !== 'string' || !example.expectedOutcome.trim())) {
    errors.push('expectedOutcome must be a non-empty string if provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}















/**
 * Extract metadata from a scenario object
 * @param {Object} scenarioData - The scenario data
 * @returns {Object} Extracted metadata
 */
export function extractScenarioMetadata(scenarioData) {
  if (!scenarioData || typeof scenarioData !== 'object') {
    return {};
  }

  const metadata = {
    id: scenarioData.id,
    name: scenarioData.name,
    description: scenarioData.description,

    // Dataset information
    hasDatasets: !!(scenarioData.datasets && scenarioData.datasets.length > 0),
    datasetCount: scenarioData.datasets ? scenarioData.datasets.length : 0,

    // Prompt information
    hasSystemPrompts: !!(scenarioData.systemPrompts && scenarioData.systemPrompts.length > 0),
    systemPromptCount: scenarioData.systemPrompts ? scenarioData.systemPrompts.length : 0,
    hasUserPrompts: !!(scenarioData.userPrompts && scenarioData.userPrompts.length > 0),
    userPromptCount: scenarioData.userPrompts ? scenarioData.userPrompts.length : 0,

    // Tool information
    hasTools: !!(scenarioData.tools && scenarioData.tools.length > 0),
    toolCount: scenarioData.tools ? scenarioData.tools.length : 0,
    toolNames: scenarioData.tools ? scenarioData.tools.map(tool => tool.name) : [],
    hasExecutableTools: scenarioData.tools ? scenarioData.tools.some(tool => tool.handler) : false,

    // Configuration information
    hasConfiguration: !!scenarioData.configuration,
    allowsCustomPrompts: scenarioData.configuration?.allowCustomPrompts !== false,
    allowsDatasetModification: scenarioData.configuration?.allowDatasetModification === true,
    defaultStreamingEnabled: scenarioData.configuration?.defaultStreamingEnabled !== false,
    maxIterations: scenarioData.configuration?.maxIterations || 10,
    recommendedModelCount: scenarioData.configuration?.recommendedModels ? scenarioData.configuration.recommendedModels.length : 0,

    // Example information
    hasExamples: !!(scenarioData.examples && scenarioData.examples.length > 0),
    exampleCount: scenarioData.examples ? scenarioData.examples.length : 0,

    // Guardrail information
    hasGuardrails: !!scenarioData.guardrails && (
      // Check for simplified format
      !!(scenarioData.guardrails.topicPolicy ||
        scenarioData.guardrails.contentPolicy ||
        scenarioData.guardrails.wordPolicy ||
        scenarioData.guardrails.sensitiveInformationPolicy ||
        scenarioData.guardrails.contextualGroundingPolicy) ||
      // Check for AWS format
      !!(scenarioData.guardrails.contentPolicyConfig ||
        scenarioData.guardrails.wordPolicyConfig ||
        scenarioData.guardrails.sensitiveInformationPolicyConfig ||
        scenarioData.guardrails.topicPolicyConfig ||
        scenarioData.guardrails.contextualGroundingPolicyConfig)
    ),
    guardrailsEnabled: scenarioData.guardrails?.enabled !== false,
    guardrailName: scenarioData.guardrails?.name || null,
    guardrailDescription: scenarioData.guardrails?.description || null,

    // Policy type detection (works for both simplified and AWS formats)
    hasContentPolicyGuardrails: !!(scenarioData.guardrails?.contentPolicy || scenarioData.guardrails?.contentPolicyConfig),
    hasWordPolicyGuardrails: !!(scenarioData.guardrails?.wordPolicy || scenarioData.guardrails?.wordPolicyConfig),
    hasPiiGuardrails: !!(scenarioData.guardrails?.sensitiveInformationPolicy || scenarioData.guardrails?.sensitiveInformationPolicyConfig),
    hasTopicGuardrails: !!(scenarioData.guardrails?.topicPolicy || scenarioData.guardrails?.topicPolicyConfig),
    hasContextualGroundingGuardrails: !!(scenarioData.guardrails?.contextualGroundingPolicy || scenarioData.guardrails?.contextualGroundingPolicyConfig),

    // Format detection
    guardrailsFormat: scenarioData.guardrails ? (
      !!(scenarioData.guardrails.topicPolicy ||
        scenarioData.guardrails.contentPolicy ||
        scenarioData.guardrails.wordPolicy ||
        scenarioData.guardrails.sensitiveInformationPolicy ||
        scenarioData.guardrails.contextualGroundingPolicy) ? 'simplified' : 'aws'
    ) : null,

    // Seed data information (only scenarios with explicit seed data configuration can be refreshed)
    hasSeedData: !!(
      scenarioData.seedData ||
      (scenarioData.datasets && scenarioData.datasets.some(dataset =>
        dataset.seedData || dataset.allowReset || (dataset.file && dataset.file.includes('seed'))
      ))
    ),

    // Computed properties
    isComplete: !!(scenarioData.id && scenarioData.name && scenarioData.description),
    complexity: calculateComplexity(scenarioData)
  };

  return metadata;
}

/**
 * Calculate scenario complexity based on its components
 * @param {Object} scenarioData - The scenario data
 * @returns {string} Complexity level ('simple', 'moderate', 'complex')
 */
function calculateComplexity(scenarioData) {
  let score = 0;

  // Base components
  if (scenarioData.datasets && scenarioData.datasets.length > 0) score += 1;
  if (scenarioData.systemPrompts && scenarioData.systemPrompts.length > 0) score += 1;
  if (scenarioData.userPrompts && scenarioData.userPrompts.length > 0) score += 1;
  if (scenarioData.tools && scenarioData.tools.length > 0) score += 2;
  if (scenarioData.configuration) score += 1;
  if (scenarioData.examples && scenarioData.examples.length > 0) score += 1;
  if (scenarioData.guardrails && scenarioData.guardrails.configs && scenarioData.guardrails.configs.length > 0) score += 1;

  // Additional complexity factors
  if (scenarioData.datasets && scenarioData.datasets.length > 3) score += 1;
  if (scenarioData.tools && scenarioData.tools.length > 3) score += 1;
  if (scenarioData.tools && scenarioData.tools.some(tool => tool.handler)) score += 1;
  if (scenarioData.systemPrompts && scenarioData.systemPrompts.length > 3) score += 1;
  if (scenarioData.userPrompts && scenarioData.userPrompts.length > 3) score += 1;
  if (scenarioData.guardrails && scenarioData.guardrails.configs && scenarioData.guardrails.configs.length > 2) score += 1;

  if (score <= 3) return 'simple';
  if (score <= 6) return 'moderate';
  return 'complex';
}

/**
 * Create a default scenario object with the given basic information
 * @param {string} id - Scenario ID
 * @param {string} name - Scenario name
 * @param {string} description - Scenario description
 * @returns {Object} Default scenario object
 */
export function createDefaultScenario(id, name, description) {
  return {
    id: id || '',
    name: name || '',
    description: description || '',
    datasets: [],
    systemPrompts: [],
    userPrompts: [],
    tools: [],
    configuration: {
      allowCustomPrompts: true,
      allowDatasetModification: false,
      defaultStreamingEnabled: true,
      maxIterations: 10,
      recommendedModels: []
    },
    examples: [],
    guardrails: {
      enabled: false,
      configs: []
    }
  };
}

/**
 * Create a JSON schema for scenario validation
 * @returns {Object} JSON schema object
 */
export function createScenarioSchema() {
  return {
    type: 'object',
    required: ['id', 'name', 'description'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-z0-9-]+$',
        minLength: 1,
        maxLength: 50,
        description: 'Unique scenario identifier using lowercase letters, numbers, and hyphens'
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
        description: 'Human-readable scenario name'
      },
      description: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
        description: 'Detailed description of the scenario purpose and use case'
      },
      datasets: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name', 'description', 'file'],
          properties: {
            id: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1 },
            file: { type: 'string', minLength: 1 }
          }
        }
      },
      systemPrompts: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name', 'content'],
          properties: {
            id: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
            content: { type: 'string', minLength: 1, maxLength: 5000 }
          }
        }
      },
      userPrompts: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name', 'content'],
          properties: {
            id: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
            content: { type: 'string', minLength: 1, maxLength: 2000 }
          }
        }
      },
      tools: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'description', 'inputSchema'],
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1 },
            inputSchema: { type: 'object' },
            handler: { type: 'string' }
          }
        }
      },
      configuration: {
        type: 'object',
        properties: {
          allowCustomPrompts: { type: 'boolean' },
          allowDatasetModification: { type: 'boolean' },
          defaultStreamingEnabled: { type: 'boolean' },
          maxIterations: { type: 'number', minimum: 1, maximum: 100 },
          recommendedModels: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      },
      examples: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'description'],
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1 },
            systemPrompt: { type: 'string' },
            userPrompt: { type: 'string' },
            dataset: { type: 'string' },
            expectedOutcome: { type: 'string' }
          }
        }
      },
      guardrails: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          configs: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 50,
                  pattern: '^[a-zA-Z0-9_-]+$'
                },
                description: { type: 'string', maxLength: 200 },
                blockedInputMessaging: { type: 'string', maxLength: 500 },
                blockedOutputsMessaging: { type: 'string', maxLength: 500 },
                contentPolicyConfig: {
                  type: 'object',
                  properties: {
                    filtersConfig: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['type', 'inputStrength', 'outputStrength'],
                        properties: {
                          type: {
                            type: 'string',
                            enum: ['SEXUAL', 'VIOLENCE', 'HATE', 'INSULTS', 'MISCONDUCT', 'PROMPT_ATTACK']
                          },
                          inputStrength: {
                            type: 'string',
                            enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH']
                          },
                          outputStrength: {
                            type: 'string',
                            enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH']
                          }
                        }
                      }
                    }
                  }
                },
                wordPolicyConfig: {
                  type: 'object',
                  properties: {
                    wordsConfig: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          text: { type: 'string' }
                        }
                      }
                    },
                    managedWordListsConfig: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          type: { type: 'string', enum: ['PROFANITY'] }
                        }
                      }
                    }
                  }
                },
                sensitiveInformationPolicyConfig: {
                  type: 'object',
                  properties: {
                    piiEntitiesConfig: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          type: { type: 'string' },
                          action: { type: 'string', enum: ['BLOCK', 'ANONYMIZE'] }
                        }
                      }
                    },
                    regexesConfig: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          description: { type: 'string' },
                          pattern: { type: 'string' },
                          action: { type: 'string', enum: ['BLOCK', 'ANONYMIZE'] }
                        }
                      }
                    }
                  }
                },
                topicPolicyConfig: {
                  type: 'object',
                  properties: {
                    topicsConfig: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          definition: { type: 'string' },
                          examples: {
                            type: 'array',
                            items: { type: 'string' }
                          },
                          type: { type: 'string', enum: ['DENY'] }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Migrate scenario schema to support guardrails for existing scenarios
 * @param {Object} scenarioData - The scenario data to migrate
 * @returns {Object} Migrated scenario data with guardrails support
 */
export function migrateScenarioSchema(scenarioData) {
  if (!scenarioData || typeof scenarioData !== 'object') {
    return scenarioData;
  }

  // Create a copy to avoid mutating the original
  const migratedScenario = { ...scenarioData };

  // Add guardrails property if it doesn't exist
  if (!migratedScenario.guardrails) {
    migratedScenario.guardrails = {
      enabled: false,
      configs: []
    };
    return migratedScenario;
  }

  // If guardrails is not an object, reset it
  if (typeof migratedScenario.guardrails !== 'object') {
    migratedScenario.guardrails = {
      enabled: false,
      configs: []
    };
    return migratedScenario;
  }

  // Check if this is using the scenario format (has policy objects directly)
  const hasScenarioFormat = !!(
    migratedScenario.guardrails.topicPolicy ||
    migratedScenario.guardrails.contentPolicy ||
    migratedScenario.guardrails.wordPolicy ||
    migratedScenario.guardrails.sensitiveInformationPolicy ||
    migratedScenario.guardrails.contextualGroundingPolicy
  );

  // If using scenario format, preserve it and just ensure enabled is set
  if (hasScenarioFormat) {
    if (typeof migratedScenario.guardrails.enabled !== 'boolean') {
      migratedScenario.guardrails.enabled = true; // Default to true for scenario format
    }
    return migratedScenario;
  }

  // For array format, ensure proper structure
  if (typeof migratedScenario.guardrails.enabled !== 'boolean') {
    migratedScenario.guardrails.enabled = false;
  }

  if (!Array.isArray(migratedScenario.guardrails.configs)) {
    migratedScenario.guardrails.configs = [];
  }

  return migratedScenario;
}

/**
 * Check if a scenario needs schema migration for guardrails support
 * @param {Object} scenarioData - The scenario data to check
 * @returns {boolean} True if migration is needed
 */
export function needsGuardrailsMigration(scenarioData) {
  if (!scenarioData || typeof scenarioData !== 'object') {
    return false;
  }

  // Check if guardrails property is missing or malformed
  if (!scenarioData.guardrails) {
    return true;
  }

  if (typeof scenarioData.guardrails !== 'object') {
    return true;
  }

  // Check if this is using the scenario format (has policy objects directly)
  const hasScenarioFormat = !!(
    scenarioData.guardrails.topicPolicy ||
    scenarioData.guardrails.contentPolicy ||
    scenarioData.guardrails.wordPolicy ||
    scenarioData.guardrails.sensitiveInformationPolicy ||
    scenarioData.guardrails.contextualGroundingPolicy
  );

  // If using scenario format, no migration needed
  if (hasScenarioFormat) {
    return false;
  }

  // For array format, check if structure is correct
  if (typeof scenarioData.guardrails.enabled !== 'boolean') {
    return true;
  }

  if (!Array.isArray(scenarioData.guardrails.configs)) {
    return true;
  }

  return false;
}

/**
 * Create a scenario template for a specific use case
 * @param {string} templateType - Type of template ('fraud-detection', 'data-analysis', 'content-generation')
 * @param {string} id - Scenario ID
 * @param {string} name - Scenario name
 * @returns {Object} Template scenario object
 */
export function createScenarioTemplate(templateType, id, name) {
  const baseScenario = createDefaultScenario(id, name, '');

  switch (templateType) {
    case 'fraud-detection':
      return {
        ...baseScenario,
        description: 'Comprehensive fraud detection scenario with transaction analysis capabilities',
        systemPrompts: [
          {
            id: 'fraud-analyst',
            name: 'Fraud Detection Analyst',
            content: 'You are an expert fraud detection analyst with 10+ years of experience in financial crime prevention. Analyze transaction data to identify suspicious patterns, unusual behaviors, and potential fraud indicators.'
          }
        ],
        userPrompts: [
          {
            id: 'analyze-transactions',
            name: 'Analyze for Fraud Patterns',
            content: 'Analyze the provided transaction data for potential fraud indicators. Look for unusual patterns in amounts, locations, timing, and merchant categories.'
          }
        ],
        tools: [
          {
            name: 'flag_suspicious_transaction',
            description: 'Flag individual transactions for review',
            inputSchema: {
              type: 'object',
              properties: {
                transaction_id: { type: 'string' },
                risk_score: { type: 'number', minimum: 0, maximum: 100 }
              },
              required: ['transaction_id', 'risk_score']
            }
          }
        ]
      };

    case 'data-analysis':
      return {
        ...baseScenario,
        description: 'General data analysis scenario for exploring and interpreting datasets',
        systemPrompts: [
          {
            id: 'data-analyst',
            name: 'Data Analyst',
            content: 'You are a skilled data analyst with expertise in statistical analysis, pattern recognition, and data interpretation. Provide clear insights and actionable recommendations.'
          }
        ],
        userPrompts: [
          {
            id: 'analyze-data',
            name: 'Analyze Dataset',
            content: 'Analyze the provided dataset and identify key patterns, trends, and insights. Provide a summary of your findings and recommendations.'
          }
        ]
      };

    case 'content-generation':
      return {
        ...baseScenario,
        description: 'Content generation scenario for creating various types of written content',
        systemPrompts: [
          {
            id: 'content-writer',
            name: 'Content Writer',
            content: 'You are a professional content writer with expertise in creating engaging, informative, and well-structured content for various audiences and purposes.'
          }
        ],
        userPrompts: [
          {
            id: 'generate-content',
            name: 'Generate Content',
            content: 'Generate high-quality content based on the provided requirements and data. Ensure the content is engaging, informative, and appropriate for the target audience.'
          }
        ]
      };

    default:
      return baseScenario;
  }
}

/**
 * Check if a scenario uses the simplified guardrails format
 * @param {Object} scenarioData - The scenario data to check
 * @returns {boolean} True if using simplified format
 */
export function isSimplifiedGuardrailsFormat(scenarioData) {
  if (!scenarioData?.guardrails) {
    return false;
  }

  return !!(
    scenarioData.guardrails.topicPolicy ||
    scenarioData.guardrails.contentPolicy ||
    scenarioData.guardrails.wordPolicy ||
    scenarioData.guardrails.sensitiveInformationPolicy ||
    scenarioData.guardrails.contextualGroundingPolicy ||
    scenarioData.guardrails.blockedMessages
  );
}

/**
 * Check if a scenario uses the AWS guardrails format
 * @param {Object} scenarioData - The scenario data to check
 * @returns {boolean} True if using AWS format
 */
export function isAWSGuardrailsFormat(scenarioData) {
  if (!scenarioData?.guardrails) {
    return false;
  }

  return !!(
    scenarioData.guardrails.contentPolicyConfig ||
    scenarioData.guardrails.wordPolicyConfig ||
    scenarioData.guardrails.sensitiveInformationPolicyConfig ||
    scenarioData.guardrails.topicPolicyConfig ||
    scenarioData.guardrails.contextualGroundingPolicyConfig ||
    scenarioData.guardrails.blockedInputMessaging ||
    scenarioData.guardrails.blockedOutputsMessaging
  );
}
