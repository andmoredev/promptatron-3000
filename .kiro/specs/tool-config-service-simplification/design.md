# Design Document

## Overview

This design document outlines the simplification of the toolConfigService to wousively with the scenario-based architecture. The current service is overly complex, attempting to load tool configurations from deprecated manifest files and implementing complex caching, hot-reloading, and fallback mechanisms. The simplified service will act as a lightweight adapter that retrieves tool configurations directly from loaded scenarios via the scenarioService.

## Architecture

### Current Architecture Problems

The current toolConfigService has several architectural issues:

1. **Deprecated Data Source**: Attempts to load from `/datasets/manifest.json` which no longer exists
2. **Complex Initialization**: Multi-step initialization with manifest scanning, caching, and fallback logic
3. **Hot-Reloading**: Unnecessary complexity for development-time reloading
4. **Manifest Caching**: Complex caching system for data that should come from scenarios
5. **Fallback Configurations**: Hard-coded fallback configurations that duplicate scenario data

### New Simplified Architecture

The simplified architecture will be much cleaner:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Simplified ToolConfigService                 │
├─────────────────────────────────────────────────────────────────┤
│  Constructor:                                                   │
│  - Initialize with reference to scenarioService                │
│  - No complex initialization required                          │
├─────────────────────────────────────────────────────────────────┤
│  Core Methods:                                                  │
│  - getToolsForDatasetType(scenarioId)                         │
│    └─> scenarioService.getScenario(scenarioId).tools          │
│  - hasToolsForDatasetType(scenarioId)                         │
│    └─> Check if scenario has tools array                      │
│  - validateToolDefinition(toolConfig)                         │
│    └─> Simple validation using existing patterns              │
├─────────────────────────────────────────────────────────────────┤
│  Removed Complexity:                                           │
│  ✗ Manifest loading                                           │
│  ✗ Hot-reloading                                              │
│  ✗ Caching systems                                            │
│  ✗ Fallback configurations                                    │
│  ✗ Complex initialization                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

The new data flow is straightforward:

```
1. Scenario files contain tool definitions
2. ScenarioService loads and validates scenarios
3. ToolConfigService acts as adapter to scenarioService
4. Components request tools via ToolConfigService
5. ToolConfigService returns tools from appropriate scenario
```

## Components and Interfaces

### Simplified ToolConfigService Class

The new service will be dramatically simplified:

```javascript
export class ToolConfigService {
  constructor(scenarioService) {
    this.scenarioService = scenarioService;
    this.isInitialized = true; // Always ready since it's just an adapter
  }

  // Main API methods (maintain compatibility)
  getToolsForDatasetType(scenarioId) { /* Simple scenario lookup */ }
  hasToolsForDatasetType(scenarioId) { /* Check scenario.tools */ }
  getToolNamesForDatasetType(scenarioId) { /* Extract tool names */ }

  // Simplified validation
  validateToolDefinition(toolConfig) { /* Basic validation */ }

  // Status methods
  isReady() { return this.scenarioService.isReady(); }
  getStatus() { /* Simple status based on scenarioService */ }
}
```

### API Compatibility Layer

To maintain backward compatibility, the service will include a mapping layer:

```javascript
// Map legacy dataset type names to scenario IDs
const LEGACY_DATASET_TYPE_MAPPING = {
  'fraud-detection': 'fraud-detection',
  'shipping-logistics': 'shipping-logistics',
  'customer-support': 'customer-support'
  // Add more mappings as needed
};
```

### Tool Configuration Format

The service will work with tool configurations as defined in scenario files:

```json
{
  "id": "scenario-id",
  "name": "Scenario Name",
  "tools": [
    {
      "name": "tool_name",
      "description": "Tool description",
      "inputSchema": {
        "type": "object",
        "properties": { /* ... */ },
        "required": ["param1", "param2"]
      }
    }
  ]
}
```

## Data Models

### Simplified Tool Configuration

