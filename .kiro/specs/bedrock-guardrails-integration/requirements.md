# Requirements Document

## Introduction

This feature adds comprehensive AWS Bedrock Guardrails integration to the Bedrock LLM Analyzer. Guardrails provide content filtering and safety controls for AI model interactions, allowing users to define and enforce policies around harmful content, personally identifiable information (PII), and other sensitive topics. The integration will extend scenario schemas to include guardrail configurations, automatically create and manage guardrails in the user's AWS account with proper tagging, provide UI components for displaying guardrail results, and implement AWS API integration for guardrail evaluation during model testing. Each scenario will have its own dedicated guardrail resource in AWS, tagged for easy identification and management.

## Requirements

### Requirement 1

**User Story:** As a developer testing AI models, I want to define guardrails in my scenario configurations so that I can ensure my prompts and model responses comply with safety and content policies.

#### Acceptance Criteria

1. WHEN a user creates or edits a scenario THEN the system SHALL support an optional `guardrails` property in the scenario schema
2. WHEN guardrails are defined in a scenario THEN the system SHALL validate the guardrail configuration structure against the expected schema
3. WHEN a scenario includes guardrails THEN the system SHALL display them in a dedicated "Guardrails" section in the scenario UI
4. WHEN guardrails are configured THEN the system SHALL provide a toggle option to include or exclude them from test runs
5. WHEN guardrails are present THEN the system SHALL clearly indicate their status (enabled/disabled) in the test interface

### Requirement 2

**User Story:** As a user running AI model tests, I want guardrails to be automatically applied during test execution so that I can see if my prompts or responses trigger any safety violations.

#### Acceptance Criteria

1. WHEN a test is executed with guardrails enabled THEN the system SHALL pass the guardrail configuration to the Bedrock Converse API
2. WHEN a guardrail is triggered during a test THEN the system SHALL clearly display the violation in the test results
3. WHEN guardrail violations occur THEN the system SHALL show which specific guardrail was triggered and why
4. WHEN a test completes THEN the system SHALL display guardrail evaluation results alongside the model response
5. WHEN guardrails are disabled for a test THEN the system SHALL run the test without any guardrail evaluation

### Requirement 3

**User Story:** As a user working with guardrails, I want consistent visual design and clear status indicators so that I can easily understand guardrail states and results.

#### Acceptance Criteria

1. WHEN guardrails are displayed THEN the system SHALL use the existing application theme and design patterns
2. WHEN guardrail violations occur THEN the system SHALL use clear visual indicators (colors, icons) to show the violation status
3. WHEN guardrails are being processed THEN the system SHALL show appropriate loading states and progress indicators
4. WHEN guardrail results are displayed THEN the system SHALL provide expandable sections for detailed violation information
5. WHEN guardrails are configured THEN the system SHALL show a summary count of active guardrails in the scenario interface

### Requirement 4

**User Story:** As a developer integrating guardrails, I want proper error handling and fallback behavior so that guardrail issues don't break the core testing functionality.

#### Acceptance Criteria

1. WHEN guardrail API calls fail THEN the system SHALL continue with model testing without guardrails
2. WHEN guardrail evaluation fails THEN the system SHALL log the error and show a warning to the user
3. WHEN AWS credentials lack guardrail permissions THEN the system SHALL provide specific guidance on required permissions
4. WHEN guardrail services are unavailable THEN the system SHALL gracefully degrade to non-guardrail functionality
5. WHEN guardrail configuration is invalid THEN the system SHALL show clear validation errors

### Requirement 5

**User Story:** As a user with AWS credentials configured, I want guardrails to be automatically created and managed in my AWS account so that I don't have to manually set up guardrail resources.

#### Acceptance Criteria

1. WHEN a scenario with guardrails is loaded AND AWS credentials are configured THEN the system SHALL check if a guardrail exists for that scenario in the user's AWS account
2. WHEN a guardrail doesn't exist for a scenario THEN the system SHALL automatically create it using the Bedrock CreateGuardrail API
3. WHEN creating a guardrail THEN the system SHALL tag it with "promptatron" as the source and the scenario name for identification
4. WHEN guardrail creation is attempted THEN the system SHALL provide progress feedback to the user
5. WHEN guardrail creation fails THEN the system SHALL display helpful error messages with troubleshooting guidance
6. WHEN guardrails are successfully created THEN the system SHALL store the guardrail ARN for future use

### Requirement 6

**User Story:** As a user initializing the application, I want existing guardrails to be automatically discovered and mapped to scenarios so that I can reuse previously created guardrails.

#### Acceptance Criteria

1. WHEN the application initializes AND AWS credentials are configured THEN the system SHALL use listGuardrails to discover existing guardrails
2. WHEN guardrails are discovered THEN the system SHALL filter for those tagged with "promptatron" as the source
3. WHEN promptatron guardrails are found THEN the system SHALL map them to scenarios based on the scenario name tag
4. WHEN a scenario is loaded AND a matching guardrail exists THEN the system SHALL use the existing guardrail instead of creating a new one
5. WHEN guardrail discovery fails THEN the system SHALL continue without guardrails and show a warning

### Requirement 7

**User Story:** As a user managing multiple scenarios, I want guardrail configurations to be portable and reusable so that I can maintain consistent policies across different test scenarios.

#### Acceptance Criteria

1. WHEN guardrails are defined in a scenario THEN the system SHALL store the complete guardrail configuration in the scenario file
2. WHEN scenarios are shared or exported THEN the system SHALL include guardrail configurations in the export
3. WHEN scenarios with guardrails are imported THEN the system SHALL validate and apply the guardrail configurations
4. WHEN a scenario guardrail configuration is updated THEN the system SHALL update the corresponding AWS guardrail resource
5. WHEN multiple scenarios have identical guardrail configurations THEN the system SHALL create separate guardrails for each scenario
