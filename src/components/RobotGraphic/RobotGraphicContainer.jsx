/**
 * @fileoverview Container component that integrates RobotGraphic with application state
 * Demonstrates the complete integration of state mapping utilities
 */

import React from 'react';
import PropTypes from 'prop-types';
import RobotGraphic from './RobotGraphic.jsx';
import { useRobotState } from './useRobotState.js';
import { useChadReveal } from './useChadReveal.js';

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
  enableDebug = false,
  chadState = null
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

  // Use Chad reveal state management (either passed in or create our own)
  const internalChadState = useChadReveal({
    revealAnimationDuration: options.chadRevealAnimationDuration || 800,
    revealDelay: options.chadRevealDelay || 300,
    enablePersistence: options.enableChadPersistence !== false
  });

  const chadRevealState = chadState || internalChadState;

  // Debug information (when debug mode is enabled)
  React.useEffect(() => {
    if (enableDebug) {
      console.log('RobotGraphicContainer Debug:', {
        currentState,
        isTransitioning,
        robotRelevantState,
        stateHistoryLength: stateHistory.length,
        debug,
        chadState: {
          isRevealed: chadRevealState.isRevealed,
          isRevealing: chadRevealState.isRevealing,
          storageAvailable: chadRevealState.storageAvailable,
          fallbackMode: chadRevealState.fallbackMode
        }
      });
    }
  }, [currentState, isTransitioning, robotRelevantState, stateHistory.length, debug, enableDebug, chadRevealState]);

  // Build enhanced className with state information
  const enhancedClassName = [
    className,
    isTransitioning && 'robot-transitioning',
    `robot-container-${currentState}`
  ].filter(Boolean).join(' ');

  // Enhanced aria label with transition and Chad information
  const enhancedAriaLabel = ariaLabel || (
    isTransitioning
      ? `${chadRevealState.isRevealed ? 'Chad' : 'Robot'} is transitioning to ${currentState} state`
      : `${chadRevealState.isRevealed ? 'Chad' : 'Robot'} is in ${currentState} state`
  );

  return (
    <div
      className={`robot-graphic-container ${enhancedClassName}`}
      data-testid="robot-graphic-container"
      data-current-state={currentState}
      data-is-transitioning={isTransitioning}
      data-is-chad={chadRevealState.isRevealed}
      data-chad-revealing={chadRevealState.isRevealing}
    >
      <RobotGraphic
        currentState={currentState}
        size={size}
        className={className}
        ariaLabel={enhancedAriaLabel}
        isChad={chadRevealState.isRevealed}
      />

      {/* Debug panel (when debug mode is enabled) */}
      {enableDebug && (
        <RobotDebugPanel
          currentState={currentState}
          isTransitioning={isTransitioning}
          stateHistory={stateHistory}
          appState={robotRelevantState}
          getStateInfo={getStateInfo}
          chadRevealState={chadRevealState}
        />
      )}
    </div>
  );
};

/**
 * Debug panel component for development
 * Shows current state, history, Chad state, and allows manual state testing
 */
const RobotDebugPanel = ({
  currentState,
  isTransitioning,
  stateHistory,
  appState,
  getStateInfo,
  chadRevealState
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

        {/* Chad state information */}
        <div className="border-t border-gray-600 pt-1 mt-2">
          <div className="font-bold text-xs mb-1">Chad State</div>
          <div>Revealed: {chadRevealState.isRevealed ? 'Yes' : 'No'}</div>
          <div>Revealing: {chadRevealState.isRevealing ? 'Yes' : 'No'}</div>
          <div>Storage: {chadRevealState.storageAvailable ? 'Available' : 'Unavailable'}</div>
          {chadRevealState.fallbackMode && (
            <div className="text-yellow-300">Fallback Mode</div>
          )}
          {chadRevealState.error && (
            <div className="text-red-300">Error: {chadRevealState.error}</div>
          )}
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer">App State</summary>
          <pre className="text-xs mt-1 overflow-auto max-h-20">
            {JSON.stringify(appState, null, 2)}
          </pre>
        </details>

        {/* Chad debug controls (development only) */}
        {import.meta.env.DEV && (
          <details className="mt-2">
            <summary className="cursor-pointer">Chad Controls</summary>
            <div className="text-xs mt-1 space-y-1">
              <button
                onClick={() => chadRevealState.revealChad()}
                disabled={chadRevealState.isRevealed || chadRevealState.isRevealing}
                className="block w-full text-left px-1 py-0.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white"
              >
                Reveal Chad
              </button>
              <button
                onClick={() => chadRevealState.resetReveal()}
                className="block w-full text-left px-1 py-0.5 bg-red-600 hover:bg-red-700 rounded text-white"
              >
                Reset Chad
              </button>
              <button
                onClick={() => chadRevealState.forceReveal(!chadRevealState.isRevealed)}
                className="block w-full text-left px-1 py-0.5 bg-yellow-600 hover:bg-yellow-700 rounded text-white"
              >
                Toggle Chad
              </button>
            </div>
          </details>
        )}

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
    enableTransitions: PropTypes.bool,
    chadRevealAnimationDuration: PropTypes.number,
    chadRevealDelay: PropTypes.number,
    enableChadPersistence: PropTypes.bool
  }),
  enableDebug: PropTypes.bool,
  chadState: PropTypes.shape({
    isRevealed: PropTypes.bool.isRequired,
    isRevealing: PropTypes.bool.isRequired,
    storageAvailable: PropTypes.bool.isRequired,
    fallbackMode: PropTypes.bool.isRequired,
    error: PropTypes.string,
    revealChad: PropTypes.func.isRequired,
    resetReveal: PropTypes.func,
    forceReveal: PropTypes.func
  })
};

RobotDebugPanel.propTypes = {
  currentState: PropTypes.string.isRequired,
  isTransitioning: PropTypes.bool.isRequired,
  stateHistory: PropTypes.array.isRequired,
  appState: PropTypes.object.isRequired,
  getStateInfo: PropTypes.func.isRequired,
  chadRevealState: PropTypes.shape({
    isRevealed: PropTypes.bool.isRequired,
    isRevealing: PropTypes.bool.isRequired,
    storageAvailable: PropTypes.bool.isRequired,
    fallbackMode: PropTypes.bool.isRequired,
    error: PropTypes.string,
    revealChad: PropTypes.func.isRequired,
    resetReveal: PropTypes.func.isRequired,
    forceReveal: PropTypes.func.isRequired
  }).isRequired
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
  const chadRevealState = useChadReveal(options);

  return {
    // Robot component ready to use
    RobotComponent: (props) => (
      <RobotGraphic
        currentState={robotState.currentState}
        isChad={chadRevealState.isRevealed}
        {...props}
      />
    ),

    // Container component with full integration
    RobotContainer: (props) => (
      <RobotGraphicContainer
        appState={appState}
        {...props}
      />
    ),

    // State information
    currentState: robotState.currentState,
    isTransitioning: robotState.isTransitioning,
    stateHistory: robotState.stateHistory,

    // Chad state information
    isChad: chadRevealState.isRevealed,
    isChadRevealing: chadRevealState.isRevealing,
    chadRevealState,

    // Control functions
    forceUpdate: robotState.forceUpdate,
    getStateInfo: robotState.getStateInfo,
    clearHistory: robotState.clearHistory,
    revealChad: chadRevealState.revealChad,
    resetChad: chadRevealState.resetReveal
  };
}