The service will work with a simplified tool configuration model:

```javascript
interface ToolConfiguration {
  scenarioId: string;
  tools: Tool[];
  source: 'scenario';
  loadedAt: string;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
```

### Service State

The service state will be minimal:

```javascript
interface ToolConfigServiceState {
  isInitialized: boolean; // Always true
  scenarioService: ScenarioService;
  lastError?: string;
}
```

## Error Handling

### Simplified Error Handling

The new service will use simple, clear error handling:

1. **Scenario Not Found**: Return null/empty configuration with clear message
2. **ScenarioService Not Ready**: Return appropriate status with guidance
3. **Invalid Tool Configuration**: Use existing scenario validation
4. **Missing Tools**: Return empty array (not an error condition)

### Error Messages

Error messages will be clear and actionable:

```javascript
const ERROR_MESSAGES = {
  SCENARIO_NOT_FOUND: 'Scenario "{scenarioId}" not found. Please check that the scenario is loaded.',
  SCENARIO_SERVICE_NOT_READY: 'Scenario service is not initialized. Please wait for scenarios to load.',
  INVALID_SCENARIO_ID: 'Invalid scenario ID "{scenarioId}". Scenario IDs must be non-empty strings.',
  NO_TOOLS_DEFINED: 'Scenario "{scenarioId}" does not have any tools defined.'
};
```

## Implementation Strategy

### Phase 1: Create Simplified Service

1. Create new simplified ToolConfigService class
2. Implement core methods that delegate to scenarioService
3. Add basic validation and error handling
4. Maintain existing API surface for compatibility

### Phase 2: Integration and Testing

1. Update service instantiation to inject scenarioService
2. Test with existing components to ensure compatibility
3. Verify tool configurations load correctly from scenarios
4. Test error handling and edge cases

### Phase 3: Cleanup

1. Remove old manifest loading code
2. Remove caching and hot-reloading logic
3. Remove fallback configurations
4. Clean up imports and dependencies

### Migration Strategy

The migration will be seamless for existing components:

1. **API Compatibility**: All existing method signatures remain the same
2. **Behavior Compatibility**: Methods return the same data structures
3. **Error Compatibility**: Error handling follows similar patterns
4. **No Component Changes**: Existing components continue to work unchanged

## Service Methods

### Core Methods

```javascript
class ToolConfigService {
  /**
   * Get tool configuration for a scenario
   * @param {string} scenarioId - The scenario ID (or legacy dataset type)
   * @returns {Object|null} Tool configuration or null if not found
   */
  getToolsForDatasetType(scenarioId) {
    // 1. Validate input
    // 2. Map legacy dataset types to scenario IDs if needed
    // 3. Get scenario from scenarioService
    // 4. Extract and return tool configuration
  }

  /**
   * Check if a scenario has tools
   * @param {string} scenarioId - The scenario ID
   * @returns {boolean} True if scenario has tools
   */
  hasToolsForDatasetType(scenarioId) {
    // 1. Get scenario from scenarioService
    // 2. Check if tools array exists and has items
  }

  /**
   * Get tool names for a scenario
   * @param {string} scenarioId - The scenario ID
   * @returns {string[]} Array of tool names
   */
  getToolNamesForDatasetType(scenarioId) {
    // 1. Get tool configuration
    // 2. Extract tool names from tools array
  }

  /**
   * Validate tool configuration
   * @param {Object} toolConfig - Tool configuration to validate
   * @returns {Object} Validation result
   */
  validateToolDefinition(toolConfig) {
    // 1. Basic structure validation
    // 2. Tool schema validation
    // 3. Return validation result
  }
}
```

### Utility Methods

