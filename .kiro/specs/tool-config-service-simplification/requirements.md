# Requirements Document

## Introduction

The toolConfigService currently attempts to load tool configurations from a deprecated `/datasets/manifest.json` structure and individual dataset manifests. However, the application has moved to a scenario-based architecture where all tool configurations are defined directly within scenario JSON files. This feature will simplify the toolConfigService to work exclusively with the scenario-based architecture, removing the complex manifest loading logic and making it a simple adapter that retrieves tool configurations from loaded scenarios.

## Requirements

### Requirement 1

**User Story:** As a developer, I want the toolConfigService to load tool configurations from scenarios instead of deprecated manifest files so that the service aligns with the current architecture.

#### Acceptance Criteria

1. WHEN the toolConfigService initializes THEN it SHALL NOT attempt to load from `/datasets/manifest.json`
2. WHEN the toolConfigService needs tool configurations THEN it SHALL retrieve them from the scenarioService
3. WHEN a scenario has tools defined THEN the toolConfigService SHALL make those tools available for the scenario
4. WHEN a scenario does not have tools defined THEN the toolConfigService SHALL return an empty configuration
5. WHEN the scenarioService is not initialized THEN the toolConfigService SHALL handle this gracefully

### Requirement 2

**User Story:** As a developer, I want the toolConfigService to maintain its existing API so that existing components continue to work without changes.

#### Acceptance Criteria

1. WHEN existing components call `getToolsForDatasetType()` THEN the method SHALL continue to work but map to scenario-based lookups
2. WHEN existing components call `hasToolsForDatasetType()` THEN the method SHALL return correct results based on scenario data
3. WHEN existing components call `getToolNamesForDatasetType()` THEN the method SHALL return tool names from the appropriate scenario
4. WHEN existing components call validation methods THEN they SHALL continue to work with scenario-based tool configurations
5. WHEN the API is called with legacy dataset type names THEN the service SHALL attempt to map them to scenario IDs

### Requirement 3

**User Story:** As a developer, I want the toolConfigService to be much simpler and easier to maintain so that it's easier to debug and extend.

#### Acceptance Criteria

1. WHEN reviewing the toolConfigService code THEN it SHALL be significantly shorter and simpler than the current implementation
2. WHEN the service initializes THEN it SHALL NOT perform complex manifest scanning or hot-reloading logic
3. WHEN the service encounters errors THEN it SHALL use simple, clear error handling without complex recovery mechanisms
4. WHEN the service needs to validate tool configurations THEN it SHALL use the existing scenario validation logic
5. WHEN debugging tool configuration issues THEN the service SHALL provide clear, actionable error messages

### Requirement 4

**User Story:** As a developer, I want the toolConfigService to work seamlessly with the scenarioService so that tool configurations are always in sync with loaded scenarios.

#### Acceptance Criteria

1. WHEN a scenario is loaded by the scenarioService THEN its tool configuration SHALL automatically be available through the toolConfigService
2. WHEN a scenario is reloaded THEN the toolConfigService SHALL reflect the updated tool configuration
3. WHEN the scenarioService fails to load a scenario THEN the toolConfigService SHALL handle the missing configuration gracefully
4. WHEN multiple scenarios have tools THEN the toolConfigService SHALL be able to distinguish between them
5. WHEN a scenario ID is used as a dataset type THEN the toolConfigService SHALL return the correct tool configuration

### Requirement 5

**User Story:** As a developer, I want to remove all the deprecated manifest loading code so that the codebase is cleaner and there's no confusion about the data source.

#### Acceptance Criteria

1. WHEN the toolConfigService is refactored THEN all references to `/datasets/manifest.json` SHALL be removed
2. WHEN the toolConfigService is refactored THEN all manifest caching logic SHALL be removed
3. WHEN the toolConfigService is refactored THEN all hot-reloading logic SHALL be removed
4. WHEN the toolConfigService is refactored THEN all complex initialization from manifests SHALL be removed
5. WHEN the toolConfigService is refactored THEN fallback configuration logic SHALL be simplified or removed

### Requirement 6

**User Story:** As a user, I want tool configurations to work correctly with scenarios so that I can use tools in scenario-based tests without any issues.

#### Acceptance Criteria

1. WHEN I select a scenario that has tools defined THEN the tool execution features SHALL be available
2. WHEN I select a scenario without tools THEN the tool execution features SHALL be disabled appropriately
3. WHEN I run a test with a scenario that has tools THEN the tools SHALL be available for execution
4. WHEN there are errors in scenario tool configurations THEN I SHALL see clear error messages
5. WHEN I switch between scenarios THEN the available tools SHALL update correctly
