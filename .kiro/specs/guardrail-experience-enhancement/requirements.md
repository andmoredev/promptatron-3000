# Requirements Document

## Introduction

This feature enhances the guardrail experience in Promptatron by providing users with better control and visibility over guardrail configurations. The enhancement includes the ability to toggle individual guardrail configurations on/off, view guardrail information in the history tab, and edit guardrail settings through a dedicated modal interface.

## Glossary

- **Guardrail**: AWS Bedrock guardrail that contains multiple configuration types for content filtering and safety
- **Guardrail Configuration**: Individual policy within a guardrail (Topic Policy, Content Policy, Word Policy, Sensitive Information, Contextual Grounding, Automated Reasoning)
- **Promptatron**: The Bedrock LLM Analyzer application
- **History Tab**: The section of the application that displays previous test runs and their results
- **Toggle**: UI control that allows users to enable/disable individual guardrail configurations
- **Edit Modal**: A popup interface for modifying guardrail settings and properties

## Requirements

### Requirement 1: Individual Guardrail Configuration Toggle Control

**User Story:** As a user testing AI models with guardrails, I want to toggle individual guardrail configurations on and off, so that I can test different combinations of safety policies without creating multiple guardrails.

#### Acceptance Criteria

1. WHEN a scenario has a guardrail configuration attached, THE Promptatron SHALL display each guardrail configuration type (Topic Policy, Content Policy, Word Policy, Sensitive Information, Contextual Grounding, Automated Reasoning)
2. THE Promptatron SHALL provide toggle buttons beside each configuration type with clear active/inactive visual states
3. WHEN a user toggles a configuration, THE Promptatron SHALL update the in-memory guardrail configuration object to reflect the new isActive state
4. WHEN a configuration toggle is changed, THE Promptatron SHALL immediately call UpdateGuardrailCommand to persist the change
5. WHEN the application initializes, THE Promptatron SHALL call GetGuardrailCommand to determine the current active/inactive state of each configuration
6. THE Promptatron SHALL sync the UI toggle states with the retrieved guardrail configuration data
7. WHEN a toggle operation succeeds, THE Promptatron SHALL provide visual feedback indicating success
8. WHEN a toggle operation fails, THE Promptatron SHALL provide clear error messaging and revert the toggle state

### Requirement 2: Guardrail Information in History Tab

**User Story:** As a user reviewing past test runs, I want to see which guardrail configurations were active and which ones triggered interventions, so that I can understand how guardrails affected my test results.

#### Acceptance Criteria

1. THE Promptatron SHALL store guardrail configuration state information alongside each test run in the history
2. THE Promptatron SHALL record which guardrail configurations were active during each test execution
3. THE Promptatron SHALL capture and store information about guardrail interventions that occurred during test runs
4. THE Promptatron SHALL display guardrail information as a collapsible section under each history entry
5. WHEN displaying active guardrails, THE Promptatron SHALL show clear labels for each configuration type that was enabled
6. WHEN displaying triggered guardrails, THE Promptatron SHALL show intervention details with descriptive labels such as "Topic Policy: Blocked" or "PII Filter: Anonymized"
7. THE Promptatron SHALL provide visual indicators (icons or status tags) to distinguish between active and triggered guardrails
8. THE Promptatron SHALL maintain guardrail history data persistence across application sessions

### Requirement 3: Guardrail Edit Modal Interface

**User Story:** As a user managing guardrail configurations, I want to edit guardrail settings through a dedicated interface, so that I can customize guardrail behavior without leaving the application.

#### Acceptance Criteria

1. THE Promptatron SHALL display an edit icon in the top-right corner of each guardrail configuration box
2. WHEN the edit icon is clicked, THE Promptatron SHALL open an "Edit Guardrail" modal dialog
3. THE Promptatron SHALL populate the modal with current guardrail data retrieved via GetGuardrailCommand
4. THE Promptatron SHALL provide editable fields for guardrail name, description, relevance threshold, automated reasoning policies, confidence threshold, blocked input message, blocked output message, and active configurations
5. THE Promptatron SHALL include help text for fields that users might not understand
6. THE Promptatron SHALL provide a relevance threshold slider control with values from 0 to 1
7. THE Promptatron SHALL offer a multi-select interface for automated reasoning policy ARNs
8. THE Promptatron SHALL include checkbox controls for active configuration toggles within the modal
9. WHEN the user clicks Save, THE Promptatron SHALL call UpdateGuardrailCommand with the modified field values
10. WHEN the user clicks Cancel, THE Promptatron SHALL close the modal without applying changes
11. WHEN a save operation succeeds, THE Promptatron SHALL update the UI to reflect the new guardrail settings
12. WHEN a save operation fails, THE Promptatron SHALL display error notifications as toast messages
13. THE Promptatron SHALL validate required fields before allowing save operations
14. THE Promptatron SHALL provide loading indicators during save operations