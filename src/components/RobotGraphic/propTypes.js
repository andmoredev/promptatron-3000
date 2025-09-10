/**
 * @fileoverview PropTypes definitions for Robot Graphic components
 */

import PropTypes from 'prop-types';

/**
 * PropTypes for robot state keys
 */
export const robotStateKeyPropType = PropTypes.oneOf(['idle', 'thinking', 'talking', 'error']);

/**
 * PropTypes for robot expressions
 */
export const robotExpressionPropType = PropTypes.oneOf(['happy', 'thinking', 'talking', 'concerned']);

/**
 * PropTypes for robot sizes
 */
export const robotSizePropType = PropTypes.oneOf(['sm', 'md', 'lg']);

/**
 * PropTypes for animation timing functions
 */
export const animationTimingPropType = PropTypes.oneOf(['ease', 'ease-in', 'ease-out', 'ease-in-out']);

/**
 * PropTypes for RobotState object
 */
export const robotStatePropType = PropTypes.shape({
  key: robotStateKeyPropType.isRequired,
  expression: robotExpressionPropType.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  animations: PropTypes.arrayOf(PropTypes.string).isRequired,
  transitionDuration: PropTypes.number
});

/**
 * PropTypes for AnimationConfig object
 */
export const animationConfigPropType = PropTypes.shape({
  name: PropTypes.string.isRequired,
  duration: PropTypes.number.isRequired,
  timing: animationTimingPropType.isRequired,
  iterations: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf(['infinite'])]).isRequired,
  respectsMotionPreference: PropTypes.bool.isRequired
});

/**
 * PropTypes for RobotGraphic component
 */
export const robotGraphicPropTypes = {
  currentState: robotStateKeyPropType.isRequired,
  size: robotSizePropType,
  className: PropTypes.string,
  ariaLabel: PropTypes.string
};

/**
 * PropTypes for RobotFace component
 */
export const robotFacePropTypes = {
  expression: robotExpressionPropType.isRequired,
  animated: PropTypes.bool,
  size: robotSizePropType,
  theme: PropTypes.object
};

/**
 * Default props for RobotGraphic component
 */
export const robotGraphicDefaultProps = {
  size: 'md',
  className: '',
  ariaLabel: null
};

/**
 * Default props for RobotFace component
 */
export const robotFaceDefaultProps = {
  animated: true,
  size: 'md',
  theme: null
};