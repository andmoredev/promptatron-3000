/**
 * @fileoverview Integration tests for RobotFace SVG rendering
 */

import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RobotGraphic from '../RobotGraphic.jsx';

describe('RobotFace SVG Integration', () => {
  describe('SVG Structure Validation', () => {
    it('should render complete SVG structure for happy expression', () => {
      const { container } = render(<RobotGraphic currentState="idle" />);

      // Check for SVG element
      const svg = container.querySelector('svg[data-testid="robot-face-svg"]');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox', '0 0 100 100');

      // Check for happy face elements
      const happyFace = container.querySelector('.robot-face-happy');
      expect(happyFace).toBeInTheDocument();

      const head = container.querySelector('.robot-head');
      expect(head).toBeInTheDocument();
      expect(head).toHaveAttribute('fill'); // Just check that fill attribute exists

      const eyes = container.querySelectorAll('.robot-eye');
      expect(eyes).toHaveLength(2);

      const mouth = container.querySelector('.robot-mouth-happy');
      expect(mouth).toBeInTheDocument();

      const cheeks = container.querySelectorAll('.robot-cheek');
      expect(cheeks).toHaveLength(2);
    });

    it('should render complete SVG structure for thinking expression', () => {
      const { container } = render(<RobotGraphic currentState="thinking" />);

      const svg = container.querySelector('svg[data-testid="robot-face-svg"]');
      expect(svg).toBeInTheDocument();

      const thinkingFace = container.querySelector('.robot-face-thinking');
      expect(thinkingFace).toBeInTheDocument();

      const head = container.querySelector('.robot-head');
      expect(head).toHaveAttribute('fill'); // Just check that fill attribute exists

      const thinkingDots = container.querySelectorAll('.robot-thinking-dot');
      expect(thinkingDots).toHaveLength(3);

      const eyebrows = container.querySelectorAll('.robot-eyebrows line');
      expect(eyebrows).toHaveLength(2);
    });

    it('should render complete SVG structure for talking expression', () => {
      const { container } = render(<RobotGraphic currentState="talking" />);

      const svg = container.querySelector('svg[data-testid="robot-face-svg"]');
      expect(svg).toBeInTheDocument();

      const talkingFace = container.querySelector('.robot-face-talking');
      expect(talkingFace).toBeInTheDocument();

      const head = container.querySelector('.robot-head');
      expect(head).toHaveAttribute('fill'); // Just check that fill attribute exists

      const speechWaves = container.querySelectorAll('.robot-speech-wave');
      expect(speechWaves).toHaveLength(3);

      const eyeHighlights = container.querySelectorAll('.robot-eye-highlight');
      expect(eyeHighlights).toHaveLength(2);
    });

    it('should render complete SVG structure for concerned expression', () => {
      const { container } = render(<RobotGraphic currentState="error" />);

      const svg = container.querySelector('svg[data-testid="robot-face-svg"]');
      expect(svg).toBeInTheDocument();

      const concernedFace = container.querySelector('.robot-face-concerned');
      expect(concernedFace).toBeInTheDocument();

      const head = container.querySelector('.robot-head');
      expect(head).toHaveAttribute('fill'); // Just check that fill attribute exists

      const errorSymbol = container.querySelector('.robot-error-symbol');
      expect(errorSymbol).toBeInTheDocument();

      const errorText = container.querySelector('.robot-error-text');
      expect(errorText).toBeInTheDocument();
      expect(errorText.textContent).toBe('!');
    });
  });

  describe('Animation Classes Integration', () => {
    it('should apply animation classes when animations are enabled', () => {
      const { container } = render(<RobotGraphic currentState="idle" />);

      const blinkingEyes = container.querySelectorAll('.robot-eye-blink');
      expect(blinkingEyes).toHaveLength(2);
    });

    it('should apply thinking animation classes', () => {
      const { container } = render(<RobotGraphic currentState="thinking" />);

      const pulsingDots = container.querySelectorAll('[class*="robot-thinking-pulse"]');
      expect(pulsingDots).toHaveLength(3);
    });

    it('should apply talking animation classes', () => {
      const { container } = render(<RobotGraphic currentState="talking" />);

      const animatedMouth = container.querySelector('.robot-mouth-animate');
      expect(animatedMouth).toBeInTheDocument();

      const animatedWaves = container.querySelectorAll('[class*="robot-speech-wave-"]');
      expect(animatedWaves).toHaveLength(3);
    });

    it('should apply error animation classes', () => {
      const { container } = render(<RobotGraphic currentState="error" />);

      const pulsingError = container.querySelector('.robot-error-pulse');
      expect(pulsingError).toBeInTheDocument();
    });
  });

  describe('Size Integration', () => {
    it('should scale SVG correctly for different sizes', () => {
      const { container: smallContainer } = render(
        <RobotGraphic currentState="idle" size="sm" />
      );
      const { container: largeContainer } = render(
        <RobotGraphic currentState="idle" size="lg" />
      );

      const smallSvg = smallContainer.querySelector('svg');
      const largeSvg = largeContainer.querySelector('svg');

      expect(smallSvg).toHaveAttribute('width', '40');
      expect(smallSvg).toHaveAttribute('height', '40');

      expect(largeSvg).toHaveAttribute('width', '80');
      expect(largeSvg).toHaveAttribute('height', '80');
    });
  });

  describe('Expression Transitions', () => {
    it('should maintain SVG structure when expression changes', () => {
      const { container, rerender } = render(<RobotGraphic currentState="idle" />);

      // Initial happy expression
      let svg = container.querySelector('svg[data-testid="robot-face-svg"]');
      expect(svg).toHaveClass('robot-expression-happy');

      // Change to thinking
      rerender(<RobotGraphic currentState="thinking" />);
      svg = container.querySelector('svg[data-testid="robot-face-svg"]');
      expect(svg).toHaveClass('robot-expression-thinking');

      // Change to talking
      rerender(<RobotGraphic currentState="talking" />);
      svg = container.querySelector('svg[data-testid="robot-face-svg"]');
      expect(svg).toHaveClass('robot-expression-talking');

      // Change to error
      rerender(<RobotGraphic currentState="error" />);
      svg = container.querySelector('svg[data-testid="robot-face-svg"]');
      expect(svg).toHaveClass('robot-expression-concerned');
    });
  });

  describe('Accessibility Integration', () => {
    it('should maintain accessibility attributes with SVG faces', () => {
      const { container } = render(<RobotGraphic currentState="idle" />);

      const robotElement = container.querySelector('[data-testid="robot-graphic"]');
      expect(robotElement).toHaveAttribute('role', 'img');
      expect(robotElement).toHaveAttribute('aria-label');

      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('viewBox');
    });
  });
});