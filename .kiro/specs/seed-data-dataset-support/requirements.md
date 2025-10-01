# Requirements Document

## Introduction

The application currently supports datasets with file-based data (like fraud-detection with CSV files), but needs to support a new pattern for datasets that use seed data instead of files. The shipping-logistics dataset type uses seed data that is loaded programmatically and needs a reset capability instead of file selection.

## Requirements

### Requirement 1

**User Story:** As a user testing shipping logistics scenarios, I want to select the shipping-logistics dataset and have the seed data automatically loaded, so that I can immediately start testing with realistic shipping exception data.

#### Acceptance Criteria

1. WHEN I select "shipping-logistics" as the dataset type THEN the system SHALL automatically load the seed data from the shippingToolsService
2. WHEN the seed data is loaded THEN the system SHALL display the dataset as ready for testing without requiring file selection
3. WHEN the seed data loading fails THEN the system SHALL display a clear error message and allow retry

### Requirement 2

**User Story:** As a user testing multiple shipping scenarios, I want to reset the seed data to its original state, so that I can test different AI model responses against the same initial conditions.

#### Acceptance Criteria

1. WHEN I have a shipping-logistics dataset selected THEN the system SHALL display a "Reset Data" button instead of a file picker
2. WHEN I click the "Reset Data" button THEN the system SHALL call the shippingToolsService.resetDemoData() method
3. WHEN the reset is successful THEN the system SHALL display a success message and refresh the dataset content
4. WHEN the reset fails THEN the system SHALL display an error message and maintain the current state

### Requirement 3

**User Story:** As a user, I want the dataset selector to automatically detect whether a dataset uses files or seed data, so that the interface adapts appropriately without manual configuration.

#### Acceptance Criteria

1. WHEN a dataset manifest contains a "seedData" configuration THEN the system SHALL use seed data mode
2. WHEN a dataset manifest contains a "files" array THEN the system SHALL use file selection mode
3. WHEN a dataset has both configurations THEN the system SHALL prioritize seed data mode
4. WHEN a dataset has neither configuration THEN the system SHALL display an appropriate error message

### Requirement 4

**User Story:** As a user, I want clear visual feedback about the dataset loading state, so that I understand when the system is working and when it's ready.

#### Acceptance Criteria

1. WHEN seed data is being loaded THEN the system SHALL display a loading indicator with descriptive text
2. WHEN seed data is being reset THEN the system SHALL display a loading indicator on the reset button
3. WHEN operations complete successfully THEN the system SHALL display success feedback
4. WHEN operations fail THEN the system SHALL display error messages with actionable guidance

### Requirement 5

**User Story:** As a user, I want the seed data content to be displayed in the same format as file-based datasets, so that the testing interface remains consistent.

#### Acceptance Criteria

1. WHEN seed data is loaded THEN the system SHALL format it as JSON string for display consistency
2. WHEN seed data is reset THEN the system SHALL update the displayed content immediately
3. WHEN switching between dataset types THEN the system SHALL maintain consistent content formatting
4. WHEN the dataset content is displayed THEN it SHALL be properly formatted and readable

### Requirement 6

**User Story:** As a user, I want dataset-specific system prompts to be automatically loaded and available in the system prompt selector, so that I can use prompts optimized for the specific dataset type.

#### Acceptance Criteria

1. WHEN a dataset manifest contains "systemPrompts" configuration THEN the system SHALL load these prompts into the system prompt selector
2. WHEN system prompts contain escaped newlines (\\n) THEN the system SHALL convert them to actual newlines for proper display
3. WHEN I select a dataset with system prompts THEN the prompts SHALL appear in the system prompt dropdown alongside hardcoded prompts
4. WHEN I switch between datasets THEN the system prompt options SHALL update to reflect the current dataset's available prompts
5. WHEN a dataset has no system prompts THEN only the hardcoded system prompts SHALL be available
