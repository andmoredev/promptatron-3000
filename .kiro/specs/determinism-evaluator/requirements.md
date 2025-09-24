# Requirements Document

## Introduction

This feature provides enhanced determinism evaluation capabilities for the Promptatron 3000 application. When a user runs a test with the determinism checkbox enabled, the system will execute the same prompt multiple times (configurable number) and evaluate the consistency of responses using a grader LLM. The evaluation includes comprehensive throttling handling, improved metrics, better UI feedback, and configurable settings to make the feature more robust and user-friendly.

## Requirements

### Requirement 1

**User Story:** As a prompt engineer, I want determinism evaluation to fire exactly once when I press the Run Test button with the determinism checkbox checked, so that I can reliably test response consistency without duplicate evaluations.

#### Acceptance Criteria

1. WHEN a user runs a test with the determinism checkbox checked THEN the system SHALL initiate exactly one determinism evaluation
2. WHEN the determinism evaluation starts THEN the system SHALL execute the same prompt additional times based on user settings (default 9 additional for total of 10)
3. WHEN the evaluation is running THEN the system SHALL display clear status indicators showing current phase ("Collecting additional responses..." or "Evaluating determinism...")
4. WHEN all executions are complete THEN the system SHALL send all responses to a grader LLM for evaluation
5. WHEN the grader completes its analysis THEN the system SHALL display a letter grade (A-F) with improved metrics excluding exact matches

### Requirement 2

**User Story:** As a user, I want to see all responses and tool use calls in the review modal so that I can understand exactly what variations occurred across multiple runs.

#### Acceptance Criteria

1. WHEN a determinism grade is displayed THEN the user SHALL be able to click on the grade to view detailed breakdown
2. WHEN the user clicks the grade THEN the system SHALL show a modal displaying all individual responses from the evaluation
3. WHEN showing evaluation details THEN the system SHALL display all tool use calls for each request alongside the text responses
4. WHEN showing evaluation details THEN the system SHALL include improved semantic similarity metrics that exclude exact text matches
5. WHEN the user closes the details view THEN the system SHALL return to the normal results display

### Requirement 3

**User Story:** As a user, I want a system-wide settings dialog with a determinism section to control evaluation parameters so that I can customize the application behavior to my needs.

#### Acceptance Criteria

1. WHEN accessing application settings THEN the system SHALL provide a comprehensive settings dialog with a determinism section
2. WHEN the user changes determinism settings THEN the system SHALL save all preferences and use them for future evaluations
3. WHEN the user sets a test count THEN the system SHALL validate it's within reasonable bounds (minimum 3, maximum 50)
4. WHEN settings are changed THEN the system SHALL persist all settings across browser sessions
5. WHEN the feature is disabled via checkbox THEN no determinism evaluation SHALL occur and no UI elements SHALL be shown

### Requirement 4

**User Story:** As a user, I want clear visibility when deterministic tests are throttled so that I understand why evaluation is taking longer than expected.

#### Acceptance Criteria

1. WHEN AWS throttling occurs THEN the system SHALL display a clear throttling indicator in the progress area
2. WHEN throttling is detected THEN the system SHALL show "Handling rate limits..." status message
3. WHEN requests are being throttled THEN the system SHALL implement responsible retry with exponential backoff
4. WHEN throttling persists after 3 attempts THEN the system SHALL abandon that request and record it as throttled
5. WHEN throttled requests occur THEN the system SHALL exclude them from semantic metrics but display them visually in the results

### Requirement 5

**User Story:** As a user, I want clear status indicators showing evaluation progress phases so that I understand what the system is currently doing.

#### Acceptance Criteria

1. WHEN determinism evaluation starts THEN the system SHALL show "Collecting additional responses" status under the progress bar
2. WHEN response collection completes THEN the system SHALL show "Evaluating determinism" status under the progress bar
3. WHEN evaluation is in progress THEN the user SHALL see progress percentage and completed/total request counts
4. WHEN the user starts a new test THEN any previous determinism evaluation SHALL be cancelled automatically
5. WHEN evaluation completes THEN the system SHALL show final grade and allow access to detailed results

### Requirement 6

**User Story:** As a user, I want improved semantic similarity metrics that focus on meaningful differences rather than exact text matches so that I get more accurate determinism assessments.

#### Acceptance Criteria

1. WHEN calculating determinism metrics THEN the system SHALL exclude exact text matches from semantic similarity calculations
2. WHEN evaluating responses THEN the system SHALL focus on semantic equivalence, decision consistency, and structural consistency
3. WHEN sending responses to the grader THEN the system SHALL include all collected responses and request improved analysis
4. WHEN the grader responds THEN the system SHALL parse enhanced metrics including tool usage consistency
5. WHEN the grader fails to respond or provides invalid output THEN the system SHALL display an appropriate error message with fallback metrics

### Requirement 7

**User Story:** As a developer, I want the determinism service to be simple, safe, and not over-engineered so that it's maintainable and reliable.

#### Acceptance Criteria

1. WHEN implementing determinism features THEN the code SHALL follow simple, straightforward patterns without unnecessary complexity
2. WHEN handling errors THEN the system SHALL fail gracefully and provide clear user feedback
3. WHEN managing state THEN the system SHALL use minimal state management and avoid race conditions
4. WHEN integrating with existing code THEN the system SHALL use established patterns and minimal coupling
5. WHEN the feature is disabled THEN it SHALL have no impact on application performance or stability

### Requirement 8

**User Story:** As a user, I want robust error handling and throttling management so that determinism evaluation works reliably even under adverse conditions.

#### Acceptance Criteria

1. WHEN AWS API calls fail during evaluation THEN the system SHALL retry responsibly up to 3 times with exponential backoff
2. WHEN requests are consistently throttled THEN the system SHALL abandon further attempts and record throttled results
3. WHEN throttled results occur THEN the system SHALL display them visually but exclude them from semantic analysis
4. WHEN evaluation encounters errors THEN the original test result SHALL remain unaffected and fully functional
5. WHEN partial evaluation data is available THEN the system SHALL complete analysis with available data and indicate incomplete status
