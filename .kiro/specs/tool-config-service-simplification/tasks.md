# Implementation Plan

- [x] 1. Create simplified ToolConfigService implementation





  - Replace the complex manifest-loading service with a simple adapter that gets tool configurations from scenarios
  - Maintain API compatibility while dramatically reducing complexity
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 1.1 Create new simplified ToolConfigService class


  - Replace the existing complex service with a simple adapter class
  - Remove all manifest loading, caching, hot-reloading, and fallback logic
  - Implement constructor that takes scenarioService as dependency
  - Add basic error handling and validation methods
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 1.2 Implement core API methods for scenario-based tool retrieval


  - Implement getToolsForDatasetType() to retrieve tools from scenarios
  - Implement hasToolsForDatasetType() to check if scenario has tools
  - Implement getToolNamesForDatasetType() to extract tool names
  - Add legacy dataset type mapping for backward compatibility
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 1.3 Add simplified validation and utility methods


  - Implement validateToolDefinition() with basic validation logic
  - Add utility methods for extracting tool configurations from scenarios
  - Implement status and readiness methods that delegate to scenarioService
  - _Requirements: 2.4, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 2. Update service instantiation and integration





  - Modify how the toolConfigService is created and initialized in the application
  - Update the service to work with the scenarioService dependency
  - Ensure proper integration with existing components
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 2.1 Update service instantiation in main application


  - Modify the service creation to inject scenarioService dependency
  - Remove complex initialization calls that are no longer needed
  - Update service initialization order to ensure scenarioService is available
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 2.2 Test integration with existing components


  - Verify that existing components continue to work with simplified service
  - Test tool configuration retrieval for scenarios with tools
  - Test graceful handling when scenarios don't have tools
  - Verify error handling and user feedback
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3. Clean up deprecated code and dependencies





  - Remove all the complex manifest loading and caching code
  - Clean up imports and dependencies that are no longer needed
  - Update any remaining references to the old architecture
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3.1 Remove manifest loading and caching logic


  - Delete all code related to loading from /datasets/manifest.json
  - Remove manifest caching, hot-reloading, and fallback configuration logic
  - Clean up complex initialization methods and error recovery mechanisms
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 3.2 Update imports and clean up dependencies


  - Remove unused imports and dependencies from the simplified service
  - Update any components that import specific methods that have been simplified
  - Clean up any remaining references to deprecated manifest structure
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Verify tool functionality with scenarios





  - Test that tool configurations work correctly with the scenario-based architecture
  - Verify that tool execution works with the simplified service
  - Test error handling and edge cases
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4.1 Test tool configuration loading from scenarios


  - Verify that scenarios with tools are correctly identified
  - Test that tool configurations are properly extracted and formatted
  - Verify that scenarios without tools are handled gracefully
  - Test legacy dataset type mapping functionality
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 4.2 Test integration with tool execution features


  - Verify that tool execution works with configurations from scenarios
  - Test that the simplified service provides correct tool definitions
  - Verify that validation works correctly with scenario-based tools
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 4.1, 4.2, 4.3, 4.4, 4.5_
