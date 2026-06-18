# Design Document

## Overview

This design implements the Principle 5: LLM-Driven Error Analysis demonstration by extending Promptatron 3000 with configurable meta-agents that analyze and evaluate baseline LLM responses. The system builds upon existing patterns (determinism evaluator, scenario configuration, guardrails) to create three specialized meta-agents: Fact Checker, Error Containment, and Quality Enforcer.

The architecture follows the established pattern where the baseline LLM processes expense reports using Promptatron's existing infrastructure, then meta-agents analyze the response and provide accept/reject recommendations with detailed quality assessments.

## Architecture

### High-Level Flow

```
1. User configures expense-report-validator scenario
2. User enables desired meta-agents via UI toggles
3. Baseline LLM processes expense report (existing Promptatron flow)
4. Meta-agents analyze baseline response concurrently
5. System displays baseline response + meta-agent evaluations
6. User sees accept/reject recommendations with quality scores
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Promptatron 3000                         │
├─────────────────────────────────────────────────────────────┤
│  Existing Components (Unchanged)                            │
│  ├── BedrockService (baseline LLM)                         │
│  ├── ScenarioService (scenario management)                 │
│  ├── ToolExecutionService (expense policy tools)          │
│  └── TestResults (response display)                        │
├─────────────────────────────────────────────────────────────┤
│  New Meta-Agent Components                                  │
│  ├── MetaAgentService (orchestrates meta-agents)          │
│  └── MetaAgentResults (evaluation display)                │
├─────────────────────────────────────────────────────────────┤
│  Scenario-Specific Meta-Agents                             │
│  └── src/scenarios/expense-report-validator/               │
│      └── meta-agents/                                      │
│          ├── factChecker.js                               │
│          ├── errorContainment.js                          │
│          └── qualityEnforcer.js                           │
├─────────────────────────────────────────────────────────────┤
│  Enhanced Components                                        │
│  ├── App.jsx (meta-agent integration)                     │
│  ├── TestResults.jsx (meta-agent results display)        │
│  └── ScenarioSelector.jsx (meta-agent toggles)           │
└─────────────────────────────────────────────────────────────┘
```

### Scenario Folder Structure

```
src/scenarios/expense-report-validator/
├── scenario.json                    # Scenario configuration with meta-agent settings
├── datasets/
│   ├── expense-reports.csv         # Sample expense report data
│   └── policy-violations.csv       # Reports with intentional policy issues
├── tools/                          # Expense policy lookup tools
│   ├── policyLookup.js
│   ├── receiptValidation.js
│   └── complianceCheck.js
└── meta-agents/                    # Meta-agents specific to this scenario
    ├── factChecker.js              # Data consistency validation
    ├── errorContainment.js         # Safety and policy validation  
    └── qualityEnforcer.js          # Quality scoring and assessment
```

## Components and Interfaces

### MetaAgentService

Central service that manages meta-agent execution and coordination, loading scenario-specific meta-agents dynamically.

```javascript
class MetaAgentService {
  constructor() {
    this.activeEvaluations = new Map(); // evaluation ID -> status
    this.statusCallbacks = new Map(); // evaluation ID -> callback
    this.scenarioAgents = new Map(); // scenario ID -> loaded agents
  }

  // Load meta-agents for a specific scenario
  async loadScenarioMetaAgents(scenarioId) {
    if (this.scenarioAgents.has(scenarioId)) {
      return this.scenarioAgents.get(scenarioId);
    }

    const agents = new Map();
    const scenarioPath = `../scenarios/${scenarioId}/meta-agents`;

    try {
      // Dynamically import meta-agents from scenario folder
      const factChecker = await import(`${scenarioPath}/factChecker.js`);
      const errorContainment = await import(`${scenarioPath}/errorContainment.js`);
      const qualityEnforcer = await import(`${scenarioPath}/qualityEnforcer.js`);

      agents.set('factChecker', factChecker.default);
      agents.set('errorContainment', errorContainment.default);
      agents.set('qualityEnforcer', qualityEnforcer.default);

      this.scenarioAgents.set(scenarioId, agents);
      return agents;
    } catch (error) {
      console.warn(`Failed to load meta-agents for scenario ${scenarioId}:`, error);
      return new Map(); // Return empty map if meta-agents not found
    }
  }

  // Start meta-agent evaluation of baseline response
  async evaluateResponse(baselineResult, scenarioId, metaAgentConfig) {
    const evaluationId = generateId();
    const agents = await this.loadScenarioMetaAgents(scenarioId);
    const enabledAgents = this.getEnabledAgents(agents, metaAgentConfig);
    
    // Execute meta-agents concurrently
    const evaluations = await Promise.allSettled(
      enabledAgents.map(agent => agent.evaluate(baselineResult))
    );

    return this.aggregateResults(evaluations);
  }

  // Get enabled agents based on configuration
  getEnabledAgents(agents, config) {
    const enabled = [];
    
    if (config.agents?.factChecker?.enabled && agents.has('factChecker')) {
      const AgentClass = agents.get('factChecker');
      enabled.push(new AgentClass(config.agents.factChecker.config));
    }
    
    if (config.agents?.errorContainment?.enabled && agents.has('errorContainment')) {
      const AgentClass = agents.get('errorContainment');
      enabled.push(new AgentClass(config.agents.errorContainment.config));
    }
    
    if (config.agents?.qualityEnforcer?.enabled && agents.has('qualityEnforcer')) {
      const AgentClass = agents.get('qualityEnforcer');
      enabled.push(new AgentClass(config.agents.qualityEnforcer.config));
    }

    return enabled;
  }

  // Subscribe to evaluation status updates
  onStatusUpdate(evaluationId, callback) {
    this.statusCallbacks.set(evaluationId, callback);
    return () => this.statusCallbacks.delete(evaluationId);
  }
}
```

