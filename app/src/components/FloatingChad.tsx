/**
 * @fileoverview Chad, present at all times as a floating companion — a
 * Clippy for the Promptatron. He watches `runStore` and reacts: his face
 * mirrors `selectRobotMood` (the same mood the header mascot renders) and he
 * pops a short quip in a speech bubble whenever the run status *changes*.
 *
 * The old "reveal" easter-egg mechanic (`useChadReveal`, a hidden trigger
 * that made him appear once) is gone for good — this component renders
 * unconditionally once `settingsStore.chadEnabled` is true, which it is by
 * default. See `git show d9fe266^:app/src/components/RobotGraphic/FloatingChad.jsx`
 * for the retired implementation this one keeps the good ideas from
 * (fixed/draggable positioning, a lightweight personality) while dropping its
 * app-state-shape plumbing and localStorage-backed reveal state.
 *
 * Renders `ChadFace` directly rather than going through `RobotGraphic`:
 * `RobotGraphic` stamps a fixed `data-testid="robot-graphic"` on its root,
 * which the header's `RobotMascot` already claims — two of those on screen
 * at once would break `getByTestId('robot-graphic')` lookups (and screen
 * readers would meet "robot" twice under two different roles). `ChadFace`'s
 * own SVG is already `aria-hidden`, so the accessible name lives on this
 * component's wrapper instead.
 */

import { useEffect, useRef, useState } from 'react'
import ChadFace from './RobotGraphic/ChadFace'
import { getRobotState } from './RobotGraphic/robotStates'
import { shouldDisableAnimations } from './RobotGraphic/accessibility'
import { useDraggable } from '../hooks/useDraggable'
import { pickQuip, quipCategoryForTransition } from '../utils/chadQuips'
import { selectRobotMood, useRunStore, useSettingsStore } from '../stores'

/** Chad's fixed footprint — used both to render him and to clamp dragging. */
const CHAD_SIZE = { width: 64, height: 64 }

/** Gap kept from the viewport edge in his default bottom-right spot. */
const EDGE_MARGIN = 24

/** How long a quip stays up before it auto-hides. */
const QUIP_VISIBLE_MS = 4000

function defaultChadPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: EDGE_MARGIN, y: EDGE_MARGIN }
  }
  return {
    x: Math.max(0, window.innerWidth - CHAD_SIZE.width - EDGE_MARGIN),
    y: Math.max(0, window.innerHeight - CHAD_SIZE.height - EDGE_MARGIN)
  }
}

export default function FloatingChad() {
  const enabled = useSettingsStore((state) => state.chadEnabled)
  const setChadEnabled = useSettingsStore((state) => state.setChadEnabled)
  const mood = useRunStore(selectRobotMood)
  const status = useRunStore((state) => state.status)
  const runId = useRunStore((state) => state.runId)

  // Computed once: Chad keeps whatever corner he started in across
  // re-renders, and only a real drag (or a resize that would strand him)
  // moves him after that.
  const [initialPosition] = useState(defaultChadPosition)

  const { position, isDragging, dragRef, onPointerDown } = useDraggable({
    defaultPosition: initialPosition,
    size: CHAD_SIZE,
    disabled: !enabled
  })

  const [quip, setQuip] = useState<string | null>(null)
  const previousStatusRef = useRef(status)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // React to status *transitions*, not every render: a quip fires once per
  // change, driven off `runStore`, and clears itself a few seconds later.
  useEffect(() => {
    const previousStatus = previousStatusRef.current
    previousStatusRef.current = status

    if (previousStatus === status) return

    const category = quipCategoryForTransition(status)
    if (!category) return

    setQuip(pickQuip(category, runId ?? status))

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    hideTimeoutRef.current = setTimeout(() => setQuip(null), QUIP_VISIBLE_MS)
  }, [status, runId])

  useEffect(
    () => () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    },
    []
  )

  if (!enabled) return null

  const robotState = getRobotState(mood)
  const animationsDisabled = shouldDisableAnimations()

  return (
    <div
      className="fixed z-40"
      style={{
        left: position.x,
        top: position.y,
        width: CHAD_SIZE.width,
        height: CHAD_SIZE.height
      }}
      data-testid="floating-chad"
      data-state={mood}
    >
      {quip && (
        <div
          role="status"
          aria-live="polite"
          data-testid="chad-quip"
          className="absolute bottom-full right-0 mb-2 w-max max-w-[12rem] rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg"
        >
          {quip}
        </div>
      )}

      <div
        ref={dragRef}
        role="img"
        aria-label={`Chad, your floating companion. ${robotState.ariaLabel}.`}
        className={`h-full w-full cursor-grab touch-none select-none rounded-full transition-transform duration-150 ${
          isDragging ? 'scale-110 cursor-grabbing' : 'hover:scale-105'
        }`}
        onPointerDown={onPointerDown}
      >
        <div aria-hidden="true">
          <ChadFace expression={robotState.expression} animated={!animationsDisabled} size="md" />
        </div>
      </div>

      <button
        type="button"
        aria-label="Dismiss Chad"
        title="Dismiss Chad"
        onClick={() => setChadEnabled(false)}
        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-secondary-200 bg-white text-xs leading-none text-gray-600 shadow-sm hover:bg-gray-100 hover:text-gray-900"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
