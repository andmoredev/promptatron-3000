# Requirements Document

## Introduction

This feature adds an informational "About" section to the application that educates users about AI agent building principles and provides attribution to the creators. The section will be integrated into the existing settings dialog as a new tab, maintaining consistency with the current UI patterns.

## Requirements

### Requirement 1

**User Story:** As a user of the Promptatron 3000, I want to access educational content about AI agent building principles, so that I can improve my understanding and application of these concepts.

#### Acceptance Criteria

1. WHEN the user opens the settings dialog THEN they SHALL see an "About" tab alongside existing tabs
2. WHEN the user clicks the "About" tab THEN the system SHALL display the 6 principles of AI agent building
3. WHEN viewing the principles THEN each principle SHALL be clearly formatted with a title and description
4. WHEN viewing the principles THEN the content SHALL follow the established UI design patterns and styling

### Requirement 2

**User Story:** As a user, I want to see proper attribution to the creators and resources in a compact format, so that I can learn more and give credit where it's due without taking up excessive space.

#### Acceptance Criteria

1. WHEN viewing the About section THEN the system SHALL display credits to Andres Moreno with LinkedIn profile link in a compact format
2. WHEN viewing the About section THEN the system SHALL display credits to Allen Helton with LinkedIn profile link in a compact format
3. WHEN viewing the About section THEN the system SHALL include a link to the Null Check TV YouTube channel for additional learning in a compact format
4. WHEN viewing the About section THEN the system SHALL include a link to the GitHub repository in a compact format
5. WHEN viewing the credits section THEN all links SHALL be displayed in a dense, space-efficient layout
6. WHEN the user clicks any external link THEN the system SHALL open the link in a new tab/window

### Requirement 3

**User Story:** As a user, I want the About section to be easily accessible and well-integrated, so that I can find this information when I need it.

#### Acceptance Criteria

1. WHEN the settings dialog is open THEN the "About" tab SHALL be visible and accessible
2. WHEN switching between tabs THEN the About tab SHALL maintain the same interaction patterns as other tabs
3. WHEN viewing the About section THEN the content SHALL be responsive and readable on different screen sizes
4. WHEN the About section is displayed THEN it SHALL follow the same styling and layout patterns as other settings sections
5. WHEN the About tab is active THEN the export, import, and reset to defaults buttons SHALL be hidden from the footer
6. WHEN switching away from the About tab THEN the export, import, and reset to defaults buttons SHALL be visible again

### Requirement 4

**User Story:** As a user, I want the educational content to be well-organized and easy to read, so that I can quickly understand and reference the AI agent building principles.

#### Acceptance Criteria

1. WHEN viewing the principles THEN they SHALL be numbered 1-6 in the specified order
2. WHEN viewing each principle THEN the title SHALL be prominently displayed
3. WHEN viewing each principle THEN the description SHALL be clearly readable with proper formatting
4. WHEN viewing the content THEN it SHALL use consistent typography and spacing with the rest of the application
5. WHEN viewing the content THEN it SHALL include appropriate visual hierarchy to distinguish between sections
