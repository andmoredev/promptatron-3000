/**
 * @fileoverview FloatingChad component that displays Chad as a floating companion
 */

import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import ChadFace from "./ChadFace.jsx";
import { getRobotState } from "./robotStates.js";
import { shouldDisableAnimations } from "./accessibility.js";
import { useDraggable } from "../../hooks/useDraggable.js";
import "./RobotFaceAnimations.css";

/**
 * FloatingChad component that displays Chad as a floating companion that can be dragged around
 * @param {Object} props - Component props
 * @param {boolean} props.isVisible - Whether the floating Chad should be visible
 * @param {string} props.currentState - Current application state for expression synchronization
 * @param {string} [props.size='sm'] - Size variant for the floating Chad
 * @param {Object} [props.position] - Custom positioning properties (legacy support)
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {boolean} [props.draggable=true] - Whether Chad can be dragged
 * @param {function} [props.onPositionChange] - Callback when position changes
 * @returns {JSX.Element|null} The FloatingChad component or null if not visible
 */
const FloatingChad = ({
  isVisible,
  currentState,
  size = "sm",
  position = null, // Legacy position prop, now handled by draggable hook
  className = "",
  draggable = true,
  onPositionChange,
}) => {
  const [hasEntered, setHasEntered] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Get the robot state configuration based on the current state
  const robotState = getRobotState(currentState);

  // Check for accessibility preferences
  const animationsDisabled = shouldDisableAnimations();

  const getDefaultPosition = () => {
    if (position) {
      // Convert CSS position values to pixel coordinates
      const defaultX = position.left ? parseInt(position.left) || 20 : 20;
      const defaultY = position.top ? parseInt(position.top) || 20 :
        position.bottom ? window.innerHeight - parseInt(position.bottom) - 100 : 20;
      return { x: defaultX, y: defaultY };
    }
    return { x: 20, y: 20 }; // Default bottom-left position
  };

  // Initialize draggable functionality
  const {
    isDragging,
    position: dragPosition,
    dragRef,
    onPointerDown,
    onMouseDown,
    onTouchStart,
    onKeyDown,
  } = useDraggable({
    constrainToViewport: true,
    persistPosition: true,
    persistKey: 'floating_chad_position',
    defaultPosition: getDefaultPosition(),
    disabled: !draggable
  });

  // Notify parent of position changes
  useEffect(() => {
    if (onPositionChange && dragPosition) {
      onPositionChange(dragPosition);
    }
  }, [dragPosition, onPositionChange]);

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
    sm: { width: 80, height: 80, baseScale: 1.2 },
    md: { width: 100, height: 100, baseScale: 1.5 },
    lg: { width: 120, height: 120, baseScale: 1.8 },
  };

  const sizeConfig = sizeConfigs[size] || sizeConfigs.sm;

  // Calculate responsive scale based on screen size
  const getResponsiveScale = () => {
    const screenWidth = window.innerWidth;
    let responsiveMultiplier = 1;

    if (screenWidth >= 1536) {
      responsiveMultiplier = 1.6;
    } else if (screenWidth >= 1280) {
      responsiveMultiplier = 1.4;
    } else if (screenWidth >= 1024) {
      responsiveMultiplier = 1.2;
    } else if (screenWidth <= 768) {
      responsiveMultiplier = 0.9;
    }

    return sizeConfig.baseScale * responsiveMultiplier;
  };

  const [responsiveScale, setResponsiveScale] = useState(() => getResponsiveScale());

  // Update responsive scale on window resize
  useEffect(() => {
    const handleResize = () => {
      setResponsiveScale(getResponsiveScale());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [size]);

  // Build CSS classes
  const cssClasses = [
    "floating-chad",
    `floating-chad-${size}`,
    `floating-chad-state-${robotState.key}`,
    hasEntered && "floating-chad-entered",
    isAnimating && "floating-chad-animating",
    animationsDisabled && "floating-chad-no-animations",
    isDragging && "floating-chad-dragging",
    draggable && "floating-chad-draggable",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={dragRef}
      className={`${cssClasses} responsive-chad`}
      style={{
        position: "fixed",
        left: `${dragPosition.x}px`,
        right: "auto",
        top: `${dragPosition.y}px`,
        bottom: "auto",
        width: `${sizeConfig.width}px`,
        height: `${sizeConfig.height}px`,
        zIndex: isDragging ? 10000 : 9999, // Higher z-index when dragging
        pointerEvents: draggable ? "auto" : "none", // Allow interaction when draggable
        transition: isDragging || animationsDisabled ? "none" : "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: `scale(${responsiveScale})`,
        transformOrigin: "center",
        userSelect: "none", // Prevent text selection during drag
        touchAction: "none", // Ensure touch dragging works in all directions
      }}
      draggable={false}
      role="img"
      aria-label={`Chad companion - ${robotState.ariaLabel}${draggable ? '. Click and drag to reposition, or use arrow keys.' : ''}`}
      aria-hidden="false" // Make interactive when draggable
      data-testid="floating-chad"
      data-state={robotState.key}
      data-expression={robotState.expression}
      tabIndex={draggable ? 0 : -1} // Make focusable when draggable
      onPointerDown={draggable ? onPointerDown : undefined}
      onMouseDown={draggable ? onMouseDown : undefined}
      onTouchStart={draggable ? onTouchStart : undefined}
      onKeyDown={draggable ? onKeyDown : undefined}
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
  }), // Legacy support
  className: PropTypes.string,
  draggable: PropTypes.bool,
  onPositionChange: PropTypes.func,
};

FloatingChad.defaultProps = {
  size: "sm",
  position: null,
  className: "",
  draggable: true,
  onPositionChange: null,
};

export default FloatingChad;
