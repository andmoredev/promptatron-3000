# Design Document

## Overview

This design document outlines the implementation of tool execution functionality in the Bedrock LLM Analyzer. The system will be enhanced to support actual tool execution in addition to the current tool detection and display capabilities. The design focuses on creating a toggle between "tool tracking" mode (current behavior) and "tool execution" mode (new functionality), with comprehensive workflow visualization and proper iteration control.

## Architecture

### High-Level Architecture

The tool execution system will be built as an extension to the existing architecture, maintaining backward compatibility while adding new execution capabilities:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  App.jsx (Main Controller)                                     │
│  ├─ Tool Execution Toggle                                      │
│  ├─ Max Iteration Control                                      │
│  └─ Determinism Evaluation Disabling Logic                    │
├─────────────────────────────────────────────────────────────────┤
│  Components                                                     │
│  ├─ ToolExecutionSettings (New)                               │
│  ├─ WorkflowTimeline (New)                                    │
│  ├─ ToolUsageDisplay (Enhanced)                               │
│  └─ TestResults (Enhanced)                                    │
├─────────────────────────────────────────────────────────────────┤
│  Services                                                       │
│  ├─ toolExecutionService (New)                                │
│  ├─ fraudToolsService (New)                                   │
│  ├─ workflowTrackingService (New)                             │
│  └─ bedrockService (Enhanced)                                 │
├─────────────────────────────────────────────────────────────────┤
│  Storage Layer                                                  │
│  ├─ Local Storage (Tool execution state)                      │
│  ├─ IndexedDB (Workflow history, tool results)                │
│  └─ Session Storage (Temporary execution state)               │
└─────────────────────────────────────────────────────────────────┘
```

### Tool Execution Flow

The tool execution system will implement Bedrock's multi-turn conversation pattern:

```
1. Send Initial Request + Tool Definitions → Bedrock
2. Bedrock Response: stopReason="tool_use" + toolUse blocks
3. Our App: Execute Tools Locally → Get Results  
4. Send toolResult Messages → Bedrock
5. Bedrock: Final Response with stopReason="end_turn"
   (Repeat 2-5 until max iterations or end_turn)
```

**Key Points:**
- Bedrock NEVER executes tools directly - it only requests tool usage
- Our application executes tools locally and sends results back
- This follows Bedrock's documented tool use pattern exactly

## Components and Interfaces

### New Components

#### 1. ToolExecutionSettings Component

**Purpose**: Provides UI controls for tool execution configuration

**Props**:
```typescript
interface ToolExecutionSettingsProps {
  useToolsEnabled: boolean;
  onUseToolsToggle: (enabled: boolean) => void;
  maxIterations: number;
  onMaxIterationsChange: (count: number) => void;
  determinismEnabled: boolean;
  onDeterminismToggle: (enabled: boolean) => void;
  isExecuting: boolean;
}
```

**Features**:
- Toggle switch for "Use Tools" mode
- Numeric input for maximum iteration count (1-50)
- Automatic disabling of determinism evaluation when tools are enabled
- Visual indicators for current execution state

#### 2. WorkflowTimeline Component

**Purpose**: Displays the complete workflow of LLM tool usage in chronological order

**Props**:
```typescript
interface WorkflowTimelineProps {
  workflow: WorkflowStep[];
  isExecuting: boolean;
  onStepExpand: (stepId: string) => void;
  onCopyStep: (stepId: string) => void;
}

