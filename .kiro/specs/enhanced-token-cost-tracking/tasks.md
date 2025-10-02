# Implementation Plan

- [x] 1. Set up token estimation infrastructure





  - Install tiktoken dependency for accurate token counting
  - Create TokenEstimationService singleton with encoder caching
  - Implement model-to-tokenizer mapping for different AI model families
  - Add error handling for unsupported models and estimation failures
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Create cost calculation service





  - Create CostCalculationService singleton for pricing calculations
  - Implement AWS Bedrock pricing data structure and storage
  - Add model-specific pricing lookup with regional support
  - Implement cost calculation methods for input, output, and tool tokens
  - Add error handling for missing pricing data
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3. Extend settings system for cost preferences





  - Add cost settings section to SettingsService configuration
  - Create useCostSettings hook following existing settings pattern
  - Implement cost display toggle with persistence
  - Add settings validation and default values
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4. Enhance BedrockService with token and cost integration





  - Modify parseConverseResponse to integrate token estimation
  - Add cost calculation integration when cost display is enabled
  - Enhance usage data structure with estimation metadata
  - Implement fallback logic when API usage data is unavailable
  - Add performance optimizations to skip cost calculations when disabled
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.2, 7.3_

- [x] 5. Create TokenCostDisplay component





  - Build reusable component for displaying token and cost information
  - Implement compact and full display modes
  - Add visual indicators for estimated vs exact values
  - Include cost disclaimer and estimation notices
  - Support conditional cost display based on user settings
  - _Requirements: 1.3, 3.1, 3.4, 4.3_

- [x] 6. Add cost settings to SettingsDialog





  - Create CostSettingsTab component following existing tab pattern
  - Add cost display toggle with immediate preview
  - Include pricing data information and last update timestamp
  - Integrate with existing SettingsDialog tab system
  - Add help tooltips for cost-related settings
  - _Requirements: 4.1, 4.2, 4.4_



- [x] 7. Update TestResults component with enhanced token display



  - Replace existing token display with TokenCostDisplay component
  - Add conditional cost information rendering
  - Implement responsive layout for token and cost metrics
  - Add estimation indicators and disclaimers
  - Ensure backward compatibility with existing test data
  - _Requirements: 1.3, 3.1, 3.4, 7.4_
- [x] 8. Enhance History component with cost tracking









- [ ] 8. Enhance History component with cost tracking

  - Update history display to show cost information when enabled
  - Add cost filtering and sorting capabilities
  - Implement cost aggregation for historical analysis
  - Update export functionality to include cost data
  - Handle legacy test data without cost information
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 9. Update Comparison component with cost comparison





  - Add cost comparison metrics to side-by-side view
  - Implement cost difference calculations and highlighting
  - Update comparison export to include cost data
  - Add cost-based comparison insights
  - Maintain existing comparison functionality
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 10. Add AWS Bedrock pricing data





  - Create comprehensive pricing data file with current AWS Bedrock rates
  - Implement pricing data loading and caching
  - Add regional pricing support for major AWS regions
  - Include pricing effective dates and version tracking
  - Add pricing data validation and error handling
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 11. Create comprehensive test suite
  - Write unit tests for TokenEstimationService with various model types
  - Create unit tests for CostCalculationService with different pricing scenarios
  - Add integration tests for enhanced BedrockService functionality
  - Test TokenCostDisplay component with different data states
  - Create end-to-end tests for complete token and cost tracking workflow
  - _Requirements: All requirements validation_

- [x] 12. Implement performance optimizations





  - Add token estimation caching with LRU eviction
  - Implement lazy loading for tiktoken encoders
  - Add performance monitoring for token estimation speed
  - Optimize cost calculations to meet performance requirements
  - Add memory usage monitoring for token estimation service
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 13. Add error handling and user feedback





  - Implement graceful degradation when token estimation fails
  - Add user notifications for pricing data issues
  - Create fallback displays for unavailable cost information
  - Add error recovery mechanisms for service initialization failures
  - Implement user-friendly error messages for all failure scenarios
  - _Requirements: 2.5, 3.5, 7.5_

- [x] 14. Final integration and testing





  - Integrate all components into main application flow
  - Test complete user workflow from settings to results display
  - Verify backward compatibility with existing test data
  - Test performance under various load conditions
  - Validate all requirements are met and functioning correctly
  - _Requirements: All requirements final validation_
