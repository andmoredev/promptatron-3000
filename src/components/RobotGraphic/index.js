/**
 * @fileoverview Robot Graphic component exports
 */

// Export all state definitions and constants
export {
  ROBOT_STATES,
  ANIMATION_CONFIGS,
  SIZE_CONFIGS,
  DEFAULT_CONFIG,
  getRobotState,
  isValidRobotState
} from './robotStates.js';

// Export PropTypes definitions
export {
  robotStateKeyPropType,
  robotExpressionPropType,
  robotSizePropType,
  animationTimingPropType,
  robotStatePropType,
  animationConfigPropType,
  robotGraphicPropTypes,
  robotFacePropTypes,
  robotGraphicDefaultProps,
  robotFaceDefaultProps
} from './propTypes.js';

// Export main components
export { default as RobotGraphic } from './RobotGraphic.jsx';
export { default as RobotFace } from './RobotFace.jsx';

// Export accessibility utilities
export {
  announceToScreenReader,
  getRobotAriaAttributes,
  shouldDisableAnimations
} from './accessibility.js';

// State management integration utilities
export {
  mapAppStateToRobotState,
  detectStateChange,
  validateAppState,
  extractRobotRelevantState,
  createDebouncedStateHandler,
  createRobotStateComparison
} from './stateMapping.js';

export {
  useRobotState,
  useRobotStateComparison,
  useOptimizedRobotState
} from './useRobotState.js';

export {
  withRobotStateOptimization,
  withRobotStateMonitoring,
  createOptimizedRobotGraphic,
  useRenderTracking
} from './withRobotStateOptimization.jsx';

export {
  default as RobotGraphicContainer,
  UnoptimizedRobotGraphicContainer,
  useRobotIntegration
} from './RobotGraphicContainer.jsx';

// Type definitions are available via JSDoc comments in types.js