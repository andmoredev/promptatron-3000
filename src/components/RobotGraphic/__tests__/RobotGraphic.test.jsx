/**
 * @fileoverview Tests for RobotGraphic component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RobotGraphic from '../RobotGraphic.jsx';
import { ROBOT_STATES, SIZE_CONFIGS } from '../robotStates.js';

// Mock console.error to test PropTypes validation
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
});

describe('RobotGraphic Component', () => {
  describe('Basic Rendering', () => {
    it('should render with required props', () => {
      render(<RobotGraphic currentState="idle" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toBeInTheDocument();
    });

    it('should render robot face element', () => {
      render(<RobotGraphic currentState="idle" />);

      const faceElement = screen.getByTestId('robot-face');
      expect(faceElement).toBeInTheDocument();
    });

    it('should display SVG robot face', () => {
      render(<RobotGraphic currentState="idle" />);

      const robotFaceSvg = screen.getByTestId('robot-face-svg');
      expect(robotFaceSvg).toBeInTheDocument();
      expect(robotFaceSvg.tagName).toBe('svg');
    });
  });

  describe('State-to-Expression Mapping', () => {
    it('should map idle state to happy expression', () => {
      render(<RobotGraphic currentState="idle" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('data-state', 'idle');
      expect(robotElement).toHaveAttribute('data-expression', 'happy');

      const robotFaceSvg = screen.getByTestId('robot-face-svg');
      expect(robotFaceSvg).toHaveClass('robot-expression-happy');
    });

    it('should map thinking state to thinking expression', () => {
      render(<RobotGraphic currentState="thinking" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('data-state', 'thinking');
      expect(robotElement).toHaveAttribute('data-expression', 'thinking');

      const robotFaceSvg = screen.getByTestId('robot-face-svg');
      expect(robotFaceSvg).toHaveClass('robot-expression-thinking');
    });

    it('should map talking state to talking expression', () => {
      render(<RobotGraphic currentState="talking" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('data-state', 'talking');
      expect(robotElement).toHaveAttribute('data-expression', 'talking');

      const robotFaceSvg = screen.getByTestId('robot-face-svg');
      expect(robotFaceSvg).toHaveClass('robot-expression-talking');
    });

    it('should map error state to concerned expression', () => {
      render(<RobotGraphic currentState="error" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('data-state', 'error');
      expect(robotElement).toHaveAttribute('data-expression', 'concerned');

      const robotFaceSvg = screen.getByTestId('robot-face-svg');
      expect(robotFaceSvg).toHaveClass('robot-expression-concerned');
    });

    it('should fallback to idle state for invalid states', () => {
      render(<RobotGraphic currentState="invalid" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('data-state', 'idle');
      expect(robotElement).toHaveAttribute('data-expression', 'happy');
    });
  });

  describe('Size Variants', () => {
    it('should apply small size configuration', () => {
      render(<RobotGraphic currentState="idle" size="sm" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveClass('robot-size-sm');
      expect(robotElement).toHaveStyle({
        width: `${SIZE_CONFIGS.sm.width}px`,
        height: `${SIZE_CONFIGS.sm.height}px`
      });
    });

    it('should apply medium size configuration (default)', () => {
      render(<RobotGraphic currentState="idle" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveClass('robot-size-md');
      expect(robotElement).toHaveStyle({
        width: `${SIZE_CONFIGS.md.width}px`,
        height: `${SIZE_CONFIGS.md.height}px`
      });
    });

    it('should apply large size configuration', () => {
      render(<RobotGraphic currentState="idle" size="lg" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveClass('robot-size-lg');
      expect(robotElement).toHaveStyle({
        width: `${SIZE_CONFIGS.lg.width}px`,
        height: `${SIZE_CONFIGS.lg.height}px`
      });
    });
  });

  describe('CSS Classes', () => {
    it('should apply base CSS classes', () => {
      render(<RobotGraphic currentState="idle" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveClass('robot-graphic');
      expect(robotElement).toHaveClass('robot-size-md');
      expect(robotElement).toHaveClass('robot-state-idle');
      expect(robotElement).toHaveClass('robot-expression-happy');
    });

    it('should apply custom className', () => {
      render(<RobotGraphic currentState="idle" className="custom-class" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveClass('custom-class');
    });

    it('should apply state-specific classes', () => {
      render(<RobotGraphic currentState="thinking" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveClass('robot-state-thinking');
      expect(robotElement).toHaveClass('robot-expression-thinking');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA role', () => {
      render(<RobotGraphic currentState="idle" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('role', 'img');
    });

    it('should use default aria-label from robot state', () => {
      render(<RobotGraphic currentState="idle" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('aria-label', ROBOT_STATES.IDLE.ariaLabel);
    });

    it('should use custom aria-label when provided', () => {
      const customLabel = 'Custom robot label';
      render(<RobotGraphic currentState="idle" ariaLabel={customLabel} />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('aria-label', customLabel);
    });

    it('should update aria-label based on state', () => {
      const { rerender } = render(<RobotGraphic currentState="idle" />);

      let robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('aria-label', ROBOT_STATES.IDLE.ariaLabel);

      rerender(<RobotGraphic currentState="thinking" />);
      robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveAttribute('aria-label', ROBOT_STATES.THINKING.ariaLabel);
    });
  });

  describe('Transitions', () => {
    it('should apply transition duration from robot state', () => {
      render(<RobotGraphic currentState="idle" />);

      const robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveStyle({
        transition: `all ${ROBOT_STATES.IDLE.transitionDuration}ms ease-in-out`
      });
    });

    it('should update transition duration when state changes', () => {
      const { rerender } = render(<RobotGraphic currentState="idle" />);

      let robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveStyle({
        transition: `all ${ROBOT_STATES.IDLE.transitionDuration}ms ease-in-out`
      });

      rerender(<RobotGraphic currentState="thinking" />);
      robotElement = screen.getByTestId('robot-graphic');
      expect(robotElement).toHaveStyle({
        transition: `all ${ROBOT_STATES.THINKING.transitionDuration}ms ease-in-out`
      });
    });
  });

  describe('Component Structure', () => {
    it('should have correct DOM structure', () => {
      render(<RobotGraphic currentState="idle" />);

      const robotElement = screen.getByTestId('robot-graphic');
      const faceElement = screen.getByTestId('robot-face');

      expect(robotElement).toContainElement(faceElement);
      expect(faceElement).toHaveClass('robot-face');
    });

    it('should have SVG robot face inside face container', () => {
      render(<RobotGraphic currentState="idle" />);

      const faceElement = screen.getByTestId('robot-face');
      const robotFaceSvg = screen.getByTestId('robot-face-svg');

      expect(faceElement).toContainElement(robotFaceSvg);
      expect(robotFaceSvg).toHaveClass('robot-face-svg');
    });
  });
});

describe('RobotGraphic PropTypes Validation', () => {
  it('should not log errors for valid props', () => {
    render(<RobotGraphic currentState="idle" size="md" className="test" />);

    expect(console.error).not.toHaveBeenCalled();
  });

  it('should validate currentState prop', () => {
    // Valid states should not cause errors
    render(<RobotGraphic currentState="idle" />);
    render(<RobotGraphic currentState="thinking" />);
    render(<RobotGraphic currentState="talking" />);
    render(<RobotGraphic currentState="error" />);

    expect(console.error).not.toHaveBeenCalled();
  });

  it('should validate size prop', () => {
    // Valid sizes should not cause errors
    render(<RobotGraphic currentState="idle" size="sm" />);
    render(<RobotGraphic currentState="idle" size="md" />);
    render(<RobotGraphic currentState="idle" size="lg" />);

    expect(console.error).not.toHaveBeenCalled();
  });

  it('should validate optional props', () => {
    // Optional props should not cause errors
    render(<RobotGraphic currentState="idle" className="test-class" />);
    render(<RobotGraphic currentState="idle" ariaLabel="Custom label" />);

    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('RobotGraphic Default Props', () => {
  it('should use default size when not provided', () => {
    render(<RobotGraphic currentState="idle" />);

    const robotElement = screen.getByTestId('robot-graphic');
    expect(robotElement).toHaveClass('robot-size-md');
  });

  it('should use empty className when not provided', () => {
    render(<RobotGraphic currentState="idle" />);

    const robotElement = screen.getByTestId('robot-graphic');
    // Should not have any custom classes beyond the base ones
    const classes = robotElement.className.split(' ');
    expect(classes).toContain('robot-graphic');
    expect(classes).toContain('robot-size-md');
    expect(classes).toContain('robot-state-idle');
    expect(classes).toContain('robot-expression-happy');
  });

  it('should use robot state ariaLabel when custom ariaLabel not provided', () => {
    render(<RobotGraphic currentState="thinking" />);

    const robotElement = screen.getByTestId('robot-graphic');
    expect(robotElement).toHaveAttribute('aria-label', ROBOT_STATES.THINKING.ariaLabel);
  });
});