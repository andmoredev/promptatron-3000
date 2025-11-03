# Implementation Plan

- [x] 1. Create base meta-agent infrastructure
  - Create BaseMetaAgent class with common functionality for all meta-agents
  - Implement MetaAgentService for orchestrating meta-agent execution
  - Add meta-agent configuration loading and validation utilities
  - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2_

- [x] 2. Set up expense report validator scenario structure
  - Create expense-report-validator scenario folder with proper structure
  - Add scenario.json with meta-agent configuration section
  - Create sample expense report datasets with intentional issues
  - Add expense policy lookup tools for compliance checking
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Implement scenario-specific meta-agents
- [x] 3.1 Create Fact Checker meta-agent
  - Implement factChecker.js in scenario meta-agents folder
  - Add data consistency validation logic and OCR mismatch detection
  - Create structured JSON response parsing for fact-checking results
  - _Requirements: 3.1, 4.1_

- [x] 3.2 Create Error Containment meta-agent
  - Implement errorContainment.js in scenario meta-agents folder
  - Add policy violation detection and unsafe decision identification
  - Create safety assessment logic with risk categorization
  - _Requirements: 3.2, 4.2_

- [x] 3.3 Create Quality Enforcer meta-agent
  - Implement qualityEnforcer.js in scenario meta-agents folder
  - Add reasoning clarity scoring and completeness assessment
  - Create quality breakdown scoring (reasoning, completeness, tool usage, communication)
  - _Requirements: 3.3, 4.3_

- [x] 4. Integrate meta-agents with existing test execution flow
- [x] 4.1 Extend App.jsx for meta-agent execution
  - Add meta-agent evaluation trigger after baseline LLM completion
  - Implement meta-agent status tracking and progress indicators
  - Add meta-agent configuration loading from scenario settings
  - _Requirements: 7.3, 7.4_

- [x] 4.2 Update test result data structure
  - Extend test result object to include meta-agent evaluation results
  - Add meta-agent status and recommendation fields
  - Implement result aggregation logic for overall accept/reject decisions
  - _Requirements: 5.1, 5.2, 5.5_

- [x] 5. Create meta-agent results display components
- [x] 5.1 Create MetaAgentResults component
  - Design meta-agent results display with color-coded indicators
  - Implement expandable details for each meta-agent analysis
  - Add overall recommendation display with confidence scores
  - _Requirements: 4.4, 5.3, 5.4_

- [x] 5.2 Extend TestResults component
  - Integrate MetaAgentResults component into existing test results display
  - Add meta-agent section with proper loading states and error handling
  - Implement progressive display as meta-agents complete evaluation
  - _Requirements: 4.5, 5.1, 5.2_
- [x] 6. Add meta-agent configuration UI controls
- [x] 6.1 Extend scenario configuration display
  - Add meta-agent toggle controls to scenario selector
  - Implement individual meta-agent enable/disable functionality
  - Add meta-agent configuration status indicators
  - _Requirements: 6.2, 6.4_

- [x] 6.2 Create meta-agent settings panel
  - Add meta-agent configuration options to execution settings
  - Implement meta-agent parameter controls (thresholds, model selection)
  - Add meta-agent validation and error messaging
  - _Requirements: 6.3, 6.5_

- [x] 7. Implement error handling and recovery
- [x] 7.1 Add meta-agent failure handling
  - Implement graceful degradation when individual meta-agents fail
  - Add retry logic with exponential backoff for transient failures
  - Create fallback responses for failed meta-agent evaluations
  - _Requirements: 7.5_

- [x] 7.2 Add meta-agent timeout and cancellation
  - Implement timeout handling for long-running meta-agent evaluations
  - Add cancellation support for meta-agent executions
  - Create user feedback for timeout and cancellation scenarios
  - _Requirements: 7.3, 7.4_

- [x] 8. Create expense report validator demo scenario
- [x] 8.1 Add baseline demo data
  - Create expense report with missing policy lookup (demonstrates wrong decision)
  - Add sample data that shows $130 vs $310 discrepancy from demo script
  - Include receipt data with temperature indicators for policy checking
  - _Requirements: 1.3, 2.2, 2.3_

- [x] 8.2 Configure demo prompts and tools
  - Add system prompt for expense report triage agent
  - Create user prompt with minimal expense exception scenario
  - Configure policy lookup tools that baseline agent should use but doesn't
  - _Requirements: 1.4, 2.1, 2.4_

- [x] 9. Add meta-agent history and persistence
- [x] 9.1 Extend history storage
  - Add meta-agent results to test history storage
  - Implement meta-agent result serialization and deserialization
  - Update history display to show meta-agent evaluations
  - _Requirements: 5.5_

- [x] 9.2 Add meta-agent comparison support
  - Extend comparison view to include meta-agent results
  - Add meta-agent result comparison between different test runs
  - Implement meta-agent trend analysis for quality improvements
  - _Requirements: 5.5_

- [ ]* 10. Add comprehensive testing
- [ ]* 10.1 Create unit tests for meta-agent components
  - Test BaseMetaAgent class functionality and error handling
  - Test MetaAgentService orchestration and result aggregation
  - Test individual meta-agent evaluation logic and response parsing
  - _Requirements: 7.1, 7.2, 7.5_

- [ ]* 10.2 Create integration tests for meta-agent flow
  - Test end-to-end meta-agent execution after baseline LLM
  - Test meta-agent configuration loading and validation
  - Test meta-agent UI integration and status updates
  - _Requirements: 6.1, 6.2, 7.3_

- [ ]* 10.3 Create demo scenario validation tests
  - Test expense report validator scenario configuration
  - Test meta-agent detection of policy violations and data inconsistencies
  - Test quality scoring accuracy and recommendation logic
  - _Requirements: 1.1, 3.1, 3.2, 3.3_