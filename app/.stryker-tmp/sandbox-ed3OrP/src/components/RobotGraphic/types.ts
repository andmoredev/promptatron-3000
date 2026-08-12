/**
 * @fileoverview Type definitions for Robot Graphic component
 */
// @ts-nocheck


import type { ThemeConfig } from '../../utils/themeUtils'

export type RobotStateKey = 'idle' | 'thinking' | 'talking' | 'error'

export type RobotExpression = 'happy' | 'thinking' | 'talking' | 'concerned'

export type RobotSize = 'sm' | 'md' | 'lg'

export type AnimationTiming = 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface RobotState {
  key: RobotStateKey
  expression: RobotExpression
  ariaLabel: string
  animations: string[]
  transitionDuration?: number
}

export interface AnimationConfig {
  name: string
  duration: number
  timing: AnimationTiming
  iterations: number | 'infinite'
  respectsMotionPreference: boolean
}

export interface SizeConfig {
  width: number
  height: number
  className: string
}

export interface RobotGraphicProps {
  /** Current robot state */
  currentState: RobotStateKey
  /** Size variant (default: 'md') */
  size?: RobotSize
  /** Additional CSS classes */
  className?: string
  /** Custom accessibility label */
  ariaLabel?: string
  /** Whether to render Chad personality instead of original robot */
  isChad?: boolean
}

export interface RobotFaceProps {
  /** Facial expression to display */
  expression: RobotExpression
  /** Whether to enable animations (default: true) */
  animated?: boolean
  /** Size variant for scaling (default: 'md') */
  size?: RobotSize
  /** Theme object for color customization */
  theme?: ThemeConfig | null
}
