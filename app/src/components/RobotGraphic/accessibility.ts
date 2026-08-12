/**
 * @fileoverview Accessibility utilities for RobotGraphic component
 */

/**
 * Checks if the user prefers reduced motion
 * @returns True if reduced motion is preferred
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Checks if the user prefers high contrast
 * @returns True if high contrast is preferred
 */
export const prefersHighContrast = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-contrast: high)').matches
}

/**
 * Checks if forced colors mode is active (Windows High Contrast)
 * @returns True if forced colors mode is active
 */
export const isForcedColorsActive = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(forced-colors: active)').matches
}

/**
 * Creates a media query listener for accessibility preferences
 * @param query - The media query to listen for
 * @param callback - Callback function to execute when query changes
 * @returns Cleanup function to remove the listener
 */
export const createAccessibilityListener = (
  query: string,
  callback: (matches: boolean) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {}

  const mediaQuery = window.matchMedia(query)
  const handler = (e: MediaQueryListEvent) => callback(e.matches)

  // Call immediately with current state
  callback(mediaQuery.matches)

  // Add listener for changes
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  } else {
    // Fallback for older browsers
    mediaQuery.addListener(handler)
    return () => mediaQuery.removeListener(handler)
  }
}

export interface ContrastInfo {
  ratio: number
  AA: boolean
  AAA: boolean
  AALarge: boolean
  AAALarge: boolean
}

/**
 * Validates color contrast ratio
 * @param foreground - Foreground color (hex)
 * @param background - Background color (hex)
 * @returns Contrast information including ratio and compliance levels
 */
export const validateColorContrast = (foreground: string, background: string): ContrastInfo => {
  const getLuminance = (color: string) => {
    // Convert hex to RGB
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16) / 255
    const g = parseInt(hex.substr(2, 2), 16) / 255
    const b = parseInt(hex.substr(4, 2), 16) / 255

    // Calculate relative luminance
    const sRGB = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })

    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2]
  }

  const l1 = getLuminance(foreground)
  const l2 = getLuminance(background)
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)

  return {
    ratio: Math.round(ratio * 100) / 100,
    AA: ratio >= 4.5,
    AAA: ratio >= 7,
    AALarge: ratio >= 3,
    AAALarge: ratio >= 4.5
  }
}

/**
 * Announces a message to screen readers
 * @param message - The message to announce
 * @param priority - Priority level ('polite' or 'assertive')
 */
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite'): void => {
  if (typeof document === 'undefined') return

  const announcement = document.createElement('div')
  announcement.setAttribute('aria-live', priority)
  announcement.setAttribute('aria-atomic', 'true')
  announcement.className = 'sr-only'
  announcement.textContent = message

  document.body.appendChild(announcement)

  // Remove the announcement after screen readers have processed it
  setTimeout(() => {
    if (document.body.contains(announcement)) {
      document.body.removeChild(announcement)
    }
  }, 1000)
}

export interface RobotAriaAttributes {
  'aria-label': string
  'aria-describedby': string
  'aria-live': 'polite' | 'off'
  'data-description': string
}

/**
 * Gets appropriate ARIA attributes for robot state
 * @param state - Current robot state
 * @param previousState - Previous robot state
 * @returns ARIA attributes object
 */
export const getRobotAriaAttributes = (state: string, previousState?: string | null): RobotAriaAttributes => {
  const stateLabels: Record<string, string> = {
    idle: 'Robot is ready and waiting for input',
    thinking: 'Robot is processing your request',
    talking: 'Robot is generating a response',
    error: 'Robot has encountered an error'
  }

  const stateDescriptions: Record<string, string> = {
    idle: 'The robot appears happy and ready to help',
    thinking: 'The robot shows a focused expression with thinking indicators',
    talking: 'The robot displays an active expression with speech indicators',
    error: 'The robot shows a concerned expression with error indicators'
  }

  return {
    'aria-label': stateLabels[state] || stateLabels.idle,
    'aria-describedby': `robot-description-${state}`,
    'aria-live': previousState && previousState !== state ? 'polite' : 'off',
    'data-description': stateDescriptions[state] || stateDescriptions.idle
  }
}

/**
 * Checks if animations should be disabled based on user preferences
 * @returns True if animations should be disabled
 */
export const shouldDisableAnimations = (): boolean => {
  return prefersReducedMotion()
}

/**
 * Gets accessible color scheme based on user preferences
 * @param defaultColors - Default color scheme
 * @returns Adjusted color scheme for accessibility
 */
export const getAccessibleColors = <T extends Record<string, string>>(defaultColors: T): T => {
  if (isForcedColorsActive()) {
    return {
      ...defaultColors,
      robotStroke: 'CanvasText',
      eyeColor: 'CanvasText',
      robotBody: 'Canvas',
      happyMouth: 'Highlight',
      thinkingMouth: 'Highlight',
      talkingElements: 'Highlight',
      errorElements: 'Highlight'
    }
  }

  if (prefersHighContrast()) {
    return {
      ...defaultColors,
      robotStroke: '#000000',
      eyeColor: '#000000',
      happyMouth: '#006600',
      thinkingMouth: '#cc6600',
      talkingElements: '#0066cc',
      errorElements: '#cc0000'
    }
  }

  return defaultColors
}
