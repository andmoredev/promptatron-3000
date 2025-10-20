# Design Document

## Overview

The Bedrock Guardrails integration extends the existing Bedrock LLM Analyzer with comprehensive content filtering and safety controls. This design leverages AWS Bedrock Guardrails to provide automated content policy enforcement, PII detection, and harmful content filtering. The integration follows the established architectural patterns in the application, including service-based AWS integration, component-driven UI, and scenario-based configuration management.

The design implements guardrails at multiple levels: scenario configuration, test execution, and result display. It maintains backward compatibility with existing scenarios while providing new capabilities for content safety and compliance.

## Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "UI Layer"
        A[Scenario Selector] --> B[Guardrails Section]
        B --> C[Guardrails Toggle]
        D[Test Interface] --> E[Guardrail Results Display]
        F[Settings Dialog] --> G[Guardrails Tab]
    end

    subgraph "Service Layer"
        H[GuardrailService] --> I[AWS Bedrock Guardrails API]
        J[ScenarioService] --> K[Guardrail Schema Validation]
        L[BedrockService] --> M[Converse API with Guardrails]
    end

    subgraph "Data Layer"
        N[Scenario Schema] --> O[Guardrails Configuration]
        P[Test Results] --> Q[Guardrail Evaluation Data]
    end

    A --> J
    D --> L
    L --> P
```

### Service Integration Pattern

The guardrails functionality integrates with existing services following the established singleton pattern:

- **GuardrailService**: New service for AWS Bedrock Guardrails API integration
- **BedrockService**: Extended to support guardrails in Converse API calls
- **ScenarioService**: Extended to validate and manage guardrail configurations

### Data Flow Architecture

```mermaid
sequenceDiagram
    participant U as User
    participant UI as UI Components
    participant GS as GuardrailService
    participant BS as BedrockService
    participant AWS as AWS Bedrock

    U->>UI: Load scenario with guardrails
    UI->>GS: Validate guardrail config
    GS->>AWS: Check if guardrail exists for scenario
    alt Guardrail doesn't exist
        GS->>AWS: Create guardrail with scenario tags
        AWS-->>GS: Return guardrail ARN
    end

    U->>UI: Run test with guardrails
    UI->>BS: Invoke model with guardrails
    BS->>AWS: Converse API with guardrail config
    AWS-->>BS: Response with guardrail results
    BS-->>UI: Display results and violations
```

## Components and Interfaces

### Core Components

#### GuardrailsSection Component
```javascript
// Location: src/components/GuardrailsSection.jsx
const GuardrailsSection = ({
  guardrails,
  isEnabled,
  onToggleEnabled,
  isCollapsed,
  onToggleCollapse,
  validationErrors
}) => {
  // Displays guardrail configuration
  // Shows enable/disable toggle
  // Shows guardrail status and counts
  // Displays validation errors
}
```

#### GuardrailResults Component
```javascript
// Location: src/components/GuardrailResults.jsx
const GuardrailResults = ({
  results,
  onDismiss
}) => {
  // Displays guardrail evaluation results
  // Shows violations with detailed explanations
  // Provides expandable sections for each guardrail
  // Uses consistent theme colors for status indicators
}
```

### Service Interfaces

#### GuardrailService Interface
```javascript
// Location: src/services/guardrailService.js
export class GuardrailService {
  // Core initialization
  async initialize()
  isReady()

  // Guardrail lifecycle management
  async createGuardrailForScenario(scenarioName, guardrailConfig)
  async discoverExistingGuardrails()
  async mapGuardrailsToScenarios(guardrails, scenarios)
  async ensureGuardrailExists(scenarioName, guardrailConfig)

  // Validation operations
  async validateGuardrailConfig(config)

  // Utility methods
  generateGuardrailTags(scenarioName)
  parseGuardrailTags(guardrail)

  // Status and monitoring
  detectCredentialSources()
  getGuardrailStatus(scenarioName)
}
```

#### Extended BedrockService Interface
```javascript
// Extended methods in src/services/bedrockService.js
export class BedrockService {
  // Existing methods...

