# Implementation Plan

- [x] 1. Create system-wide settings infrastructure





  - Build global SettingsService for managing all application settings
  - Create AppSettings interface with sections for determinism, UI, AWS, etc.
  - Implement settings persistence with localStorage and validation
  - Add settings state management to main App component
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 2. Build system-wide settings dialog component






  - Create SettingsDialog component with tabbed sections
  - Implement determinism settings section with test count, throttling alerts, retry attempts
  - Add settings validation with immediate user feedback
  - Integrate settings dialog into main application header/menu
  - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [x] 3. Enhance DeterminismEvaluator component with single-fire logic





  - Modify component to fire exactly once when Run Test button is pressed with checkbox checked
  - Add enhanced status display showing "Collecting additional responses..." and "Evaluating determinism..." phases
  - Implement throttling visibility with clear indicators and retry countdown
  - Create comprehensive results modal showing all responses and tool usage data
  - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 4.1, 4.2, 5.1, 5.2_

- [x] 4. Enhance DeterminismService with robust throttling management





  - Simplify service to run on main thread without service worker complexity
  - Implement responsible retry logic with exponential backoff (5s, 10s, 20s)
  - Add throttling detection and abandonment after 3 attempts per request
  - Create throttled result tracking that excludes failed requests from semantic analysis
  - Integrate with user settings for configurable test count and retry behavior
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_

- [x] 5. Enhance BedrockService batch execution for determinism evaluation





  - Modify existing batch execution to handle configurable test counts from settings
  - Improve progress reporting to show current phase and throttling status
  - Add comprehensive error handling for throttled requests with visual feedback
  - Implement conservative execution strategy (single request at a time, 2s delays)
  - Preserve full response objects including tool usage data for analysis
  - _Requirements: 1.2, 4.1, 4.2, 5.1, 5.2, 5.3_

- [x] 6. Enhance grader LLM integration with improved semantic analysis





  - Update grader prompt to exclude exact matches from semantic similarity calculations
  - Implement enhanced metrics focusing on semantic equivalence, decision consistency, and structure consistency
  - Add tool usage consistency evaluation for responses with tool calls
  - Create fallback analysis for when grader LLM is unavailable
  - Exclude throttled responses from grader analysis while preserving them for display
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Create comprehensive results modal with all response data





  - Build modal component displaying all individual responses with timestamps
  - Show tool usage data for each response alongside text content
  - Highlight throttled responses (grayed out) but include them in the display
  - Add expandable sections for detailed metrics and analysis
  - Implement export functionality for response data and analysis results
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 8. Implement robust error handling and recovery with throttling focus





  - Add comprehensive error handling for AWS throttling, network issues, and grader failures
  - Create clear user feedback for throttling events with retry countdown displays
  - Implement graceful degradation that preserves original test results
  - Add recovery options with user control over retry attempts
  - Ensure partial evaluation data can complete analysis with available responses
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 9. Integrate enhanced DeterminismEvaluator with settings and single-fire logic




  - Update TestResults integration to use settings-driven configuration
  - Implement single-fire evaluation logic that prevents duplicate runs
  - Add quick settings access from determinism evaluator component
  - Ensure clean cancellation when new tests are started
  - Maintain simple integration that doesn't affect existing functionality
  - _Requirements: 1.1, 1.2, 1.3, 7.4, 7.5_

- [x] 10. Add system-wide settings integration to main application





  - Integrate SettingsService with main App component state management
  - Implement keyboard shortcut support (Ctrl/Cmd + ,) for settings dialog
  - Ensure settings changes immediately affect determinism evaluation behavior
  - Ensure settings save and load properly between page loads
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [ ] 11. Implement comprehensive testing and validation
  - Write tests for SettingsService and settings persistence
  - Create tests for enhanced DeterminismEvaluator component states and throttling scenarios
  - Test DeterminismService error handling and retry logic
  - Validate settings dialog functionality and validation rules
  - Test integration between settings and determinism evaluation behavior
  - _Requirements: 7.1, 7.2, 7.3, 8.4, 8.5_

- [x] 12. Polish and optimize the enhanced determinism evaluation system





  - Optimize performance for large numbers of test responses
  - Add accessibility features to settings dialog and results modal
  - Implement proper loading states and transitions
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
