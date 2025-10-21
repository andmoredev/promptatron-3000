# Implementation Plan

- [x] 1. Set up core guardrail service and data models




  - Create GuardrailService class with AWS Bedrock Guardrails API integration
plement GuardrailConfig and GuardrailResult data models
  - Add credential detection and initialization patterns following BedrockService
  - _Requirements: 1.1, 4.1, 4.2, 7.4_

- [x] 1.1 Create GuardrailService with AWS API integration


  - Write GuardrailService class with singleton pattern
  - Implement createGuardrail, deleteGuardrail, listGuardrails, applyGuardrail methods
  - Add credential validation and error handling following existing patterns
  - _Requirements: 4.1, 4.2, 7.1, 7.2_

- [x] 1.2 Implement guardrail data models


  - Create GuardrailConfig class with validation and AWS format conversion
  - Create GuardrailResult class with violation detection and formatting
  - Add schema validation utilities for guardrail configurations
  - _Requirements: 1.2, 8.1, 8.3_

- [ ]* 1.3 Write unit tests for guardrail service and models
  - Create unit tests for GuardrailService methods
  - Write tests for GuardrailConfig and GuardrailResult classes
  - Add mock AWS API responses for testing
  - _Requirements: 1.2, 4.2, 7.1_

- [x] 2. Extend scenario schema and validation





  - Update scenario schema to include guardrails configuration
  - Extend scenario validation to handle guardrail configs
  - Add backward compatibility for existing scenarios
  - _Requirements: 1.1, 1.2, 8.1, 8.3_


- [ ] 2.1 Update scenario schema with guardrails support










  - Extend scenarioModels.js with guardrails schema definition
  - Add validation for all guardrail policy types (content, word, PII, topic)
  - Implement schema migration for existing scenarios
  - _Requirements: 1.1, 1.2, 8.1_



- [x] 2.2 Extend ScenarioService for guardrail management





  - Add guardrail validation to scenario loading process
  - Implement guardrail resource management in scenario lifecycle
  - Add methods for extracting and managing guardrail configurations
  - _Requirements: 1.2, 4.1, 8.2, 8.4_

- [x] 2.3 Implement simplified schema translation system





  - Create GuardrailSchemaTranslator service for converting simplified schema to AWS format
  - Add translation methods for all policy types (topic, content, word, PII, contextual grounding)
  - Implement validation for simplified schema format with clear error messages
  - Extend GuardrailConfig class to detect and handle simplified format automatically
  - Add support for sensible defaults when input/output configurations are omitted
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

- [ ]* 2.4 Write tests for scenario schema extensions
  - Create tests for guardrail schema validation
  - Write tests for scenario loading with guardrails
  - Add tests for backward compatibility
  - Create tests for simplified schema translation and validation
  - _Requirements: 1.2, 8.1, 8.3, 8.10_

- [x] 3. Create guardrails UI components





  - Build GuardrailsSection component for scenario display
  - Create GuardrailResults component for evaluation results
  - Implement consistent theme styling and status indicators
  - _Requirements: 1.3, 1.4, 1.5, 2.3, 2.4, 6.1, 6.2, 6.4_

- [x] 3.1 Build GuardrailsSection component


  - Create component to display guardrail configuration in scenarios
  - Add enable/disable toggle for guardrails
  - Add collapsible section with guardrail summary
  - _Requirements: 1.3, 1.4, 1.5, 3.1, 3.5_

- [x] 3.2 Create GuardrailResults component


  - Build component to display guardrail evaluation results
  - Add expandable sections for detailed violation information
  - Implement clear visual indicators for violations using theme colors
  - Add support for integrated test results display
  - _Requirements: 2.3, 2.4, 3.1, 3.2, 3.4_

- [x] 3.3 Integrate guardrails into ScenarioSelector


  - Add GuardrailsSection to scenario display
  - Wire up guardrail toggle functionality
  - Implement validation error display for guardrail configs
  - _Requirements: 1.3, 1.4, 1.5, 3.1_

- [ ]* 3.4 Write component tests for guardrail UI
  - Create tests for GuardrailsSection interactions
  - Write tests for GuardrailResults display logic
  - Add tests for integration with ScenarioSelector
  - _Requirements: 1.3, 2.3, 3.1_

- [x] 4. Extend BedrockService for guardrail integration





  - Add guardrail support to Converse API calls
  - Implement guardrail result parsing and formatting
  - Add multiple guardrails evaluation support
  - _Requirements: 2.1, 2.2, 2.4, 7.1, 7.3_