  // Helper methods for guardrail support
  parseGuardrailResults(response)
  formatGuardrailViolations(violations)
  formatGuardrailConfigForAPI(config)
}
```

### Schema Extensions

#### Scenario Schema Extension
```javascript
// Extended scenario schema in src/utils/scenarioModels.js
const scenarioSchema = {
  // Existing fields...

  guardrails: {
    type: 'object',
    optional: true,
    properties: {
      enabled: { type: 'boolean', default: true },
      name: { type: 'string' }, // Used for AWS guardrail naming and tagging
      description: { type: 'string' },
      blockedInputMessaging: { type: 'string' },
      blockedOutputsMessaging: { type: 'string' },
      contentPolicyConfig: {
        type: 'object',
        properties: {
          filtersConfig: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['SEXUAL', 'VIOLENCE', 'HATE', 'INSULTS', 'MISCONDUCT', 'PROMPT_ATTACK'] },
                inputStrength: { type: 'string', enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH'] },
                outputStrength: { type: 'string', enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH'] }
              }
            }
          }
        }
      },
      wordPolicyConfig: { /* Word filtering configuration */ },
      sensitiveInformationPolicyConfig: { /* PII detection configuration */ },
      topicPolicyConfig: { /* Topic filtering configuration */ },
      // Runtime fields (not stored in scenario file)
      arn: { type: 'string' }, // Set after discovery/creation
      version: { type: 'string', default: 'DRAFT' }
    }
  }
}
```

## Data Models

### Guardrail Configuration Model
```javascript
// Location: src/models/GuardrailConfig.js
export class GuardrailConfig {
  constructor(config, scenarioName) {
    this.scenarioName = scenarioName
    this.name = config.name || `${scenarioName}-guardrail`
    this.description = config.description
    this.blockedInputMessaging = config.blockedInputMessaging
    this.blockedOutputsMessaging = config.blockedOutputsMessaging
    this.contentPolicyConfig = config.contentPolicyConfig
    this.wordPolicyConfig = config.wordPolicyConfig
    this.sensitiveInformationPolicyConfig = config.sensitiveInformationPolicyConfig
    this.topicPolicyConfig = config.topicPolicyConfig

    // Runtime properties
    this.arn = config.arn || null
    this.version = config.version || 'DRAFT'
    this.status = 'pending' // pending, creating, ready, error
  }

  validate() {
    // Validation logic for guardrail configuration
  }

  toAWSCreateFormat() {
    // Convert to AWS CreateGuardrail API format
    return {
      name: this.name,
      description: this.description,
      blockedInputMessaging: this.blockedInputMessaging,
      blockedOutputsMessaging: this.blockedOutputsMessaging,
      contentPolicyConfig: this.contentPolicyConfig,
      wordPolicyConfig: this.wordPolicyConfig,
      sensitiveInformationPolicyConfig: this.sensitiveInformationPolicyConfig,
      topicPolicyConfig: this.topicPolicyConfig,
      tags: [
        { key: 'source', value: 'promptatron' },
        { key: 'scenario', value: this.scenarioName }
      ]
    }
  }

  toConverseFormat() {
    // Convert to AWS Converse API format
    return {
      guardrailIdentifier: this.arn,
      guardrailVersion: this.version
    }
  }

  static fromScenarioConfig(scenarioConfig, scenarioName) {
    return new GuardrailConfig(scenarioConfig.guardrails, scenarioName)
  }

  static fromAWSGuardrail(awsGuardrail) {
    // Create from AWS ListGuardrails response
    const scenarioTag = awsGuardrail.tags?.find(tag => tag.key === 'scenario')
    const scenarioName = scenarioTag?.value || 'unknown'

    return new GuardrailConfig({
      name: awsGuardrail.name,
      description: awsGuardrail.description,
      arn: awsGuardrail.arn,
      version: awsGuardrail.version
    }, scenarioName)
  }
}
```

### Guardrail Evaluation Result Model
```javascript
// Location: src/models/GuardrailResult.js
export class GuardrailResult {
  constructor(result) {
    this.action = result.action // GUARDRAIL_INTERVENED or NONE
    this.output = result.output // Filtered content
    this.assessments = result.assessments || []
    this.timestamp = new Date().toISOString()
    this.guardrailId = result.guardrailId
    this.inputTokens = result.usage?.inputTokens || 0
    this.outputTokens = result.usage?.outputTokens || 0
  }

