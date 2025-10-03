# Design Document

## Overview

The Chad personality reveal feature transforms the existing robot character into "Chad" - a more distinctive personality with hat and polo shirt styling. The feature includes a floating Chad companion, a reveal mechanism for live demonstrations, and persistent state management to remember the reveal status across sessions.

## Architecture

### Component Architecture

The Chad feature will extend the existing RobotGraphic component system without breaking changes:

```
src/components/RobotGraphic/
├── RobotGraphic.jsx (existing - no changes)
├── RobotFace.jsx (existing - no changes) 
├── ChadFace.jsx (new - Chad-specific styling)
├── FloatingChad.jsx (new - floating companion)
├── ChadRevealButton.jsx (new - reveal trigger)
├── robotStates.js (existing - no changes)
├── chadStates.js (new - Chad-specific states)
└── useChadReveal.js (new - reveal state management)

src/utils/
└── chadStorage.js (new - Chad reveal persistence)

src/App.jsx (modified - add reveal button and floating Chad)
```

### State Management

Chad reveal state will be managed through:

1. **Local Component State**: Current reveal status in App.jsx
2. **Custom Hook**: `useChadReveal` for reveal logic and animations
3. **Persistent Storage**: localStorage for reveal state persistence
4. **Robot State Integration**: Chad states that map to existing robot states

## Components and Interfaces

### ChadFace Component

```javascript
// src/components/RobotGraphic/ChadFace.jsx
const ChadFace = ({ expression, animated, size, theme }) => {
  // Renders Chad with hat and polo shirt
  // Reuses existing expression logic but with Chad styling
  // Hat: Baseball cap or similar casual hat
  // Polo shirt: Collar and button details
  // Same facial expressions as original robot
}
```

**Props Interface:**
- `expression`: string - Same as RobotFace ('happy', 'thinking', 'talking', 'concerned')
- `animated`: boolean - Enable/disable animations
- `size`: string - Size variant ('sm', 'md', 'lg')
- `theme`: object - Theme colors

### FloatingChad Component

```javascript
// src/components/RobotGraphic/FloatingChad.jsx
const FloatingChad = ({ 
  isVisible, 
  currentState, 
  size = 'sm',
  position = { bottom: '20px', left: '20px' }
}) => {
  // Floating Chad in bottom-left corner
  // Responds to application state
  // Subtle animations and hover effects
  // Responsive positioning
}
```

**Props Interface:**
- `isVisible`: boolean - Show/hide floating Chad
- `currentState`: string - Current application state for expressions
- `size`: string - Size variant (defaults to 'sm')
- `position`: object - CSS positioning properties

### ChadRevealButton Component

```javascript
// src/components/RobotGraphic/ChadRevealButton.jsx
const ChadRevealButton = ({ 
  onReveal, 
  isRevealed, 
  isLoading 
}) => {
  // "Reveal Agent" button in header
  // Smooth transition animation
  // Disappears after reveal
}
```

**Props Interface:**
- `onReveal`: function - Callback when button is clicked
- `isRevealed`: boolean - Current reveal state
- `isLoading`: boolean - Show loading state during reveal

### useChadReveal Hook

```javascript
// src/components/RobotGraphic/useChadReveal.js
export const useChadReveal = () => {
  const [isRevealed, setIsRevealed] = useState(false)
  const [isRevealing, setIsRevealing] = useState(false)
  
  // Load reveal state from storage
  // Handle reveal animation
  // Persist reveal state
  // Return reveal controls
  
  return {
    isRevealed,
    isRevealing,
    revealChad,
    resetReveal // for development/testing
  }
}
```

**Return Interface:**
- `isRevealed`: boolean - Current reveal state
- `isRevealing`: boolean - Animation in progress
- `revealChad`: function - Trigger reveal animation
- `resetReveal`: function - Reset to original robot (dev only)

## Data Models

### Chad Reveal State

```javascript
const chadRevealState = {
  isRevealed: boolean,
  revealedAt: timestamp,
  version: string // for future migrations
}
```

### Chad Configuration

```javascript
const chadConfig = {
  hat: {
    type: 'baseball_cap',
    color: '#2563eb', // Blue
    style: 'casual'
  },
  shirt: {
    type: 'polo',
    color: '#ffffff', // White
    collar: true,
    buttons: 2
  },
  personality: {
    name: 'Chad',
    traits: ['friendly', 'helpful', 'tech-savvy']
  }
}
```

### Floating Chad Configuration

```javascript
const floatingChadConfig = {
  position: {
    bottom: '20px',
    left: '20px',
    zIndex: 1000
  },
  responsive: {
    mobile: { bottom: '16px', left: '16px', size: 'sm' },
    tablet: { bottom: '20px', left: '20px', size: 'sm' },
    desktop: { bottom: '24px', left: '24px', size: 'md' }
  },
  animations: {
    entrance: 'fadeInUp',
    idle: 'subtleBounce',
    hover: 'gentleScale'
  }
}
```

## Error Handling

### Graceful Degradation

1. **Storage Failure**: If localStorage fails, Chad remains in session-only mode
2. **Animation Failure**: Falls back to static Chad display
3. **Component Error**: Error boundary catches issues and shows original robot

