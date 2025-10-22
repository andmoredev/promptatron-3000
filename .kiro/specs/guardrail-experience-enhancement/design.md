# Design Document

## Overview

This design enhances the existing guardrail experience in Promptatron by building upon the current AWS Bedrock guardrail integration. The application already has comprehensive guardrail functionality including:

- **Existing AWS Integration**: GuardrailManager, GuardrailConfigurationManager, and AWS SDK commands (GetGuardrailCommand, UpdateGuardrailCommand)
- **Current UI Components**: GuardrailsSection component with basic display and toggle functionality
- **History Integration**: Guardrail results are already captured and displayed in test history
- **Service Layer**: Complete service architecture for guardrail management

The enhancement focuses on **UI/UX improvements** to provide better control and visibility over individual guardrail configurations, enhanced history display, and a dedicated edit modal interface.

## Architecture

### Component Architecture

```
App.jsx
├── GuardrailsSection.jsx (Enhanced)
│   ├── GuardrailConfigurationToggles.jsx (New)
│   └── GuardrailEditModal.jsx (New)
├── History.jsx (Enhanced)
│   └── GuardrailHistoryDisplay.jsx (New)
└── TestResults.jsx (Enhanced)
    └── GuardrailResultsDisplay.jsx (Enhanced)
```

### Service Layer (Existing - No Changes Needed)

The existing service architecture is comprehensive and supports all required functionality:

- **GuardrailConfigurationManager**: Already implements toggle functionality, AWS integration, and state management
- **GuardrailManager**: Handles result parsing and API formatting
- **BedrockService**: Integrates guardrail configuration into model invocation

## Components and Interfaces

### 1. Enhanced GuardrailsSection Component

**Current State**: Basic display with overall enable/disable toggle
**Enhancement**: Add individual configuration toggles and edit modal trigger

```javascript
// Enhanced props interface
{
  guardrails: {
    configs: [
      {
        name: string,
        description: string,
        contentPolicyConfig: { isActive: boolean, filters: [...] },
        wordPolicyConfig: { isActive: boolean, ... },
        sensitiveInformationPolicyConfig: { isActive: boolean, ... },
        topicPolicyConfig: { isActive: boolean, ... },
        contextualGroundingPolicyConfig: { isActive: boolean, ... },
        automatedReasoningPolicyConfig: { isActive: boolean, ... }
      }
    ]
  },
  onConfigurationToggle: (configType, isActive) => void,
  onEditGuardrail: (guardrailId) => void
}
```

### 2. New GuardrailConfigurationToggles Component

**Purpose**: Display individual configuration types with toggle controls

```javascript
const GuardrailConfigurationToggles = ({
  configurations,
  onToggle,
  isLoading,
  errors
}) => {
  // Render toggle switches for each configuration type
  // Show loading states during API calls
  // Display error messages with retry options
  // Provide visual feedback for successful operations
}
```

### 3. New GuardrailEditModal Component

**Purpose**: Comprehensive guardrail editing interface

```javascript
const GuardrailEditModal = ({
  isOpen,
  guardrailId,
  onClose,
  onSave
}) => {
  // Form fields for all guardrail properties
  // Help text and tooltips for complex fields
  // Validation and error handling
  // Loading states during save operations
}
```

### 4. Enhanced History Component

**Current State**: Basic guardrail indicator badge
**Enhancement**: Detailed guardrail information display

```javascript
// Enhanced history item structure
{
  guardrailResults: {
    hasViolations: boolean,
    violations: [...],
    activeConfigurations: [
      { type: 'contentPolicy', isActive: boolean },
      { type: 'wordPolicy', isActive: boolean },
      // ... other configurations
    ],
    interventionDetails: [...]
  }
}
```

### 5. New GuardrailHistoryDisplay Component

**Purpose**: Collapsible section showing detailed guardrail information

```javascript
const GuardrailHistoryDisplay = ({
  guardrailResults,
  activeConfigurations,
  isExpanded,
  onToggleExpanded
}) => {
  // Show active configurations at test time
  // Display intervention details with clear labels
  // Visual indicators for different violation types
  // Expandable/collapsible interface
}
```

## Data Models

### Enhanced Guardrail Configuration State

