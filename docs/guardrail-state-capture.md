# Guardrail State Capture Implementation

## Overview

This document describes the implementation of guardrailstate capture during test execution, which allows users to see which guardrail configurations were active when a test was run and how they affected the results.

## Implementation Details

### Key Components

1. **State Capture Function** (`captureGuardrailStateSnapshot`)
   - Captures the current state of all guardrail configurations at test execution time
   - Stores which configurations are active/inactive
   - Records configuration details and metadata

2. **Test Result Enhancement**
   - Adds `guardrailSnapshot` field to test results
   - Maintains backward compatibility with existing history data
   - Provides rich information for history display

3. **History Integration**
   - History component already supports displaying guardrail snapshots
   - Shows active configurations and intervention details
   - Provides expandable sections for detailed information

### Data Structure

The `guardrailSnapshot` field in test results contains:

```javascript
{
  scenarioName: "scenario-name",
  guardrailId: "guardrail-id",
  guardrailArn: "arn:aws:bedrock:...",
  guardrailVersion: "DRAFT",
  guardrailName: "scenario-name-guardrail",
  activeConfigurations: [
    {
      type: "CONTENT_POLICY",
      name: "Content Policy",
      isActive: true,
      details: "Content filtering enabled"
    },
    // ... other configurations
  ],
  configurationStates: {
    "CONTENT_POLICY": {
      isActive: true,
      details: "Content filtering enabled"
    },
    // ... other configuration states
  },
  capturedAt: "2024-01-01T12:00:00.000Z"
}
```

### Error Handling

- Graceful degradation when guardrail service is unavailable
- Fallback to minimal snapshot with error information
- Maintains test execution flow even if state capture fails
- Backward compatibility with tests that don't have guardrail snapshots

### Integration Points

1. **Test Execution Flow**
   - State capture occurs after guardrail configuration is determined
   - Happens before model invocation to ensure accurate state
   - Works for both tool execution and regular test modes

2. **History Display**
   - Uses existing `GuardrailHistoryDisplay` component
   - Shows active configurations from snapshot
   - Displays intervention details from guardrail results

3. **Service Dependencies**
   - Uses `guardrailConfigurationManager` for state retrieval
   - Integrates with existing `guardrailService`
   - Works with scenario-based guardrail mapping

## Requirements Fulfilled

✅ **2.1**: Store guardrail configuration state information alongside each test run
✅ **2.2**: Record which guardrail configurations were active during test execution
✅ **2.3**: Capture and store guardrail intervention information (already implemented)
✅ **2.8**: Maintain guardrail history data persistence across sessions

## Usage

The guardrail state capture is automatic and transparent:

1. When a test is run with guardrails enabled
2. The system captures the current state of all guardrail configurations
3. This state is stored with the test results in history
4. Users can view the guardrail information in the History tab
5. The information shows both what was active and what interventions occurred

## Testing

A test file is provided at `src/utils/__tests__/guardrailStateCapture.test.js` that verifies:

- State capture functionality works correctly
- Error handling for missing guardrails
- Proper data structure creation
- Active configuration filtering

## Backward Compatibility

- Existing history entries without guardrail snapshots continue to work
- History component gracefully handles missing snapshot data
- No breaking changes to existing APIs or data structures
- Progressive enhancement approach ensures smooth operation

## Future Enhancements

Potential improvements that could be added:

1. **Configuration Change Detection**: Track when configurations change between tests
2. **Performance Metrics**: Capture guardrail evaluation timing
3. **Configuration Comparison**: Compare configurations across different test runs
4. **Export/Import**: Include guardrail state in history export/import functionality
