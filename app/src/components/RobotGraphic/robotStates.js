/**
 * @fileoverview Robot state definitions and constants
 */

/**
 * Robot state definitions mapping application states to robot expressions and behaviors
 * @type {Object.<string, import('./types.js').RobotState>}
 */
export const ROBOT_STATES = {
  IDLE: {
    key: 'idle',
    expression: 'happy',
    ariaLabel: 'Robot is ready and waiting',
    animations: ['blink', 'subtle-breathing'],
    transitionDuration: 300
  },
  THINKING: {
    key: 'thinking',
    expression: 'thinking',
    ariaLabel: 'Robot is processing your request',
    animations: ['thinking-indicator'],
    transitionDuration: 200
  },
  TALKING: {
    key: 'talking',
    expression: 'talking',
    ariaLabel: 'Robot is generating response',
    animations: ['mouth-movement', 'active-indicator'],
    transitionDuration: 150
  },
  ERROR: {
    key: 'error',
    expression: 'concerned',
    ariaLabel: 'Robot encountered an error',
    animations: ['error-indicator'],
    transitionDuration: 250
  }
};

/**
 * Animation configurations for different robot behaviors
 * @type {Object.<string, import('./types.js').AnimationConfig>}
 */
export const ANIMATION_CONFIGS = {
  blink: {
    name: 'blink',
    duration: 150,
    timing: 'ease-in-out',
    iterations: 'infinite',
    respectsMotionPreference: false
  },
  'subtle-breathing': {
    name: 'subtle-breathing',
    duration: 3000,
    timing: 'ease-in-out',
    iterations: 'infinite',
    respectsMotionPreference: true
  },
  'thinking-indicator': {
    name: 'thinking-indicator',
    duration: 1500,
    timing: 'ease-in-out',
    iterations: 'infinite',
    respectsMotionPreference: true
  },
  'mouth-movement': {
    name: 'mouth-movement',
    duration: 800,
    timing: 'ease-in-out',
    iterations: 'infinite',
    respectsMotionPreference: true
  },
  'active-indicator': {
    name: 'active-indicator',
    duration: 2000,
    timing: 'ease-in-out',
    iterations: 'infinite',
    respectsMotionPreference: true
  },
  'error-indicator': {
    name: 'error-indicator',
    duration: 1000,
    timing: 'ease-in-out',
    iterations: 3,
    respectsMotionPreference: true
  }
};

/**
 * Size configurations for different robot variants
 * @type {Object.<string, {width: number, height: number, className: string}>}
 */
export const SIZE_CONFIGS = {
  sm: {
    width: 48,
    height: 48,
    className: 'robot-size-sm'
  },
  md: {
    width: 64,
    height: 64,
    className: 'robot-size-md'
  },
  lg: {
    width: 96,
    height: 96,
    className: 'robot-size-lg'
  }
};

/**
 * Default robot configuration
 */
export const DEFAULT_CONFIG = {
  state: ROBOT_STATES.IDLE,
  size: 'md',
  animationsEnabled: true,
  transitionDuration: 300
};

/**
 * Utility function to get robot state by key
 * @param {string} stateKey - The state key to look up
 * @returns {import('./types.js').RobotState} The robot state object
 */
export function getRobotState(stateKey) {
  const stateMap = {
    idle: ROBOT_STATES.IDLE,
    thinking: ROBOT_STATES.THINKING,
    talking: ROBOT_STATES.TALKING,
    error: ROBOT_STATES.ERROR
  };

  return stateMap[stateKey] || ROBOT_STATES.IDLE;
}

/**
 * Utility function to validate robot state key
 * @param {string} stateKey - The state key to validate
 * @returns {boolean} Whether the state key is valid
 */
export function isValidRobotState(stateKey) {
  return ['idle', 'thinking', 'talking', 'error'].includes(stateKey);
}