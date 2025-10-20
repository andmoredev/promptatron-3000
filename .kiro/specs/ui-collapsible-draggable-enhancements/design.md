# Design Document

## Overview

This design document outlines the technical approach for implementing col UI sections, draggable robot functionality, and enhanced textarea controls in the Bedrock LLM Analyzer. The solution focuses on creating a more flexible, presentation-friendly interface while maintaining accessibility and performance standards.

## Architecture

### Component Structure

The implementation will follow a modular approach with reusable components and hooks:

```
src/
├── components/
│   ├── CollapsibleSection/
│   │   ├── CollapsibleSection.jsx
│   │   ├── CollapsibleSection.css
│   │   └── index.js
│   ├── DraggableRobot/
│   │   ├── DraggableRobot.jsx
│   │   ├── useDraggable.js
│   │   └── index.js
│   ├── ResizableTextarea/
│   │   ├── ResizableTextarea.jsx
│   │   ├── ResizableTextarea.css
│   │   └── index.js
│   └── [existing components...]
├── hooks/
│   ├── useCollapsibleState.js
│   ├── useDraggablePosition.js
│   ├── useResizableTextarea.js
│   └── useUIPreferences.js
├── utils/
│   ├── uiPreferences.js
│   ├── dragUtils.js
│   └── [existing utils...]
└── services/
    ├── uiPreferencesService.js
    └── [existing services...]
```

### State Management Strategy

The design uses a combination of local component state and persistent storage:

1. **Local State**: Immediate UI interactions (dragging, resizing, animating)
2. **Persistent State**: User preferences stored in localStorage
3. **Global State**: Shared UI state managed through custom hooks

## Components and Interfaces

### CollapsibleSection Component

A reusable wrapper component that adds collapse/expand functionality to any content:

```jsx
<CollapsibleSection
  title="Model Selection"
  defaultExpanded={true}
  persistKey="model-selection"
  icon={<ModelIcon />}
  className="mb-6"
>
  <ModelSelector {...props} />
</CollapsibleSection>
```

**Props Interface:**
```typescript
interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  persistKey?: string;
  icon?: React.ReactNode;
  className?: string;
  onToggle?: (expanded: boolean) => void;
  disabled?: boolean;
  headerActions?: React.ReactNode;
}
```

**Key Features:**
- Smooth CSS transitions for expand/collapse
- Persistent state using localStorage
- Keyboard accessibility (Enter/Space to toggle)
- ARIA attributes for screen readers
- Optional icons and header actions
- Customizable styling

### DraggableRobot Component

Enhances the existing FloatingChad component with drag functionality:

```jsx
<DraggableRobot
  isVisible={chadState.isRevealed}
  currentState={robotState}
  onPositionChange={handlePositionChange}
  constrainToViewport={true}
  persistPosition={true}
>
  <FloatingChad {...chadProps} />
</DraggableRobot>
```

**Props Interface:**
```typescript
interface DraggableRobotProps {
  children: React.ReactNode;
  isVisible: boolean;
  currentState: string;
  onPositionChange?: (position: Position) => void;
  constrainToViewport?: boolean;
  persistPosition?: boolean;
  disabled?: boolean;
  keyboardMovement?: boolean;
}

interface Position {
  x: number;
  y: number;
}
```

**Key Features:**
- Mouse and touch drag support
- Keyboard movement (arrow keys)
- Viewport boundary constraints
- Position persistence in localStorage
- Smooth drag animations
- Visual feedback during drag
- Highest z-index to stay on top

### ResizableTextarea Component

Enhanced textarea with manual resize capabilities:

```jsx
<ResizableTextarea
  value={systemPrompt}
  onChange={handleSystemPromptChange}
  placeholder="Enter system prompt..."
  minHeight={128}
  maxHeight={400}
  persistSize={true}
  persistKey="system-prompt-size"
  className="input-field"
/>
```

**Props Interface:**
```typescript
interface ResizableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  persistSize?: boolean;
  persistKey?: string;
  className?: string;
  disabled?: boolean;
  autoResize?: boolean;
}
```

