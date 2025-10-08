# Requirements Document

## Introduction

The current scenario structure is fragmented between `/public/scenarios/` and `/src/scenarios/` directories, creating confusion and maintenance issues. Tool handlers have been moved to `/src/scenarios/` but scenario configuration files remain in `/public/scenarios/`, and services are looking in the wrong locations. This creates a disjointed architecture that makes discovery and maintenance difficult.

## Requirements

### Requirement 1

**User Story:** As a developer, I want all scenario-related files organized in a single, logical location, so that I can easily find and maintain scenario configurations and their associated tool handlers.

#### Acceptance Criteria

1. WHEN I look for scenario files THEN all scenario configurations, tool handlers, datasets, and related files SHALL be located in a single directory structure
2. WHEN I examine the project structure THEN there SHALL be no duplicate or orphaned scenario files in multiple locations
3. WHEN I need to add a new scenario THEN the location and structure SHALL be immediately obvious and consistent

### Requirement 2

**User Story:** As a developer, I want services to reference the correct file paths, so that scenario loading and tool execution work reliably without path confusion.

#### Acceptance Criteria

1. WHEN the scenario service loads scenarios THEN it SHALL look in the correct, consolidated location
2. WHEN tool handlers are executed THEN they SHALL be loaded from the correct path
3. WHEN datasets are accessed THEN they SHALL be found in their expected location relative to the scenario
4. WHEN the application starts THEN all scenario-related file references SHALL resolve correctly

### Requirement 3

**User Story:** As a developer, I want old, unused files cleaned up, so that the codebase doesn't contain confusing duplicate or obsolete files.

#### Acceptance Criteria

1. WHEN the consolidation is complete THEN old scenario files in incorrect locations SHALL be removed
2. WHEN I examine the file structure THEN there SHALL be no orphaned tool handlers or configuration files
3. WHEN services reference scenario files THEN they SHALL only reference files that actually exist in the consolidated structure

### Requirement 4

**User Story:** As a developer, I want the scenario structure to follow established project conventions, so that it integrates well with the existing codebase architecture.

#### Acceptance Criteria

1. WHEN I examine the scenario structure THEN it SHALL follow the same organizational patterns as other parts of the codebase
2. WHEN scenarios are accessed THEN they SHALL use the same service patterns and file loading mechanisms as other features
3. WHEN new scenarios are added THEN they SHALL follow the established directory and naming conventions
4. WHEN the build process runs THEN scenario files SHALL be properly included and accessible

### Requirement 5

**User Story:** As a developer, I want clear documentation of the new structure, so that I understand where to place different types of scenario-related files.

#### Acceptance Criteria

1. WHEN I need to add a scenario THEN the directory structure SHALL clearly indicate where configuration files belong
2. WHEN I need to add tool handlers THEN the structure SHALL clearly indicate where they belong relative to their scenario
3. WHEN I need to add datasets THEN the structure SHALL clearly indicate the expected location and naming pattern
4. WHEN I examine the codebase THEN the scenario organization SHALL be self-documenting through clear directory names and structure
