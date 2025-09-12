# Requirements Document

## Introduction

This feature adds tool use capabilities to the Bedrock LLM Analyzer, allowing AI models to interact with predefined tools during analysis and tracking their usage attempts. The system will provide dataset-specific tools that models can invoke, capture tool usage attempts, and display this information as part of the test results. This enables evaluation of models' ability to use tools appropriately for different use cases.

## Requirements

### Requirement 1

**User Story:** As a developer/researcher, I want models to have access to dataset-specific tools during analysis, so that I can evaluate their ability to take appropriate actions based on the data they analyze.

#### Acceptance Criteria

1. WHEN I select a dataset type THEN the system SHALL automatically provide relevant tools for that dataset type to the model
2. WHEN the fraud detection dataset is selected THEN the system SHALL provide a "freeze_account" tool with account_id, transaction_ids array, and reason string parameters
3. WHEN other dataset types are selected THEN the system SHALL provide appropriate tools for those specific use cases
4. WHEN no tools are defined for a dataset type THEN the system SHALL run the test without tool definitions

### Requirement 2

**User Story:** As a developer/researcher, I want to see when models attempt to use tools, so that I can evaluate their decision-making process and tool usage patterns.

#### Acceptance Criteria

1. WHEN a model attempts to use a tool during analysis THEN the system SHALL capture the tool name and parameters the model tried to pass without executing the tool
2. WHEN a model makes multiple tool use attempts THEN the system SHALL capture all attempts in the order they occurred
3. WHEN a model completes analysis without using tools THEN the system SHALL indicate that no tools were used
4. WHEN tool usage is captured THEN the system SHALL store this information as part of the test result
5. WHEN a model attempts to use tools THEN the system SHALL NOT continue the conversation or simulate tool execution

### Requirement 3

**User Story:** As a developer/researcher, I want to see tool usage information displayed clearly in test results, so that I can understand what actions the model wanted to take based on the data.

#### Acceptance Criteria

1. WHEN viewing test results THEN the system SHALL display a dedicated "Tool Usage" section showing any tool use attempts
2. WHEN a tool was attempted THEN the system SHALL show the tool name and parameters the model tried to pass
3. WHEN multiple tools were attempted THEN the system SHALL display them in chronological order with clear separation
4. WHEN no tools were used THEN the system SHALL display "No tools used" in the tool usage section
5. WHEN displaying tool attempts THEN the system SHALL clearly indicate these were attempted but not executed

### Requirement 4

**User Story:** As a developer/researcher, I want tool usage information included in test history and comparisons, so that I can analyze tool usage patterns across different models and configurations.

#### Acceptance Criteria

1. WHEN a test with tool usage is saved to history THEN the system SHALL include tool usage data in the stored test result
2. WHEN viewing historical test results THEN the system SHALL display tool usage information alongside other test details
3. WHEN comparing test results THEN the system SHALL include tool usage comparison in the side-by-side view
4. WHEN searching or filtering history THEN the system SHALL allow filtering by tool usage (used tools vs no tools used)

### Requirement 5

**User Story:** As a developer/researcher, I want the fraud detection freeze_account tool to capture realistic account management scenarios, so that I can evaluate models' ability to make appropriate fraud prevention decisions.

#### Acceptance Criteria

1. WHEN the freeze_account tool is defined THEN the system SHALL require account_id as a string parameter
2. WHEN the freeze_account tool is defined THEN the system SHALL require transaction_ids as an array parameter
3. WHEN the freeze_account tool is defined THEN the system SHALL require reason as a string parameter explaining why the account should be frozen
4. WHEN the model attempts to use freeze_account THEN the system SHALL capture the parameters the model provided without validation or execution

### Requirement 6

**User Story:** As a developer/researcher, I want tool usage to be included in determinism evaluation with high weighting, so that I can assess whether models consistently make the same tool usage decisions across multiple runs.

#### Acceptance Criteria

1. WHEN determinism evaluation is performed THEN the system SHALL include tool usage data as a major factor in the determinism score
2. WHEN comparing tool usage for determinism THEN the system SHALL check if the same tools were attempted with the same parameters
3. WHEN tool usage differs between runs THEN the system SHALL significantly impact the determinism score due to high weighting
4. WHEN tool parameters vary between runs THEN the system SHALL treat this as a determinism failure even if tool names match
5. WHEN one run uses tools and another doesn't THEN the system SHALL mark this as a major determinism inconsistency

### Requirement 7

**User Story:** As a developer/researcher, I want tool definitions to be easily extensible for new dataset types, so that I can add appropriate tools for different analysis scenarios without complex code changes.

#### Acceptance Criteria

1. WHEN new dataset types are added THEN the system SHALL allow easy configuration of tools specific to those dataset types
2. WHEN tool definitions are modified THEN the system SHALL not require application restart to use updated tool definitions
3. WHEN tools are configured THEN the system SHALL validate tool definitions to ensure they have proper structure and required fields
4. WHEN invalid tool definitions are detected THEN the system SHALL log appropriate warnings and continue without those tools
