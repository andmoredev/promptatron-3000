/**
 * @fileoverview Robot Graphic component exports
 *
 * The mascot is now driven straight off `runStore`'s `selectRobotMood` (see
 * `components/RobotMascot.tsx`), which yields exactly the four state keys
 * `RobotGraphic` accepts. The old app-state-shape mapping layer
 * (`RobotGraphicContainer`, `useRobotState`, `stateMapping`) and the Chad
 * reveal easter egg (`useChadReveal`, `ChadRevealButton`) went with App.jsx
 * for good. Chad himself is back — always visible, not revealed — as
 * `components/FloatingChad.tsx`, one directory up; it renders `ChadFace`
 * (below) directly rather than going through `RobotGraphic`.
 */
// @ts-nocheck


export {
  ROBOT_STATES,
  ANIMATION_CONFIGS,
  SIZE_CONFIGS,
  DEFAULT_CONFIG,
  getRobotState,
  isValidRobotState
} from './robotStates'

export type {
  RobotStateKey,
  RobotExpression,
  RobotSize,
  AnimationTiming,
  RobotState,
  AnimationConfig,
  SizeConfig,
  RobotGraphicProps,
  RobotFaceProps
} from './types'

export { default as RobotGraphic } from './RobotGraphic'
export { default as RobotFace } from './RobotFace'
export { default as ChadFace } from './ChadFace'

export {
  announceToScreenReader,
  getRobotAriaAttributes,
  shouldDisableAnimations
} from './accessibility'
