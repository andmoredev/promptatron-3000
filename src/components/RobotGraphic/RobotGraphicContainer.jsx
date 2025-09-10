/**
 * @fileoverview Container component that integrates RobotGraphic with application state
 * Demonstrates the complete integration of state mapping utilities
 */

import React from 'react';
import PropTypes from 'prop-types';
import RobotGraphic from './RobotGraphic.jsx';
import { useRobotState } from './useRobotState.js';

import { extractRobotRelevantState } from './stateMapping.js';

/**
 * Container component that connects RobotGraphic to application state
 * Handles state mapping, optimization, and provides debugging capabilities
 *
 * @param {Object} props - Component props
 * @param {Object} props.appState - Full application state from App.jsx
 * @param {string} [props.size='md'] - Robot size variant
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {string} [props.ariaLabel] - Custom accessibility label
 * @param {Object} [props.options={}] - Configuration options
 * @param {boolean} [props.enableDebug=false] - Enable debug mode
 * @returns {JSX.Element} The integrated robot graphic component
 */
const RobotGraphicContainer = ({
  appState,
  size = 'md',
  className = '',
  ariaLabel,
  options = {},
  enableDebug = false
}) => {
  // Extract only robot-relevant state for performance
  const robotRelevantState = extractRobotRelevantState(appState);

  // Use the robot state hook for state management
  const {
    currentState,
    isTransitioning,
    stateHistory,
    getStateInfo,
    debug
  } = useRobotState(robotRelevantState, {
    talkingDuration: options.talkingDuration || 2000,
    debounceDelay: options.debounceDelay || 100,
    enableTransitions: options.enableTransitions !== false
  });

  // Debug information (when debug mode is enabled)
  React.useEffect(() => {
    if (enableDebug) {
      console.log('RobotGraphicContainer Debug:', {
        currentState,
        isTransitioning,
        robotRelevantState,
        stateHistoryLength: stateHistory.length,
        debug
      });
    }
  }, [currentState, isTransitioning, robotRelevantState, stateHistory.length, debug, enableDebug]);

  // Build enhanced className with state information
  const enhancedClassName = [
    className,
    isTransitioning && 'robot-transitioning',
    `robot-container-${currentState}`
  ].filter(Boolean).join(' ');

  // Enhanced aria label with transition information
  const enhancedAriaLabel = ariaLabel || (
    isTransitioning
      ? `Robot is transitioning to ${currentState} state`
      : `Robot is in ${currentState} state`
  );

  return (
    <div
      className={`robot-graphic-container ${enhancedClassName}`}
      data-testid="robot-graphic-container"
      data-current-state={currentState}
      data-is-transitioning={isTransitioning}
    >
      <RobotGraphic
        currentState={currentState}
        size={size}
        className={className}
        ariaLabel={enhancedAriaLabel}
      />

      {/* Debug panel (when debug mode is enabled) */}
      {enableDebug && (
        <RobotDebugPanel
          currentState={currentState}
          isTransitioning={isTransitioning}
          stateHistory={stateHistory}
          appState={robotRelevantState}
          getStateInfo={getStateInfo}
        />
      )}
    </div>
  );
};

/**
 * Debug panel component for development
 * Shows current state, history, and allows manual state testing
 */
const RobotDebugPanel = ({
  currentState,
  isTransitioning,
  stateHistory,
  appState,
  getStateInfo
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  if (!isExpanded) {
    return (
      <div className="robot-debug-panel-collapsed">
        <button
          onClick={() => setIsExpanded(true)}
          className="text-xs bg-gray-800 text-white px-2 py-1 rounded"
          style={{ position: 'absolute', top: 0, right: 0, zIndex: 1000 }}
        >
          🤖 Debug
        </button>
      </div>
    );
  }

  return (
    <div
      className="robot-debug-panel"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        background: 'rgba(0,0,0,0.9)',
        color: 'white',
        padding: '8px',
        fontSize: '10px',
        borderRadius: '4px',
        maxWidth: '200px',
        zIndex: 1000
      }}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold">Robot Debug</span>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-white hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1">
        <div>State: <span className="font-mono">{currentState}</span></div>
        <div>Transitioning: {isTransitioning ? 'Yes' : 'No'}</div>
        <div>History: {stateHistory.length} entries</div>

        <details className="mt-2">
          <summary className="cursor-pointer">App State</summary>
          <pre className="text-xs mt-1 overflow-auto max-h-20">
            {JSON.stringify(appState, null, 2)}
          </pre>
        </details>

        {stateHistory.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer">Recent Changes</summary>
            <div className="text-xs mt-1 max-h-20 overflow-auto">
              {stateHistory.slice(-3).map((entry, index) => (
                <div key={entry.timestamp} className="mb-1">
                  {entry.from} → {entry.to} ({entry.reason})
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};



// PropTypes
RobotGraphicContainer.propTypes = {
  appState: PropTypes.shape({
    isLoading: PropTypes.bool,
    error: PropTypes.string,
    progressStatus: PropTypes.string,
    progressValue: PropTypes.number,
    testResults: PropTypes.object
  }).isRequired,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
  ariaLabel: PropTypes.string,
  options: PropTypes.shape({
    talkingDuration: PropTypes.number,
    debounceDelay: PropTypes.number,
    enableTransitions: PropTypes.bool
  }),
  enableDebug: PropTypes.bool
};

RobotDebugPanel.propTypes = {
  currentState: PropTypes.string.isRequired,
  isTransitioning: PropTypes.bool.isRequired,
  stateHistory: PropTypes.array.isRequired,
  appState: PropTypes.object.isRequired,
  getStateInfo: PropTypes.func.isRequired
};

// Export the container component
export default RobotGraphicContainer;

/**
 * Hook for easy integration with App.jsx
 * Provides a simple interface for adding robot to any component
 *
 * @param {Object} appState - Application state
 * @param {Object} options - Configuration options
 * @returns {Object} Robot integration utilities
 */
export function useRobotIntegration(appState, options = {}) {
  const robotRelevantState = extractRobotRelevantState(appState);
  const robotState = useRobotState(robotRelevantState, options);

  return {
    // Robot component ready to use
    RobotComponent: (props) => (
      <RobotGraphic
        currentState={robotState.currentState}
        {...props}
      />
    ),

    // Container component with full integration
    RobotContainer: (props) => (
      <OptimizedRobotGraphicContainer
        appState={appState}
        {...props}
      />
    ),

    // State information
    currentState: robotState.currentState,
    isTransitioning: robotState.isTransitioning,
    stateHistory: robotState.stateHistory,

    // Control functions
    forceUpdate: robotState.forceUpdate,
    getStateInfo: robotState.getStateInfo,
    clearHistory: robotState.clearHistory
  };
}