- [x] 4.1 Add guardrail support to model invocation


  - Extend invokeModel method to accept guardrail configurations
  - Modify Converse API calls to include guardrailConfig parameter
  - Add guardrail result parsing to response handling
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 4.2 Implement multiple guardrails evaluation


  - Add support for evaluating multiple guardrails concurrently
  - Implement result aggregation and combination logic
  - Add error handling for partial guardrail failures
  - _Requirements: 2.1, 2.4, 7.1, 7.3_

- [x] 4.3 Extend tool workflow execution with guardrails


  - Add guardrail support to executeToolWorkflow method
  - Ensure guardrails are applied throughout multi-turn conversations
  - Implement guardrail result tracking in workflow state
  - _Requirements: 2.1, 2.2, 2.4_

- [ ]* 4.4 Write tests for BedrockService guardrail extensions
  - Create tests for guardrail-enabled model invocation
  - Write tests for multiple guardrails evaluation
  - Add tests for tool workflow with guardrails
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 5. Implement AWS guardrail resource management





  - Add automatic guardrail creation for scenarios
  - Implement guardrail discovery and mapping via tags
  - Add guardrail lifecycle management with proper tagging
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 5.1 Implement guardrail creation with tagging


  - Add createGuardrailForScenario method to GuardrailService
  - Implement proper tagging with "promptatron" source and scenario name
  - Add progress feedback and error handling for creation process
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 5.2 Add guardrail discovery and mapping


  - Implement discoverExistingGuardrails method using listGuardrails API
  - Add filtering for promptatron-tagged guardrails
  - Implement mapping of guardrails to scenarios based on tags
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 5.3 Integrate guardrail management into scenario loading


  - Add ensureGuardrailExists method for scenario initialization
  - Implement automatic creation when guardrails don't exist
  - Add guardrail ARN storage and retrieval for scenarios
  - _Requirements: 5.1, 5.2, 6.4, 7.4_

- [ ]* 5.4 Write tests for AWS resource management
  - Create tests for guardrail creation with proper tagging
  - Write tests for guardrail discovery and mapping
  - Add tests for scenario-guardrail integration
  - _Requirements: 5.1, 5.2, 6.1, 6.2_

- [x] 6. Implement error handling and graceful degradation





  - Add comprehensive error handling for all guardrail operations
  - Implement graceful degradation when guardrails fail
  - Create user-friendly error messages and recovery guidance
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.5_

- [x] 6.1 Add comprehensive error handling


  - Implement error categorization and user-friendly messages
  - Add retry mechanisms with exponential backoff
  - Create error recovery workflows for common failures
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 6.2 Implement graceful degradation


  - Add fallback behavior when guardrails are unavailable
  - Implement degraded mode indicators in UI
  - Ensure core functionality continues without guardrails
  - _Requirements: 4.1, 4.4, 6.5_

- [x] 6.3 Create user guidance and troubleshooting


  - Add AWS permissions guidance for guardrail operations
  - Implement contextual help for guardrail configuration
  - Create troubleshooting workflows for common issues
  - _Requirements: 4.3, 4.5_

- [ ]* 6.4 Write tests for error handling
  - Create tests for error categorization and messaging
  - Write tests for graceful degradation scenarios
  - Add tests for retry mechanisms and recovery workflows
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 7. Integration testing and final wiring




  - Wire all components together in main App component
  - Add integration between guardrails and existing test workflows
  - Implement end-to-end testing scenarios
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1_

- [x] 7.1 Integrate guardrails into main application flow


  - Wire GuardrailService into App component initialization
  - Add guardrail discovery during application startup
  - Integrate guardrail results into test results display
  - _Requirements: 1.1, 2.1, 6.1, 6.2_

- [x] 7.2 Connect guardrails to test execution workflows


  - Modify test execution to include guardrail evaluation
  - Add guardrail results to history and comparison features
  - Implement guardrail status in test progress indicators
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 7.3 Add guardrail support to existing features


  - Integrate guardrails with streaming output
  - Add guardrail considerations to determinism evaluation
  - Ensure guardrails work with tool execution workflows
  - _Requirements: 2.1, 4.1, 5.1_

- [ ]* 7.4 Create end-to-end integration tests
  - Write tests for complete guardrail workflows including AWS resource management
  - Create tests for integration with existing features
  - Add tests for guardrail discovery and scenario mapping
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_