### Meta-Agent Base Class

Abstract base class for all meta-agents with common functionality.

```javascript
class BaseMetaAgent {
  constructor(type, config = {}) {
    this.type = type;
    this.config = config;
    this.bedrockService = bedrockService; // Reuse existing service
  }

  // Abstract method - must be implemented by subclasses
  async evaluate(baselineResult) {
    throw new Error('evaluate() must be implemented by subclass');
  }

  // Common LLM invocation for meta-agent analysis
  async invokeMetaAgent(systemPrompt, analysisPrompt, context) {
    return await this.bedrockService.invokeModel(
      this.config.modelId || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      systemPrompt,
      analysisPrompt,
      JSON.stringify(context, null, 2)
    );
  }

  // Common result formatting
  formatResult(analysis, recommendation, confidence, details = {}) {
    return {
      agentType: this.type,
      recommendation, // 'accept' | 'reject' | 'warning'
      confidence, // 0-100
      analysis,
      details,
      timestamp: new Date().toISOString()
    };
  }
}
```

### Scenario-Specific Meta-Agents

Meta-agents are implemented as ES6 modules in the scenario's `meta-agents/` folder.

#### factChecker.js (src/scenarios/expense-report-validator/meta-agents/factChecker.js)

Validates data consistency and identifies factual errors.

```javascript
import { BaseMetaAgent } from '../../../services/BaseMetaAgent.js';

class FactCheckerAgent extends BaseMetaAgent {
  constructor(config = {}) {
    super('fact-checker', config);
    this.systemPrompt = `You are a fact-checking specialist for expense report validation.
    
Your job is to identify data inconsistencies, OCR mismatches, and factual errors in expense report analysis.

Focus on:
- Numerical accuracy (amounts, calculations, totals)
- Data consistency between different fields
- Logical relationships (dates, categories, amounts)
- Missing or contradictory information

Provide a recommendation: ACCEPT, REJECT, or WARNING
Include confidence score (0-100) and specific findings.`;
  }

  async evaluate(baselineResult) {
    const analysisPrompt = `Analyze this expense report validation for factual accuracy and data consistency:

BASELINE RESPONSE: ${baselineResult.response}

TOOL CALLS MADE: ${JSON.stringify(baselineResult.toolUsage?.toolCalls || [], null, 2)}

DATASET CONTEXT: ${baselineResult.datasetContent}

Check for:
1. Mathematical accuracy in calculations
2. Consistency between stated amounts and tool results
3. Logical relationships in the data
4. Missing critical information that should have been verified

Respond with JSON:
{
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 85,
  "findings": ["specific issue 1", "specific issue 2"],
  "analysis": "detailed explanation of fact-checking results"
}`;

    const context = {
      baselineResponse: baselineResult.response,
      toolCalls: baselineResult.toolUsage?.toolCalls || [],
      datasetContent: baselineResult.datasetContent
    };

    const result = await this.invokeMetaAgent(
      this.systemPrompt,
      analysisPrompt,
      context
    );

    const parsed = this.parseMetaAgentResponse(result.text);
    return this.formatResult(
      parsed.analysis,
      parsed.recommendation.toLowerCase(),
      parsed.confidence,
      { findings: parsed.findings }
    );
  }

  parseMetaAgentResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      // Fallback parsing for non-JSON responses
      return {
        recommendation: 'WARNING',
        confidence: 50,
        findings: ['Failed to parse meta-agent response'],
        analysis: response
      };
    }
  }
}
```

  }
}