**Key Features:**
- Manual resize handle in bottom-right corner
- Auto-resize based on content (optional)
- Size persistence in localStorage
- Proper scrolling behavior
- Maintains focus during resize
- Responsive to container changes

## Data Models

### UI Preferences Schema

```typescript
interface UIPreferences {
  collapsedSections: Record<string, boolean>;
  robotPosition: Position | null;
  textareaSizes: Record<string, TextareaSize>;
  version: string;
  timestamp: number;
}

interface TextareaSize {
  width: number;
  height: number;
}

interface Position {
  x: number;
  y: number;
}
```

### Storage Keys

```typescript
const STORAGE_KEYS = {
  UI_PREFERENCES: 'promptatron_ui_preferences',
  COLLAPSED_SECTIONS: 'promptatron_collapsed_sections',
  ROBOT_POSITION: 'promptatron_robot_position',
  TEXTAREA_SIZES: 'promptatron_textarea_sizes'
} as const;
```

## Error Handling

### Storage Error Recovery

```typescript
class UIPreferencesService {
  private handleStorageError(error: Error, operation: string) {
    console.warn(`UI Preferences ${operation} failed:`, error);

    // Attempt to clear corrupted data
    if (error.name === 'QuotaExceededError') {
      this.clearOldPreferences();
    }

    // Fall back to defaults
    return this.getDefaultPreferences();
  }

  private clearOldPreferences() {
    // Remove old or corrupted preference data
    const keys = Object.values(STORAGE_KEYS);
    keys.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // Silent fail for cleanup
      }
    });
  }
}
```

### Drag Boundary Handling

```typescript
const constrainToViewport = (position: Position): Position => {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  };

  const robotSize = { width: 80, height: 80 }; // Minimum visible area

  return {
    x: Math.max(0, Math.min(position.x, viewport.width - robotSize.width)),
    y: Math.max(0, Math.min(position.y, viewport.height - robotSize.height))
  };
};
```

### Textarea Resize Validation

```typescript
const validateTextareaSize = (
  width: number,
  height: number,
  constraints: SizeConstraints
): TextareaSize => {
  return {
    width: Math.max(constraints.minWidth, Math.min(width, constraints.maxWidth)),
    height: Math.max(constraints.minHeight, Math.min(height, constraints.maxHeight))
  };
};
```

## Testing Strategy

### Unit Tests

1. **CollapsibleSection Component**
   - Toggle functionality
   - Keyboard accessibility
   - State persistence
   - Animation completion

2. **DraggableRobot Component**
   - Drag event handling
   - Position constraints
   - Keyboard movement
   - Position persistence

3. **ResizableTextarea Component**
   - Resize functionality
   - Size constraints
   - Content handling
   - Size persistence

### Integration Tests

1. **UI Preferences Service**
   - Storage operations
   - Error recovery
   - Cross-tab synchronization
   - Migration handling

2. **App Integration**
   - Multiple collapsible sections
   - Robot positioning with layout changes
   - Textarea resizing in different contexts
   - Preference restoration on app load

### Accessibility Tests

1. **Keyboard Navigation**
   - Tab order with collapsed sections
   - Keyboard shortcuts for all interactions
   - Focus management during state changes

2. **Screen Reader Support**
   - ARIA announcements for state changes
   - Proper labeling of interactive elements
   - Content accessibility when collapsed

### Performance Tests

1. **Animation Performance**
   - 60fps during transitions
   - Memory usage during repeated interactions
   - CPU usage with multiple simultaneous animations

2. **Storage Performance**
   - localStorage write/read times
   - Memory usage with large preference objects
   - Performance with frequent updates

## Implementation Details

### CSS Architecture

