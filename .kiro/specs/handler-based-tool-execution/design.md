# Design Document

## Overview

This design outlines the refactoring of the tool execution system from separate service classes to a handler-based architecture. The new system will usa single tool execution service that dynamically loads and executes tool implementations based on handler configurations, similar to AWS Lambda function handlers.

## Architecture

### Current Architecture
```
ToolExecutionService
├── fraudToolsService (separate class)
│   ├── freezeAccount()
│   ├── flagSuspiciousTransaction()
│   └── ...
└── shippingToolsService (separate class)
    ├── getCarrierStatus()
    ├── expediteShipment()
    └── ...
```

### New Handler-Based Architecture
```
ToolExecutionService
└── executeHandler(handler, parameters, context)
    ├── parseHandler("filename.entry")
    ├── dynamicImport("scenario/filename.js")
    └── callFunction(entry, parameters, context)

Scenario Files:
├── fraud-detection/
│   ├── freezeAccount.js (exports freezeAccount function)
│   ├── flagTransaction.js (exports flagSuspiciousTransaction function)
│   └── ...
└── shipping-logistics/
    ├── carrierStatus.js (exports getCarrierStatus function)
    ├── expediteShipment.js (exports expediteShipment function)
    └── ...
```

## Components and Interfaces

### Handler Configuration Format

Tools in scenario JSON files will support a new `handler` property:

```json
{
  "name": "freezeAccount",
  "description": "Freeze an account due to suspected fraud",
  "handler": "freezeAccount.freezeAccount",
  "inputSchema": {
    "type": "object",
    "properties": {
      "account_id": { "type": "string" }
    }
  }
}
```

The handler format follows the pattern: `{filename}.{entryPoint}`
- `filename`: JavaScript file name (without .js extension) in the scenario directory
- `entryPoint`: Function name to call within that file

### Enhanced ToolExecutionService

The existing `ToolExecutionService` will be enhanced with handler execution capabilities:

```javascript
class ToolExecutionService {
  // Existing methods remain unchanged

  /**
   * Execute a tool using either handler-based or legacy service approach
   */
  async executeTool(toolName, parameters, context) {
    const toolConfig = this.getToolConfig(toolName, context);

    if (toolConfig.handler) {
      return await this.executeHandler(toolConfig.handler, parameters, context);
    } else {
      // Fall back to legacy service execution
      return await this.executeLegacyTool(toolName, parameters, context);
    }
  }

  /**
   * Execute a handler-based tool
   */
  async executeHandler(handler, parameters, context) {
    const { filename, entryPoint } = this.parseHandler(handler);
    const scenarioPath = this.getScenarioPath(context.datasetType);
    const modulePath = `${scenarioPath}/${filename}.js`;

    try {
      const module = await import(modulePath);
      const handlerFunction = module[entryPoint];

      if (typeof handlerFunction !== 'function') {
        throw new Error(`Handler function '${entryPoint}' not found in ${filename}.js`);
      }

      return await handlerFunction(parameters, context);
    } catch (error) {
      throw new Error(`Handler execution failed: ${error.message}`);
    }
  }

  /**
   * Parse handler string into filename and entry point
   */
  parseHandler(handler) {
    const parts = handler.split('.');
    if (parts.length !== 2) {
      throw new Error(`Invalid handler format: ${handler}. Expected format: filename.entryPoint`);
    }

    return {
      filename: parts[0],
      entryPoint: parts[1]
    };
  }
}
```

### Handler Function Interface

All handler functions will follow a consistent interface:

```javascript
/**
 * Handler function interface
 * @param {Object} parameters - Tool parameters from the model
 * @param {Object} context - Execution context
 * @param {string} context.executionId - Unique execution ID
 * @param {Object} context.toolConfig - Tool configuration
 * @param {string} context.datasetType - Dataset/scenario type
 * @returns {Promise<Object>} Tool execution result
 */
export async function handlerName(parameters, context) {
  // Validate parameters
  // Execute tool logic
  // Return formatted response
}
```

### Storage and Utility Access

Handler functions will have access to shared utilities and storage patterns:

```javascript
// Shared utilities for handlers
export class HandlerUtils {
  static async initializeStorage(dbName, version, stores) {
    // IndexedDB initialization logic
  }

  static async saveToStorage(db, storeName, data) {
    // Storage save logic
  }

  static async getFromStorage(db, storeName, key) {
    // Storage retrieval logic
  }

  static validateParameters(parameters, schema) {
    // Parameter validation logic
  }

  static generateId(prefix) {
    // ID generation logic
  }
}
```

## Data Models

### Tool Configuration Schema

Extended tool configuration to support handlers:

```json
{
  "name": "string",
  "description": "string",
  "handler": "string (optional)", // Format: "filename.entryPoint"
  "inputSchema": {
    "type": "object",
    "properties": {},
    "required": []
  }
}
```

### Handler Execution Context

```javascript
{
  executionId: "string",
  toolConfig: "Object",
  datasetType: "string", // scenario ID
  scenarioPath: "string", // path to scenario directory
  storage: {
    dbName: "string",
    version: "number"
  }
}
```

### Handler Response Format

All handlers must return responses in this format:

```javascript
{
  success: true,
  // Tool-specific response data
  timestamp: "ISO string",
  // Additional metadata as needed
}
```

## Error Handling

### Handler Loading Errors

