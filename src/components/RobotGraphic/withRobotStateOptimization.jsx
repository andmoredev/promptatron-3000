/**
 * @fileoverview Higher-order component for optimizing RobotGraphic performance
 * Uses React.memo with custom comparison function to prevent unnecessary re-renders
 */

import React from 'react';
import { createRobotStateComparison } from './stateMapping.js';

/**
 * Higher-order component that optimizes RobotGraphic rendering performance
 * Only re-renders when robot-relevant state changes
 * @param {React.Component} WrappedComponent - Component to optimize
 * @returns {React.Component} Optimized component
 */
export function withRobotStateOptimization(WrappedComponent) {
  const OptimizedComponent = React.memo(WrappedComponent, (prevProps, nextProps) => {
    // Use the state comparison function from stateMapping
    return createRobotStateComparison(prevProps, nextProps);
  });

  // Set display name for debugging
  OptimizedComponent.displayName = `withRobotStateOptimization(${WrappedComponent.displayName || WrappedComponent.name})`;

  return OptimizedComponent;
}

/**
 * Performance monitoring wrapper that tracks render counts and reasons
 * Useful for development and debugging
 * @param {React.Component} WrappedComponent - Component to monitor
 * @param {Object} options - Monitoring options
 * @returns {React.Component} Monitored component
 */
export function withRobotStateMonitoring(WrappedComponent, options = {}) {
  const { enableLogging = false, logPrefix = 'RobotGraphic' } = options;

  let renderCount = 0;
  let lastRenderReason = null;

  const MonitoredComponent = React.memo(WrappedComponent, (prevProps, nextProps) => {
    const shouldSkipRender = createRobotStateComparison(prevProps, nextProps);

    if (!shouldSkipRender) {
      renderCount++;
      lastRenderReason = getRenderReason(prevProps, nextProps);

      if (enableLogging) {
        console.log(`${logPrefix} render #${renderCount}: ${lastRenderReason}`);
      }
    }

    return shouldSkipRender;
  });

  // Add debug methods to the component
  MonitoredComponent.getRenderCount = () => renderCount;
  MonitoredComponent.getLastRenderReason = () => lastRenderReason;
  MonitoredComponent.resetRenderCount = () => {
    renderCount = 0;
    lastRenderReason = null;
  };

  MonitoredComponent.displayName = `withRobotStateMonitoring(${WrappedComponent.displayName || WrappedComponent.name})`;

  return MonitoredComponent;
}

/**
 * Determines the reason for a component re-render
 * @param {Object} prevProps - Previous props
 * @param {Object} nextProps - Next props
 * @returns {string} Reason for re-render
 */
function getRenderReason(prevProps, nextProps) {
  const reasons = [];

  // Check app state changes
  if (prevProps.appState !== nextProps.appState) {
    const prevRobotState = prevProps.appState ? mapAppStateToRobotState(prevProps.appState) : 'idle';
    const nextRobotState = nextProps.appState ? mapAppStateToRobotState(nextProps.appState) : 'idle';

    if (prevRobotState !== nextRobotState) {
      reasons.push(`robot state changed (${prevRobotState} -> ${nextRobotState})`);
    } else {
      reasons.push('app state changed (no robot state impact)');
    }
  }

  // Check other prop changes
  if (prevProps.size !== nextProps.size) {
    reasons.push(`size changed (${prevProps.size} -> ${nextProps.size})`);
  }

  if (prevProps.className !== nextProps.className) {
    reasons.push('className changed');
  }

  if (prevProps.ariaLabel !== nextProps.ariaLabel) {
    reasons.push('ariaLabel changed');
  }

  if (prevProps.currentState !== nextProps.currentState) {
    reasons.push(`currentState prop changed (${prevProps.currentState} -> ${nextProps.currentState})`);
  }

  return reasons.length > 0 ? reasons.join(', ') : 'unknown reason';
}

/**
 * Creates a memoized version of RobotGraphic with custom comparison
 * @param {React.Component} RobotGraphicComponent - The RobotGraphic component
 * @param {Object} options - Optimization options
 * @returns {React.Component} Optimized RobotGraphic component
 */
export function createOptimizedRobotGraphic(RobotGraphicComponent, options = {}) {
  const {
    enableMonitoring = false,
    enableLogging = false,
    logPrefix = 'RobotGraphic'
  } = options;

  let OptimizedComponent = RobotGraphicComponent;

  // Apply performance optimization
  OptimizedComponent = withRobotStateOptimization(OptimizedComponent);

  // Apply monitoring if enabled
  if (enableMonitoring) {
    OptimizedComponent = withRobotStateMonitoring(OptimizedComponent, {
      enableLogging,
      logPrefix
    });
  }

  return OptimizedComponent;
}

/**
 * Hook for tracking component render performance
 * @param {string} componentName - Name of the component being tracked
 * @param {Object} props - Current component props
 * @returns {Object} Performance tracking data
 */
export function useRenderTracking(componentName, props) {
  const renderCountRef = React.useRef(0);
  const lastRenderTimeRef = React.useRef(Date.now());
  const propsHistoryRef = React.useRef([]);

  React.useEffect(() => {
    renderCountRef.current++;
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTimeRef.current;

    // Keep history of last 10 renders
    propsHistoryRef.current = [
      ...propsHistoryRef.current.slice(-9),
      {
        renderCount: renderCountRef.current,
        timestamp: now,
        timeSinceLastRender,
        props: { ...props }
      }
    ];

    lastRenderTimeRef.current = now;
  });

  return {
    renderCount: renderCountRef.current,
    getHistory: () => propsHistoryRef.current,
    getAverageRenderTime: () => {
      const history = propsHistoryRef.current;
      if (history.length < 2) return 0;

      const times = history.slice(1).map(entry => entry.timeSinceLastRender);
      return times.reduce((sum, time) => sum + time, 0) / times.length;
    },
    reset: () => {
      renderCountRef.current = 0;
      propsHistoryRef.current = [];
      lastRenderTimeRef.current = Date.now();
    }
  };
}

// Import mapAppStateToRobotState for use in getRenderReason
import { mapAppStateToRobotState } from './stateMapping.js';