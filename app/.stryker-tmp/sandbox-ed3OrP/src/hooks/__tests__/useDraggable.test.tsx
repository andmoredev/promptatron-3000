/**
 * useDraggable: pointerdown + move updates position; clamped to the
 * viewport; a no-op when disabled.
 *
 * jsdom has no native `PointerEvent` constructor (confirmed against the
 * jsdom version pinned here), so events are built as plain `MouseEvent`s
 * carrying the same `type`/`clientX`/`clientY` fields a real `PointerEvent`
 * would — `useDraggable`'s handlers only read those fields (plus an optional
 * `pointerId` used solely for `set/releasePointerCapture`, which are
 * themselves unimplemented in jsdom and called through `?.`), so the
 * substitute is faithful for what this hook actually does.
 */
// @ts-nocheck


import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useDraggable } from '../useDraggable'

const SIZE = { width: 64, height: 64 }

function pointerEvent(type: string, clientX: number, clientY: number, pointerId = 1) {
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  return event
}

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1024)
  vi.stubGlobal('innerHeight', 768)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useDraggable', () => {
  it('starts at the given default position, clamped to the viewport', () => {
    const { result } = renderHook(() =>
      useDraggable({ defaultPosition: { x: 900, y: 10 }, size: SIZE })
    )

    // 1024 - 64 = 960, so x=900 is within bounds and passes through unchanged.
    expect(result.current.position).toEqual({ x: 900, y: 10 })
    expect(result.current.isDragging).toBe(false)
  })

  it('clamps an out-of-bounds default position into the viewport', () => {
    const { result } = renderHook(() =>
      useDraggable({ defaultPosition: { x: 5000, y: -50 }, size: SIZE })
    )

    expect(result.current.position).toEqual({ x: 1024 - SIZE.width, y: 0 })
  })

  it('pointerdown + pointermove drags the element by the pointer delta', () => {
    const { result } = renderHook(() =>
      useDraggable({ defaultPosition: { x: 100, y: 100 }, size: SIZE })
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    // The hook exposes a ref; point it at a real element the way JSX would.
    Object.defineProperty(result.current.dragRef, 'current', {
      value: container,
      writable: true
    })

    act(() => {
      result.current.onPointerDown({
        clientX: 200,
        clientY: 150,
        pointerId: 1
      } as unknown as ReactPointerEvent<HTMLDivElement>)
    })

    expect(result.current.isDragging).toBe(true)

    act(() => {
      document.dispatchEvent(pointerEvent('pointermove', 230, 180))
    })

    // delta (+30, +30) off the (100, 100) start.
    expect(result.current.position).toEqual({ x: 130, y: 130 })

    act(() => {
      document.dispatchEvent(pointerEvent('pointerup', 230, 180))
    })

    expect(result.current.isDragging).toBe(false)
    // Position holds after release (no persistence, but no snap-back either).
    expect(result.current.position).toEqual({ x: 130, y: 130 })
  })

  it('clamps a drag that would carry the element past the viewport edge', () => {
    const { result } = renderHook(() =>
      useDraggable({ defaultPosition: { x: 900, y: 10 }, size: SIZE })
    )

    act(() => {
      result.current.onPointerDown({
        clientX: 0,
        clientY: 0,
        pointerId: 1
      } as unknown as ReactPointerEvent<HTMLDivElement>)
    })

    act(() => {
      // A huge rightward/downward drag — clamped to the bottom-right corner.
      document.dispatchEvent(pointerEvent('pointermove', 5000, 5000))
    })

    expect(result.current.position).toEqual({
      x: 1024 - SIZE.width,
      y: 768 - SIZE.height
    })
  })

  it('drags via a real, mounted element and native-style pointer events end to end', () => {
    function Draggable() {
      const { position, dragRef, onPointerDown } = useDraggable({
        defaultPosition: { x: 40, y: 40 },
        size: SIZE
      })
      return (
        <div
          ref={dragRef}
          data-testid="drag-target"
          onPointerDown={onPointerDown}
          style={{ position: 'fixed', left: position.x, top: position.y }}
        />
      )
    }

    render(<Draggable />)
    const target = screen.getByTestId('drag-target')

    expect(target.style.left).toBe('40px')
    expect(target.style.top).toBe('40px')

    act(() => {
      target.dispatchEvent(pointerEvent('pointerdown', 10, 10))
    })
    act(() => {
      document.dispatchEvent(pointerEvent('pointermove', 25, 15))
    })
    act(() => {
      document.dispatchEvent(pointerEvent('pointerup', 25, 15))
    })

    // delta (+15, +5) off the (40, 40) start.
    expect(target.style.left).toBe('55px')
    expect(target.style.top).toBe('45px')
  })

  it('captures the pointer on pointerdown and releases it on pointerup, when the element supports it', () => {
    const { result } = renderHook(() =>
      useDraggable({ defaultPosition: { x: 100, y: 100 }, size: SIZE })
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    // jsdom does not implement these; stub them the way a real browser
    // element would provide them, so the `?.()` call sites actually fire.
    Object.assign(container, { setPointerCapture, releasePointerCapture })
    Object.defineProperty(result.current.dragRef, 'current', {
      value: container,
      writable: true
    })

    act(() => {
      result.current.onPointerDown({
        clientX: 200,
        clientY: 150,
        pointerId: 7
      } as unknown as ReactPointerEvent<HTMLDivElement>)
    })

    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(releasePointerCapture).not.toHaveBeenCalled()

    act(() => {
      document.dispatchEvent(pointerEvent('pointerup', 200, 150, 7))
    })

    expect(releasePointerCapture).toHaveBeenCalledWith(7)
  })

  it('does nothing on pointerdown when disabled', () => {
    const { result } = renderHook(() =>
      useDraggable({ defaultPosition: { x: 50, y: 50 }, size: SIZE, disabled: true })
    )

    act(() => {
      result.current.onPointerDown({
        clientX: 200,
        clientY: 150,
        pointerId: 1
      } as unknown as ReactPointerEvent<HTMLDivElement>)
    })

    expect(result.current.isDragging).toBe(false)

    act(() => {
      document.dispatchEvent(pointerEvent('pointermove', 500, 500))
    })

    expect(result.current.position).toEqual({ x: 50, y: 50 })
  })
})