1. **File Not Found**: Clear error message with expected file path
2. **Function Not Found**: Clear error message with expected function name
3. **Import Errors**: Detailed error information about module loading issues

### Handler Execution Errors

1. **Parameter Validation**: Use existing validation patterns
2. **Runtime Errors**: Wrap and provide context about which handler failed
3. **Storage Errors**: Use existing storage error handling patterns

### Fallback Mechanism

During migration, the system will support both handler-based and legacy execution:

```javascript
async executeTool(toolName, parameters, context) {
  const toolConfig = this.getToolConfig(toolName, context);

  if (toolConfig.handler) {
    try {
      return await this.executeHandler(toolConfig.handler, parameters, context);
    } catch (handlerError) {
      console.warn(`Handler execution failed, falling back to legacy: ${handlerError.message}`);
      return await this.executeLegacyTool(toolName, parameters, context);
    }
  } else {
    return await this.executeLegacyTool(toolName, parameters, context);
  }
}
```

## Testing Strategy

### Unit Testing

1. **Handler Parsing**: Test handler string parsing with valid and invalid formats
2. **Module Loading**: Test dynamic import functionality with mocked modules
3. **Function Execution**: Test handler function calling with various parameter sets
4. **Error Handling**: Test all error scenarios with appropriate error messages

### Integration Testing

1. **End-to-End Tool Execution**: Test complete tool execution flow with handler-based tools
2. **Storage Integration**: Test handler access to IndexedDB storage
3. **Context Passing**: Test that execution context is properly passed to handlers
4. **Legacy Fallback**: Test fallback to legacy services when handlers fail

### Migration Testing

1. **Functional Equivalence**: Verify that migrated handlers produce identical results to legacy services
2. **Performance Comparison**: Ensure handler-based execution performs comparably to legacy services
3. **Error Consistency**: Verify that error messages and handling remain consistent

## Implementation Plan

### Phase 1: Core Handler Infrastructure

1. Enhance `ToolExecutionService` with handler execution capabilities
2. Create `HandlerUtils` class with shared utilities
3. Implement handler parsing and dynamic loading
4. Add comprehensive error handling

### Phase 2: Fraud Detection Migration

1. Create handler files for each fraud detection tool:
   - `freezeAccount.js` with `freezeAccount` function
   - `flagTransaction.js` with `flagSuspiciousTransaction` function
   - `createAlert.js` with `createFraudAlert` function
   - `updateRisk.js` with `updateRiskProfile` function

2. Update fraud detection scenario JSON with handler configurations
3. Test functional equivalence with legacy service

### Phase 3: Shipping Logistics Migration

1. Create handler files for each shipping logistics tool:
   - `carrierStatus.js` with `getCarrierStatus` function
   - `packageContents.js` with `getPackageContents` function
   - `customerTier.js` with `getCustomerTier` function
   - `slaInfo.js` with `getSLA` function
   - `expediteQuote.js` with `getExpediteQuote` function
   - `expediteShipment.js` with `expediteShipment` function
   - `holdForPickup.js` with `holdForPickup` function
   - `escalateToManager.js` with `escalateToManager` function
   - `noActionRequired.js` with `noActionRequired` function

2. Update shipping logistics scenario JSON with handler configurations
3. Test functional equivalence with legacy service

### Phase 4: Legacy Service Removal

1. Remove `fraudToolsService.js` and `shippingToolsService.js`
2. Remove legacy service imports from `toolExecutionService.js`
3. Remove legacy execution paths
4. Update all references to use handler-based execution only

### Phase 5: Documentation and Examples

1. Create handler development documentation
2. Provide example handler implementations
3. Document best practices for handler development
4. Create migration guide for future tool additions

## File Structure

After migration, the file structure will be:

```
public/scenarios/
├── fraud-detection/
│   ├── scenario.json (updated with handlers)
│   ├── freezeAccount.js
│   ├── flagTransaction.js
│   ├── createAlert.js
│   ├── updateRisk.js
│   └── handlerUtils.js (shared utilities)
└── shipping-logistics/
    ├── scenario.json (updated with handlers)
    ├── carrierStatus.js
    ├── packageContents.js
    ├── customerTier.js
    ├── slaInfo.js
    ├── expediteQuote.js
    ├── expediteShipment.js
    ├── holdForPickup.js
    ├── escalateToManager.js
    ├── noActionRequired.js
    └── handlerUtils.js (shared utilities)

src/services/
├── toolExecutionService.js (enhanced)
└── handlerUtils.js (global utilities)
```

## Benefits

1. **Reduced Code Duplication**: Single execution service instead of multiple service classes
2. **Better Separation of Concerns**: Each tool has its own file and implementation
3. **Easier Maintenance**: Tools can be updated independently without affecting the execution service
4. **Familiar Pattern**: Handler-based approach is familiar to developers who work with serverless functions
5. **Dynamic Loading**: Tools are loaded only when needed, reducing initial bundle size
6. **Extensibility**: New scenarios can easily add tools without modifying core services

## Migration Considerations

1. **Backward Compatibility**: Maintain legacy execution during migration period
2. **Testing**: Extensive testing to ensure functional equivalence
3. **Performance**: Monitor performance impact of dynamic imports
4. **Error Handling**: Ensure error messages remain helpful and actionable
5. **Documentation**: Clear migration path for future tool development
