/**
 * @fileoverview Custom hook for draggable functionality with position persistence
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for making elements draggable with position persistence
 * @param {Object} options - Configuration options
 * @param {boolean} options.constrainToViewport - Whether to constrain dragging to viewport boundaries
 * @param {boolean} options.persistPosition - Whether to save position to localStorage
 * @param {string} options.persistKey - Key for localStorage persistence
 * @param {Object} options.defaultPosition - Default position if no saved position exists
 * @param {boolean} options.disabled - Whether dragging is disabled
 * @returns {Object} Draggable state and handlers
 */
export const useDraggable = ({
  constrainToViewport = true,
  persistPosition = true,
  persistKey = 'draggable_position',
  defaultPosition = { x: 20, y: 20 },
  disabled = false
} = {}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(defaultPosition);
  const dragRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, elementX: 0, elementY: 0 });
  const pointerIdRef = useRef(null);

  // Load saved position from localStorage on mount
  useEffect(() => {
    if (persistPosition && persistKey) {
      try {
        const savedPosition = localStorage.getItem(persistKey);
        if (savedPosition) {
          const parsed = JSON.parse(savedPosition);
          // Validate the saved position
          if (parsed &&
              typeof parsed.x === 'number' &&
              typeof parsed.y === 'number' &&
              !isNaN(parsed.x) &&
              !isNaN(parsed.y) &&
              parsed.x >= 0 &&
              parsed.y >= 0) {
            // Ensure position is within viewport bounds if constraining
            const constrainedPosition = constrainToViewport
              ? constrainPosition(parsed)
              : parsed;
            setPosition(constrainedPosition);
          } else {
            // Invalid saved position, use default
            setPosition(defaultPosition);
          }
        } else {
          // No saved position, use default
          setPosition(defaultPosition);
        }
      } catch (error) {
        console.warn('Failed to load saved position:', error);
        setPosition(defaultPosition);
      }
    } else {
      // Not persisting or no key, use default
      setPosition(defaultPosition);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistPosition, persistKey]);

  // Save position to localStorage
  const savePosition = useCallback((newPosition) => {
    if (persistPosition && persistKey) {
      try {
        localStorage.setItem(persistKey, JSON.stringify(newPosition));
      } catch (error) {
        console.warn('Failed to save position:', error);
      }
    }
  }, [persistPosition, persistKey]);

  // Constrain position to viewport boundaries
  const constrainPosition = useCallback((pos) => {
    if (!constrainToViewport) return pos;

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    // Get element size from the actual element if available, otherwise use default
    let elementSize = { width: 100, height: 100 };
    if (dragRef.current) {
      const rect = dragRef.current.getBoundingClientRect();
      elementSize = { width: rect.width, height: rect.height };
    }

    // Ensure minimum visible area (at least 20px visible on each side)
    const minVisible = 20;
    const maxX = viewport.width - elementSize.width + minVisible;
    const maxY = viewport.height - elementSize.height + minVisible;

    return {
      x: Math.max(-elementSize.width + minVisible, Math.min(pos.x, maxX)),
      y: Math.max(-elementSize.height + minVisible, Math.min(pos.y, maxY))
    };
  }, [constrainToViewport]);

  // Handle mouse down event
  const handleMouseDown = useCallback((event) => {
    if (disabled || !dragRef.current) return;

    event.preventDefault();
    event.stopPropagation();

    // Use current position state instead of getBoundingClientRect to avoid transform issues
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      elementX: position.x,
      elementY: position.y
    };

    console.log('Mouse down - dragStart:', dragStartRef.current, 'current position:', position);

    setIsDragging(true);
  }, [disabled, position]);

  // Handle mouse move event
  const handleMouseMove = useCallback((event) => {
    if (!isDragging || disabled) return;

    event.preventDefault();

    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;

    const newPosition = {
      x: dragStartRef.current.elementX + deltaX,
      y: dragStartRef.current.elementY + deltaY
    };

    // Debug: Log position changes (remove this after testing)
    console.log('Drag Debug:', {
      deltaX,
      deltaY,
      newPosition,
      constrainedPosition: constrainPosition(newPosition),
      dragStart: dragStartRef.current
    });

    const constrainedPosition = constrainPosition(newPosition);
    setPosition(constrainedPosition);
  }, [isDragging, disabled, constrainPosition]);

  // Handle mouse up event
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      // Save position when drag ends - use current position from state
      setPosition(currentPosition => {
        savePosition(currentPosition);
        return currentPosition;
      });
    }
  }, [isDragging, savePosition]);

  // Pointer Events (unified mouse/touch/pen)
  const handlePointerDown = useCallback((event) => {
    if (disabled || !dragRef.current) return;

    try {
      dragRef.current.setPointerCapture?.(event.pointerId);
      pointerIdRef.current = event.pointerId;
    } catch (_) {}

    event.preventDefault();
    event.stopPropagation();

    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      elementX: position.x,
      elementY: position.y
    };

    setIsDragging(true);
  }, [disabled, position]);

  const handlePointerMove = useCallback((event) => {
    if (!isDragging || disabled) return;

    event.preventDefault();

    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;

    const newPosition = {
      x: dragStartRef.current.elementX + deltaX,
      y: dragStartRef.current.elementY + deltaY
    };

    const constrainedPosition = constrainPosition(newPosition);
    setPosition(constrainedPosition);
  }, [isDragging, disabled, constrainPosition]);

  const handlePointerUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setPosition(currentPosition => {
        savePosition(currentPosition);
        return currentPosition;
      });
    }
    // Release capture if held
    if (dragRef.current && pointerIdRef.current != null) {
      try { dragRef.current.releasePointerCapture?.(pointerIdRef.current); } catch (_) {}
      pointerIdRef.current = null;
    }
  }, [isDragging, savePosition]);

  // Handle touch events for mobile support
  const handleTouchStart = useCallback((event) => {
    if (disabled || !dragRef.current || event.touches.length !== 1) return;

    const touch = event.touches[0];

    // Use current logical position values to ensure consistent dragging across axes
    dragStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      elementX: position.x,
      elementY: position.y
    };

    setIsDragging(true);
  }, [disabled, position]);

  const handleTouchMove = useCallback((event) => {
    if (!isDragging || disabled || event.touches.length !== 1) return;

    event.preventDefault();

    const touch = event.touches[0];
    const deltaX = touch.clientX - dragStartRef.current.x;
    const deltaY = touch.clientY - dragStartRef.current.y;

    const newPosition = {
      x: dragStartRef.current.elementX + deltaX,
      y: dragStartRef.current.elementY + deltaY
    };

    const constrainedPosition = constrainPosition(newPosition);
    setPosition(constrainedPosition);
  }, [isDragging, disabled, constrainPosition]);

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      // Save position when drag ends - use current position from state
      setPosition(currentPosition => {
        savePosition(currentPosition);
        return currentPosition;
      });
    }
  }, [isDragging, savePosition]);

  // Set up global event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      // Pointer events
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd, handlePointerMove, handlePointerUp]);

  // Handle keyboard movement (arrow keys)
  const handleKeyDown = useCallback((event) => {
    if (disabled) return;

    const step = event.shiftKey ? 10 : 1;

    setPosition(currentPosition => {
      let newPosition = { ...currentPosition };

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          newPosition.y = Math.max(0, currentPosition.y - step);
          break;
        case 'ArrowDown':
          event.preventDefault();
          newPosition.y = currentPosition.y + step;
          break;
        case 'ArrowLeft':
          event.preventDefault();
          newPosition.x = Math.max(0, currentPosition.x - step);
          break;
        case 'ArrowRight':
          event.preventDefault();
          newPosition.x = currentPosition.x + step;
          break;
        default:
          return currentPosition;
      }

      const constrainedPosition = constrainPosition(newPosition);
      savePosition(constrainedPosition);
      return constrainedPosition;
    });
  }, [disabled, constrainPosition, savePosition]);

  // Handle window resize to ensure element stays in bounds
  useEffect(() => {
    const handleResize = () => {
      if (constrainToViewport) {
        setPosition(currentPosition => {
          const constrainedPosition = constrainPosition(currentPosition);
          if (constrainedPosition.x !== currentPosition.x || constrainedPosition.y !== currentPosition.y) {
            savePosition(constrainedPosition);
            return constrainedPosition;
          }
          return currentPosition;
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [constrainToViewport, constrainPosition, savePosition]);

  return {
    // State
    isDragging,
    position,

    // Refs
    dragRef,

    // Event handlers
    onMouseDown: handleMouseDown,
    onTouchStart: handleTouchStart,
    onPointerDown: handlePointerDown,
    onKeyDown: handleKeyDown,

    // Utilities
    setPosition: (newPos) => {
      const constrainedPosition = constrainPosition(newPos);
      setPosition(constrainedPosition);
      savePosition(constrainedPosition);
    },
    resetPosition: () => {
      setPosition(defaultPosition);
      savePosition(defaultPosition);
    }
  };
};

export default useDraggable;
