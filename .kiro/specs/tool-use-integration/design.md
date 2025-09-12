# Design Document

## Overview

The tool use integration feature extends the Bedrock LLM Analyzer to support AWS Bedrock's tool use (function calling) capabilities. This enhancement allows AI models to be presented with predefined tools during analysis and captures their usage attempts without executing the tools. The system records what tools the model wanted to use and what parameters it tried to pass, providing insights into the model's decision-making process. The feature includes strong integration with the determinism evaluation system, where tool usage consistency is weighted heavily in determinism scoring.

## Architecture

### Core Components

1. **Tool Configuration System**: Manages dataset-specific tool definitions
2. **Enhanced Bedrock Service**: Extended to support tool use in Converse API calls
3. **Tool Usage Tracking**: Captures and stores tool usage attempts and parameters
4. **UI Enhancement**: Displays tool usage information in test results and history
5. **Determinism Integration**: Includes tool usage in determinism evaluation with high weighting

### Data Flow

```
Dataset Selection → Tool Configuration → Model Invocation with Tools → Tool Usage Detection → Result Display → History Storage → Determinism Evaluation
```

## Components and Interfaces

### Tool Configuration Service

**Location**: `src/services/toolConfigService.js`

```javascript
export class ToolConfigService {
  // Get tool definitions for a specific dataset type
  getToolsForDatasetType(datasetType)

  // Validate tool definitions
  validateToolDefinition(toolDef)

  // Get all available tool configurations
  getAllToolConfigurations()
}
```

**Tool Definition Structure**:
```javascript
{
  datasetType: "fraud-detection",
  tools: [
    {
      name: "freeze_account",
      description: "Freeze an account due to suspected fraud",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID to freeze" },
          transaction_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of transaction IDs related to fraud"
          },
          reason: { type: "string", description: "Reason for freezing the account" }
        },
        required: ["account_id", "transaction_ids", "reason"]
      }
    }
  ]
}
```

### Enhanced Bedrock Service

**Extensions to**: `src/services/bedrockService.js`

```javascript
// New methods to add:
async invokeModelWithTools(modelId, systemPrompt, userPrompt, content, toolConfig)
async invokeModelStreamWithTools(modelId, systemPrompt, userPrompt, content, toolConfig, onToken, onComplete, onError)
parseToolUseFromMessageContent(messageContent)
extractToolUsageAttempts(response)
formatToolUsageForDisplay(toolUsage)
```

**Tool Use Processing Flow**:
1. Send initial message with tool configuration to model
2. Check response.output.message.content for tool use blocks
3. Extract toolUse items: `{ toolUse: { name, input, toolUseId } }`
4. Record tool usage attempts without execution
5. Return response with captured tool usage data (no conversation continuation)

### Tool Usage Data Structure

Based on Bedrock Converse API response structure:

```javascript
{
  toolUse: {
    name: "freeze_account",
    toolUseId: "tooluse_abc123", // From toolUse.toolUseId
    input: { // From toolUse.input (raw parameters from model)
      account_id: "ACC-12345",
      transaction_ids: ["TXN-001", "TXN-002"],
      reason: "Suspicious large transactions from foreign IP"
    },
    attempted: true, // Indicates this was attempted but not executed
    timestamp: "2024-01-15T10:30:15Z"
  }
}
```

### UI Components

**Enhanced Test Results Display**:
- New "Tool Usage" section in test results
- Clear formatting of tool attempts with par
 Visual indicators for tool usage status

**History Integration**:
- Tool usage information stored with each test result
- Searchable and filterable by tool usage
- Comparison view includes tool usage differences

**Component Updates**:
- `src/components/TestResults.jsx`: Add tool usage display section
- `src/components/History.jsx`: Add tool usage filtering and display
- `src/components/Comparison.jsx`: Add tool usage comparison

### Determinism Integration

**Enhanced Determinism Service**:
```javascript
// Extensions to src/services/determinismService.js
evaluateToolUsageConsistency(responses)
calculateToolUsageScore(toolUsageData)
```

**Tool Usage Determinism Criteria**:
1. **Tool Selection Consistency**: Same tools used across runs (weight: 30%)
2. **Parameter Consistency**: Identical parameters for same tools (weight: 40%)
3. **Usage Pattern Consistency**: Same number and sequence of tool calls (weight: 30%)

**Scoring Algorithm**:
- Perfect match: 100% score
- Same tools, different parameters: 40% score
- Different tools used: 0% score
- Mixed usage (some runs with tools, some without): 10% score

## Data Models

### Tool Configuration Model

```javascript
{
  id: "fraud-detection-tools",
  datasetType: "fraud-detection",
  version: "1.0",
  tools: [
    {
      toolSpec: {
        name: "freeze_account",
        description: "Put a freeze on a specific account and mark why it was frozen",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              account_id: {
                type: "string",
                description: "The account ID to freeze"
              },
              transaction_ids: {
                type: "array",
                items: { type: "string" },
                description: "Array of transaction IDs that led to this decision"
              },
              reason: {
                type: "string",
                description: "Detailed reason for freezing the account"
              }
            },
            required: ["account_id", "transaction_ids", "reason"]
          }
        }
      }
    }
  ]
}
```