```css
/* CollapsibleSection Styles */
.collapsible-section {
  @apply border border-gray-200 rounded-lg bg-white shadow-sm;
}

.collapsible-header {
  @apply flex items-center justify-between p-4 cursor-pointer;
  @apply hover:bg-gray-50 transition-colors duration-200;
}

.collapsible-content {
  @apply overflow-hidden transition-all duration-300 ease-in-out;
}

.collapsible-content.collapsed {
  @apply max-h-0;
}

.collapsible-content.expanded {
  @apply max-h-screen;
}

/* DraggableRobot Styles */
.draggable-robot {
  @apply fixed cursor-move;
  z-index: 9999;
  user-select: none;
}

.draggable-robot.dragging {
  @apply cursor-grabbing;
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.3));
}

.draggable-robot.keyboard-focus {
  @apply ring-2 ring-blue-500 ring-offset-2;
}

/* ResizableTextarea Styles */
.resizable-textarea {
  @apply relative;
}

.resize-handle {
  @apply absolute bottom-0 right-0 w-4 h-4;
  @apply cursor-se-resize bg-gray-300 opacity-50;
  @apply hover:opacity-75 transition-opacity duration-200;
  background-image: linear-gradient(-45deg,
    transparent 0%, transparent 25%,
    currentColor 25%, currentColor 50%,
    transparent 50%, transparent 75%,
    currentColor 75%);
}
```

### Animation Timing

```typescript
const ANIMATION_DURATIONS = {
  COLLAPSE_EXPAND: 300,
  DRAG_FEEDBACK: 150,
  RESIZE_FEEDBACK: 100,
  POSITION_SNAP: 200
} as const;

const EASING_FUNCTIONS = {
  SMOOTH: 'cubic-bezier(0.4, 0, 0.2, 1)',
  BOUNCE: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)'
} as const;
```

### Responsive Behavior

```typescript
const RESPONSIVE_BREAKPOINTS = {
  MOBILE: 768,
  TABLET: 1024,
  DESKTOP: 1280
} as const;

const getResponsiveRobotSize = (screenWidth: number) => {
  if (screenWidth < RESPONSIVE_BREAKPOINTS.MOBILE) {
    return { width: 60, height: 60 };
  } else if (screenWidth < RESPONSIVE_BREAKPOINTS.TABLET) {
    return { width: 80, height: 80 };
  } else {
    return { width: 100, height: 100 };
  }
};
```

### Accessibility Implementation

```typescript
const KEYBOARD_SHORTCUTS = {
  TOGGLE_SECTION: ['Enter', ' '],
  MOVE_ROBOT: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  RESIZE_TEXTAREA: ['Shift+ArrowUp', 'Shift+ArrowDown']
} as const;

const ARIA_LABELS = {
  COLLAPSED_SECTION: (title: string) => `${title} section, collapsed. Press Enter to expand.`,
  EXPANDED_SECTION: (title: string) => `${title} section, expanded. Press Enter to collapse.`,
  DRAGGABLE_ROBOT: 'Chad robot companion. Click and drag to reposition, or use arrow keys.',
  RESIZABLE_TEXTAREA: 'Resizable text area. Drag the corner to resize or use Shift+Arrow keys.'
} as const;
```

## Migration Strategy

### Existing Component Integration

1. **Wrap Existing Sections**: Gradually wrap existing UI sections with CollapsibleSection
2. **Enhance FloatingChad**: Wrap with DraggableRobot component
3. **Replace Textareas**: Replace existing textareas with ResizableTextarea
4. **Preserve Existing Props**: Maintain backward compatibility with existing prop interfaces

### Data Migration

```typescript
const migrateUIPreferences = (oldPrefs: any): UIPreferences => {
  // Handle migration from older preference formats
  return {
    collapsedSections: oldPrefs.collapsed || {},
    robotPosition: oldPrefs.robotPos || null,
    textareaSizes: oldPrefs.textSizes || {},
    version: '1.0.0',
    timestamp: Date.now()
  };
};
```

### Rollback Strategy

- Feature flags for each enhancement
- Graceful degradation when features are disabled
- Ability to reset all preferences to defaults
- Fallback to original components if enhanced versions fail

This design provides a comprehensive foundation for implementing the UI enhancements while maintaining the existing application architecture and ensuring a smooth user experience.
