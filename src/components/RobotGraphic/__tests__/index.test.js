/**
 * @fileoverview Tests for index exports
 */

import { describe, it, expect } from 'vitest';
import {
  ROBOT_STATES,
  ANIMATION_CONFIGS,
  SIZE_CONFIGS,
  DEFAULT_CONFIG,
  getRobotState,
  isValidRobotState,
  robotStateKeyPropType,
  robotExpressionPropType,
  robotSizePropType,
  robotGraphicPropTypes,
  robotFacePropTypes,
  robotGraphicDefaultProps,
  robotFaceDefaultProps
} from '../index.js';

describe('Index Exports', () => {
  it('should export all robot states', () => {
    expect(ROBOT_STATES).toBeDefined();
    expect(ROBOT_STATES.IDLE).toBeDefined();
    expect(ROBOT_STATES.THINKING).toBeDefined();
    expect(ROBOT_STATES.TALKING).toBeDefined();
    expect(ROBOT_STATES.ERROR).toBeDefined();
  });

  it('should export animation configs', () => {
    expect(ANIMATION_CONFIGS).toBeDefined();
    expect(typeof ANIMATION_CONFIGS).toBe('object');
  });

  it('should export size configs', () => {
    expect(SIZE_CONFIGS).toBeDefined();
    expect(SIZE_CONFIGS.sm).toBeDefined();
    expect(SIZE_CONFIGS.md).toBeDefined();
    expect(SIZE_CONFIGS.lg).toBeDefined();
  });

  it('should export default config', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.state).toBe(ROBOT_STATES.IDLE);
  });

  it('should export utility functions', () => {
    expect(getRobotState).toBeDefined();
    expect(typeof getRobotState).toBe('function');
    expect(isValidRobotState).toBeDefined();
    expect(typeof isValidRobotState).toBe('function');
  });

  it('should export PropTypes', () => {
    expect(robotStateKeyPropType).toBeDefined();
    expect(robotExpressionPropType).toBeDefined();
    expect(robotSizePropType).toBeDefined();
    expect(robotGraphicPropTypes).toBeDefined();
    expect(robotFacePropTypes).toBeDefined();
  });

  it('should export default props', () => {
    expect(robotGraphicDefaultProps).toBeDefined();
    expect(robotFaceDefaultProps).toBeDefined();
  });

  it('should have working utility functions', () => {
    expect(getRobotState('idle')).toBe(ROBOT_STATES.IDLE);
    expect(isValidRobotState('thinking')).toBe(true);
    expect(isValidRobotState('invalid')).toBe(false);
  });
});