  hasViolations() {
    return this.action === 'GUARDRAIL_INTERVENED'
  }

  getViolationSummary() {
    // Extract violation details from assessments
  }

  getFilteredContent() {
    return this.output
  }
}
```

## Error Handling

### Error Categories and Responses

#### Guardrail Creation Errors
```javascript
const guardrailCreationErrors = {
  'AccessDenied': {
    userMessage: 'AWS credentials lack permission to create guardrails. Please ensure your credentials have bedrock:CreateGuardrail permission.',
    action: 'show_permissions_help',
    recoverable: true
  },
  'ValidationException': {
    userMessage: 'Guardrail configuration is invalid. Please check your scenario configuration.',
    action: 'show_config_help',
    recoverable: true
  },
  'ServiceQuotaExceededException': {
    userMessage: 'You have reached the maximum number of guardrails for your account.',
    action: 'show_quota_help',
    recoverable: false
  },
  'ThrottlingException': {
    userMessage: 'AWS API rate limit exceeded. Retrying automatically...',
    action: 'retry_with_backoff',
    recoverable: true
  }
}
```

#### Guardrail Evaluation Errors
```javascript
const guardrailEvaluationErrors = {
  'ResourceNotFoundException': {
    userMessage: 'Guardrail not found in your AWS account. It may have been deleted.',
    action: 'recreate_guardrail',
    recoverable: true
  },
  'ValidationException': {
    userMessage: 'Invalid content provided for guardrail evaluation.',
    action: 'show_content_requirements',
    recoverable: true
  }
}
```

### Graceful Degradation Strategy

1. **Guardrail Creation Failure**: Continue with model testing without guardrails, show warning
2. **Guardrail Evaluation Failure**: Log error, show warning, continue with model response
3. **AWS Credentials Missing**: Disable guardrail features, show setup guidance
4. **Network Connectivity Issues**: Implement retry with exponential backoff
5. **Service Unavailable**: Cache last known guardrail status, show degraded mode indicator

## Testing Strategy

### Unit Testing Approach

#### GuardrailService Tests
```javascript
// Location: src/services/__tests__/guardrailService.test.js
describe('GuardrailService', () => {
  describe('createGuardrail', () => {
    test('should create guardrail with valid configuration')
    test('should handle AWS API errors gracefully')
    test('should validate configuration before creation')
  })

  describe('applyGuardrail', () => {
    test('should evaluate content against guardrail')
    test('should handle guardrail violations correctly')
    test('should return proper result format')
  })

  describe('ensureGuardrailsExist', () => {
    test('should create missing guardrails')
    test('should reuse existing guardrails')
    test('should handle partial failures')
  })
})
```

#### Component Tests
```javascript
// Location: src/components/__tests__/GuardrailsSection.test.js
describe('GuardrailsSection', () => {
  test('should display guardrail configuration')
  test('should handle enable/disable toggle')
  test('should trigger guardrail-only testing')
  test('should show validation errors')
})
```

### Integration Testing

#### End-to-End Workflow Tests
```javascript
// Location: src/__tests__/integration/guardrails.test.js
describe('Guardrails Integration', () => {
  test('should load scenario with guardrails')
  test('should run model test with guardrails enabled')
  test('should display guardrail results correctly')
})
```

### Manual Testing Scenarios

1. **Scenario Loading**: Load scenarios with various guardrail configurations
2. **AWS Integration**: Test with different AWS credential configurations
3. **Error Handling**: Test with invalid configurations and network issues
4. **UI Interactions**: Test all user interactions and state changes
5. **Performance**: Test with large guardrail configurations and multiple evaluations

### Mock Testing Strategy

#### AWS API Mocking
```javascript
// Location: src/services/__tests__/mocks/guardrailMocks.js
export const mockGuardrailService = {
  createGuardrail: jest.fn(),
  applyGuardrail: jest.fn(),
  deleteGuardrail: jest.fn(),
  listGuardrails: jest.fn()
}
```

#### Test Data
```javascript
// Location: src/__tests__/fixtures/guardrailFixtures.js
export const sampleGuardrailConfig = {
  name: 'test-scenario-guardrail',
  description: 'Test guardrail configuration',
  contentPolicyConfig: {
    filtersConfig: [
      {
        type: 'HATE',
        inputStrength: 'HIGH',
        outputStrength: 'HIGH'
      }
    ]
  }
}

