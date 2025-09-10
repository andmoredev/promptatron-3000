/**
 * @fileoverview Accessibility tests for RobotGraphic component
 * These tests verify that the component meets accessibility standards
 */

import {
  prefersReducedMotion,
  prefersHighContrast,
  isForcedColorsActive,
  validateColorContrast,
  announceToScreenReader,
  getRobotAriaAttributes,
  shouldDisableAnimations,
  getAccessibleColors
} from './accessibility.js';

// Mock window.matchMedia for testing
const mockMatchMedia = (matches) => ({
  matches,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn()
});

// Mock document for testing
const mockDocument = {
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    contains: jest.fn(() => true)
  },
  createElement: jest.fn(() => ({
    setAttribute: jest.fn(),
    className: '',
    textContent: ''
  }))
};

describe('Accessibility Utilities', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock window and document
    global.window = {
      matchMedia: jest.fn()
    };
    global.document = mockDocument;
  });

  describe('prefersReducedMotion', () => {
    it('should return true when user prefers reduced motion', () => {
      window.matchMedia.mockReturnValue(mockMatchMedia(true));
      expect(prefersReducedMotion()).toBe(true);
    });

    it('should return false when user does not prefer reduced motion', () => {
      window.matchMedia.mockReturnValue(mockMatchMedia(false));
      expect(prefersReducedMotion()).toBe(false);
    });

    it('should return false when window is undefined', () => {
      global.window = undefined;
      expect(prefersReducedMotion()).toBe(false);
    });
  });

  describe('prefersHighContrast', () => {
    it('should return true when user prefers high contrast', () => {
      window.matchMedia.mockReturnValue(mockMatchMedia(true));
      expect(prefersHighContrast()).toBe(true);
    });

    it('should return false when user does not prefer high contrast', () => {
      window.matchMedia.mockReturnValue(mockMatchMedia(false));
      expect(prefersHighContrast()).toBe(false);
    });
  });

  describe('isForcedColorsActive', () => {
    it('should return true when forced colors mode is active', () => {
      window.matchMedia.mockReturnValue(mockMatchMedia(true));
      expect(isForcedColorsActive()).toBe(true);
    });

    it('should return false when forced colors mode is not active', () => {
      window.matchMedia.mockReturnValue(mockMatchMedia(false));
      expect(isForcedColorsActive()).toBe(false);
    });
  });

  describe('validateColorContrast', () => {
    it('should calculate correct contrast ratio for black on white', () => {
      const result = validateColorContrast('#000000', '#ffffff');
      expect(result.ratio).toBe(21);
      expect(result.AA).toBe(true);
      expect(result.AAA).toBe(true);
    });

    it('should calculate correct contrast ratio for low contrast colors', () => {
      const result = validateColorContrast('#888888', '#999999');
      expect(result.ratio).toBeLessThan(4.5);
      expect(result.AA).toBe(false);
      expect(result.AAA).toBe(false);
    });

    it('should handle colors without # prefix', () => {
      const result = validateColorContrast('000000', 'ffffff');
      expect(result.ratio).toBe(21);
    });
  });

  describe('announceToScreenReader', () => {
    it('should create and append announcement element', () => {
      const mockElement = {
        setAttribute: jest.fn(),
        className: '',
        textContent: ''
      };
      document.createElement.mockReturnValue(mockElement);

      announceToScreenReader('Test message');

      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(mockElement.setAttribute).toHaveBeenCalledWith('aria-live', 'polite');
      expect(mockElement.setAttribute).toHaveBeenCalledWith('aria-atomic', 'true');
      expect(mockElement.textContent).toBe('Test message');
      expect(document.body.appendChild).toHaveBeenCalledWith(mockElement);
    });

    it('should use assertive priority when specified', () => {
      const mockElement = {
        setAttribute: jest.fn(),
        className: '',
        textContent: ''
      };
      document.createElement.mockReturnValue(mockElement);

      announceToScreenReader('Urgent message', 'assertive');

      expect(mockElement.setAttribute).toHaveBeenCalledWith('aria-live', 'assertive');
    });

    it('should handle missing document gracefully', () => {
      global.document = undefined;
      expect(() => announceToScreenReader('Test')).not.toThrow();
    });
  });

  describe('getRobotAriaAttributes', () => {
    it('should return correct attributes for idle state', () => {
      const attributes = getRobotAriaAttributes('idle');
      expect(attributes['aria-label']).toBe('Robot is ready and waiting for input');
      expect(attributes['aria-describedby']).toBe('robot-description-idle');
      expect(attributes['aria-live']).toBe('off');
    });

    it('should return correct attributes for thinking state', () => {
      const attributes = getRobotAriaAttributes('thinking');
      expect(attributes['aria-label']).toBe('Robot is processing your request');
      expect(attributes['aria-describedby']).toBe('robot-description-thinking');
    });

    it('should set aria-live to polite when state changes', () => {
      const attributes = getRobotAriaAttributes('thinking', 'idle');
      expect(attributes['aria-live']).toBe('polite');
    });

    it('should handle invalid states gracefully', () => {
      const attributes = getRobotAriaAttributes('invalid');
      expect(attributes['aria-label']).toBe('Robot is ready and waiting for input');
    });
  });

  describe('shouldDisableAnimations', () => {
    it('should return true when reduced motion is preferred', () => {
      window.matchMedia.mockReturnValue(mockMatchMedia(true));
      expect(shouldDisableAnimations()).toBe(true);
    });

    it('should return false when reduced motion is not preferred', () => {
      window.matchMedia.mockReturnValue(mockMatchMedia(false));
      expect(shouldDisableAnimations()).toBe(false);
    });
  });

  describe('getAccessibleColors', () => {
    const defaultColors = {
      robotStroke: '#475569',
      eyeColor: '#0f172a',
      robotBody: '#f8fafc',
      happyMouth: '#047857'
    };

    it('should return forced colors when active', () => {
      // Mock forced colors active
      window.matchMedia.mockImplementation((query) => {
        if (query === '(forced-colors: active)') {
          return mockMatchMedia(true);
        }
        return mockMatchMedia(false);
      });

      const colors = getAccessibleColors(defaultColors);
      expect(colors.robotStroke).toBe('CanvasText');
      expect(colors.eyeColor).toBe('CanvasText');
      expect(colors.robotBody).toBe('Canvas');
    });

    it('should return high contrast colors when preferred', () => {
      // Mock high contrast preferred
      window.matchMedia.mockImplementation((query) => {
        if (query === '(prefers-contrast: high)') {
          return mockMatchMedia(true);
        }
        return mockMatchMedia(false);
      });

      const colors = getAccessibleColors(defaultColors);
      expect(colors.robotStroke).toBe('#000000');
      expect(colors.eyeColor).toBe('#000000');
    });

    it('should return default colors when no accessibility preferences', () => {
      window.matchMedia.mockReturnValue(mockMatchMedia(false));

      const colors = getAccessibleColors(defaultColors);
      expect(colors).toEqual(defaultColors);
    });
  });
});

