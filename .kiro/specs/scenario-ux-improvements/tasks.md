# Implementation Plan

- [x] 1. Simplify ScenarioSelector display





  - Remove comprehensive analysis box (scenario metadata section)
  - Show only simple tools list when scenario has tools
  - Add refresh seed data icon next to scenario name when applicable
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.1, 7.2, 7.3_

- [x] 2. Update PromptEditor template labels





  - Change "System Prompt Templates" to "Templates"
  - Change "User Prompt Templates" to "Templates"
  - Fix newline rendering in prompt fields using whiteSpace: 'pre-wrap'
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

- [x] 3. Make ConditionalExecutionSettings more compact





  - Reduce spacing in maximum iterations field
  - Use horizontal layout for max iterations (label left, input right)
  - Remove blue "Tool Execution Mode Active" dialog
  - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4_

- [x] 4. Fix ConditionalDatasetSelector visibility logic





  - Show dataset selector only when scenario has datasets configured
  - Hide completely when scenario has no datasets
  - Update App.jsx to use proper conditional rendering
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 5. Implement seed data refresh functionality





  - Add refresh icon to scenario name when scenario has seed data
  - Implement refresh handler in ScenarioSelector
  - Add loading state for refresh operation
  - _Requirements: 7.4, 7.5, 7.6_
