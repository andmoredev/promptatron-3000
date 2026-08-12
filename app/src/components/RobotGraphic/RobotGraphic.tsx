/**
 * @fileoverview Main RobotGraphic component with SVG-based facial expressions
 */

import { useEffect, useRef } from 'react'
import { getRobotState, SIZE_CONFIGS } from './robotStates'
import RobotFace from './RobotFace'
import ChadFace from './ChadFace'
import {
  announceToScreenReader,
  getRobotAriaAttributes,
  shouldDisableAnimations
} from './accessibility'
import type { RobotGraphicProps } from './types'
import './RobotGraphic.css'
import './RobotFaceAnimations.css'

/**
 * RobotGraphic component that displays a robot with different facial expressions
 * based on the current application state
 */
const RobotGraphic = ({ currentState, size = 'md', className = '', ariaLabel, isChad = false }: RobotGraphicProps) => {
  // Refs for accessibility
  const robotRef = useRef<HTMLDivElement>(null)
  const previousStateRef = useRef(currentState)
  const announcementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Get the robot state configuration based on the current state
  const robotState = getRobotState(currentState)

  // Get size configuration
  const sizeConfig = SIZE_CONFIGS[size]

  // Get accessibility attributes
  const ariaAttributes = getRobotAriaAttributes(currentState, previousStateRef.current)
  const baseAriaLabel = ariaLabel || ariaAttributes['aria-label']
  const effectiveAriaLabel = isChad ? `Chad ${baseAriaLabel}` : baseAriaLabel

  // Handle state change announcements for screen readers
  useEffect(() => {
    const previousState = previousStateRef.current

    if (previousState !== currentState && robotRef.current) {
      // Clear any existing timeout
      if (announcementTimeoutRef.current) {
        clearTimeout(announcementTimeoutRef.current)
      }

      // Announce state change to screen readers with a slight delay
      // to ensure the visual change has occurred
      announcementTimeoutRef.current = setTimeout(() => {
        const announcement = getStateChangeAnnouncement(previousState, currentState)
        announceToScreenReader(announcement, 'polite')
      }, 100)

      previousStateRef.current = currentState
    }

    // Cleanup timeout on unmount
    return () => {
      if (announcementTimeoutRef.current) {
        clearTimeout(announcementTimeoutRef.current)
      }
    }
  }, [currentState])

  // Check for accessibility preferences
  const animationsDisabled = shouldDisableAnimations()

  // Build CSS classes
  const cssClasses = [
    'robot-graphic',
    sizeConfig.className,
    `robot-state-${robotState.key}`,
    `robot-expression-${robotState.expression}`,
    isChad && 'robot-chad-personality',
    animationsDisabled && 'robot-no-animations',
    className
  ]
    .filter(Boolean)
    .join(' ')

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
        transition: animationsDisabled ? 'none' : `all ${robotState.transitionDuration}ms ease-in-out`
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
  )
}

/**
 * Creates an announcement message for state changes
 * @param previousState - The previous robot state
 * @param currentState - The current robot state
 * @returns Announcement message for screen readers
 */
const getStateChangeAnnouncement = (previousState: string, currentState: string): string => {
  const stateMessages: Record<string, string> = {
    idle: 'Robot is now ready and waiting',
    thinking: 'Robot is now processing your request',
    talking: 'Robot is now generating a response',
    error: 'Robot has encountered an error'
  }

  const currentMessage = stateMessages[currentState] || stateMessages.idle

  // Add context about the transition for better user understanding
  if (previousState && previousState !== currentState) {
    return `Status changed: ${currentMessage}`
  }

  return currentMessage
}

export default RobotGraphic