// Integration tests for accessibility features
describe('Accessibility Integration', () => {
  beforeEach(() => {
    global.window = {
      matchMedia: jest.fn().mockReturnValue(mockMatchMedia(false))
    };
    global.document = mockDocument;
  });

  it('should provide comprehensive accessibility support', () => {
    // Test that all accessibility functions work together
    const state = 'thinking';
    const previousState = 'idle';

    const ariaAttributes = getRobotAriaAttributes(state, previousState);
    const animationsDisabled = shouldDisableAnimations();
    const colors = getAccessibleColors({
      robotStroke: '#475569',
      eyeColor: '#0f172a'
    });

    expect(ariaAttributes['aria-label']).toBeTruthy();
    expect(ariaAttributes['aria-live']).toBe('polite');
    expect(typeof animationsDisabled).toBe('boolean');
    expect(colors).toBeTruthy();
  });

  it('should handle screen reader announcements properly', () => {
    const mockElement = {
      setAttribute: jest.fn(),
      className: '',
      textContent: ''
    };
    document.createElement.mockReturnValue(mockElement);

    announceToScreenReader('Robot state changed to thinking');

    expect(document.createElement).toHaveBeenCalledWith('div');
    expect(mockElement.setAttribute).toHaveBeenCalledWith('aria-live', 'polite');
    expect(mockElement.textContent).toBe('Robot state changed to thinking');
  });
});

// Color contrast validation tests
describe('Color Contrast Validation', () => {
  const testCases = [
    { fg: '#000000', bg: '#ffffff', expectedAA: true, expectedAAA: true },
    { fg: '#767676', bg: '#ffffff', expectedAA: true, expectedAAA: false },
    { fg: '#949494', bg: '#ffffff', expectedAA: false, expectedAAA: false },
    { fg: '#ffffff', bg: '#0066cc', expectedAA: true, expectedAAA: false },
    { fg: '#ffffff', bg: '#cc0000', expectedAA: true, expectedAAA: false }
  ];

  testCases.forEach(({ fg, bg, expectedAA, expectedAAA }) => {
    it(`should validate contrast for ${fg} on ${bg}`, () => {
      const result = validateColorContrast(fg, bg);
      expect(result.AA).toBe(expectedAA);
      expect(result.AAA).toBe(expectedAAA);
      expect(result.ratio).toBeGreaterThan(0);
    });
  });
});