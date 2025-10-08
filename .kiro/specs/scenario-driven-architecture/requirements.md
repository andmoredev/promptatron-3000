# Requirements Document

## Introduction

This specification outlines the transformation of the Bedrock LLM Analyzer from a dataset-driven architecture to a scenario-driven architecture. The current system organizes functionality around datasets with separate tool configurations, but the new system will organize everything around comprehensive scenarios that encapsulate datasets, prompts, tools, and descriptions in a unified structure. This change will provide a more streamlined user experience while enabling richer functionality through scenario-specific configurations.

## Requirements

### Requirement 1: Scenario Data Structure

**User Story:** As a developer, I want scenarios to be self-contained JSON files that include all necessary configuration, so that I can easily create and manage complete test scenarios.

#### Acceptance Criteria

1. WHEN a scenario is loaded THEN the system SHALL read a JSON file containing datasets, system prompts, user prompts, tool definitions, tool implementations, and descriptions
2. WHEN a scenario includes datasets THEN the system SHALL load the dataset content from the scenario configuration
3. WHEN a scenario includes system prompts THEN the system SHALL present these as selectable options in the UI
4. WHEN a scenario includes user prompts THEN the system SHALL present these as selectable options in the UI
5. WHEN a scenario includes tool definitions with implementations THEN the system SHALL enable tool execution functionality
6. WHEN a scenario includes only tool definitions without implementations THEN the system SHALL enable tool detection mode only
7. WHEN a scenario does not include datasets THEN the system SHALL hide dataset selection controls from the UI
8. WHEN a scenario does not include tools THEN the system SHALL hide tool-related controls from the UI

### Requirement 2: Scenario Selection Interface

**User Story:** As a user, I want to select scenarios instead of datasets, so that I can work with pre-configured test environments that include all necessary components.

#### Acceptance Criteria

1. WHEN the application loads THEN the system SHALL scan the `/public/scenarios/` folder and display available scenarios in a scenario selector
2. WHEN the scenarios folder is scanned THEN the system SHALL read each JSON file and extract scenario metadata for the selection list
3. WHEN a user selects a scenario THEN the system SHALL load all scenario components (datasets, prompts, tools, descriptions) from the selected scenario file
4. WHEN a scenario is selected THEN the system SHALL automatically configure the UI to show only relevant controls
5. WHEN a scenario includes multiple system prompt options THEN the system SHALL present them in a dropdown selector
6. WHEN a scenario includes multiple user prompt options THEN the system SHALL present them in a dropdown selector
7. WHEN a scenario includes multiple datasets THEN the system SHALL present them in a dataset selector within the scenario context
8. WHEN a scenario has a description THEN the system SHALL display it to provide context to the user

### Requirement 3: Dynamic UI Adaptation

**User Story:** As a user, I want the interface to automatically adapt based on the selected scenario's capabilities, so that I only see relevant controls and options.

#### Acceptance Criteria

1. WHEN a scenario does not include datasets THEN the system SHALL hide the dataset selection section entirely
2. WHEN a scenario does not include tools THEN the system SHALL hide tool execution settings and controls
3. WHEN a scenario includes tools with implementations THEN the system SHALL show the "Use Tools" toggle
4. WHEN a scenario includes only tool definitions without implementations THEN the system SHALL hide the "Use Tools" toggle and only enable tool detection
5. WHEN a scenario includes system prompts THEN the system SHALL show the system prompt selector with scenario-provided options
6. WHEN a scenario includes user prompts THEN the system SHALL show the user prompt selector with scenario-provided options
7. WHEN switching between scenarios THEN the system SHALL dynamically show/hide UI elements based on the new scenario's capabilities

### Requirement 4: Scenario Builder Interface

**User Story:** As a developer, I want a scenario builder interface, so that I can create and customize new scenarios locally without manually editing JSON files.

#### Acceptance Criteria

1. WHEN accessing the scenario builder THEN the system SHALL provide a form-based interface for creating scenarios
2. WHEN creating a scenario THEN the system SHALL allow adding multiple datasets with file upload or text input
3. WHEN creating a scenario THEN the system SHALL allow adding multiple system prompt options
4. WHEN creating a scenario THEN the system SHALL allow adding multiple user prompt options
5. WHEN creating a scenario THEN the system SHALL allow defining tool schemas and optional implementations
6. WHEN creating a scenario THEN the system SHALL allow adding a description and metadata
7. WHEN saving a scenario THEN the system SHALL write the scenario JSON file to the local scenarios directory
8. WHEN editing an existing scenario THEN the system SHALL load the current configuration and allow modifications
9. WHEN validating a scenario THEN the system SHALL check for required fields and valid JSON structure

### Requirement 5: Backward Compatibility and Migration

