/**
 * @fileoverview Main RobotGraphic component with SVG-based facial expressions
 */

import React from "react";
import {
  robotGraphicPropTypes,
  robotGraphicDefaultProps,
} from "./propTypes.js";
import { getRobotState, SIZE_CONFIGS } from "./robotStates.js";
import RobotFace from "./RobotFace.jsx";
import "./RobotGraphic.css";
import "./RobotFaceAnimations.css";

/**
 * RobotGraphic component that displays a robot with different facial expressions
 * based on the current application state
 *
 * @param {Object} props - Component props
 * @param {string} props.currentState - Current robot state ('idle', 'thinking', 'talking', 'error')
 * @param {string} [props.size='md'] - Size variant ('sm', 'md', 'lg')
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {string} [props.ariaLabel] - Custom accessibility label
 * @returns {JSX.Element} The RobotGraphic component
 */
const RobotGraphic = ({ currentState, size, className, ariaLabel }) => {
  // Get the robot state configuration based on the current state
  const robotState = getRobotState(currentState);

  // Get size configuration
  const sizeConfig = SIZE_CONFIGS[size];

  // Determine the aria label to use
  const effectiveAriaLabel = ariaLabel || robotState.ariaLabel;

  // Build CSS classes
  const cssClasses = [
    "robot-graphic",
    sizeConfig.className,
    `robot-state-${robotState.key}`,
    `robot-expression-${robotState.expression}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cssClasses}
      role="img"
      aria-label={effectiveAriaLabel}
      style={{
        width: sizeConfig.width,
        height: sizeConfig.height,
        transition: `all ${robotState.transitionDuration}ms ease-in-out`,
      }}
      data-testid="robot-graphic"
      data-state={robotState.key}
      data-expression={robotState.expression}
    >
      {/* SVG-based robot face with expressions */}
      <div className="robot-face" data-testid="robot-face">
        <RobotFace
          expression={robotState.expression}
          animated={true}
          size={size}
        />
      </div>
    </div>
  );
};

// Set prop types and default props
RobotGraphic.propTypes = robotGraphicPropTypes;
RobotGraphic.defaultProps = robotGraphicDefaultProps;

export default RobotGraphic;
