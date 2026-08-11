/**
 * @fileoverview Accessibility utilities for RobotGraphic component
 */

/**
 * Checks if the user prefers reduced motion
 * @returns {boolean} True if reduced motion is preferred
 */
export const prefersReducedMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Checks if the user prefers high contrast
 * @returns {boolean} True if high contrast is preferred
 */
export const prefersHighContrast = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: high)').matches;
};

/**
 * Checks if forced colors mode is active (Windows High Contrast)
 * @returns {boolean} True if forced colors mode is active
 */
export const isForcedColorsActive = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(forced-colors: active)').matches;
};

/**
 * Creates a media query listener for accessibility preferences
 * @param {string} query - The media query to listen for
 * @param {Function} callback - Callback function to execute when query changes
 * @returns {Function} Cleanup function to remove the listener
 */
export const createAccessibilityListener = (query, callback) => {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia(query);
  const handler = (e) => callback(e.matches);

  // Call immediately with current state
  callback(mediaQuery.matches);

  // Add listener for changes
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  } else {
    // Fallback for older browsers
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }
};

/**
 * Validates color contrast ratio
 * @param {string} foreground - Foreground color (hex)
 * @param {string} background - Background color (hex)
 * @returns {Object} Contrast information including ratio and compliance levels
 */
export const validateColorContrast = (foreground, background) => {
  const getLuminance = (color) => {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    // Calculate relative luminance
    const sRGB = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    AA: ratio >= 4.5,
    AAA: ratio >= 7,
    AALarge: ratio >= 3,
    AAALarge: ratio >= 4.5
  };
};

/**
 * Announces a message to screen readers
 * @param {string} message - The message to announce
 * @param {string} priority - Priority level ('polite' or 'assertive')
 */
export const announceToScreenReader = (message, priority = 'polite') => {
  if (typeof document === 'undefined') return;

  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove the announcement after screen readers have processed it
  setTimeout(() => {
    if (document.body.contains(announcement)) {
      document.body.removeChild(announcement);
    }
  }, 1000);
};

/**
 * Gets appropriate ARIA attributes for robot state
 * @param {string} state - Current robot state
 * @param {string} previousState - Previous robot state
 * @returns {Object} ARIA attributes object
 */
export const getRobotAriaAttributes = (state, previousState) => {
  const stateLabels = {
    idle: 'Robot is ready and waiting for input',
    thinking: 'Robot is processing your request',
    talking: 'Robot is generating a response',
    error: 'Robot has encountered an error'
  };

  const stateDescriptions = {
    idle: 'The robot appears happy and ready to help',
    thinking: 'The robot shows a focused expression with thinking indicators',
    talking: 'The robot displays an active expression with speech indicators',
    error: 'The robot shows a concerned expression with error indicators'
  };

  return {
    'aria-label': stateLabels[state] || stateLabels.idle,
    'aria-describedby': `robot-description-${state}`,
    'aria-live': previousState && previousState !== state ? 'polite' : 'off',
    'data-description': stateDescriptions[state] || stateDescriptions.idle
  };
};

/**
 * Checks if animations should be disabled based on user preferences
 * @returns {boolean} True if animations should be disabled
 */
export const shouldDisableAnimations = () => {
  return prefersReducedMotion();
};

/**
 * Gets accessible color scheme based on user preferences
 * @param {Object} defaultColors - Default color scheme
 * @returns {Object} Adjusted color scheme for accessibility
 */
export const getAccessibleColors = (defaultColors) => {
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
    };
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
    };
  }

  return defaultColors;
};