interface WorkflowStep {
  id: string;
  type: 'llm_request' | 'llm_response' | 'tool_call' | 'tool_result' | 'error';
  timestamp: string;
  duration?: number;
  content: any;
  metadata?: any;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
}
```

**Features**:
- Chronological timeline view with timestamps
- Expandable steps for detailed information
- Real-time updates during execution
- Error highlighting and recovery information
- Copy functionality for individual steps

#### 3. ToolExecutionMonitor Component

**Purpose**: Provides real-time monitoring during tool execution

**Props**:
```typescript
interface ToolExecutionMonitorProps {
  currentIteration: number;
  maxIterations: number;
  activeTools: string[];
  executionStatus: 'idle' | 'executing' | 'completed' | 'error' | 'cancelled';
  onCancel: () => void;
}
```

**Features**:
- Progress indicator showing current iteration
- List of currently executing tools
- Cancel button for stopping execution
- Status indicators and error states

### Enhanced Components

#### 1. TestResults Component (Enhanced)

**New Features**:
- Integration with WorkflowTimeline component
- Display of tool execution results vs. tool detection results
- Enhanced history saving with workflow data

#### 2. ToolUsageDisplay Component (Enhanced)

**New Features**:
- Display actual tool execution results
- Show tool execution status (attempted vs. executed)
- Integration with workflow timeline

## Data Models

### Tool Execution State

```typescript
interface ToolExecutionState {
  enabled: boolean;
  maxIterations: number;
  currentIteration: number;
  status: 'idle' | 'executing' | 'completed' | 'error' | 'cancelled';
  workflow: WorkflowStep[];
  executionId: string;
  startTime: string;
  endTime?: string;
  totalDuration?: number;
}
```

### Workflow Step

```typescript
interface WorkflowStep {
  id: string;
  executionId: string;
  type: 'llm_request' | 'llm_response' | 'tool_call' | 'tool_result' | 'error';
  timestamp: string;
  duration?: number;
  iteration: number;
  content: {
    // For llm_request
    messages?: ConversationMessage[];
    // For llm_response
    response?: string;
    toolCalls?: ToolCall[];
    // For tool_call
    toolName?: string;
    parameters?: any;
    // For tool_result
    result?: any;
    success?: boolean;
    // For error
    error?: string;
    errorType?: string;
  };
  metadata?: {
    modelId?: string;
    usage?: TokenUsage;
    executionTime?: number;
    retryCount?: number;
  };
  status: 'pending' | 'in_progress' | 'completed' | 'error';
}
```

### Tool Execution Result

```typescript
interface ToolExecutionResult {
  toolName: string;
  parameters: any;
  result: any;
  success: boolean;
  error?: string;
  executionTime: number;
  timestamp: string;
}
```

## Services

### 1. ToolExecutionService

**Purpose**: Orchestrates the tool execution workflow

**Key Methods**:
```typescript
class ToolExecutionService {
  async executeWorkflow(
    modelId: string,
    systemPrompt: string,
    userPrompt: string,
    content: string,
    toolConfig: ToolConfig,
    options: ExecutionOptions
  ): Promise<ExecutionResult>;
  
  async executeTool(
    toolName: string,
    parameters: any,
    context: ExecutionContext
  ): Promise<ToolExecutionResult>;
  
  cancelExecution(executionId: string): void;
  
  getExecutionStatus(executionId: string): ToolExecutionState;
}
```

**Features**:
- Multi-turn conversation management
- Iteration counting and limits
- Tool execution orchestration
- Error handling and recovery
- Cancellation support

### 2. FraudToolsService

**Purpose**: Implements the actual fraud detection tool functionality

**Key Methods**:
```typescript
class FraudToolsService {
  async freezeAccount(parameters: FreezeAccountParams): Promise<FreezeAccountResult>;
  async flagSuspiciousTransaction(parameters: FlagTransactionParams): Promise<FlagTransactionResult>;
  async createFraudAlert(parameters: CreateAlertParams): Promise<CreateAlertResult>;
  async updateRiskProfile(parameters: UpdateRiskParams): Promise<UpdateRiskResult>;
  