### Error Recovery

```javascript
const errorRecoveryStrategies = {
  storageError: {
    action: 'fallback_to_session',
    message: 'Chad reveal state will not persist across sessions'
  },
  animationError: {
    action: 'disable_animations',
    message: 'Chad will appear without transition animations'
  },
  componentError: {
    action: 'fallback_to_original',
    message: 'Falling back to original robot display'
  }
}
```

## Testing Strategy

### Unit Tests

1. **useChadReveal Hook**
   - Reveal state management
   - Storage persistence
   - Animation timing

2. **ChadFace Component**
   - Expression rendering
   - Hat and polo shirt styling
   - Theme integration

3. **FloatingChad Component**
   - Positioning logic
   - Responsive behavior
   - State synchronization

### Integration Tests

1. **Reveal Flow**
   - Button click → animation → state persistence
   - Page reload → state restoration
   - Cross-component state sync

2. **Robot State Integration**
   - Chad expressions match application states
   - Floating Chad reflects main robot state
   - Smooth transitions between states

### Visual Tests

1. **Chad Styling**
   - Hat renders correctly across sizes
   - Polo shirt maintains proportions
   - Colors match theme system

2. **Responsive Design**
   - Floating Chad scales appropriately
   - Mobile positioning doesn't obstruct UI
   - Touch targets remain accessible

## Implementation Details

### Chad Visual Design

**Hat Design:**
- Baseball cap style with curved brim
- Solid color matching theme primary
- Subtle shadow and highlight details
- Scales proportionally with robot size

**Polo Shirt Design:**
- Classic polo collar with fold details
- Two-button placket
- Clean white color with subtle shading
- Maintains robot's rectangular body shape

**Integration with Existing Expressions:**
- All existing facial expressions work with Chad
- Hat and shirt remain consistent across states
- Animations apply to facial features, not clothing
- Clothing adds personality without changing functionality

### Floating Chad Behavior

**Positioning Strategy:**
```css
.floating-chad {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 1000;
  pointer-events: none; /* Doesn't block clicks */
}

@media (max-width: 768px) {
  .floating-chad {
    bottom: 16px;
    left: 16px;
    transform: scale(0.8);
  }
}
```

**State Synchronization:**
- Floating Chad mirrors main robot's expression
- Updates happen with 100ms delay for smooth feel
- Respects user's animation preferences
- Maintains performance with efficient updates

### Storage Implementation

**Chad Storage Utility:**
```javascript
// src/utils/chadStorage.js
const CHAD_STORAGE_KEY = 'promptatron_chad_reveal'

export const saveChadRevealState = (isRevealed) => {
  const state = {
    isRevealed,
    revealedAt: Date.now(),
    version: '1.0'
  }
  localStorage.setItem(CHAD_STORAGE_KEY, JSON.stringify(state))
}

export const loadChadRevealState = () => {
  try {
    const saved = localStorage.getItem(CHAD_STORAGE_KEY)
    return saved ? JSON.parse(saved) : { isRevealed: false }
  } catch {
    return { isRevealed: false }
  }
}
```

### Animation Sequences

**Reveal Animation:**
1. Button click triggers reveal
2. 300ms fade transition from original to Chad
3. Floating Chad appears with slide-up animation
4. Button fades out over 200ms
5. State persisted to localStorage

**Entrance Animations:**
```css
@keyframes chadReveal {
  0% { opacity: 0; transform: scale(0.8); }
  50% { opacity: 0.5; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes floatingChadEntrance {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

### Performance Considerations

**Optimization Strategies:**
1. **Lazy Loading**: Chad components only load when needed
2. **Animation Efficiency**: Use CSS transforms for smooth animations
3. **State Batching**: Batch state updates to prevent excessive re-renders
4. **Memory Management**: Clean up animation timers and event listeners

**Bundle Size Impact:**
- Chad components add ~5KB to bundle
- SVG styling adds ~2KB
- Storage utility adds ~1KB
- Total impact: ~8KB (minimal)

### Accessibility

**Screen Reader Support:**
- Chad maintains same ARIA labels as original robot
- Reveal button has descriptive label
- Floating Chad marked as decorative
- Animation respects `prefers-reduced-motion`

**Keyboard Navigation:**
- Reveal button accessible via keyboard
- Focus management during reveal animation
- No keyboard traps introduced

**High Contrast Mode:**
- Chad styling adapts to high contrast themes
- Hat and shirt maintain visibility
- Color combinations meet WCAG standards

### Browser Compatibility

**Supported Features:**
- CSS transforms for animations
- localStorage for persistence
- SVG for Chad styling
- Flexbox for positioning

**Fallback Strategies:**
- No localStorage: Session-only reveal
- No CSS transforms: Instant reveal without animation
- No SVG support: Text-based fallback (unlikely in modern browsers)

### Development Tools

**Debug Features:**
- Console logging for reveal state changes
- Development-only reset function
- Visual indicators for floating Chad positioning
- Performance monitoring for animation smoothness

**Testing Utilities:**
- Mock storage for unit tests
- Animation testing helpers
- Responsive design testing tools
- Accessibility testing integration