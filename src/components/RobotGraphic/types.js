/**
 * @fileoverview Type definitions and interfaces for Robot Graphic component
 */

/**
 * @typedef {'idle' | 'thinking' | 'talking' | 'error'} RobotStateKey
 */

/**
 * @typedef {'happy' | 'thinking' | 'talking' | 'concerned'} RobotExpression
 */

/**
 * @typedef {'sm' | 'md' | 'lg'} RobotSize
 */

/**
 * @typedef {Object} RobotState
 * @property {RobotStateKey} key - The state identifier
 * @property {RobotExpression} expression - The facial expression to display
 * @property {string} ariaLabel - Accessibility label for screen readers
 * @property {string[]} animations - Array of animation names to apply
 * @property {number} [transitionDuration] - Optional transition duration in ms
 */

/**
 * @typedef {Object} AnimationConfig
 * @property {string} name - Animation name
 * @property {number} duration - Animation duration in ms
 * @property {'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'} timing - Animation timing function
 * @property {number | 'infinite'} iterations - Number of iterations or 'infinite'
 * @property {boolean} respectsMotionPreference - Whether to respect prefers-reduced-motion
 */

/**
 * @typedef {Object} RobotGraphicProps
 * @property {RobotStateKey} currentState - Current robot state
 * @property {RobotSize} [size] - Size variant (default: 'md')
 * @property {string} [className] - Additional CSS classes
 * @property {string} [ariaLabel] - Custom accessibility label
 */

/**
 * @typedef {Object} RobotFaceProps
 * @property {RobotExpression} expression - Facial expression to display
 * @property {boolean} [animated] - Whether to enable animations (default: true)
 * @property {Object} [theme] - Theme colors object
 */

export {};