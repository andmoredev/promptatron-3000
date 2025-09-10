/**
 * @fileoverview Tests for robot states and utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  ROBOT_STATES,
  ANIMATION_CONFIGS,
  SIZE_CONFIGS,
  DEFAULT_CONFIG,
  getRobotState,
  isValidRobotState
} from '../robotStates.js';

describe('Robot States', () => {
  it('should have all required robot states defined', () => {
    expect(ROBOT_STATES.IDLE).toBeDefined();
    expect(ROBOT_STATES.THINKING).toBeDefined();
    expect(ROBOT_STATES.TALKING).toBeDefined();
    expect(ROBOT_STATES.ERROR).toBeDefined();
  });

  it('should have valid state structure for each robot state', () => {
    Object.values(ROBOT_STATES).forEach(state => {
      expect(state).toHaveProperty('key');
      expect(state).toHaveProperty('expression');
      expect(state).toHaveProperty('ariaLabel');
      expect(state).toHaveProperty('animations');
      expect(Array.isArray(state.animations)).toBe(true);
      expect(typeof state.ariaLabel).toBe('string');
      expect(state.ariaLabel.length).toBeGreaterThan(0);
    });
  });

  it('should have correct state keys', () => {
    expect(ROBOT_STATES.IDLE.key).toBe('idle');
    expect(ROBOT_STATES.THINKING.key).toBe('thinking');
    expect(ROBOT_STATES.TALKING.key).toBe('talking');
    expect(ROBOT_STATES.ERROR.key).toBe('error');
  });

  it('should have correct expressions', () => {
    expect(ROBOT_STATES.IDLE.expression).toBe('happy');
    expect(ROBOT_STATES.THINKING.expression).toBe('thinking');
    expect(ROBOT_STATES.TALKING.expression).toBe('talking');
    expect(ROBOT_STATES.ERROR.expression).toBe('concerned');
  });
});

describe('Animation Configs', () => {
  it('should have animation configs defined', () => {
    expect(ANIMATION_CONFIGS).toBeDefined();
    expect(Object.keys(ANIMATION_CONFIGS).length).toBeGreaterThan(0);
  });

  it('should have valid animation config structure', () => {
    Object.values(ANIMATION_CONFIGS).forEach(config => {
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('duration');
      expect(config).toHaveProperty('timing');
      expect(config).toHaveProperty('iterations');
      expect(config).toHaveProperty('respectsMotionPreference');
      expect(typeof config.name).toBe('string');
      expect(typeof config.duration).toBe('number');
      expect(typeof config.respectsMotionPreference).toBe('boolean');
    });
  });
});

describe('Size Configs', () => {
  it('should have all size variants defined', () => {
    expect(SIZE_CONFIGS.sm).toBeDefined();
    expect(SIZE_CONFIGS.md).toBeDefined();
    expect(SIZE_CONFIGS.lg).toBeDefined();
  });

  it('should have valid size config structure', () => {
    Object.values(SIZE_CONFIGS).forEach(config => {
      expect(config).toHaveProperty('width');
      expect(config).toHaveProperty('height');
      expect(config).toHaveProperty('className');
      expect(typeof config.width).toBe('number');
      expect(typeof config.height).toBe('number');
      expect(typeof config.className).toBe('string');
    });
  });
});

describe('Utility Functions', () => {
  describe('getRobotState', () => {
    it('should return correct state for valid keys', () => {
      expect(getRobotState('idle')).toBe(ROBOT_STATES.IDLE);
      expect(getRobotState('thinking')).toBe(ROBOT_STATES.THINKING);
      expect(getRobotState('talking')).toBe(ROBOT_STATES.TALKING);
      expect(getRobotState('error')).toBe(ROBOT_STATES.ERROR);
    });

    it('should return IDLE state for invalid keys', () => {
      expect(getRobotState('invalid')).toBe(ROBOT_STATES.IDLE);
      expect(getRobotState('')).toBe(ROBOT_STATES.IDLE);
      expect(getRobotState(null)).toBe(ROBOT_STATES.IDLE);
      expect(getRobotState(undefined)).toBe(ROBOT_STATES.IDLE);
    });
  });

  describe('isValidRobotState', () => {
    it('should return true for valid state keys', () => {
      expect(isValidRobotState('idle')).toBe(true);
      expect(isValidRobotState('thinking')).toBe(true);
      expect(isValidRobotState('talking')).toBe(true);
      expect(isValidRobotState('error')).toBe(true);
    });

    it('should return false for invalid state keys', () => {
      expect(isValidRobotState('invalid')).toBe(false);
      expect(isValidRobotState('')).toBe(false);
      expect(isValidRobotState(null)).toBe(false);
      expect(isValidRobotState(undefined)).toBe(false);
    });
  });
});

describe('Default Config', () => {
  it('should have valid default configuration', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.state).toBe(ROBOT_STATES.IDLE);
    expect(DEFAULT_CONFIG.size).toBe('md');
    expect(typeof DEFAULT_CONFIG.animationsEnabled).toBe('boolean');
    expect(typeof DEFAULT_CONFIG.transitionDuration).toBe('number');
  });
});