# Implementation Plan

- [x] 1. Enhance DatasetToolIntegrationService for seed data support





  - Add method to detect dataset mode (file vs seed data) from manifest
  - Implement seed data loading logic with proper error handling
  - Add support for system prompts configuration processing
  - _Requirements: 1.1, 3.1, 3.2, 6.1_

- [x] 2. Create tool service detection utility





  - [x] 2.1 Implement getToolServiceForDatasetType function


    - Create mapping between dataset types and their corresponding tool services
    - Handle cases where no tool service exists for a dataset type
    - _Requirements: 1.1, 2.2_

  - [x] 2.2 Add seed data initialization logic


    - Call tool service initialize method when loading seed data datasets
    - Handle initialization failures gracefully
    - _Requirements: 1.1, 1.3_

- [x] 3. Enhance DatasetSelector component for seed data mode





  - [x] 3.1 Add seed data mode state management


    - Add seedDataMode, isResettingData, and datasetManifest state variables
    - Implement dataset mode detection in handleTypeChange
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Implement seed data loading functionality


    - Create loadSeedData function to initialize tool service and load seed data file
    - Handle loading states and error scenarios
    - Format seed data as JSON string for consistent display
    - _Requirements: 1.1, 1.2, 1.3, 5.1_

  - [x] 3.3 Add reset data functionality


    - Create handleResetData function to call tool service resetDemoData method
    - Implement loading states for reset button
    - Add success and error feedback for reset operations
    - _Requirements: 2.1, 2.2, 2.3, 4.2, 4.3_

  - [x] 3.4 Update UI rendering for seed data mode


    - Replace file picker with reset button when in seed data mode
    - Add appropriate loading indicators and success/error messages
    - Maintain consistent styling with existing components
    - _Requirements: 2.1, 4.1, 4.2, 4.3, 4.4_

- [x] 4. Enhance PromptEditor component for dataset-specific system prompts





  - [x] 4.1 Add dataset system prompts state management


    - Add datasetSystemPrompts state variable
    - Create effect to load prompts when dataset changes
    - _Requirements: 6.1, 6.4_

  - [x] 4.2 Implement system prompt loading logic


    - Create loadDatasetSystemPrompts function to fetch prompts from manifest
    - Process escaped newlines (\\n) to actual newlines for proper display
    - Handle loading errors gracefully with fallback to hardcoded prompts
    - _Requirements: 6.1, 6.2, 6.5_

  - [x] 4.3 Integrate dataset prompts with existing template system


    - Combine hardcoded and dataset-specific prompts in allSystemPromptTemplates
    - Update template selection UI to show all available prompts
    - Add visual indicators to distinguish prompt sources
    - _Requirements: 6.3, 6.4_

- [x] 5. Update DatasetToolIntegrationService for enhanced manifest processing





  - [x] 5.1 Add seedData configuration processing


    - Detect and process seedData configuration in manifest
    - Add seedDataConfig property to processed manifest
    - _Requirements: 3.1, 3.2_

  - [x] 5.2 Add systemPrompts configuration processing


    - Detect and process systemPrompts configuration in manifest
    - Add systemPromptsConfig property to processed manifest
    - _Requirements: 6.1_

- [x] 6. Add comprehensive error handling and user feedback





  - [x] 6.1 Implement seed data error handling


    - Handle service initialization failures with retry options
    - Manage missing seed data files with clear error messages
    - Provide fallback behavior when tool service is unavailable
    - _Requirements: 1.3, 4.4_

  - [x] 6.2 Implement reset operation error handling


    - Handle reset method unavailability with appropriate messaging
    - Manage reset operation failures with retry options
    - Maintain current state when reset fails
    - _Requirements: 2.3, 4.4_

  - [x] 6.3 Add success feedback for operations


    - Show success messages for successful data resets
    - Provide loading indicators during operations
    - Clear feedback messages after appropriate timeout
    - _Requirements: 4.3, 4.4_

- [ ] 7. Integration and testing
  - [ ] 7.1 Test seed data dataset selection flow
    - Verify shipping-logistics dataset loads seed data automatically
    - Confirm tool configuration displays correctly
    - Test error scenarios with missing files or failed initialization
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 7.2 Test reset data functionality
    - Verify reset button appears for seed data datasets
    - Test successful reset operation with proper feedback
    - Test error handling when reset fails
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 7.3 Test system prompt integration
    - Verify dataset-specific prompts load correctly
    - Test newline processing for proper display
    - Confirm prompts update when switching datasets
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 7.4 Test mixed dataset type handling
    - Switch between file-based and seed data datasets
    - Verify UI adapts appropriately for each mode
    - Confirm backward compatibility with existing datasets
    - _Requirements: 3.3, 5.3, 5.4_