```javascript
/**
 * Map legacy dataset type to scenario ID
 * @param {string} datasetType - Legacy dataset type
 * @returns {string} Scenario ID
 */
mapLegacyDatasetType(datasetType) {
  return LEGACY_DATASET_TYPE_MAPPING[datasetType] || datasetType;
}

/**
 * Extract tool configuration from scenario
 * @param {Object} scenario - Scenario object
 * @returns {Object} Tool configuration
 */
extractToolConfiguration(scenario) {
  if (!scenario || !scenario.tools || !Array.isArray(scenario.tools)) {
    return null;
  }

  return {
    id: `${scenario.id}-tools`,
    scenarioId: scenario.id,
    tools: scenario.tools,
    source: 'scenario',
    loadedAt: new Date().toISOString()
  };
}
```

## Testing Strategy

### Unit Tests

1. **Service Initialization**: Test that service initializes correctly with scenarioService
2. **Tool Retrieval**: Test getting tools from various scenarios
3. **Legacy Mapping**: Test mapping of legacy dataset types to scenario IDs
4. **Error Handling**: Test behavior when scenarios are missing or invalid
5. **Validation**: Test tool configuration validation

### Integration Tests

1. **ScenarioService Integration**: Test that service works correctly with loaded scenarios
2. **Component Integration**: Test that existing components continue to work
3. **Tool Execution Integration**: Test that tool execution works with simplified service

### Test Scenarios

```javascript
describe('ToolConfigService', () => {
  describe('getToolsForDatasetType', () => {
    it('should return tools for valid scenario');
    it('should return null for scenario without tools');
    it('should return null for non-existent scenario');
    it('should map legacy dataset types to scenario IDs');
  });

  descriForDatasetType', () => {
    it('should return true for scenario with tools');
    it('should return false for scenario without tools');
    it('should return false for non-existent scenario');
  });

  describe('validateToolDefinition', () => {
    it('should validate correct tool configuration');
    it('should reject invalid tool configuration');
    it('should provide helpful error messages');
  });
});
```

## Performance Considerations

### Performance Improvements

The simplified service will be more performant:

1. **No Manifest Loading**: Eliminates network requests for manifest files
2. **No Caching Overhead**: Removes complex caching logic
3. **No Hot-Reloading**: Eliminates periodic checking and reloading
4. **Direct Access**: Direct access to scenario data without intermediate layers

### Memory Usage

Memory usage will be reduced:

1. **No Duplicate Storage**: Tools are stored once in scenarios, not duplicated in service
2. **No Cache Storage**: Eliminates manifest cache and validation cache
3. **Simpler State**: Minimal service state reduces memory footprint

## Security Considerations

### Simplified Security Model

The simplified service has fewer security concerns:

1. **No File System Access**: No longer attempts to load files from various paths
2. **No Dynamic Loading**: No dynamic loading of external configuration files
3. **Validated Input**: All tool configurations come through scenario validation
4. **Clear Data Flow**: Simple, traceable data flow from scenarios to components

## Migration Impact

### Zero Impact Migration

The migration will have zero impact on existing functionality:

1. **API Compatibility**: All existing method calls continue to work
2. **Data Compatibility**: Same data structures returned
3. **Error Compatibility**: Similar error handling patterns
4. **Performance Improvement**: Faster and more reliable operation

### Benefits

The simplified service provides several benefits:

1. **Maintainability**: Much easier to understand and modify
2. **Reliability**: Fewer failure points and edge cases
3. **Performance**: Faster initialization and operation
4. **Clarity**: Clear data flow and dependencies
5. **Testability**: Easier to test with fewer dependencies

## Future Considerations

### Extensibility

The simplified service can be easily extended:

1. **Additional Validation**: Easy to add more validation rules
2. **Tool Metadata**: Easy to add tool metadata and categorization
3. **Tool Discovery**: Easy to add tool discovery and recommendation features
4. **Integration**: Easy to integrate with other services

### Monitoring

Simple monitoring can be added:

1. **Usage Tracking**: Track which scenarios and tools are used
2. **Error Tracking**: Track and report configuration errors
3. **Performance Metrics**: Monitor service response times
