/**
 * @fileoverview Tests for RobotFace component facial expressions
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RobotFace from '../RobotFace.jsx';
import { ThemeProvider } from '../../ThemeProvider.jsx';

// Mock theme for testing
const mockTheme = {
  colors: {
    primary: {
      50: '#f0f9ff',
      500: '#0ea5e9',
      600: '#0284c7'
    },
    secondary: {
      50: '#fefce8',
      300: '#fde047',
      400: '#facc15',
      600: '#ca8a04'
    },
    tertiary: {
      50: '#fef2f2',
      600: '#dc2626'
    },
    gray: {
      500: '#6b7280'
    }
  }
};

describe('RobotFace Component', () => {
  describe('Basic Rendering', () => {
    it('renders SVG element with correct test id', () => {
      render(<RobotFace expression="happy" />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toBeInTheDocument();
      expect(svg.tagName).toBe('svg');
    });

    it('applies correct CSS class for expression', () => {
      render(<RobotFace expression="thinking" />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveClass('robot-expression-thinking');
    });

    it('applies animated class when animated is true', () => {
      render(<RobotFace expression="happy" animated={true} />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveClass('robot-animated');
    });

    it('applies static class when animated is false', () => {
      render(<RobotFace expression="happy" animated={false} />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveClass('robot-static');
    });

    it('sets correct viewBox and dimensions', () => {
      render(<RobotFace expression="happy" size="md" />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveAttribute('viewBox', '0 0 100 100');
      expect(svg).toHaveAttribute('width', '56');
      expect(svg).toHaveAttribute('height', '56');
    });
  });

  describe('Size Variants', () => {
    it('renders small size correctly', () => {
      render(<RobotFace expression="happy" size="sm" />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveAttribute('width', '40');
      expect(svg).toHaveAttribute('height', '40');
    });

    it('renders medium size correctly (default)', () => {
      render(<RobotFace expression="happy" size="md" />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveAttribute('width', '56');
      expect(svg).toHaveAttribute('height', '56');
    });

    it('renders large size correctly', () => {
      render(<RobotFace expression="happy" size="lg" />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveAttribute('width', '80');
      expect(svg).toHaveAttribute('height', '80');
    });

    it('defaults to medium size when invalid size provided', () => {
      render(<RobotFace expression="happy" size="invalid" />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveAttribute('width', '56');
      expect(svg).toHaveAttribute('height', '56');
    });
  });

  describe('Happy Expression', () => {
    it('renders happy expression elements', () => {
      const { container } = render(<RobotFace expression="happy" />);

      // Check for happy face group
      const happyFace = container.querySelector('.robot-face-happy');
      expect(happyFace).toBeInTheDocument();

      // Check for robot head
      const head = container.querySelector('.robot-head');
      expect(head).toBeInTheDocument();
      expect(head).toHaveAttribute('fill'); // Just check that fill attribute exists

      // Check for eyes
      const eyes = container.querySelectorAll('.robot-eye');
      expect(eyes).toHaveLength(2);

      // Check for happy mouth (smile)
      const mouth = container.querySelector('.robot-mouth-happy');
      expect(mouth).toBeInTheDocument();
      expect(mouth).toHaveAttribute('stroke'); // Just check that stroke attribute exists

      // Check for cheeks
      const cheeks = container.querySelectorAll('.robot-cheek');
      expect(cheeks).toHaveLength(2);
    });

    it('applies blinking animation when animated is true', () => {
      const { container } = render(<RobotFace expression="happy" animated={true} />);
      const eyes = container.querySelectorAll('.robot-eye-blink');
      expect(eyes).toHaveLength(2);
    });

    it('does not apply blinking animation when animated is false', () => {
      const { container } = render(<RobotFace expression="happy" animated={false} />);
      const eyes = container.querySelectorAll('.robot-eye-blink');
      expect(eyes).toHaveLength(0);
    });
  });

  describe('Thinking Expression', () => {
    it('renders thinking expression elements', () => {
      const { container } = render(<RobotFace expression="thinking" />);

      // Check for thinking face group
      const thinkingFace = container.querySelector('.robot-face-thinking');
      expect(thinkingFace).toBeInTheDocument();

      // Check for robot head with thinking background
      const head = container.querySelector('.robot-head');
      expect(head).toHaveAttribute('fill'); // Just check that fill attribute exists

      // Check for focused eyes (ellipses)
      const eyes = container.querySelectorAll('.robot-eye');
      expect(eyes).toHaveLength(2);
      eyes.forEach(eye => {
        expect(eye.tagName).toBe('ellipse');
      });

      // Check for neutral mouth
      const mouth = container.querySelector('.robot-mouth-thinking');
      expect(mouth).toBeInTheDocument();
      expect(mouth.tagName).toBe('line');

      // Check for thinking indicators
      const thinkingDots = container.querySelectorAll('.robot-thinking-dot');
      expect(thinkingDots).toHaveLength(3);

      // Check for eyebrows
      const eyebrows = container.querySelectorAll('.robot-eyebrows line');
      expect(eyebrows).toHaveLength(2);
    });

    it('applies thinking animation when animated is true', () => {
      const { container } = render(<RobotFace expression="thinking" animated={true} />);
      const pulsingDots = container.querySelectorAll('[class*="robot-thinking-pulse"]');
      expect(pulsingDots).toHaveLength(3);
    });
  });

  describe('Talking Expression', () => {
    it('renders talking expression elements', () => {
      const { container } = render(<RobotFace expression="talking" />);

      // Check for talking face group
      const talkingFace = container.querySelector('.robot-face-talking');
      expect(talkingFace).toBeInTheDocument();

      // Check for robot head with talking background
      const head = container.querySelector('.robot-head');
      expect(head).toHaveAttribute('fill'); // Just check that fill attribute exists

      // Check for alert eyes with highlights
      const eyes = container.querySelectorAll('.robot-eye');
      expect(eyes).toHaveLength(2);
      const eyeHighlights = container.querySelectorAll('.robot-eye-highlight');
      expect(eyeHighlights).toHaveLength(2);

      // Check for talking mouth (oval)
      const mouth = container.querySelector('.robot-mouth-talking');
      expect(mouth).toBeInTheDocument();
      expect(mouth.tagName).toBe('ellipse');

      // Check for speech wave indicators
      const speechWaves = container.querySelectorAll('.robot-speech-wave');
      expect(speechWaves).toHaveLength(3);
    });

    it('applies talking animation when animated is true', () => {
      const { container } = render(<RobotFace expression="talking" animated={true} />);
      const animatedMouth = container.querySelector('.robot-mouth-animate');
      expect(animatedMouth).toBeInTheDocument();

      const animatedWaves = container.querySelectorAll('[class*="robot-speech-wave-"]');
      expect(animatedWaves).toHaveLength(3);
    });
  });

  describe('Concerned Expression', () => {
    it('renders concerned expression elements', () => {
      const { container } = render(<RobotFace expression="concerned" />);

      // Check for concerned face group
      const concernedFace = container.querySelector('.robot-face-concerned');
      expect(concernedFace).toBeInTheDocument();

      // Check for robot head with error background
      const head = container.querySelector('.robot-head');
      expect(head).toHaveAttribute('fill'); // Just check that fill attribute exists

      // Check for worried eyes
      const eyes = container.querySelectorAll('.robot-eye');
      expect(eyes).toHaveLength(2);

      // Check for concerned mouth (downward curve)
      const mouth = container.querySelector('.robot-mouth-concerned');
      expect(mouth).toBeInTheDocument();
      expect(mouth).toHaveAttribute('stroke'); // Just check that stroke attribute exists

      // Check for worried eyebrows
      const eyebrows = container.querySelectorAll('.robot-eyebrows line');
      expect(eyebrows).toHaveLength(2);

      // Check for error indicator
      const errorSymbol = container.querySelector('.robot-error-symbol');
      expect(errorSymbol).toBeInTheDocument();
      const errorText = container.querySelector('.robot-error-text');
      expect(errorText).toBeInTheDocument();
      expect(errorText.textContent).toBe('!');
    });

    it('applies error animation when animated is true', () => {
      const { container } = render(<RobotFace expression="concerned" animated={true} />);
      const pulsingError = container.querySelector('.robot-error-pulse');
      expect(pulsingError).toBeInTheDocument();
    });
  });

  describe('Invalid Expression Handling', () => {
    it('defaults to happy expression for invalid expression', () => {
      const { container } = render(<RobotFace expression="invalid" />);
      const happyFace = container.querySelector('.robot-face-happy');
      expect(happyFace).toBeInTheDocument();
    });

    it('applies correct CSS class even for invalid expression', () => {
      render(<RobotFace expression="invalid" />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveClass('robot-expression-invalid');
    });
  });

  describe('Animation Control', () => {
    it('respects animated prop being false', () => {
      const { container } = render(<RobotFace expression="happy" animated={false} />);
      const blinkingEyes = container.querySelectorAll('.robot-eye-blink');
      expect(blinkingEyes).toHaveLength(0);
    });

    it('defaults animated to true when not specified', () => {
      const { container } = render(<RobotFace expression="happy" />);
      const blinkingEyes = container.querySelectorAll('.robot-eye-blink');
      expect(blinkingEyes).toHaveLength(2);
    });
  });

  describe('Accessibility', () => {
    it('provides proper SVG structure for screen readers', () => {
      render(<RobotFace expression="happy" />);
      const svg = screen.getByTestId('robot-face-svg');
      expect(svg).toHaveAttribute('viewBox');
      expect(svg).toHaveClass('robot-face-svg');
    });

    it('includes semantic grouping for facial features', () => {
      const { container } = render(<RobotFace expression="happy" />);
      const eyesGroup = container.querySelector('.robot-eyes');
      expect(eyesGroup).toBeInTheDocument();
    });
  });

  describe('Theme Integration', () => {
    it('uses theme colors when provided via prop', () => {
      const { container } = render(<RobotFace expression="happy" theme={mockTheme} />);
      const head = container.querySelector('.robot-head');
      expect(head).toHaveAttribute('fill', mockTheme.colors.primary[50]);
    });

    it('uses theme colors from context when available', () => {
      const { container } = render(
        <ThemeProvider theme={mockTheme}>
          <RobotFace expression="thinking" />
        </ThemeProvider>
      );
      const head = container.querySelector('.robot-head');
      expect(head).toHaveAttribute('fill', mockTheme.colors.secondary[50]);
    });

    it('falls back to default colors when theme is not available', () => {
      const { container } = render(<RobotFace expression="happy" />);
      const head = container.querySelector('.robot-head');
      // Should use fallback color
      expect(head).toHaveAttribute('fill');
    });

    it('prop theme takes precedence over context theme', () => {
      const propTheme = {
        colors: {
          primary: { 50: '#custom-color' }
        }
      };

      const { container } = render(
        <ThemeProvider theme={mockTheme}>
          <RobotFace expression="happy" theme={propTheme} />
        </ThemeProvider>
      );
      const head = container.querySelector('.robot-head');
      expect(head).toHaveAttribute('fill', '#custom-color');
    });

    it('applies theme colors to different expression elements', () => {
      const { container } = render(<RobotFace expression="thinking" theme={mockTheme} />);

      // Check thinking mouth color
      const mouth = container.querySelector('.robot-mouth-thinking');
      expect(mouth).toHaveAttribute('stroke', mockTheme.colors.secondary[600]);

      // Check thinking dots
      const thinkingDot = container.querySelector('.robot-thinking-dot');
      expect(thinkingDot).toHaveAttribute('fill', mockTheme.colors.secondary[600]);
    });

    it('applies theme colors to talking expression elements', () => {
      const { container } = render(<RobotFace expression="talking" theme={mockTheme} />);

      // Check speech waves
      const speechWave = container.querySelector('.robot-speech-wave');
      expect(speechWave).toHaveAttribute('stroke', mockTheme.colors.primary[500]);
    });

    it('applies theme colors to concerned expression elements', () => {
      const { container } = render(<RobotFace expression="concerned" theme={mockTheme} />);

      // Check error mouth
      const mouth = container.querySelector('.robot-mouth-concerned');
      expect(mouth).toHaveAttribute('stroke', mockTheme.colors.tertiary[600]);

      // Check error indicator
      const errorSymbol = container.querySelector('.robot-error-symbol');
      expect(errorSymbol).toHaveAttribute('fill', mockTheme.colors.tertiary[600]);
    });

    it('handles missing theme colors gracefully', () => {
      const incompleteTheme = {
        colors: {
          primary: { 500: '#incomplete' }
          // Missing other colors
        }
      };

      const { container } = render(<RobotFace expression="thinking" theme={incompleteTheme} />);
      const head = container.querySelector('.robot-head');
      // Should still render without errors
      expect(head).toBeInTheDocument();
      expect(head).toHaveAttribute('fill');
    });
  });

  describe('Expression Switching', () => {
    it('switches between expressions correctly', () => {
      const { container, rerender } = render(<RobotFace expression="happy" />);

      // Initially happy
      expect(container.querySelector('.robot-face-happy')).toBeInTheDocument();
      expect(container.querySelector('.robot-face-thinking')).not.toBeInTheDocument();

      // Switch to thinking
      rerender(<RobotFace expression="thinking" />);
      expect(container.querySelector('.robot-face-thinking')).toBeInTheDocument();
      expect(container.querySelector('.robot-face-happy')).not.toBeInTheDocument();
    });

    it('updates CSS classes when expression changes', () => {
      const { rerender } = render(<RobotFace expression="happy" />);
      const svg = screen.getByTestId('robot-face-svg');

      expect(svg).toHaveClass('robot-expression-happy');

      rerender(<RobotFace expression="talking" />);
      expect(svg).toHaveClass('robot-expression-talking');
      expect(svg).not.toHaveClass('robot-expression-happy');
    });

    it('maintains size and animation settings during expression changes', () => {
      const { rerender } = render(<RobotFace expression="happy" size="lg" animated={false} />);
      const svg = screen.getByTestId('robot-face-svg');

      expect(svg).toHaveAttribute('width', '80');
      expect(svg).toHaveClass('robot-static');

      rerender(<RobotFace expression="thinking" size="lg" animated={false} />);
      expect(svg).toHaveAttribute('width', '80');
      expect(svg).toHaveClass('robot-static');
    });
  });
});