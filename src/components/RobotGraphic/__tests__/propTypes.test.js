/**
 * @fileoverview Tests for PropTypes definitions
 */

import { describe, it, expect } from 'vitest';
import {
  robotStateKeyPropType,
  robotExpressionPropType,
  robotSizePropType,
  animationTimingPropType,
  robotStatePropType,
  animationConfigPropType,
  robotGraphicPropTypes,
  robotFacePropTypes,
  robotGraphicDefaultProps,
  robotFaceDefaultProps
} from '../propTypes.js';

describe('PropTypes Definitions', () => {
  it('should have robotStateKeyPropType defined', () => {
    expect(robotStateKeyPropType).toBeDefined();
    expect(robotStateKeyPropType).toBeInstanceOf(Function);
  });

  it('should have robotExpressionPropType defined', () => {
    expect(robotExpressionPropType).toBeDefined();
    expect(robotExpressionPropType).toBeInstanceOf(Function);
  });

  it('should have robotSizePropType defined', () => {
    expect(robotSizePropType).toBeDefined();
    expect(robotSizePropType).toBeInstanceOf(Function);
  });

  it('should have animationTimingPropType defined', () => {
    expect(animationTimingPropType).toBeDefined();
    expect(animationTimingPropType).toBeInstanceOf(Function);
  });

  it('should have robotStatePropType defined', () => {
    expect(robotStatePropType).toBeDefined();
    expect(robotStatePropType).toBeInstanceOf(Function);
  });

  it('should have animationConfigPropType defined', () => {
    expect(animationConfigPropType).toBeDefined();
    expect(animationConfigPropType).toBeInstanceOf(Function);
  });

  it('should have robotGraphicPropTypes defined with required props', () => {
    expect(robotGraphicPropTypes).toBeDefined();
    expect(robotGraphicPropTypes.currentState).toBeDefined();
    expect(robotGraphicPropTypes.size).toBeDefined();
    expect(robotGraphicPropTypes.className).toBeDefined();
    expect(robotGraphicPropTypes.ariaLabel).toBeDefined();
  });

  it('should have robotFacePropTypes defined with required props', () => {
    expect(robotFacePropTypes).toBeDefined();
    expect(robotFacePropTypes.expression).toBeDefined();
    expect(robotFacePropTypes.animated).toBeDefined();
    expect(robotFacePropTypes.theme).toBeDefined();
  });

  it('should have valid default props for RobotGraphic', () => {
    expect(robotGraphicDefaultProps).toBeDefined();
    expect(robotGraphicDefaultProps.size).toBe('md');
    expect(robotGraphicDefaultProps.className).toBe('');
    expect(robotGraphicDefaultProps.ariaLabel).toBe(null);
  });

  it('should have valid default props for RobotFace', () => {
    expect(robotFaceDefaultProps).toBeDefined();
    expect(robotFaceDefaultProps.animated).toBe(true);
    expect(robotFaceDefaultProps.theme).toBe(null);
  });
});

describe('PropTypes Structure', () => {
  it('should have correct structure for robotGraphicPropTypes', () => {
    expect(robotGraphicPropTypes).toHaveProperty('currentState');
    expect(robotGraphicPropTypes).toHaveProperty('size');
    expect(robotGraphicPropTypes).toHaveProperty('className');
    expect(robotGraphicPropTypes).toHaveProperty('ariaLabel');
  });

  it('should have correct structure for robotFacePropTypes', () => {
    expect(robotFacePropTypes).toHaveProperty('expression');
    expect(robotFacePropTypes).toHaveProperty('animated');
    expect(robotFacePropTypes).toHaveProperty('theme');
  });

  it('should have consistent default props structure', () => {
    expect(typeof robotGraphicDefaultProps.size).toBe('string');
    expect(typeof robotGraphicDefaultProps.className).toBe('string');
    expect(typeof robotFaceDefaultProps.animated).toBe('boolean');
  });
});