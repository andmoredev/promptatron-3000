/**
 * @fileoverview FloatingChad component that displays Chad as a floating companion
 */

import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import ChadFace from "./ChadFace.jsx";
import { getRobotState } from "./robotStates.js";
import { shouldDisableAnimations } from "./accessibility.js";
import "./RobotFaceAnimations.css";

/**
 * FloatingChad component that displays Chad as a floating companion in the bottom-left corner
 * @param {Object} props - Component props
 * @param {boolean} props.isVisible - Whether the floating Chad should be visible
 * @param {string} props.currentState - Current application state for expression synchronization
 * @param {string} [props.size='sm'] - Size variant for the floating Chad
 * @param {Object} [props.position] - Custom positioning properties
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element|null} The FloatingChad component or null if not visible
 */
const FloatingChad = ({
  isVisible,
  currentState,
  size = "sm",
  position = { bottom: "20px", left: "20px" },
  className = "",
}) => {
  const [hasEntered, setHasEntered] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Get the robot state configuration based on the current state
  const robotState = getRobotState(currentState);

  // Check for accessibility preferences
  const animationsDisabled = shouldDisableAnimations();

  // Handle entrance animation
  useEffect(() => {
    if (isVisible && !hasEntered) {
      setIsAnimating(true);
      setHasEntered(true);

      // Complete entrance animation after duration
      if (!animationsDisabled) {
        const timer = setTimeout(() => {
          setIsAnimating(false);
        }, 600); // Match entrance animation duration

        return () => clearTimeout(timer);
      } else {
        setIsAnimating(false);
      }
    } else if (!isVisible && hasEntered) {
      setHasEntered(false);
      setIsAnimating(false);
    }
  }, [isVisible, hasEntered, animationsDisabled]);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // Size configurations for floating Chad - responsive to screen size
  const sizeConfigs = {
    sm: { width: 80, height: 80, scale: 1.2 },
    md: { width: 100, height: 100, scale: 1.5 },
    lg: { width: 120, height: 120, scale: 1.8 },
  };

  const sizeConfig = sizeConfigs[size] || sizeConfigs.sm;

  // Build CSS classes
  const cssClasses = [
    "floating-chad",
    `floating-chad-${size}`,
    `floating-chad-state-${robotState.key}`,
    hasEntered && "floating-chad-entered",
    isAnimating && "floating-chad-animating",
    animationsDisabled && "floating-chad-no-animations",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Note: Responsive positioning is handled via CSS media queries in the style object

  return (
    <div
      className={`${cssClasses} responsive-chad`}
      style={{
        position: "fixed",
        top: position.top || "auto",
        bottom: position.bottom || "20px",
        left: position.left || "20px",
        right: position.right || "auto",
        width: `${sizeConfig.width}px`,
        height: `${sizeConfig.height}px`,
        zIndex: 1000,
        pointerEvents: "none", // Don't block clicks
        transition: animationsDisabled ? "none" : "all 0.3s ease-in-out",
        transform: position.transform
          ? `${position.transform} scale(${sizeConfig.scale})`
          : `scale(${sizeConfig.scale})`,
        transformOrigin: "bottom left",
      }}
      role="img"
      aria-label={`Chad companion - ${robotState.ariaLabel}`}
      aria-hidden="true" // Decorative element
      data-testid="floating-chad"
      data-state={robotState.key}
      data-expression={robotState.expression}
    >
      {/* Hidden text for screen readers */}
      <span className="sr-only">
        Chad companion is {robotState.ariaLabel.toLowerCase()}
      </span>

      {/* Chad face with current expression */}
      <div className="floating-chad-face">
        <ChadFace
          expression={robotState.expression}
          animated={!animationsDisabled}
          size={size}
        />
      </div>

      {/* Subtle glow effect for visibility */}
      <div
        className="floating-chad-glow"
        style={{
          position: "absolute",
          top: "-2px",
          left: "-2px",
          right: "-2px",
          bottom: "-2px",
          background:
            "radial-gradient(circle, rgba(37, 99, 235, 0.1) 0%, transparent 70%)",
          borderRadius: "50%",
          zIndex: -1,
          opacity: animationsDisabled ? 0 : 0.6,
        }}
      />
    </div>
  );
};

FloatingChad.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  currentState: PropTypes.oneOf(["idle", "thinking", "talking", "error"])
    .isRequired,
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  position: PropTypes.shape({
    bottom: PropTypes.string,
    left: PropTypes.string,
    right: PropTypes.string,
    top: PropTypes.string,
  }),
  className: PropTypes.string,
};

FloatingChad.defaultProps = {
  size: "sm",
  position: { bottom: "20px", left: "20px" },
  className: "",
};

export default FloatingChad;