export default FactCheckerAgent;
```

#### errorContainment.js (src/scenarios/expense-report-validator/meta-agents/errorContainment.js)

Identifies unsafe decisions and policy violations.

```javascript
import { BaseMetaAgent } from '../../../services/BaseMetaAgent.js';

class ErrorContainmentAgent extends BaseMetaAgent {
  constructor(config = {}) {
    super('error-containment', config);
    this.systemPrompt = `You are an error containment specialist for expense report validation.

Your job is to identify unsafe decisions, policy violations, and potentially harmful recommendations.

Focus on:
- Policy compliance violations
- Unsafe financial decisions
- Missing required validations
- Inappropriate approvals or rejections
- Security and fraud concerns

Provide a recommendation: ACCEPT, REJECT, or WARNING
Include confidence score (0-100) and specific safety concerns.`;
  }

  async evaluate(baselineResult) {
    const analysisPrompt = `Analyze this expense report validation for safety and policy compliance:

BASELINE RESPONSE: ${baselineResult.response}

TOOL CALLS MADE: ${JSON.stringify(baselineResult.toolUsage?.toolCalls || [], null, 2)}

Check for:
1. Policy compliance violations
2. Unsafe financial decisions
3. Missing required policy checks
4. Inappropriate risk assessments
5. Potential fraud indicators ignored

Respond with JSON:
{
  "recommendation": "ACCEPT|REJECT|WARNING", 
  "confidence": 90,
  "safetyIssues": ["issue 1", "issue 2"],
  "analysis": "detailed safety and compliance analysis"
}`;

    const context = {
      baselineResponse: baselineResult.response,
      toolCalls: baselineResult.toolUsage?.toolCalls || []
    };

    const result = await this.invokeMetaAgent(
      this.systemPrompt,
      analysisPrompt,
      context
    );

    const parsed = this.parseMetaAgentResponse(result.text);
    return this.formatResult(
      parsed.analysis,
      parsed.recommendation.toLowerCase(),
      parsed.confidence,
      { safetyIssues: parsed.safetyIssues }
    );
  }
}
```

  }
}

export default ErrorContainmentAgent;
```

#### qualityEnforcer.js (src/scenarios/expense-report-validator/meta-agents/qualityEnforcer.js)

Scores reasoning clarity and compliance quality.

```javascript
import { BaseMetaAgent } from '../../../services/BaseMetaAgent.js';

class QualityEnforcerAgent extends BaseMetaAgent {
  constructor(config = {}) {
    super('quality-enforcer', config);
    this.systemPrompt = `You are a quality enforcement specialist for expense report validation.

Your job is to score the reasoning clarity, completeness, and overall quality of expense report analysis.

Evaluate:
- Clarity of reasoning and explanations
- Completeness of analysis
- Appropriate use of available tools
- Professional communication quality
- Compliance with validation standards

Provide a quality score (0-100) and recommendation.`;
  }

  async evaluate(baselineResult) {
    const analysisPrompt = `Score the quality of this expense report validation:

BASELINE RESPONSE: ${baselineResult.response}

TOOL CALLS MADE: ${JSON.stringify(baselineResult.toolUsage?.toolCalls || [], null, 2)}

AVAILABLE TOOLS: ${JSON.stringify(baselineResult.toolConfig?.tools?.map(t => t.name) || [], null, 2)}

Rate on:
1. Reasoning clarity (0-25 points)
2. Analysis completeness (0-25 points) 
3. Appropriate tool usage (0-25 points)
4. Professional communication (0-25 points)

