/**
 * @fileoverview Main RobotGraphic component with SVG-based facial expressions
 */

import { useEffect, useRef } from "react";
import {
  robotGraphicPropTypes,
  robotGraphicDefaultProps,
} from "./propTypes.js";
import { getRobotState, SIZE_CONFIGS } from "./robotStates.js";
import RobotFace from "./RobotFace.jsx";
import ChadFace from "./ChadFace.jsx";
import {
  announceToScreenReader,
  getRobotAriaAttributes,
  shouldDisableAnimations
} from "./accessibility.js";
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
 * @param {boolean} [props.isChad=false] - Whether to render Chad personality instead of original robot
 * @returns {JSX.Element} The RobotGraphic component
 */
const RobotGraphic = ({ currentState, size, className, ariaLabel, isChad }) => {
  // Refs for accessibility
  const robotRef = useRef(null);
  const previousStateRef = useRef(currentState);
  const announcementTimeoutRef = useRef(null);

  // Get the robot state configuration based on the current state
  const robotState = getRobotState(currentState);

  // Get size configuration
  const sizeConfig = SIZE_CONFIGS[size];

  // Get accessibility attributes
  const ariaAttributes = getRobotAriaAttributes(currentState, previousStateRef.current);
  const baseAriaLabel = ariaLabel || ariaAttributes['aria-label'];
  const effectiveAriaLabel = isChad ? `Chad ${baseAriaLabel}` : baseAriaLabel;

  // Handle state change announcements for screen readers
  useEffect(() => {
    const previousState = previousStateRef.current;

    if (previousState !== currentState && robotRef.current) {
      // Clear any existing timeout
      if (announcementTimeoutRef.current) {
        clearTimeout(announcementTimeoutRef.current);
      }

      // Announce state change to screen readers with a slight delay
      // to ensure the visual change has occurred
      announcementTimeoutRef.current = setTimeout(() => {
        const announcement = getStateChangeAnnouncement(previousState, currentState);
        announceToScreenReader(announcement, 'polite');
      }, 100);

      previousStateRef.current = currentState;
    }

    // Cleanup timeout on unmount
    return () => {
      if (announcementTimeoutRef.current) {
        clearTimeout(announcementTimeoutRef.current);
      }
    };
  }, [currentState]);

  // Check for accessibility preferences
  const animationsDisabled = shouldDisableAnimations();

  // Build CSS classes
  const cssClasses = [
    "robot-graphic",
    sizeConfig.className,
    `robot-state-${robotState.key}`,
    `robot-expression-${robotState.expression}`,
    isChad && "robot-chad-personality",
    animationsDisabled && "robot-no-animations",
    className,
  ]
    .filter(Boolean)
    .join(" ");



  return (
    <div
      ref={robotRef}
      className={cssClasses}
      role="img"
      aria-label={effectiveAriaLabel}
      aria-live="polite"
      aria-atomic="true"
      style={{
        width: sizeConfig.width,
        height: sizeConfig.height,
        transition: animationsDisabled ? 'none' : `all ${robotState.transitionDuration}ms ease-in-out`,
      }}
      data-testid="robot-graphic"
      data-state={robotState.key}
      data-expression={robotState.expression}
    >
      {/* Hidden text for screen readers that describes current state */}
      <span className="sr-only" aria-live="polite">
        {effectiveAriaLabel}
      </span>

      {/* SVG-based robot face with expressions */}
      <div className="robot-face" data-testid="robot-face">
        {isChad ? (
          <ChadFace
            expression={robotState.expression}
            animated={!animationsDisabled}
            size={size}
          />
        ) : (
          <RobotFace
            expression={robotState.expression}
            animated={!animationsDisabled}
            size={size}
          />
        )}
      </div>
    </div>
  );
};

/**
 * Creates an announcement message for state changes
 * @param {string} previousState - The previous robot state
 * @param {string} currentState - The current robot state
 * @returns {string} Announcement message for screen readers
 */
const getStateChangeAnnouncement = (previousState, currentState) => {
  const stateMessages = {
    idle: "Robot is now ready and waiting",
    thinking: "Robot is now processing your request",
    talking: "Robot is now generating a response",
    error: "Robot has encountered an error"
  };

  const currentMessage = stateMessages[currentState] || stateMessages.idle;

  // Add context about the transition for better user understanding
  if (previousState && previousState !== currentState) {
    return `Status changed: ${currentMessage}`;
  }

  return currentMessage;
};



// Set prop types and default props
RobotGraphic.propTypes = robotGraphicPropTypes;
RobotGraphic.defaultProps = robotGraphicDefaultProps;

export default RobotGraphic;
