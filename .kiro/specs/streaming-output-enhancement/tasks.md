# Implementation Plan

- [x] 1. Extend BedrockService with streaming capabilities
  - Add ConverseStreamCommand import from AWS SDK
  - Implement invokeModelStream method with token-by-token processing
  - Add isStreamingSupported method to check model capabilities
  - Create parseStreamEvent method to handle different event types
  - Add graceful fallback to non-streaming when streaming fails
  - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.4_

- [ ] 2. Enhance App component state management for streaming
  - Add streaming-related state variables (isStreaming, streamingContent, streamingProgress, isRequestPending)
  - Modify handleRunTest to show thinking state during request sending and talking state during response streaming
  - Implement real-time token accumulation and UI updates with proper state transitions
  - Add streaming error handling with user-friendly messages
  - _Requirements: 1.1, 1.4, 4.3, 4.4_

- [ ] 3. Add distinct "thinking" and "talking" states to robot graphic system
  - Extend ROBOT_STATES with separate THINKING and TALKING state definitions
  - Add thinking indicator animations for request processing phase
  - Add mouth movement and talking animations for active streaming phase
  - Update stateMapping.js to distinguish between request sending (thinking) and response streaming (talking)
  - Modify useRobotState hook to handle both thinking and talking state transitions
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 4. Create StreamingOutput component for real-time display
  - Build component to display streaming content with real-time updates
  - Implement copy to clipboard functionality with success/error feedback
  - Add streaming progress indicators and status messages
  - Include accessibility features with ARIA live regions for screen readers
  - _Requirements: 1.1, 1.3, 3.1, 3.2, 3.3, 5.1, 5.4_

- [ ] 5. Integrate StreamingOutput into TestResults component
  - Modify TestResults to conditionally render StreamingOutput during streaming
  - Add copy button that appears after response completion
  - Implement proper state management between streaming and completed states
  - Ensure backward compatibility with existing non-streaming results
  - _Requirements: 3.1, 3.2, 3.4_

- [ ] 6. Add comprehensive error handling and fallback mechanisms
  - Implement retry logic for interrupted streams with exponential backoff
  - Add model compatibility checking before attempting to stream
  - Create user-friendly error messages for different streaming failure scenarios
  - Ensure graceful degradation to non-streaming mode when needed
  - _Requirements: 1.5, 4.4, 4.5_

- [ ] 7. Implement accessibility features for streaming interface
  - Add ARIA live regions to announce both thinking and streaming status changes
  - Ensure keyboard navigation works for copy button and streaming controls
  - Add screen reader announcements for request processing and response streaming phases
  - Implement focus management during thinking and talking state transitions
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 8. Add performance optimizations for streaming
  - Implement token batching to reduce excessive UI updates during fast streaming
  - Add debounced content updates to prevent render thrashing
  - Create memory cleanup for streaming state after completion
  - Add streaming metrics collection for performance monitoring
  - _Requirements: 1.1, 4.3_

- [ ] 9. Create comprehensive tests for streaming functionality
  - Write unit tests for BedrockService streaming methods with mocked AWS responses
  - Add tests for robot state transitions during both thinking and talking phases
  - Create integration tests for end-to-end streaming workflow including state transitions
  - Test error handling and fallback mechanisms for both request and streaming phases
  - _Requirements: 1.1, 1.5, 2.1, 4.4_

- [ ] 10. Update existing components for streaming compatibility
  - Modify ModelSelector to indicate which models support streaming
  - Update History component to display streaming metadata in saved results
  - Enhance Comparison component to handle streaming vs non-streaming results
  - Ensure all validation and form handling works with streaming mode
  - _Requirements: 4.1, 4.2_