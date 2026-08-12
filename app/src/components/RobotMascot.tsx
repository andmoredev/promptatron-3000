/**
 * The header mascot.
 *
 * `RobotGraphic` already takes exactly the four states `runStore` derives
 * (`idle | thinking | talking | error`), so `selectRobotMood` wires straight
 * into it — no adapter, and none of the debounce/`appState`-shape machinery the
 * old `RobotGraphicContainer` needed to guess a mood out of App.jsx's flags.
 *
 * `settingsStore.robotEnabled` can switch it off entirely.
 */

import RobotGraphic from './RobotGraphic/RobotGraphic'
import { selectRobotMood, useRunStore, useSettingsStore } from '../stores'

interface RobotMascotProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function RobotMascot({ size = 'md', className = '' }: RobotMascotProps) {
  const mood = useRunStore(selectRobotMood)
  const enabled = useSettingsStore((state) => state.robotEnabled)

  if (!enabled) return null

  return <RobotGraphic currentState={mood} size={size} className={className} isChad={false} />
}