export const sampleAWSGuardrail = {
  arn: 'arn:aws:bedrock:us-east-1:123456789012:guardrail/test-scenario-guardrail',
  version: 'DRAFT',
  name: 'test-scenario-guardrail',
  description: 'Test guardrail configuration',
  tags: [
    { key: 'source', value: 'promptatron' },
    { key: 'scenario', value: 'test-scenario' }
  ]
}
```

## Guardrail Management Architecture

### One Guardrail Per Scenario

The design implements a one-to-one relationship between scenarios and guardrails:

#### 1. Scenario-Level Guardrail Configuration
```javascript
// Each scenario has one guardrail with multiple policy configurations
{
  "guardrails": {
    "enabled": true,
    "name": "fraud-detection-guardrail",
    "description": "Comprehensive guardrail for fraud detection scenario",
    "contentPolicyConfig": {
      "filtersConfig": [
        {
          "type": "HATE",
          "inputStrength": "HIGH",
          "outputStrength": "HIGH"
        }
      ]
    },
    "wordPolicyConfig": {
      "wordsConfig": [
        { "text": "confidential" }
      ]
    },
    "sensitiveInformationPolicyConfig": {
      "piiEntitiesConfig": [
        {
          "type": "CREDIT_DEBIT_CARD_NUMBER",
          "action": "BLOCK"
        }
      ]
    }
  }
}
```

#### 2. AWS Guardrail Creation and Tagging
```javascript
// GuardrailService creates guardrails with proper tagging
async createGuardrailForScenario(scenarioName, guardrailConfig) {
  const createParams = {
    name: `${scenarioName}-guardrail`,
    description: guardrailConfig.description,
    contentPolicyConfig: guardrailConfig.contentPolicyConfig,
    wordPolicyConfig: guardrailConfig.wordPolicyConfig,
    sensitiveInformationPolicyConfig: guardrailConfig.sensitiveInformationPolicyConfig,
    topicPolicyConfig: guardrailConfig.topicPolicyConfig,
    tags: [
      { key: 'source', value: 'promptatron' },
      { key: 'scenario', value: scenarioName }
    ]
  };

  const response = await this.bedrockClient.send(new CreateGuardrailCommand(createParams));
  return response.guardrailArn;
}
```

#### 3. Guardrail Discovery and Mapping
```javascript
// Discover existing guardrails and map to scenarios
async discoverExistingGuardrails() {
  const listResponse = await this.bedrockClient.send(new ListGuardrailsCommand({}));

  const promptatronGuardrails = listResponse.guardrails.filter(guardrail => {
    const sourceTag = guardrail.tags?.find(tag => tag.key === 'source');
    return sourceTag?.value === 'promptatron';
  });

  const guardrailMap = new Map();
  for (const guardrail of promptatronGuardrails) {
    const scenarioTag = guardrail.tags?.find(tag => tag.key === 'scenario');
    if (scenarioTag) {
      guardrailMap.set(scenarioTag.value, guardrail);
    }
  }

  return guardrailMap;
}
```

#### 3. Combined Results Display
```javascript
// GuardrailResults component handles multiple results
const GuardrailResults = ({ results }) => {
  return (
    <div className="guardrail-results">
      {results.map(result => (
        <GuardrailResultItem
          key={result.guardrailId}
          result={result}
          showExpanded={result.hasViolations()}
        />
      ))}
      <GuardrailSummary
        totalGuardrails={results.length}
        violationsCount={results.filter(r => r.hasViolations()).length}
      />
    </div>
  );
};
```

#### 4. AWS Bedrock Integration
The AWS Bedrock Converse API supports multiple guardrails through the `guardrailConfig` parameter:
```javascript
const converseParams = {
  modelId: modelId,
  messages: messages,
  guardrailConfig: {
    guardrailIdentifier: guardrailArn,
    guardrailVersion: "DRAFT" // Can specify multiple via array
  }
};
```

Multiple guardrails are evaluated through the Converse API and results are aggregated for display.

This design provides a comprehensive foundation for implementing AWS Bedrock Guardrails integration while maintaining consistency with the existing application architecture and patterns.