Respond with JSON:
{
  "qualityScore": 85,
  "recommendation": "ACCEPT|REJECT|WARNING",
  "confidence": 95,
  "breakdown": {
    "reasoning": 22,
    "completeness": 20,
    "toolUsage": 23,
    "communication": 20
  },
  "analysis": "detailed quality assessment"
}`;

    const context = {
      baselineResponse: baselineResult.response,
      toolCalls: baselineResult.toolUsage?.toolCalls || [],
      availableTools: baselineResult.toolConfig?.tools || []
    };

    const result = await this.invokeMetaAgent(
      this.systemPrompt,
      analysisPrompt,
      context
    );

    const parsed = this.parseMetaAgentResponse(result.text);
    return this.formatResult(
      parsed.analysis,
      parsed.recommendation.toLowerCase(),
      parsed.confidence,
      { 
        qualityScore: parsed.qualityScore,
        breakdown: parsed.breakdown 
      }
    );
  }
}

export default QualityEnforcerAgent;
```
```

## Data Models

### Meta-Agent Configuration (in scenario.json)

```json
{
  "metaAgents": {
    "enabled": true,
    "agents": {
      "factChecker": {
        "enabled": true,
        "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "config": {
          "strictMode": true,
          "confidenceThreshold": 80
        }
      },
      "errorContainment": {
        "enabled": true,
        "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "config": {
          "safetyLevel": "high",
          "policyEnforcement": true
        }
      },
      "qualityEnforcer": {
        "enabled": true,
        "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "config": {
          "minimumScore": 70,
          "strictScoring": false
        }
      }
    }
  }
}
```

### Meta-Agent Evaluation Result

```javascript
{
  evaluationId: "eval_12345",
  baselineTestId: "test_67890",
  timestamp: "2025-01-01T12:00:00Z",
  status: "completed", // "running" | "completed" | "error"
  overallRecommendation: "accept", // "accept" | "reject" | "warning"
  overallConfidence: 85,
  agentResults: [
    {
      agentType: "fact-checker",
      recommendation: "accept",
      confidence: 90,
      analysis: "All numerical data is consistent...",
      details: {
        findings: ["Amounts match receipt data", "Calculations are correct"]
      }
    },
    {
      agentType: "error-containment", 
      recommendation: "warning",
      confidence: 75,
      analysis: "Policy check was not performed...",
      details: {
        safetyIssues: ["Missing policy validation"]
      }
    },
    {
      agentType: "quality-enforcer",
      recommendation: "accept",
      confidence: 88,
      analysis: "High quality analysis with clear reasoning...",
      details: {
        qualityScore: 88,
        breakdown: {
          reasoning: 22,
          completeness: 20,
          toolUsage: 23,
          communication: 23
        }
      }
    }
  ]
}
```

## Error Handling

### Meta-Agent Failure Recovery

1. **Individual Agent Failure**: If one meta-agent fails, others continue execution
2. **Graceful Degradation**: Show partial results with clear indication of failed agents
3. **Retry Logic**: Implement exponential backoff for transient failures
4. **Fallback Responses**: Provide default "unable to evaluate" responses for failed agents
5. **Error Reporting**: Log detailed error information for debugging

### User Experience During Failures

```javascript
// Example error state display
{
  status: "partial_completion",
  agentResults: [
    { agentType: "fact-checker", status: "completed", ... },
    { agentType: "error-containment", status: "failed", error: "Rate limit exceeded" },
    { agentType: "quality-enforcer", status: "completed", ... }
  ],
  warnings: ["Error Containment agent failed - safety analysis unavailable"]
}
```

## Testing Strategy

### Unit Tests

1. **MetaAgentService**: Test agent orchestration, result aggregation, error handling
2. **Individual Agents**: Test evaluation logic, prompt handling, result formatting
3. **Configuration Loading**: Test scenario meta-agent config parsing and validation
4. **Error Scenarios**: Test failure modes and recovery mechanisms

### Integration Tests

1. **End-to-End Flow**: Baseline LLM → Meta-agent evaluation → Result display
2. **Scenario Configuration**: Test meta-agent toggles and parameter changes
3. **Concurrent Execution**: Test multiple meta-agents running simultaneously
4. **UI Integration**: Test meta-agent results display and user interactions

### Demo Scenarios

1. **Baseline vs Enhanced**: Same expense report with/without meta-agents
2. **Policy Violation Detection**: Expense report that violates company policies
3. **OCR Mismatch**: Receipt data that doesn't match submitted amounts
4. **Quality Scoring**: Various quality levels of baseline responses

## Implementation Notes

### Reusing Existing Patterns

1. **Service Architecture**: Follow existing service patterns (bedrockService, determinismService)
2. **Status Updates**: Use callback pattern similar to determinism evaluator
3. **UI Integration**: Extend TestResults component similar to determinism display
4. **Configuration**: Follow scenario.json patterns like guardrails and tools
5. **Error Handling**: Use existing error handling utilities and patterns

### Performance Considerations

1. **Concurrent Execution**: Run meta-agents in parallel to minimize latency
2. **Caching**: Cache meta-agent configurations and prompts
3. **Progressive Display**: Show meta-agent results as they complete
4. **Resource Management**: Limit concurrent meta-agent executions
5. **Timeout Handling**: Set reasonable timeouts for meta-agent evaluations

### Security Considerations

1. **Input Validation**: Sanitize baseline responses before meta-agent analysis
2. **Output Filtering**: Validate meta-agent responses before display
3. **Rate Limiting**: Respect AWS Bedrock rate limits across all agents
4. **Error Information**: Avoid exposing sensitive data in error messages
5. **Configuration Security**: Validate meta-agent configurations for safety