/**
 * @fileoverview Example of how to integrate RobotGraphic with App.jsx
 * This file demonstrates the complete integration workflow
 */

import React from 'react';
import { RobotGraphicContainer, useRobotIntegration } from './RobotGraphicContainer.jsx';

/**
 * Example 1: Direct integration with RobotGraphicContainer
 * This is the simplest way to add the robot to your app
 */
export function AppWithRobotContainer({ appState }) {
  return (
    <div className="app-layout">
      {/* Your existing app content */}
      <div className="main-content">
        {/* ... existing components ... */}
      </div>

      {/* Add robot in a fixed position */}
      <div className="robot-container fixed bottom-4 right-4">
        <RobotGraphicContainer
          appState={appState}
          size="lg"
          options={{
            talkingDuration: 3000, // Show talking state for 3 seconds after completion
            debounceDelay: 150,     // Debounce rapid state changes
            enableTransitions: true  // Enable smooth transitions
          }}
          enableDebug={process.env.NODE_ENV === 'development'}
        />
      </div>
    </div>
  );
}

/**
 * Example 2: Using the useRobotIntegration hook
 * This gives you more control over the robot component
 */
export function AppWithRobotHook({ appState }) {
  const {
    RobotComponent,
    RobotContainer,
    currentState,
    isTransitioning,
    getStateInfo
  } = useRobotIntegration(appState, {
    talkingDuration: 2500,
    enableTransitions: true
  });

  // You can use the state information for other UI elements
  const statusMessage = getStatusMessage(currentState, isTransitioning);

  return (
    <div className="app-layout">
      {/* Status indicator that matches robot state */}
      <div className="status-bar">
        <span className={`status-indicator status-${currentState}`}>
          {statusMessage}
        </span>
      </div>

      {/* Main content */}
      <div className="main-content">
        {/* ... existing components ... */}
      </div>

      {/* Robot component */}
      <div className="robot-area">
        <RobotComponent
          size="md"
          className="app-robot"
          ariaLabel={`Application status: ${statusMessage}`}
        />
      </div>

      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-info">
          <pre>{JSON.stringify(getStateInfo(), null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

/**
 * Example 3: Custom integration with manual state mapping
 * For advanced use cases where you need custom logic
 */
export function AppWithCustomIntegration({ appState }) {
  const [robotState, setRobotState] = React.useState('idle');

  // Custom state mapping logic
  React.useEffect(() => {
    let newState = 'idle';

    // Custom logic for your specific app needs
    if (appState.error) {
      newState = 'error';
    } else if (appState.isLoading) {
      // Custom progress-based logic
      if (appState.progressValue < 30) {
        newState = 'thinking';
      } else if (appState.progressValue < 80) {
        newState = 'talking';
      } else {
        newState = 'thinking'; // Final processing
      }
    } else if (appState.testResults) {
      // Show success state briefly
      newState = 'talking';

      // Auto-return to idle after delay
      const timeout = setTimeout(() => {
        setRobotState('idle');
      }, 2000);

      return () => clearTimeout(timeout);
    }

    setRobotState(newState);
  }, [appState]);

  return (
    <div className="app-layout">
      <div className="main-content">
        {/* ... existing components ... */}
      </div>

      {/* Robot with custom state */}
      <RobotGraphic
        currentState={robotState}
        size="lg"
        className="custom-robot"
      />
    </div>
  );
}

/**
 * Example 4: Multiple robots showing different aspects
 * Demonstrates using multiple robot instances
 */
export function AppWithMultipleRobots({ appState }) {
  const mainRobot = useRobotIntegration(appState);

  // Create a custom state for a secondary robot (e.g., for validation status)
  const validationState = React.useMemo(() => {
    const hasValidationErrors = Object.keys(appState.validationErrors || {}).length > 0;
    return {
      isLoading: false,
      error: hasValidationErrors ? 'Validation errors' : null,
      progressStatus: '',
      progressValue: 0,
      testResults: null
    };
  }, [appState.validationErrors]);

  const validationRobot = useRobotIntegration(validationState);

  return (
    <div className="app-layout">
      <div className="main-content">
        {/* ... existing components ... */}
      </div>

      {/* Main robot showing overall app state */}
      <div className="main-robot">
        <mainRobot.RobotComponent size="lg" />
        <span className="robot-label">System Status</span>
      </div>

      {/* Validation robot showing form validation state */}
      <div className="validation-robot">
        <validationRobot.RobotComponent size="sm" />
        <span className="robot-label">Form Validation</span>
      </div>
    </div>
  );
}

/**
 * Helper function to get user-friendly status messages
 */
function getStatusMessage(robotState, isTransitioning) {
  if (isTransitioning) {
    return 'Updating...';
  }

  switch (robotState) {
    case 'idle':
      return 'Ready';
    case 'thinking':
      return 'Processing...';
    case 'talking':
      return 'Generating response...';
    case 'error':
      return 'Error occurred';
    default:
      return 'Unknown';
  }
}

/**
 * Example CSS classes for styling the robot integration
 */
export const robotIntegrationStyles = `
  .robot-container {
    z-index: 1000;
    pointer-events: none;
  }

  .robot-container .robot-graphic {
    pointer-events: auto;
  }

  .status-indicator {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-idle {
    background-color: #e6f3d5;
    color: #4a7348;
  }

  .status-thinking {
    background-color: #fef3c7;
    color: #92400e;
  }

  .status-talking {
    background-color: #dbeafe;
    color: #1e40af;
  }

  .status-error {
    background-color: #fee2e2;
    color: #dc2626;
  }

  .robot-transitioning {
    opacity: 0.8;
  }

  .app-robot {
    transition: all 0.3s ease-in-out;
  }

  .custom-robot {
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
  }

  .main-robot, .validation-robot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .robot-label {
    font-size: 10px;
    color: #6b7280;
    text-align: center;
  }
`;

// Import the RobotGraphic component for the custom integration example
import RobotGraphic from './RobotGraphic.jsx';