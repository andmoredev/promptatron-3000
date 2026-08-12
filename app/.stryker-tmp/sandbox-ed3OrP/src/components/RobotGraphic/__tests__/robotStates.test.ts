/** robotStates: state-key lookup and validation. */
// @ts-nocheck


import { describe, expect, it } from 'vitest'
import { getRobotState, isValidRobotState, ROBOT_STATES } from '../robotStates'

describe('getRobotState', () => {
  it('maps each known key to its ROBOT_STATES entry', () => {
    expect(getRobotState('idle')).toBe(ROBOT_STATES.IDLE)
    expect(getRobotState('thinking')).toBe(ROBOT_STATES.THINKING)
    expect(getRobotState('talking')).toBe(ROBOT_STATES.TALKING)
    expect(getRobotState('error')).toBe(ROBOT_STATES.ERROR)
  })

  it('falls back to IDLE for an unrecognized key', () => {
    expect(getRobotState('nonsense')).toBe(ROBOT_STATES.IDLE)
  })
})

describe('isValidRobotState', () => {
  it('accepts the four known state keys', () => {
    expect(isValidRobotState('idle')).toBe(true)
    expect(isValidRobotState('thinking')).toBe(true)
    expect(isValidRobotState('talking')).toBe(true)
    expect(isValidRobotState('error')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isValidRobotState('')).toBe(false)
    expect(isValidRobotState('ERROR')).toBe(false)
    expect(isValidRobotState('loading')).toBe(false)
  })
})
