# Requirements Document

## Introduction

This feature enhances the Bedrock LLM analyzer to support dual prompt input, allowing users to provide both a system prompt and a user prompt separately. This separation enables better control over model behavior by distinguishing between system-level instructions and user-specific queries, which is a common pattern in modern LLM applications.

## Requirements

### Requirement 1

**User Story:** As a user, I want to provide a system prompt that defines the model's behavior and role, so that I can establish consistent context and instructions for how the model should respond.

#### Acceptance Criteria

1. WHEN the user accesses the prompt interface THEN the system SHALL display a dedicated system prompt input field
2. WHEN the user enters text in the system prompt field THEN the system SHALL preserve this input separately from the user prompt
3. WHEN the system prompt is provided THEN the system SHALL include it in the Bedrock API call as the system message
4. WHEN the system prompt is empty THEN the system SHALL prevent submission and display a validation error

### Requirement 2

**User Story:** As a user, I want to provide a user prompt that contains my specific query or request, so that I can ask questions or make requests within the context established by the system prompt.

#### Acceptance Criteria

1. WHEN the user accesses the prompt interface THEN the system SHALL display a dedicated user prompt input field
2. WHEN the user enters text in the user prompt field THEN the system SHALL preserve this input separately from the system prompt
3. WHEN both prompts are provided THEN the system SHALL send both to Bedrock with proper message role formatting
4. WHEN the user prompt is empty THEN the system SHALL prevent submission and display a validation error

### Requirement 3

**User Story:** As a user, I want clear visual distinction between system and user prompt fields, so that I can easily understand the purpose of each input area.

#### Acceptance Criteria

1. WHEN the prompt interface loads THEN the system SHALL display clearly labeled fields for "System Prompt" and "User Prompt"
2. WHEN the user interacts with either field THEN the system SHALL provide visual feedback indicating which field is active
3. WHEN the user hovers over field labels THEN the system SHALL display helpful tooltips explaining the purpose of each prompt type
4. WHEN both fields are present THEN the system SHALL maintain consistent styling and layout

### Requirement 4

**User Story:** As a user, I want the system to validate that at least one prompt is provided, so that I don't accidentally submit empty requests to Bedrock.

#### Acceptance Criteria

1. WHEN the user attempts to submit without both system and user prompt content THEN the system SHALL display an error message
2. WHEN the user provides only a system prompt without a user prompt THEN the system SHALL prevent submission and highlight the missing user prompt
3. WHEN the user provides only a user prompt without a system prompt THEN the system SHALL prevent submission and highlight the missing system prompt
4. WHEN both prompts are provided THEN the system SHALL allow submission
5. WHEN validation fails THEN the system SHALL highlight the problematic fields and provide clear guidance

### Requirement 5

**User Story:** As a user, I want my prompt history to include both system and user prompts, so that I can review and reuse previous prompt combinations.

#### Acceptance Criteria

1. WHEN a request is submitted with both prompts THEN the system SHALL save both prompts in the history
2. WHEN the user selects a historical entry THEN the system SHALL restore both system and user prompts to their respective fields
3. WHEN displaying history entries THEN the system SHALL show a preview of both prompt types
4. WHEN the user searches history THEN the system SHALL search across both system and user prompt content