# Implementation Plan

- [x] 1. Enhance GuardrailsSection with Individual Configuration Toggles

  - Extend existing GuardrailsSection component to display individual configuration types
  - Add toggle switches for each guardrail configuration (Topic Policy, Content Policy, Word Policy, Sensitive Information, Contextual Grounding, Automated Reasoning)
  - Integrate with existing GuardrailConfigurationManager service for toggle operations
  - Implement visual feedback for toggle success/failure states
  - Add loading indicators during API operations
  - _Requirements: 1.1, 1.2, 1.3, 1.7, 1.8_

- [x] 2. Create GuardrailConfigurationToggles Component

  - Build dedicated component for rendering individual configuration toggle controls
  - Implement proper ARIA labels and accessibility features for toggle switches
  - Add visual states for active/inactive configurations with clear indicators
  - Handle loading states during GuardrailConfigurationManager API calls
  - Implement error handling with user-friendly messages and retry options
  - _Requirements: 1.2, 1.7, 1.8_

- [x] 3. Integrate Configuration State Management

  - Connect toggle components to existing GuardrailConfigurationManager service
  - Implement immediate UpdateGuardrailCommand calls on toggle changes
  - Add configuration state synchronization using existing GetGuardrailCommand integration
  - Handle optimistic UI updates with error recovery and state reversion
  - _Requirements: 1.3, 1.4, 1.5, 1.6_

- [ ] 4. Create GuardrailEditModal Component

  - Build comprehensive modal interface for editing guardrail settings
  - Add form fields for name, description, relevance threshold, confidence threshold, blocked messages
  - Implement relevance threshold slider control (0-1 range)
  - Create multi-select interface for automated reasoning policy ARNs
  - Add checkbox controls for active configuration toggles within modal
  - Include help text and tooltips for complex fields
  - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 5. Implement Modal Data Loading and Save Operations

  - Integrate GetGuardrailCommand for preloading modal data from existing GuardrailConfigurationManager
  - Implement save operation using existing UpdateGuardrailCommand integration
  - Add form validation with required field checking
  - Implement loading indicators during save operations
  - Add cancel operation without applying changes
  - Handle save success/failure with toast notifications
  - _Requirements: 3.3, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14_

- [ ] 6. Add Edit Modal Trigger to GuardrailsSection

  - Add edit icon in top-right corner of guardrail configuration boxes
  - Implement modal open/close state management
  - Connect edit button to GuardrailEditModal component
  - Handle modal data refresh after successful saves
  - _Requirements: 3.1, 3.2_

- [ ] 7. Enhance History Component with Guardrail Information Display

  - Extend existing History component to show detailed guardrail information
  - Add collapsible section under each history entry for guardrail details
  - Display active guardrail configurations that were enabled during test execution
  - Show guardrail intervention details with descriptive labels (e.g., "Topic Policy: Blocked")
  - Implement visual indicators (icons/status tags) to distinguish active vs triggered guardrails
  - _Requirements: 2.4, 2.5, 2.6, 2.7_

- [ ] 8. Create GuardrailHistoryDisplay Component

  - Build dedicated component for rendering guardrail information in history entries
  - Implement expandable/collapsible interface for detailed guardrail information
  - Add visual indicators for different violation types and intervention actions
  - Display configuration states that were active during test execution
  - Show intervention details with clear categorization and descriptions
  - _Requirements: 2.4, 2.5, 2.6, 2.7_

- [ ] 9. Implement Guardrail State Capture in Test Execution

  - Extend test execution flow to capture active guardrail configuration states
  - Store guardrail configuration snapshot alongside test results in history
  - Ensure guardrail intervention information is properly captured and stored
  - Maintain backward compatibility with existing history data structure
  - _Requirements: 2.1, 2.2, 2.3, 2.8_

- [ ] 10. Add Visual Enhancements and Polish

  - Implement consistent visual design following existing UI patterns
  - Add proper loading states and progress indicators for all async operations
  - Ensure responsive design for mobile and desktop viewports
  - Add hover states and smooth transitions for interactive elements
  - Implement proper focus management for accessibility
  - _Requirements: 1.7, 1.8, 3.14_

- [ ]\* 11. Add Comprehensive Error Handling

  - Implement specific error messages for AWS permission issues
  - Add retry mechanisms for failed toggle operations
  - Handle network connectivity issues gracefully
  - Provide clear guidance for troubleshooting common issues
  - Add error logging for debugging purposes
  - _Requirements: 1.8, 3.12_

- [ ]\* 12. Performance Optimization
  - Implement debounced toggle operations to prevent rapid API calls
  - Add configuration caching to reduce unnecessary GetGuardrailCommand calls
  - Optimize component re-rendering with proper React optimization techniques
  - Implement lazy loading for detailed guardrail information
  - _Requirements: 1.4, 1.5_
