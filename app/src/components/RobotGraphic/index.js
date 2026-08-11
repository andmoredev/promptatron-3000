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
export { default as ChadFace } from './ChadFace.jsx';
export { default as FloatingChad } from './FloatingChad.jsx';

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

// Chad personality components and hooks
export { default as ChadRevealButton } from './ChadRevealButton.jsx';
export { useChadReveal } from './useChadReveal.js';



export {
  default as RobotGraphicContainer,
  useRobotIntegration
} from './RobotGraphicContainer.jsx';

// Type definitions are available via JSDoc comments in types.js