**User Story:** As a user, I want existing datasets to be automatically converted to scenarios, so that I can continue using my current test configurations without manual migration.

#### Acceptance Criteria

1. WHEN the system detects existing dataset configurations THEN it SHALL automatically create equivalent scenarios
2. WHEN migrating datasets THEN the system SHALL preserve all tool configurations and dataset files
3. WHEN migrating datasets THEN the system SHALL create default system and user prompts based on the dataset type
4. WHEN migration is complete THEN the system SHALL continue to function with all existing test history and configurations
5. WHEN both old datasets and new scenarios exist THEN the system SHALL prioritize scenarios while maintaining access to legacy datasets

### Requirement 6: Scenario File Management

**User Story:** As a developer, I want scenarios to be stored in a well-organized directory structure, so that I can easily manage and version control scenario configurations.

#### Acceptance Criteria

1. WHEN scenarios are created THEN the system SHALL store them in a `/public/scenarios/` directory
2. WHEN the application loads THEN the system SHALL scan the scenarios directory on disk and read all available scenario files
3. WHEN organizing scenarios THEN the system SHALL use a flat file structure with descriptive filenames (e.g., `fraud-detection.json`, `customer-support.json`)
4. WHEN loading the scenario list THEN the system SHALL read scenario files directly from the disk-based scenarios folder
5. WHEN a scenario file is invalid THEN the system SHALL provide clear error messages and graceful fallback
6. WHEN scenarios are modified THEN the system SHALL validate the JSON structure before saving to disk
7. WHEN scenarios include large datasets THEN the system SHALL support both inline data and external file references

### Requirement 7: Enhanced Tool Integration

**User Story:** As a user, I want tool functionality to be seamlessly integrated into scenarios, so that I can use tools without complex configuration steps.

#### Acceptance Criteria

1. WHEN a scenario includes tool implementations THEN the system SHALL automatically enable tool execution mode
2. WHEN a scenario includes only tool schemas THEN the system SHALL enable tool detection mode without execution
3. WHEN tools are available in a scenario THEN the system SHALL display tool configuration status clearly
4. WHEN tool execution is enabled THEN the system SHALL use the scenario-provided tool implementations
5. WHEN tool detection is enabled THEN the system SHALL use the scenario-provided tool schemas for detection
6. WHEN no tools are defined in a scenario THEN the system SHALL disable all tool-related functionality
7. WHEN switching scenarios with different tool capabilities THEN the system SHALL update tool settings appropriately

### Requirement 8: Scenario Metadata and Documentation

**User Story:** As a user, I want scenarios to include rich metadata and documentation, so that I can understand the purpose and context of each scenario.

#### Acceptance Criteria

1. WHEN viewing a scenario THEN the system SHALL display the scenario description and purpose
2. WHEN a scenario includes metadata THEN the system SHALL show relevant information like author, version, and tags
3. WHEN a scenario includes usage instructions THEN the system SHALL provide access to detailed documentation
4. WHEN scenarios are listed THEN the system SHALL show summary information to help with selection
5. WHEN scenarios include examples THEN the system SHALL provide sample prompts and expected outcomes
6. WHEN scenarios are categorized THEN the system SHALL allow filtering and grouping by category or tags

### Requirement 9: Performance and Loading Optimization

**User Story:** As a user, I want scenarios to load quickly and efficiently, so that I can switch between different test configurations without delays.

#### Acceptance Criteria

1. WHEN loading scenarios THEN the system SHALL cache scenario metadata for fast browsing
2. WHEN switching scenarios THEN the system SHALL only load necessary components to minimize loading time
3. WHEN scenarios include large datasets THEN the system SHALL support lazy loading of dataset content
4. WHEN multiple scenarios are available THEN the system SHALL load the scenario list efficiently
5. WHEN scenario content changes THEN the system SHALL invalidate caches appropriately
6. WHEN scenarios include external references THEN the system SHALL handle loading failures gracefully

### Requirement 10: Validation and Error Handling

**User Story:** As a developer, I want comprehensive validation and error handling for scenarios, so that I can identify and fix configuration issues quickly.

#### Acceptance Criteria

1. WHEN loading a scenario THEN the system SHALL validate the JSON structure and required fields
2. WHEN a scenario has missing components THEN the system SHALL provide clear error messages with suggestions
3. WHEN tool definitions are invalid THEN the system SHALL validate schemas and provide specific feedback
4. WHEN dataset references are broken THEN the system SHALL handle missing files gracefully
5. WHEN prompt configurations are invalid THEN the system SHALL provide validation feedback
6. WHEN scenarios conflict with system capabilities THEN the system SHALL provide appropriate warnings
7. WHEN validation fails THEN the system SHALL prevent scenario loading and suggest corrections
