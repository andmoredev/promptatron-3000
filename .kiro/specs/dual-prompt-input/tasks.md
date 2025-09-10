# Implementation Plan

- [x] 1. Update form validation utilities to support dual prompts

  - Modify `src/utils/formValidation.js` to validate both system and user prompts as required fields
  - Add validation rules for minimum and maximum prompt lengths
  - Update validation error messages to distinguish between system and user prompt errors
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 2. Enhance PromptEditor component for dual prompt input

  - Refactor `src/components/PromptEditor.jsx` to include separate system and user prompt input fields
  - Add clear visual distinction and labeling for each prompt type
  - Implement help tooltips explaining the purpose of system vs user prompts
  - Update template system to categorize templates by prompt type (system vs user)
  - Add combined preview functionality showing how both prompts will be formatted
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3_

- [x] 3. Update App component state management for dual prompts

  - Modify `src/App.jsx` to manage separate state for `systemPrompt` and `userPrompt`
  - Update form validation integration to handle both prompt types
  - Modify `handleLoadFromHistory` function to restore both system and user prompts
  - Update test result creation to include both prompt types
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 5.2_

- [x] 4. Migrate BedrockService to use Converse API

  - Update `src/services/bedrockService.js` to import and use AWS Bedrock Converse API
  - Replace existing `invokeModel` method to accept both system and user prompts
  - Implement proper message formatting using Converse API's standardized structure
  - Add system prompt support using Converse API's native system message handling
  - Remove provider-specific formatting logic in favor of unified Converse API approach
  - _Requirements: 1.3, 2.3_

- [x] 5. Update test result data model for dual prompts

  - Modify test result creation in `src/App.jsx` to include both `systemPrompt` and `userPrompt` fields
  - Maintain backward compatibility by keeping legacy `prompt` field for existing history entries
  - Update history display components to show both prompt types when available
  - _Requirements: 5.1, 5.3_

- [x] 6. Enhance History component to support dual prompt display and search

  - Update `src/components/History.jsx` to display both system and user prompts in history entries
  - Modify history search functionality in `src/hooks/useHistory.js` to search across both prompt types
  - Add preview functionality that shows both prompt types in history entries
  - Ensure backward compatibility with single-prompt history entries
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7. Update validation error handling and user feedback

  - Enhance error display in `src/App.jsx` to show specific validation errors for each prompt type
  - Update validation error styling to highlight problematic fields appropriately
  - Add user guidance messages for dual prompt requirements
  - Implement clear error messaging when either prompt is missing
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 8. Integrate dual prompt functionality end-to-end
  - Test complete workflow from dual prompt input through Bedrock API call to result display
  - Verify proper message formatting and system prompt handling via Converse API
  - Ensure history save and load functionality works correctly with dual prompts
  - Validate backward compatibility with existing single-prompt history entries
  - _Requirements: 1.3, 1.4, 2.3, 5.1, 5.2_