### Enhanced Test Result Model

```javascript
{
  // Existing fields...
  id: "test_123",
  timestamp: "2024-01-15T10:30:00Z",
  modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  systemPrompt: "...",
  userPrompt: "...",
  content: "...",
  response: "...",
  usage: { ... },

  // New tool usage fields (matches Bedrock response structure)
  toolUsage: {
    hasToolUsage: true,
    toolCalls: [
      {
        toolName: "freeze_account",
        toolUseId: "tooluse_abc123",
        input: { // Raw input from model (matches toolUse.input)
          account_id: "ACC-12345",
          transaction_ids: ["TXN-001", "TXN-002"],
          reason: "Multiple high-value transactions from suspicious locations"
        },
        attempted: true,
        timestamp: "2024-01-15T10:30:15Z"
      }
    ],
    toolCallCount: 1,
    availableTools: ["freeze_account"] // Tools that were available to model
  },

  // Enhanced determinism data
  determinismData: {
    // Existing fields...
    toolUsageConsistency: {
      score: 0.85,
      details: {
        toolSelectionConsistency: 0.9,
        parameterConsistency: 0.8,
        usagePatternConsistency: 0.85,
        iterationConsistency: 0.9
      }
    }
  }
}
```

## Error Handling

### Tool Configuration Errors
- Invalid tool definitions: Log warning, continue without tools
- Missing tool configurations: Graceful degradation to no-tool mode
- Tool validation failures: Clear error messages to user

### Runtime Tool Errors
- Model tool use parsing errors: Capture and display as "attempted but failed to parse"
- Tool usage detection errors: Show parsing errors in tool usage display
- Tool parameter extraction errors: Display extraction status in results

### Determinism Evaluation Errors
- Tool usage comparison failures: Fallback to text-only determinism evaluation
- Inconsistent tool data: Handle gracefully with appropriate scoring

## Testing Strategy

### Unit Tests
- Tool configuration service validation
- Tool usage parsing from Bedrock responses
- Determinism scoring algorithms
- UI component rendering with tool usage data

### Integration Tests
- End-to-end tool use flow with mock Bedrock responses
- Tool usage storage and retrieval from history
- Determinism evaluation with tool usage data
- UI interactions with tool usage features

### Manual Testing Scenarios
1. **Basic Tool Use**: Test fraud detection with freeze_account tool
2. **No Tool Use**: Verify graceful handling when model doesn't use tools
3. **Multiple Tool Calls**: Test scenarios with multiple tool usage attempts
4. **Determinism with Tools**: Verify tool usage affects determinism scoring
5. **History and Comparison**: Test tool usage display in history and comparison views

### Test Data
- Mock Bedrock responses with tool use
- Sample tool configurations for different dataset types
- Test cases for various tool usage patterns

## Implementation Phases

### Phase 1: Core Tool Infrastructure
1. Create tool configuration service
2. Extend Bedrock service for tool use support
3. Implement tool usage data structures
4. Add basic tool usage parsing

### Phase 2: UI Integration
1. Enhance test results display with tool usage section
2. Update history component to show tool usage
3. Add tool usage to comparison view
4. Implement tool usage filtering in history

### Phase 3: Determinism Integration
1. Extend determinism service for tool usage evaluation
2. Implement tool usage consistency scoring
3. Update determinism UI to show tool usage scores
4. Add tool usage weighting to overall determinism score

### Phase 4: Dataset-Specific Tools
1. Implement fraud detection freeze_account tool
2. Create extensible system for adding new dataset tools
3. Add tool configuration validation
4. Document tool configuration format

## Security Considerations

### Tool Detection Safety
- Tools are detected but never executed
- No real account freezing or external system calls
- Tool usage detection is for analysis and display only

### Data Privacy
- Tool parameters may contain sensitive data (account IDs, transaction IDs)
- Ensure proper handling in storage and display
- Consider data masking for demo purposes

### Input Validation
- Validate all tool parameters against schema
- Sanitize tool usage data for display
- Prevent injection attacks through tool parameters

## Performance Considerations

### Tool Configuration Loading
- Cache tool configurations to avoid repeated file reads
- Lazy load tool definitions only when needed
- Optimize tool validation for large configurations

### Tool Usage Processing
- Efficient parsing of tool usage from Bedrock responses
- Minimize impact on existing model invocation performance
- Optimize tool usage storage and retrieval

### Determinism Evaluation
- Efficient comparison algorithms for tool usage data
- Parallel processing where possible
- Optimize for large numbers of tool usage comparisons

## Future Extensibility

### Additional Dataset Types
- Customer service tools (escalate_ticket, transfer_agent)
- Financial analysis tools (calculate_risk, generate_report)
- Content moderation tools (flag_content, escalate_review)

### Advanced Tool Features
- Tool chaining and dependencies
- Conditional tool availability
- Tool usage analytics and insights
- Tool performance metrics

### Integration Enhancements
- Real tool execution in controlled environments
- Tool usage export and reporting
- Advanced tool usage visualization
- Tool usage-based model comparison metrics