  // Storage operations
  async saveToStorage(operation: string, data: any): Promise<void>;
  async getFromStorage(key: string): Promise<any>;
}
```

**Features**:
- Implementation of all fraud detection tools from the JSON configuration
- Local storage/IndexedDB integration for state persistence
- Validation of tool parameters
- Realistic result generation for demonstration purposes

### 3. WorkflowTrackingService

**Purpose**: Manages workflow state and timeline data

**Key Methods**:
```typescript
class WorkflowTrackingService {
  createExecution(executionId: string): void;
  addStep(executionId: string, step: WorkflowStep): void;
  updateStep(executionId: string, stepId: string, updates: Partial<WorkflowStep>): void;
  getWorkflow(executionId: string): WorkflowStep[];
  saveWorkflow(executionId: string): Promise<void>;
  loadWorkflow(executionId: string): Promise<WorkflowStep[]>;
}
```

**Features**:
- Real-time workflow tracking
- Persistent storage of workflow history
- Step-by-step execution monitoring
- Timeline reconstruction for historical analysis

## Error Handling

### Error Types and Handling Strategies

1. **Tool Execution Errors**
   - Invalid parameters: Show validation errors, allow retry
   - Tool unavailable: Graceful degradation, continue workflow
   - Execution timeout: Cancel tool, continue with partial results

2. **Iteration Limit Errors**
   - Max iterations reached: Stop execution, show partial results
   - Infinite loop detection: Early termination with warning

3. **Network/Service Errors**
   - Bedrock API errors: Retry with exponential backoff
   - Storage errors: Fallback to session storage

4. **Validation Errors**
   - Invalid tool configuration: Disable tool execution mode
   - Missing required parameters: Show detailed error messages

### Error Recovery Mechanisms

- **Graceful Degradation**: Continue execution without failed tools
- **Partial Results**: Save and display results up to the point of failure
- **Retry Logic**: Automatic retry for transient errors
- **User Intervention**: Allow manual retry or cancellation

## Testing Strategy

### Unit Testing

1. **Service Layer Testing**
   - ToolExecutionService workflow orchestration
   - FraudToolsService tool implementations
   - WorkflowTrackingService state management

2. **Component Testing**
   - ToolExecutionSettings user interactions
   - WorkflowTimeline display and navigation
   - ToolExecutionMonitor real-time updates

### Integration Testing

1. **End-to-End Workflow Testing**
   - Complete tool execution workflows
   - Multi-iteration scenarios
   - Error handling and recovery

2. **Storage Integration Testing**
   - Local storage persistence
   - IndexedDB operations
   - State restoration

### Manual Testing Scenarios

1. **Basic Tool Execution**
   - Enable tool execution mode
   - Run test with fraud detection tools
   - Verify tool results and workflow timeline

2. **Iteration Limits**
   - Set low iteration limit
   - Trigger scenario that would exceed limit
   - Verify graceful termination

3. **Error Scenarios**
   - Invalid tool parameters
   - Network failures during execution
   - Tool execution timeouts

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**
   - Load tool configurations only when needed
   - Defer workflow timeline rendering for large workflows

2. **Caching**
   - Cache tool execution results for identical parameters
   - Cache workflow data in memory during execution

3. **Batch Operations**
   - Batch storage operations for workflow steps
   - Optimize IndexedDB writes

4. **Memory Management**
   - Clean up completed executions
   - Limit stored workflow history

### Monitoring and Metrics

- Execution time tracking
- Tool performance metrics
- Memory usage monitoring
- Error rate tracking

## Security Considerations

### Data Protection

1. **Sensitive Data Handling**
   - Sanitize tool parameters before storage
   - Encrypt sensitive workflow data
   - Clear temporary data after execution

2. **Input Validation**
   - Validate all tool parameters
   - Sanitize user inputs
   - Prevent injection attacks

### Access Control

1. **Feature Gating**
   - Control access to tool execution mode
   - Validate user permissions for tool usage

2. **Audit Logging**
   - Log all tool executions
   - Track user actions and decisions

## Migration Strategy

### Backward Compatibility

1. **Existing Functionality**
   - Maintain current tool detection behavior
   - Preserve existing test history
   - Support legacy data formats

2. **Gradual Rollout**
   - Feature flag for tool execution mode
   - Optional migration of existing data
   - Fallback to detection mode on errors

### Data Migration

1. **Storage Schema Updates**
   - Extend existing test result schema
   - Add workflow data structures
   - Maintain compatibility with old data

2. **User Experience**
   - Smooth transition between modes
   - Clear indication of new capabilities
   - Help documentation and tutorials