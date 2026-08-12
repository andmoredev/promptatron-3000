/**
 * @fileoverview A small, typed drag hook for a single floating element.
 *
 * A simplified descendant of the pre-TS `useDraggable` that used to back the
 * legacy `FloatingChad` (git history: `d9fe266^:app/src/hooks/useDraggable.js`).
 * That version tracked mouse *and* touch *and* pointer events separately,
 * persisted position to `localStorage`, and supported arrow-key nudging.
 * None of that survives here:
 *
 *   - Pointer Events alone cover mouse, touch and pen, so there is exactly
 *     one code path instead of three.
 *   - No persistence — Chad resets to his default corner on reload, which is
 *     simpler to reason about and to test.
 *   - No keyboard movement — out of scope for this pass; drag is
 *     pointer-only for now.
 *
 * The element's size is a caller-supplied constant rather than something
 * measured off the DOM (`getBoundingClientRect`), so clamping is pure
 * arithmetic against `window.inner{Width,Height}` — deterministic in a test
 * environment that never lays anything out (jsdom reports `0x0` for every
 * element).
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export interface Position {
  x: number
  y: number
}

export interface ElementSize {
  width: number
  height: number
}

export interface UseDraggableOptions {
  /** Where the element starts, in viewport pixels from the top-left. */
  defaultPosition: Position
  /** The element's on-screen footprint, used to clamp it inside the viewport. */
  size: ElementSize
  /** Disable dragging (the position stays put; handlers become no-ops). */
  disabled?: boolean
}

export interface UseDraggableResult {
  position: Position
  isDragging: boolean
  /** Attach to the draggable element. */
  dragRef: RefObject<HTMLDivElement | null>
  /** Attach to the draggable element's `onPointerDown`. */
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
}

/** Keep the element fully inside the current viewport. */
function clampToViewport(position: Position, size: ElementSize): Position {
  const maxX = Math.max(0, window.innerWidth - size.width)
  const maxY = Math.max(0, window.innerHeight - size.height)
  return {
    x: Math.min(Math.max(position.x, 0), maxX),
    y: Math.min(Math.max(position.y, 0), maxY)
  }
}

/** Makes one element draggable via Pointer Events, clamped to the viewport. */
export function useDraggable({
  defaultPosition,
  size,
  disabled = false
}: UseDraggableOptions): UseDraggableResult {
  const [position, setPosition] = useState<Position>(() => clampToViewport(defaultPosition, size))
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<HTMLDivElement>(null)

  // The pointer's viewport coordinates and the element's position, both at
  // drag start — deltas are computed against these, not the previous frame's
  // position, so rounding never accumulates across a drag.
  const dragOrigin = useRef({ pointerX: 0, pointerY: 0, elementX: 0, elementY: 0 })
  const pointerIdRef = useRef<number | null>(null)

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return

      dragOrigin.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        elementX: position.x,
        elementY: position.y
      }
      pointerIdRef.current = event.pointerId

      // Not implemented in jsdom; real browsers keep the drag tracking this
      // element even if the pointer leaves it mid-gesture.
      dragRef.current?.setPointerCapture?.(event.pointerId)

      setIsDragging(true)
    },
    [disabled, position]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (event: PointerEvent) => {
      const deltaX = event.clientX - dragOrigin.current.pointerX
      const deltaY = event.clientY - dragOrigin.current.pointerY
      setPosition(
        clampToViewport(
          { x: dragOrigin.current.elementX + deltaX, y: dragOrigin.current.elementY + deltaY },
          size
        )
      )
    }

    const handleUp = () => {
      setIsDragging(false)
      if (pointerIdRef.current !== null) {
        dragRef.current?.releasePointerCapture?.(pointerIdRef.current)
        pointerIdRef.current = null
      }
    }

    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    document.addEventListener('pointercancel', handleUp)

    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
      document.removeEventListener('pointercancel', handleUp)
    }
    // `size` is expected to be a caller-stable reference (a module-level
    // constant), so it is a correct dependency without causing re-subscribes.
  }, [isDragging, size])

  // Re-clamp on viewport resize (e.g. rotating a phone) so Chad never ends
  // up stranded off-screen.
  useEffect(() => {
    const handleResize = () => setPosition((current) => clampToViewport(current, size))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [size])

  return { position, isDragging, dragRef, onPointerDown }
}

export default useDraggable