```javascript
{
  guardrailId: string,
  name: string,
  description: string,
  version: string,
  configurations: {
    contentPolicy: {
      isActive: boolean,
      filters: [...]
    },
    wordPolicy: {
      isActive: boolean,
      customWords: [...],
      managedWordLists: [...]
    },
    sensitiveInformationPolicy: {
      isActive: boolean,
      piiEntities: [...],
      regexes: [...]
    },
    topicPolicy: {
      isActive: boolean,
      topics: [...]
    },
    contextualGroundingPolicy: {
      isActive: boolean,
      threshold: number
    },
    automatedReasoningPolicy: {
      isActive: boolean,
      policies: [...]
    }
  },
  settings: {
    relevanceThreshold: number,
    confidenceThreshold: number,
    blockedInputMessage: string,
    blockedOutputMessage: string
  }
}
```

### History Entry Enhancement

```javascript
{
  // ... existing fields
  guardrailSnapshot: {
    activeConfigurations: [
      { type: string, isActive: boolean, name: string }
    ],
    configurationStates: {
      contentPolicy: { isActive: boolean, filterCount: number },
      wordPolicy: { isActive: boolean, wordCount: number },
      // ... other configurations
    }
  }
}
```

## Error Handling

### Configuration Toggle Errors

```javascript
const handleToggleError = (error, configurationType) => {
  // Revert UI state immediately
  // Show user-friendly error message
  // Provide retry option
  // Log detailed error for debugging
}
```

### Modal Save Errors

```javascript
const handleSaveError = (error, formData) => {
  // Display toast notification with error details
  // Highlight invalid form fields
  // Preserve user input
  // Offer retry or cancel options
}
```

### AWS Permission Errors

```javascript
const handlePermissionError = (error) => {
  // Show specific guidance for missing permissions
  // Provide links to AWS documentation
  // Suggest contacting administrator
  // Gracefully degrade functionality
}
```

## Testing Strategy

### Component Testing

- **GuardrailConfigurationToggles**: Test toggle interactions, loading states, error handling
- **GuardrailEditModal**: Test form validation, save/cancel operations, field interactions
- **GuardrailHistoryDisplay**: Test expansion/collapse, data display, visual indicators

### Integration Testing

- **Service Integration**: Test GuardrailConfigurationManager integration with UI components
- **State Management**: Test configuration state synchronization between components
- **Error Scenarios**: Test AWS API failures and recovery mechanisms

### User Experience Testing

- **Toggle Responsiveness**: Ensure immediate visual feedback for toggle operations
- **Modal Usability**: Test form completion flow and help text effectiveness
- **History Navigation**: Test guardrail information discoverability in history

## Implementation Notes

### Leveraging Existing Infrastructure

1. **GuardrailConfigurationManager**: Already implements all required AWS operations
2. **Error Handling**: Existing error handling utilities can be reused
3. **UI Patterns**: Follow established component patterns and styling
4. **State Management**: Use existing React hooks and state management patterns

### Key Integration Points

1. **App.jsx**: Enhance guardrail configuration retrieval for individual toggles
2. **GuardrailsSection.jsx**: Add configuration-level toggle controls
3. **History.jsx**: Enhance guardrail result display with detailed information
4. **Existing Services**: No changes needed - all functionality already implemented

### Performance Considerations

1. **Debounced Toggles**: Prevent rapid API calls during toggle interactions
2. **Cached Configuration**: Cache guardrail configuration to reduce API calls
3. **Lazy Loading**: Load detailed guardrail information only when needed
4. **Optimistic Updates**: Update UI immediately, revert on error

### Accessibility

1. **Toggle Controls**: Proper ARIA labels and keyboard navigation
2. **Modal Interface**: Focus management and screen reader support
3. **Visual Indicators**: High contrast colors and clear status indicators
4. **Help Text**: Comprehensive tooltips and guidance text

## Migration Strategy

### Phase 1: Enhanced Configuration Toggles
- Extend GuardrailsSection with individual configuration toggles
- Integrate with existing GuardrailConfigurationManager
- Add visual feedback and error handling

### Phase 2: Edit Modal Interface
- Create GuardrailEditModal component
- Implement form validation and save operations
- Add help text and user guidance

### Phase 3: Enhanced History Display
- Extend History component with detailed guardrail information
- Create GuardrailHistoryDisplay component
- Add collapsible sections and visual indicators

### Phase 4: Polish and Testing
- Comprehensive testing of all new components
- Performance optimization and accessibility improvements
- User experience refinements based on feedback